
"use client";

import type React from 'react';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { KnowledgeCanvas } from '@/components/knowledge-canvas/KnowledgeCanvas';
import { Toolbar } from '@/components/knowledge-canvas/Toolbar';
import type { NodeData, LinkData, FileType as AppFileType, NodeType } from '@/types';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";


// Helper to determine file type
const getFileType = (fileName: string): AppFileType => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'PDF';
  if (extension === 'docx' || extension === 'doc') return 'DOCX';
  if (extension === 'txt') return 'TXT';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(extension || '')) return 'IMAGE';
  return 'OTHER';
};

interface TraversalResult {
  nodes: Set<NodeData>;
  links: Set<LinkData>;
}

// Recursive function to find linked nodes and links up to a certain depth
const traverseGraph = (
  startNodeId: string,
  currentDepth: number,
  maxDepth: number,
  allNodes: NodeData[],
  allLinks: LinkData[],
  visitedNodesInPath: Set<string>, // Tracks nodes in the current traversal path to avoid cycles
  collectedNodes: Map<string, NodeData>,
  collectedLinkIds: Set<string>
): void => {
  if (currentDepth > maxDepth || visitedNodesInPath.has(startNodeId)) {
    return;
  }
  visitedNodesInPath.add(startNodeId);

  const currentNode = allNodes.find(n => n.id === startNodeId);
  if (currentNode) {
    collectedNodes.set(startNodeId, currentNode);
  } else {
    visitedNodesInPath.delete(startNodeId); // Backtrack
    return; 
  }

  const relatedLinks = allLinks.filter(link => link.sourceNodeId === startNodeId || link.targetNodeId === startNodeId);

  for (const link of relatedLinks) {
    const neighborId = link.sourceNodeId === startNodeId ? link.targetNodeId : link.sourceNodeId;
    const neighborNode = allNodes.find(n => n.id === neighborId);
    
    if (neighborNode) {
        collectedLinkIds.add(link.id);
        traverseGraph(neighborId, currentDepth + 1, maxDepth, allNodes, allLinks, visitedNodesInPath, collectedNodes, collectedLinkIds);
    }
  }
  visitedNodesInPath.delete(startNodeId); // Backtrack for other paths
};


