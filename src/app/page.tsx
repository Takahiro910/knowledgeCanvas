
"use client";

import type React from 'react';
import { useState, useMemo, useCallback, useRef } from 'react';
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
        // Add link if it connects two nodes that will be in the result
        // This condition is better handled after all nodes are collected, or by ensuring neighbor is also collected.
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

  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);

  const addNode = (type: NodeType, title: string, content?: string, fileType?: AppFileType) => {
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    const randomX = canvasBounds ? Math.random() * (canvasBounds.width - 256) : Math.random() * 500;
    const randomY = canvasBounds ? Math.random() * (canvasBounds.height - 150) : Math.random() * 300;

    const newNode: NodeData = {
      id: crypto.randomUUID(),
      type,
      title,
      content,
      fileType,
      x: Math.max(0, randomX), // Ensure positive coordinates
      y: Math.max(0, randomY),
      width: 256, 
      height: type === 'note' ? 160 : 120,
    };
    setNodes((prevNodes) => [...prevNodes, newNode]);
    return newNode;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      handleFilesDrop(Array.from(files));
    }
    // Reset file input to allow uploading the same file again
    if (event.target) {
      event.target.value = ""; 
    }
  };
  
  const handleFilesDrop = (droppedFiles: File[]) => {
    droppedFiles.forEach(file => {
      addNode('file', file.name, undefined, getFileType(file.name));
      toast({ title: "File Uploaded", description: `${file.name} added to canvas.` });
    });
  };

  const handleCreateNote = () => {
    setCurrentNote({ title: '', content: '' }); // Reset for new note
    setIsNoteDialogOpen(true);
  };
  
  const handleSaveNote = () => {
    if (!currentNote.title.trim()) {
      toast({ title: "Error", description: "Note title cannot be empty.", variant: "destructive" });
      return;
    }
    addNode('note', currentNote.title, currentNote.content);
    toast({ title: "Note Created", description: `Note "${currentNote.title}" added.` });
    setIsNoteDialogOpen(false);
  };


  const handleToggleLinkMode = () => {
    setIsLinkingMode(!isLinkingMode);
    setSelectedNodesForLinking([]); // Clear selections when toggling mode
    if (!isLinkingMode) {
      toast({ title: "Linking Mode Activated", description: "Select two nodes to link them." });
    } else {
      toast({ title: "Linking Mode Deactivated" });
    }
  };

  const handleNodeClick = (nodeId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent canvas click from firing

    if (isLinkingMode) {
      setSelectedNodesForLinking((prevSelected) => {
        if (prevSelected.includes(nodeId)) {
          return prevSelected.filter((id) => id !== nodeId); // Deselect
        }
        const newSelected = [...prevSelected, nodeId];
        if (newSelected.length === 2) {
          // Create link
          const newLink: LinkData = {
            id: crypto.randomUUID(),
            sourceNodeId: newSelected[0],
            targetNodeId: newSelected[1],
          };
          setLinks((prevLinks) => [...prevLinks, newLink]);
          toast({ title: "Nodes Linked", description: "Link created successfully." });
          return []; // Reset selection
        }
        return newSelected;
      });
    } else {
      // Handle other node click interactions, e.g., showing details (not implemented here)
      console.log("Node clicked (not in linking mode):", nodeId);
    }
  };
  
  const handleCanvasClick = () => {
    if (isLinkingMode) {
      setSelectedNodesForLinking([]); // Deselect if clicked on canvas bg
    }
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
          onNodeClick={handleNodeClick}
          onCanvasClick={handleCanvasClick}
          onFilesDrop={handleFilesDrop}
        />
      </main>
      <Toaster />
      
      <AlertDialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create New Note</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a title and content for your new note.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="note-title" className="text-right">
                Title
              </Label>
              <Input
                id="note-title"
                value={currentNote.title}
                onChange={(e) => setCurrentNote(prev => ({ ...prev, title: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="note-content" className="text-right pt-2">
                Content
              </Label>
              <Textarea
                id="note-content"
                value={currentNote.content}
                onChange={(e) => setCurrentNote(prev => ({ ...prev, content: e.target.value }))}
                className="col-span-3 min-h-[100px]"
                placeholder="Type your note here..."
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveNote}>Save Note</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
