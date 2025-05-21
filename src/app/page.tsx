
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { XIcon, PlusCircleIcon, CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';


// Helper to determine file type
const getFileType = (fileName: string): AppFileType => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'PDF';
  if (extension === 'docx' || extension === 'doc') return 'DOCX';
  if (extension === 'txt') return 'TXT';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(extension || '')) return 'IMAGE';
  return 'OTHER';
};

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
  const [currentNote, setCurrentNote] = useState<{ title: string; content: string; tags: string[] }>({ title: '', content: '', tags: [] });
  const [currentNoteCreationCoords, setCurrentNoteCreationCoords] = useState<{x: number, y: number} | null>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [currentEditData, setCurrentEditData] = useState<{ title: string; content: string; tags: string[] }>({ title: '', content: '', tags: [] });
  const [tagInputValue, setTagInputValue] = useState('');
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);


  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartCoordsRef = useRef<{ x: number, y: number } | null>(null);
  const didPanRef = useRef(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);

  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);
  const isFirstRenderForLinkModeToast = useRef(true);
  const previousLinksLengthRef = useRef(links.length);

  useEffect(() => {
    const uniqueTags = new Set<string>();
    nodes.forEach(node => {
      if (node.tags) {
        node.tags.forEach(tag => uniqueTags.add(tag));
      }
    });
    setAllTags(Array.from(uniqueTags).sort());
  }, [nodes]);

  const handleFilterTagToggle = (tagToToggle: string) => {
    setSelectedFilterTags(prev =>
      prev.includes(tagToToggle)
        ? prev.filter(t => t !== tagToToggle)
        : [...prev, tagToToggle]
    );
  };


  const addNode = useCallback((type: NodeType, title: string, content?: string, fileType?: AppFileType, tags?: string[], posX?: number, posY?: number) => {
    const canvasBounds = canvasRef.current?.getBoundingClientRect();

    let worldX: number, worldY: number;

    if (posX !== undefined && posY !== undefined) {
      worldX = posX;
      worldY = posY;
    } else {
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
      tags: tags || [],
      x: Math.max(0, worldX),
      y: Math.max(0, worldY),
      width: 256,
      height: type === 'note' ? (content && content.length > 50 ? 200 : 160) : 120, // Basic height adjustment
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
      addNode('file', file.name, undefined, getFileType(file.name), [], dropX, dropY);
      toast({ title: "File Uploaded", description: `${file.name} added to canvas.` });
    });
  }, [addNode, toast]);

  const handleCreateNote = useCallback(() => {
    setCurrentNote({ title: '', content: '', tags: [] });
    setTagInputValue('');
    setIsNoteDialogOpen(true);
    setIsEditDialogOpen(false);
    setEditingNodeId(null);
  }, []);

  const handleSaveNote = () => {
    if (!currentNote.title.trim()) {
      toast({ title: "Error", description: "Note title cannot be empty.", variant: "destructive" });
      return;
    }
    addNode('note', currentNote.title, currentNote.content, undefined, currentNote.tags, currentNoteCreationCoords?.x, currentNoteCreationCoords?.y);
    toast({ title: "Note Created", description: `Note "${currentNote.title}" added.` });
    setIsNoteDialogOpen(false);
    setCurrentNoteCreationCoords(null);
  };

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    const nodeToEdit = nodes.find(n => n.id === nodeId);
    if (nodeToEdit) {
      setEditingNodeId(nodeId);
      setCurrentEditData({
        title: nodeToEdit.title,
        content: nodeToEdit.content || '',
        tags: nodeToEdit.tags || []
      });
      setTagInputValue('');
      setIsEditDialogOpen(true);
      setIsNoteDialogOpen(false);
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
              tags: currentEditData.tags,
              height: n.type === 'note' ? (currentEditData.content && currentEditData.content.length > 50 ? 200 : 160) : n.height, // Adjust height on edit
            }
          : n
      )
    );
    toast({ title: "Node Updated", description: `"${currentEditData.title}" updated successfully.` });
    setIsEditDialogOpen(false);
    setEditingNodeId(null);
  };

  const handleToggleLinkMode = () => {
    setIsLinkingMode(prevIsLinkingMode => !prevIsLinkingMode);
    setSelectedNodesForLinking([]);
    if (isPanning) setIsPanning(false);
  };

  useEffect(() => {
    if (isFirstRenderForLinkModeToast.current) {
      isFirstRenderForLinkModeToast.current = false;
      return;
    }

    if (isLinkingMode) {
      toast({ title: "Linking Mode Activated", description: "Select two nodes to link them." });
    } else {
      toast({ title: "Linking Mode Deactivated" });
    }
  }, [isLinkingMode, toast]);

  useEffect(() => {
    if (links.length > previousLinksLengthRef.current) {
      toast({ title: "Nodes Linked", description: "Link created successfully." });
    }
    previousLinksLengthRef.current = links.length;
  }, [links, toast]);


  const handleNodeClick = (nodeId: string, event: React.MouseEvent) => {
    if (didPanRef.current || (event.target as HTMLElement).closest('[data-dragging="true"]')) {
      didPanRef.current = false;
      return;
    }

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
          return [];
        }
        return newSelected;
      });
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
    if (!canvasBounds || isLinkingMode || isPanning || isEditDialogOpen || isNoteDialogOpen) return;

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

    if (newZoomLevel === zoomLevel) return;

    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    if (!canvasBounds) return;

    const mouseXInView = event.clientX - canvasBounds.left;
    const mouseYInView = event.clientY - canvasBounds.top;

    const worldXBeforeZoom = (mouseXInView - canvasOffset.x) / zoomLevel;
    const worldYBeforeZoom = (mouseYInView - canvasOffset.y) / zoomLevel;

    setZoomLevel(newZoomLevel);

    const newOffsetX = mouseXInView - worldXBeforeZoom * newZoomLevel;
    const newOffsetY = mouseYInView - worldYBeforeZoom * newZoomLevel;

    setCanvasOffset({ x: newOffsetX, y: newOffsetY });
  };


  const filteredNodesAndLinks = useMemo(() => {
    if (!searchTerm.trim() && selectedFilterTags.length === 0) {
      return { displayNodes: nodes, displayLinks: links };
    }

    const lowerSearchTerm = searchTerm.toLowerCase();

    let matchedInitialNodes = nodes.filter(node => {
      const matchesSelectedTags = selectedFilterTags.length > 0
        ? node.tags && node.tags.some(tag => selectedFilterTags.includes(tag))
        : true;

      const matchesSearchTerm = searchTerm.trim()
        ? (
            node.title.toLowerCase().includes(lowerSearchTerm) ||
            (node.type === 'note' && node.content?.toLowerCase().includes(lowerSearchTerm)) ||
            (node.tags && node.tags.some(tag => tag.toLowerCase().includes(lowerSearchTerm)))
          )
        : true;

      if (selectedFilterTags.length > 0 && searchTerm.trim()){
        return matchesSelectedTags && matchesSearchTerm;
      } else if (selectedFilterTags.length > 0){
        return matchesSelectedTags;
      } else if (searchTerm.trim()){
        return matchesSearchTerm;
      }
      return false; 
    });


    if (matchedInitialNodes.length === 0 && (searchTerm.trim() || selectedFilterTags.length > 0)) {
       return { displayNodes: [], displayLinks: [] };
    }
     if (matchedInitialNodes.length === 0 && !searchTerm.trim() && selectedFilterTags.length === 0) {
      return { displayNodes: nodes, displayLinks: links };
    }


    const collectedNodesMap = new Map<string, NodeData>();
    const collectedLinkIds = new Set<string>();

    matchedInitialNodes.forEach(startNode => {
      const visitedNodesInPath = new Set<string>();
      traverseGraph(startNode.id, 0, searchDepth, nodes, links, visitedNodesInPath, collectedNodesMap, collectedLinkIds);
    });

    const displayNodes = Array.from(collectedNodesMap.values());
    const displayLinks = links.filter(link =>
        collectedLinkIds.has(link.id) &&
        collectedNodesMap.has(link.sourceNodeId) &&
        collectedNodesMap.has(link.targetNodeId)
    );

    return { displayNodes, displayLinks };
  }, [nodes, links, searchTerm, searchDepth, selectedFilterTags]);

  const currentEditingNodeDetails = useMemo(() => {
    if (!editingNodeId) return null;
    return nodes.find(n => n.id === editingNodeId);
  }, [editingNodeId, nodes]);

  const handleCreateEditDialogClose = () => {
    setIsNoteDialogOpen(false);
    setIsEditDialogOpen(false);
    setEditingNodeId(null);
    setCurrentNoteCreationCoords(null);
    setCurrentNote({ title: '', content: '', tags: [] });
    setCurrentEditData({ title: '', content: '', tags: [] });
    setTagInputValue('');
    setIsTagSelectorOpen(false);
  };

  const handleAddTagToDialog = () => {
    const newTag = tagInputValue.trim();
    if (!newTag) return;

    if (isNoteDialogOpen) {
      if (!currentNote.tags.includes(newTag)) {
        setCurrentNote(prev => ({ ...prev, tags: [...prev.tags, newTag] }));
      }
    } else if (isEditDialogOpen) {
      if (!currentEditData.tags.includes(newTag)) {
        setCurrentEditData(prev => ({ ...prev, tags: [...prev.tags, newTag] }));
      }
    }
    setTagInputValue('');
  };

  const handleRemoveTagFromDialog = (tagToRemove: string) => {
    if (isNoteDialogOpen) {
      setCurrentNote(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) }));
    } else if (isEditDialogOpen) {
      setCurrentEditData(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) }));
    }
  };

  const handleSelectTagFromList = (tagToAdd: string) => {
    if (isNoteDialogOpen) {
      if (!currentNote.tags.includes(tagToAdd)) {
        setCurrentNote(prev => ({ ...prev, tags: [...prev.tags, tagToAdd] }));
      }
    } else if (isEditDialogOpen) {
      if (!currentEditData.tags.includes(tagToAdd)) {
        setCurrentEditData(prev => ({ ...prev, tags: [...prev.tags, tagToAdd] }));
      }
    }
  };

  const handleAutoLayout = () => {
    if (nodes.length === 0) return;

    const newNodes = JSON.parse(JSON.stringify(nodes)) as NodeData[];
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    const DEFAULT_NODE_WIDTH = 256;
    const DEFAULT_NODE_HEIGHT = 160;
    const HORIZONTAL_SPACING = 100;
    const VERTICAL_SPACING = 60;
    const PAGE_MARGIN_X = 50;
    const PAGE_MARGIN_Y = 50;

    newNodes.forEach(n => {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    });

    links.forEach(link => {
      adj.get(link.sourceNodeId)?.push(link.targetNodeId);
      inDegree.set(link.targetNodeId, (inDegree.get(link.targetNodeId) || 0) + 1);
    });

    let queue = newNodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
    const layers: string[][] = [];
    
    while (queue.length > 0) {
      const currentLayerNodeIds = [...queue];
      layers.push(currentLayerNodeIds);
      const nextQueue: string[] = [];
      
      currentLayerNodeIds.forEach(nodeId => {
        (adj.get(nodeId) || []).forEach(neighborId => {
          inDegree.set(neighborId, (inDegree.get(neighborId) || 1) - 1);
          if ((inDegree.get(neighborId) || 0) === 0) {
            nextQueue.push(neighborId);
          }
        });
      });
      queue = nextQueue;
    }
    
    layers.forEach((layer, layerIndex) => {
      let currentY = PAGE_MARGIN_Y;
      const layerX = PAGE_MARGIN_X + layerIndex * (DEFAULT_NODE_WIDTH + HORIZONTAL_SPACING);
      layer.forEach(nodeId => {
        const nodeToPosition = newNodes.find(n => n.id === nodeId);
        if (nodeToPosition) {
          nodeToPosition.x = layerX;
          nodeToPosition.y = currentY;
          currentY += (nodeToPosition.height || DEFAULT_NODE_HEIGHT) + VERTICAL_SPACING;
        }
      });
    });

    // Handle nodes not in layers (e.g. part of cycles or disconnected)
    const positionedNodeIds = new Set(layers.flat());
    let lastX = PAGE_MARGIN_X + (layers.length > 0 ? layers.length -1 : 0) * (DEFAULT_NODE_WIDTH + HORIZONTAL_SPACING);
    if(layers.length > 0) lastX += DEFAULT_NODE_WIDTH + HORIZONTAL_SPACING; else lastX = PAGE_MARGIN_X;

    let unPositionY = PAGE_MARGIN_Y;
    newNodes.forEach(node => {
      if (!positionedNodeIds.has(node.id)) {
        node.x = lastX;
        node.y = unPositionY;
        unPositionY += (node.height || DEFAULT_NODE_HEIGHT) + VERTICAL_SPACING;
      }
    });

    setNodes(newNodes);
    toast({ title: "Layout Applied", description: "Nodes have been automatically arranged." });
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
        allTags={allTags}
        selectedFilterTags={selectedFilterTags}
        onFilterTagToggle={handleFilterTagToggle}
        onAutoLayout={handleAutoLayout}
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

      {/* Create/Edit Node Dialog */}
      <AlertDialog open={isNoteDialogOpen || isEditDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) handleCreateEditDialogClose(); }}>
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
                : "Enter a title, content (optional), and tags (optional) for your new note."}
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
            {/* Tag Input Section */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="dialog-tags-input" className="text-right pt-2">
                Tags
              </Label>
              <div className="col-span-3">
                <div className="flex gap-2">
                  <Input
                    id="dialog-tags-input"
                    value={tagInputValue}
                    onChange={(e) => setTagInputValue(e.target.value)}
                    className="flex-grow"
                    placeholder="Add new tag and press Enter"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTagToDialog();
                      }
                    }}
                  />
                  <Popover open={isTagSelectorOpen} onOpenChange={setIsTagSelectorOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" size="icon">
                        <PlusCircleIcon className="h-4 w-4" />
                        <span className="sr-only">Add existing tag</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0">
                      <div className="flex flex-col gap-1 p-1 max-h-48 overflow-y-auto">
                        {allTags.length > 0 ? (
                          allTags.map(tag => {
                            const currentDialogTags = editingNodeId ? currentEditData.tags : currentNote.tags;
                            const isAlreadyAdded = currentDialogTags.includes(tag);
                            return (
                              <Button
                                key={tag}
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  "w-full justify-start text-left h-8",
                                  isAlreadyAdded && "opacity-50 cursor-not-allowed"
                                )}
                                onClick={() => {
                                  if (!isAlreadyAdded) {
                                    handleSelectTagFromList(tag);
                                  }
                                }}
                                disabled={isAlreadyAdded}
                              >
                                {tag}
                                {isAlreadyAdded && <CheckIcon className="ml-auto h-3 w-3" />}
                              </Button>
                            );
                          })
                        ) : (
                          <p className="text-xs text-muted-foreground text-center p-2">No existing tags to select.</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(editingNodeId ? currentEditData.tags : currentNote.tags).map(tag => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                      {tag}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-auto w-auto p-0.5 hover:bg-destructive/20"
                        onClick={() => handleRemoveTagFromDialog(tag)}
                      >
                        <XIcon className="h-3 w-3 text-destructive" />
                        <span className="sr-only">Remove tag {tag}</span>
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCreateEditDialogClose}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={editingNodeId ? handleSaveEditedNode : handleSaveNote}>
              {editingNodeId ? "Save Changes" : "Save Note"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