export default function KnowledgeCanvasPage() {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [links, setLinks] = useState<LinkData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDepth, setSearchDepth] = useState<number>(1);
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [selectedNodesForLinking, setSelectedNodesForLinking] = useState<string[]>([]);
  
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [currentNote, setCurrentNote] = useState<{ title: string; content: string }>({ title: '', content: '' });
  const [currentNoteCreationCoords, setCurrentNoteCreationCoords] = useState<{x: number, y: number} | null>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [currentEditData, setCurrentEditData] = useState<{ title: string; content: string }>({ title: '', content: '' });

  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartCoordsRef = useRef<{ x: number, y: number } | null>(null);
  const didPanRef = useRef(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);

  const addNode = useCallback((type: NodeType, title: string, content?: string, fileType?: AppFileType, posX?: number, posY?: number) => {
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    
    let worldX: number, worldY: number;

    if (posX !== undefined && posY !== undefined) {
      // posX and posY are already world coordinates if provided (e.g., from double click or drop)
      worldX = posX;
      worldY = posY;
    } else {
      // Random placement, calculate view coordinates then convert to world
      const randomViewX = canvasBounds ? Math.random() * (canvasBounds.width - 256) : Math.random() * 500;
      const randomViewY = canvasBounds ? Math.random() * (canvasBounds.height - 150) : Math.random() * 300;
      worldX = (randomViewX - canvasOffset.x) / zoomLevel;
      worldY = (randomViewY - canvasOffset.y) / zoomLevel;
    }
  
    const newNode: NodeData = {
      id: crypto.randomUUID(),
      type,
      title,
      content,
      fileType,
      x: Math.max(0, worldX), 
      y: Math.max(0, worldY),
      width: 256, 
      height: type === 'note' ? 160 : 120,
    };
    setNodes((prevNodes) => [...prevNodes, newNode]);
    return newNode;
  }, [canvasRef, canvasOffset.x, canvasOffset.y, zoomLevel]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      handleFilesDrop(Array.from(files));
    }
    if (event.target) {
      event.target.value = ""; 
    }
  };
  
  const handleFilesDrop = useCallback((droppedFiles: File[], dropX?: number, dropY?: number) => {
    droppedFiles.forEach(file => {
      addNode('file', file.name, undefined, getFileType(file.name), dropX, dropY);
      toast({ title: "File Uploaded", description: `${file.name} added to canvas.` });
    });
  }, [addNode, toast]);

  const handleCreateNote = useCallback(() => {
    setCurrentNote({ title: '', content: '' }); 
    setIsNoteDialogOpen(true);
    setIsEditDialogOpen(false);
    setEditingNodeId(null);
  }, []);
  
  const handleSaveNote = () => {
    if (!currentNote.title.trim()) {
      toast({ title: "Error", description: "Note title cannot be empty.", variant: "destructive" });
      return;
    }
    addNode('note', currentNote.title, currentNote.content, undefined, currentNoteCreationCoords?.x, currentNoteCreationCoords?.y);
    toast({ title: "Note Created", description: `Note "${currentNote.title}" added.` });
    setIsNoteDialogOpen(false);
    setCurrentNoteCreationCoords(null); 
  };

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    const nodeToEdit = nodes.find(n => n.id === nodeId);
    if (nodeToEdit) {
      setEditingNodeId(nodeId);
      setCurrentEditData({ title: nodeToEdit.title, content: nodeToEdit.content || '' });
      setIsEditDialogOpen(true);
      setIsNoteDialogOpen(false); // Ensure create dialog is closed
    }
  }, [nodes]);

  const handleSaveEditedNode = () => {
    if (!editingNodeId || !currentEditData.title.trim()) {
      toast({ title: "Error", description: "Title cannot be empty.", variant: "destructive" });
      return;
    }
    const nodeBeingEdited = nodes.find(n => n.id === editingNodeId);
    if (!nodeBeingEdited) {
        toast({ title: "Error", description: "Node not found for editing.", variant: "destructive" });
        setIsEditDialogOpen(false);
        setEditingNodeId(null);
        return;
    }

    setNodes(prevNodes =>
      prevNodes.map(n =>
        n.id === editingNodeId
          ? {
              ...n,
              title: currentEditData.title,
              content: n.type === 'note' ? currentEditData.content : n.content,
            }
          : n
      )
    );
    toast({ title: "Node Updated", description: `"${currentEditData.title}" updated successfully.` });
    setIsEditDialogOpen(false);
    setEditingNodeId(null);
  };


  const handleToggleLinkMode = () => {
    setIsLinkingMode(!isLinkingMode);
    setSelectedNodesForLinking([]); 
    if (isPanning) setIsPanning(false); 
    if (!isLinkingMode) {
      toast({ title: "Linking Mode Activated", description: "Select two nodes to link them." });
    } else {
      toast({ title: "Linking Mode Deactivated" });
    }
  };

  const handleNodeClick = (nodeId: string, event: React.MouseEvent) => {
    event.stopPropagation(); 

    if (isLinkingMode) {
      setSelectedNodesForLinking((prevSelected) => {
        if (prevSelected.includes(nodeId)) {
          return prevSelected.filter((id) => id !== nodeId); 
        }
        const newSelected = [...prevSelected, nodeId];
        if (newSelected.length === 2) {
          const newLink: LinkData = {
            id: crypto.randomUUID(),
            sourceNodeId: newSelected[0],
            targetNodeId: newSelected[1],
          };
          setLinks((prevLinks) => [...prevLinks, newLink]);
          toast({ title: "Nodes Linked", description: "Link created successfully." });
          return []; 
        }
        return newSelected;
      });
    } else {
      // console.log("Node clicked (not in linking mode):", nodeId);
    }
  };
  
  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }
    if (isLinkingMode) {
      setSelectedNodesForLinking([]); 
    }
  };

  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    if (!canvasBounds || isLinkingMode || isPanning || isEditDialogOpen) return;

    // Prevent if double click is on a node item (handled by NodeItem's onDoubleClick)
    let target = event.target as HTMLElement;
    while (target && target !== event.currentTarget) {
        if (target.closest('[data-node-item="true"]')) {
            return;
        }
        target = target.parentElement as HTMLElement;
    }

    const viewX = event.clientX - canvasBounds.left;
    const viewY = event.clientY - canvasBounds.top;
    
    const worldX = (viewX - canvasOffset.x) / zoomLevel;
    const worldY = (viewY - canvasOffset.y) / zoomLevel;
    
    setCurrentNoteCreationCoords({ x: worldX, y: worldY });
    handleCreateNote();
  };

  const handleNodeDrag = useCallback((nodeId: string, x: number, y: number) => {
    setNodes(prevNodes =>
      prevNodes.map(node =>
        node.id === nodeId ? { ...node, x, y } : node
      )
    );
  }, []);

  const handleCanvasMouseDownForPan = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isLinkingMode) return; 
    
    let targetElement = event.target as HTMLElement;
    while (targetElement && targetElement !== event.currentTarget) {
        if (targetElement.closest('[data-node-item="true"]')) { 
            return; 
        }
        targetElement = targetElement.parentElement as HTMLElement;
    }

    event.preventDefault();
    didPanRef.current = false;
    setIsPanning(true);
    panStartCoordsRef.current = {
      x: event.clientX - canvasOffset.x,
      y: event.clientY - canvasOffset.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isPanning || !panStartCoordsRef.current) return;
      didPanRef.current = true;
      const newX = event.clientX - panStartCoordsRef.current.x;
      const newY = event.clientY - panStartCoordsRef.current.y;
      setCanvasOffset({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsPanning(false);
      panStartCoordsRef.current = null;
    };

    if (isPanning) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, canvasOffset.x, canvasOffset.y]);


  const handleCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const zoomSpeed = 0.1;
    const minZoom = 0.2;
    const maxZoom = 2.0;

    const newZoomLevel = Math.max(minZoom, Math.min(maxZoom, zoomLevel - event.deltaY * zoomSpeed * 0.01));

    if (newZoomLevel === zoomLevel) return; // No change

    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    if (!canvasBounds) return;

    const mouseXInView = event.clientX - canvasBounds.left;
    const mouseYInView = event.clientY - canvasBounds.top;

    // World coordinates of the point under the mouse before zoom
    const worldXBeforeZoom = (mouseXInView - canvasOffset.x) / zoomLevel;
    const worldYBeforeZoom = (mouseYInView - canvasOffset.y) / zoomLevel;
    
    setZoomLevel(newZoomLevel);

    // New offset to keep the point under the mouse stationary
    const newOffsetX = mouseXInView - worldXBeforeZoom * newZoomLevel;
    const newOffsetY = mouseYInView - worldYBeforeZoom * newZoomLevel;
    
    setCanvasOffset({ x: newOffsetX, y: newOffsetY });
  };


  const filteredNodesAndLinks = useMemo(() => {
    if (!searchTerm.trim()) {
      return { displayNodes: nodes, displayLinks: links };
    }

    const lowerSearchTerm = searchTerm.toLowerCase();
    const matchedInitialNodes = nodes.filter(node =>
      node.title.toLowerCase().includes(lowerSearchTerm) ||
      (node.type === 'note' && node.content?.toLowerCase().includes(lowerSearchTerm))
    );

    if (matchedInitialNodes.length === 0) {
      return { displayNodes: [], displayLinks: [] };
    }

    const collectedNodesMap = new Map<string, NodeData>();
    const collectedLinkIdsSet = new Set<string>();

    matchedInitialNodes.forEach(startNode => {
      const visitedNodesInPath = new Set<string>();
      traverseGraph(startNode.id, 0, searchDepth, nodes, links, visitedNodesInPath, collectedNodesMap, collectedLinkIdsSet);
    });
    
    const displayNodes = Array.from(collectedNodesMap.values());
    const displayLinks = links.filter(link => 
        collectedLinkIdsSet.has(link.id) &&
        collectedNodesMap.has(link.sourceNodeId) &&
        collectedNodesMap.has(link.targetNodeId)
    );

    return { displayNodes, displayLinks };
  }, [nodes, links, searchTerm, searchDepth]);

  const currentEditingNodeDetails = useMemo(() => {
    if (!editingNodeId) return null;
    return nodes.find(n => n.id === editingNodeId);
  }, [editingNodeId, nodes]);

  const handleDialogClose = () => {
    setIsNoteDialogOpen(false);
    setIsEditDialogOpen(false);
    setEditingNodeId(null);
    setCurrentNoteCreationCoords(null);
    // Optionally reset currentNote and currentEditData here if desired
    // setCurrentNote({ title: '', content: '' });
    // setCurrentEditData({ title: '', content: '' });
  };


  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <Toolbar
        onFileUpload={handleFileUpload}
        onCreateNote={handleCreateNote}
        onSearch={setSearchTerm}
        currentSearchTerm={searchTerm}
        onDepthChange={(depthArr) => setSearchDepth(depthArr[0])}
        currentDepth={searchDepth}
        onToggleLinkMode={handleToggleLinkMode}
        isLinkingMode={isLinkingMode}
      />
      <main className="flex-grow relative">
        <KnowledgeCanvas
          canvasRef={canvasRef}
          nodes={filteredNodesAndLinks.displayNodes}
          links={filteredNodesAndLinks.displayLinks}
          selectedNodeIdsForLinking={selectedNodesForLinking}
          isLinkingMode={isLinkingMode}
          isPanning={isPanning}
          canvasOffset={canvasOffset}
          zoomLevel={zoomLevel}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onCanvasClick={handleCanvasClick}
          onCanvasDoubleClick={handleCanvasDoubleClick}
          onCanvasMouseDownForPan={handleCanvasMouseDownForPan}
          onCanvasWheel={handleCanvasWheel}
          onFilesDrop={handleFilesDrop}
          onNodeDrag={handleNodeDrag}
        />
      </main>
      <Toaster />
      
      <AlertDialog open={isNoteDialogOpen || isEditDialogOpen} onOpenChange={(isOpen) => !isOpen && handleDialogClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {editingNodeId 
                ? currentEditingNodeDetails?.type === 'note' 
                  ? `Edit Note: ${currentEditingNodeDetails?.title}` 
                  : `Edit File: ${currentEditingNodeDetails?.title}`
                : "Create New Note"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editingNodeId
                ? "Update the details below."
                : "Enter a title and content for your new note."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dialog-title" className="text-right">
                Title
              </Label>
              <Input
                id="dialog-title"
                value={editingNodeId ? currentEditData.title : currentNote.title}
                onChange={(e) => 
                  editingNodeId 
                    ? setCurrentEditData(prev => ({ ...prev, title: e.target.value })) 
                    : setCurrentNote(prev => ({ ...prev, title: e.target.value }))
                }
                className="col-span-3"
              />
            </div>
            {(!editingNodeId || currentEditingNodeDetails?.type === 'note') && (
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="dialog-content" className="text-right pt-2">
                  Content
                </Label>
                <Textarea
                  id="dialog-content"
                  value={editingNodeId ? currentEditData.content : currentNote.content}
                  onChange={(e) => 
                    editingNodeId 
                      ? setCurrentEditData(prev => ({ ...prev, content: e.target.value })) 
                      : setCurrentNote(prev => ({ ...prev, content: e.target.value }))
                  }
                  className="col-span-3 min-h-[100px]"
                  placeholder="Type your note here..."
                />
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDialogClose}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={editingNodeId ? handleSaveEditedNode : handleSaveNote}>
              {editingNodeId ? "Save Changes" : "Save Note"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

