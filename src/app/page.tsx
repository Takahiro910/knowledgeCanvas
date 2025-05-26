"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { KnowledgeCanvas } from '@/components/knowledge-canvas/KnowledgeCanvas';
import { Toolbar } from '@/components/knowledge-canvas/Toolbar';
import type { NodeData, LinkData, FileType as AppFileType, NodeType, DeleteModeState } from '@/types';
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
import { XIcon, PlusCircleIcon, CheckIcon, FileIcon } from 'lucide-react'; // FileIcon を追加
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import path from 'path'; // path をインポート

// ★ DBのdataカラムに保存する内容を表す型 (page.tsx内で定義)
interface NodeMetaData {
  title?: string;
  content?: string;
  fileType?: AppFileType;
  filePath?: string; // filePath を追加
  tags?: string[];
  width?: number;
  height?: number;
  // 他に data カラムに保存するプロパティがあればここに追加
}

// Preloadで公開したAPIの型定義
declare global {
  interface Window {
    electronAPI: {
      getAllNodes: () => Promise<Array<{ id: string; type: NodeType; position: string; data: string; createdAt: string }>>;
      getAllLinks: () => Promise<Array<{ id: string; source: string; target: string; createdAt: string }>>;
      addNode: (node: { id: string; type: NodeType; position: string; data: string; }) => Promise<any>;
      addLink: (link: { id: string; source: string; target: string; }) => Promise<any>;
      updateNodePosition: (id: string, position: { x: number; y: number }) => Promise<any>;
      updateNodeData: (id: string, dataToSave: Partial<NodeMetaData>) => Promise<any>;
      deleteNode: (id: string) => Promise<any>;
      deleteLink: (id: string) => Promise<any>;
      openFileDialog: () => Promise<string[]>;
      saveFileDialog: (defaultPath?: string) => Promise<string | null>;
      // New Local File Operations
      saveLocalFile: (fileName: string, fileDataBuffer: ArrayBuffer) => Promise<string | null>;
      openLocalFile: (filePath: string) => Promise<boolean>;
      getUploadsDir: () => Promise<string>;
    };
  }
}


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
  visitedNodesInPath: Set<string>,
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
    visitedNodesInPath.delete(startNodeId);
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
  visitedNodesInPath.delete(startNodeId);
};


export default function KnowledgeCanvasPage() {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [links, setLinks] = useState<LinkData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDepth, setSearchDepth] = useState<number>(1);
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [selectedNodesForLinking, setSelectedNodesForLinking] = useState<string[]>([]);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedItemsForDeletion, setSelectedItemsForDeletion] = useState<{ nodes: string[]; links: string[]; }>({ nodes: [], links: [] });
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [currentNote, setCurrentNote] = useState<{ title: string; content: string; tags: string[] }>({ title: '', content: '', tags: [] });
  const [currentNoteCreationCoords, setCurrentNoteCreationCoords] = useState<{x: number, y: number} | null>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [currentEditData, setCurrentEditData] = useState<{ title: string; content: string; tags: string[] }>({ title: '', content: '', tags: [] });
  const [tagInputValue, setTagInputValue] = useState('');
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
  const [tagSearchValue, setTagSearchValue] = useState('');
  const [isTitleFieldFocused, setIsTitleFieldFocused] = useState(false);


  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartCoordsRef = useRef<{ x: number, y: number } | null>(null);
  const didPanRef = useRef(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);

  const { toast } = useToast();

  useEffect(() => {
    if (!isTagSelectorOpen) {
      setTagSearchValue('');
    }
  }, [isTagSelectorOpen]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const isFirstRenderForLinkModeToast = useRef(true);
  const previousLinksLengthRef = useRef(links.length);
  const isInitialRenderForAutoLayoutEffect = useRef(true);

  // --- データ読み込み ---
  useEffect(() => {
    const loadData = async () => {
      try {
        if (window.electronAPI) {
          const loadedNodesFromDB = await window.electronAPI.getAllNodes();
          const loadedLinksFromDB = await window.electronAPI.getAllLinks();

          const parsedNodes: NodeData[] = loadedNodesFromDB.map(dbNode => {
            const position = JSON.parse(dbNode.position) as { x: number; y: number };
            const metaData = JSON.parse(dbNode.data) as NodeMetaData;
            return {
              id: dbNode.id,
              type: dbNode.type,
              title: metaData.title || '',
              content: metaData.content,
              fileType: metaData.fileType,
              filePath: metaData.filePath, // filePath を追加
              tags: metaData.tags || [],
              x: position.x,
              y: position.y,
              width: metaData.width,
              height: metaData.height,
            };
          });
          setNodes(parsedNodes);

          const parsedLinks: LinkData[] = loadedLinksFromDB.map(dbLink => ({
            id: dbLink.id,
            sourceNodeId: dbLink.source,
            targetNodeId: dbLink.target,
          }));
          setLinks(parsedLinks);

        } else {
          console.warn('Electron API not found. Running in browser mode?');
        }
      } catch (error) {
        console.error('Failed to load data from database:', error);
        toast({ title: "Error Loading Data", description: "Could not load data from the local database.", variant: "destructive" });
      }
    };
    loadData();
  }, [toast]);


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


  const internalAddNode = useCallback(async (
    type: NodeType,
    title: string,
    content?: string,
    fileType?: AppFileType,
    filePath?: string, // filePath パラメータを追加
    tags?: string[],
    posX?: number,
    posY?: number,
    width?: number,
    height?: number
  ) => {
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

    const newNodeForUI: NodeData = {
      id: uuidv4(),
      type,
      title,
      content,
      fileType,
      filePath, // filePath を追加
      tags: tags || [],
      x: Math.max(0, worldX),
      y: Math.max(0, worldY),
      width: width || 256,
      height: height || (type === 'note' ? (content && content.length > 50 ? 200 : 160) : 160),
    };

    const nodeForDB = {
        id: newNodeForUI.id,
        type: newNodeForUI.type,
        position: JSON.stringify({ x: newNodeForUI.x, y: newNodeForUI.y }),
        data: JSON.stringify({
            title: newNodeForUI.title,
            content: newNodeForUI.content,
            fileType: newNodeForUI.fileType,
            filePath: newNodeForUI.filePath, // filePath を追加
            tags: newNodeForUI.tags,
            width: newNodeForUI.width,
            height: newNodeForUI.height,
        } as NodeMetaData),
    };


    try {
        if (window.electronAPI) {
            await window.electronAPI.addNode(nodeForDB);
        }
        setNodes((prevNodes) => [...prevNodes, newNodeForUI]);
        toast({ title: `${type === 'note' ? "Note" : "File"} Created`, description: `"${title}" added.` });
    } catch (error) {
        console.error('Failed to add node:', error);
        toast({ title: "Error", description: `Failed to add ${type}.`, variant: "destructive" });
    }
    return newNodeForUI;
  }, [canvasRef, canvasOffset.x, canvasOffset.y, zoomLevel, toast]);


  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      handleFilesDrop(Array.from(files));
    }
    if (event.target) {
      event.target.value = "";
    }
  };

  const handleFilesDrop = useCallback(async (droppedFiles: File[], dropX?: number, dropY?: number) => {
    if (!window.electronAPI) {
        toast({ title: "Error", description: "File operations are not available.", variant: "destructive" });
        return;
    }

    for (const file of droppedFiles) {
      const nodeTypeForFile: NodeType = 'file';
      const appFileType = getFileType(file.name);
      const originalFilePath = (file as any).path; // Electronによって追加される元のファイルパス

      if (!originalFilePath) {
        toast({ title: "Error", description: `Could not get path for "${file.name}".`, variant: "destructive" });
        continue;
      }
      
      const isDuplicatePath = nodes.some(
        (node) => node.filePath === originalFilePath
      );

      if (isDuplicatePath) {
        toast({
          title: "Duplicate File Path",
          description: `A node for "${file.name}" with the same path already exists. Skipping.`,
          variant: "destructive",
        });
        continue;
      }
      
      try {
        // ファイルのローカル保存処理は削除
        // const fileBuffer = await file.arrayBuffer();
        // const savedFilePath = await window.electronAPI.saveLocalFile(file.name, fileBuffer); // 削除

        // originalFilePath を直接使用
        await internalAddNode(nodeTypeForFile, file.name, undefined, appFileType, originalFilePath, [], dropX, dropY);
        // internalAddNode は変更なしで、filePath に originalFilePath を渡す
      } catch (error) {
        console.error("Error processing dropped file:", error);
        toast({ title: "Error Processing File", description: `Failed to process "${file.name}".`, variant: "destructive" });
      }
    }
  }, [internalAddNode, nodes, toast]); // internalAddNode と nodes への依存を維持


  const handleCreateNote = useCallback(() => {
    setCurrentNote({ title: '', content: '', tags: [] });
    setTagInputValue('');
    setIsNoteDialogOpen(true);
    setIsEditDialogOpen(false);
    setEditingNodeId(null);
  }, []);

  const handleSaveNote = async () => {
    if (!currentNote.title.trim()) {
      toast({ title: "Error", description: "Note title cannot be empty.", variant: "destructive" });
      return;
    }
    const isDuplicateTitle = nodes.some(
      (node) => node.id !== editingNodeId && node.title.toLowerCase() === currentNote.title.trim().toLowerCase()
    );

    if (isDuplicateTitle) {
      toast({
        title: "Duplicate Title",
        description: "A node with this title already exists. Please use a different title.",
        variant: "destructive",
      });
      return;
    }

    // For notes, filePath is undefined
    await internalAddNode('note', currentNote.title, currentNote.content, undefined, undefined, currentNote.tags, currentNoteCreationCoords?.x, currentNoteCreationCoords?.y);
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
        // filePath is part of nodeToEdit, not directly in currentEditData for modification here
      });
      setTagInputValue('');
      setIsEditDialogOpen(true);
      setIsNoteDialogOpen(false);
    }
  }, [nodes]);


  const handleUpdateNodeContent = useCallback(async (nodeId: string, newContent: string) => {
      const nodeToUpdate = nodes.find(n => n.id === nodeId);
      if (!nodeToUpdate) {
          toast({ title: "Error", description: "Node not found for content update.", variant: "destructive" });
          return;
      }
      if (nodeToUpdate.type !== 'note') { // Only notes have inline content editing this way
          toast({ title: "Info", description: "Only note content can be edited directly here. Edit file descriptions via double-click.", variant: "default" });
          return;
      }

      const newHeight = newContent && newContent.length > 50 ? 200 : 160;

      const dataToUpdateInDB: Partial<NodeMetaData> = {
          title: nodeToUpdate.title,
          content: newContent,
          fileType: nodeToUpdate.fileType,
          filePath: nodeToUpdate.filePath, // Preserve filePath
          tags: nodeToUpdate.tags,
          width: nodeToUpdate.width,
          height: newHeight,
      };

      try {
          if (window.electronAPI) {
              await window.electronAPI.updateNodeData(nodeId, dataToUpdateInDB);
          }
          setNodes(prevNodes =>
              prevNodes.map(n =>
                  n.id === nodeId ? { ...n, content: newContent, height: newHeight } : n
              )
          );
          toast({ title: "Note Updated", description: `Content of "${nodeToUpdate.title}" updated.` });
      } catch (error) {
          console.error('Failed to update node content:', error);
          toast({ title: "Error", description: "Failed to update node content.", variant: "destructive" });
      }
  }, [nodes, toast]);


  const handleSaveEditedNode = async () => {
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

    const newHeight = nodeBeingEdited.type === 'note'
        ? (currentEditData.content && currentEditData.content.length > 50 ? 200 : 160)
        : nodeBeingEdited.height; // File node height might not change based on description

    // filePath is preserved from nodeBeingEdited, not from currentEditData
    const dataToUpdateInDB: Partial<NodeMetaData> = {
        title: currentEditData.title,
        content: currentEditData.content, // For files, this is the description
        fileType: nodeBeingEdited.fileType,
        filePath: nodeBeingEdited.filePath, // Crucial: preserve existing filePath
        tags: currentEditData.tags,
        width: nodeBeingEdited.width,
        height: newHeight,
    };

    const isDuplicateWithOtherNode = nodes.some(
      (node) => node.id !== editingNodeId && node.title.toLowerCase() === currentEditData.title.trim().toLowerCase()
    );

    if (isDuplicateWithOtherNode) {
      toast({
        title: "Duplicate Title",
        description: "Another node with this title already exists. Please use a different title.",
        variant: "destructive",
      });
      return;
    }

    try {
        if (window.electronAPI) {
            await window.electronAPI.updateNodeData(editingNodeId, dataToUpdateInDB);
        }
        setNodes(prevNodes =>
          prevNodes.map(n =>
            n.id === editingNodeId
              ? {
                  ...n, // Spread existing node data first
                  title: currentEditData.title,
                  content: currentEditData.content, // Update content/description
                  tags: currentEditData.tags,
                  height: newHeight,
                  // filePath is part of 'n' and dataToUpdateInDB, so it's preserved
                }
              : n
          )
        );
        toast({ title: "Node Updated", description: `"${currentEditData.title}" updated successfully.` });
    } catch (error) {
        console.error('Failed to save edited node:', error);
        toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    }
    setIsEditDialogOpen(false);
    setEditingNodeId(null);
  };


  const handleToggleLinkMode = () => {
    setIsLinkingMode(prevIsLinkingMode => !prevIsLinkingMode);
    setSelectedNodesForLinking([]);
    if (isPanning) setIsPanning(false);
    if (isDeleteMode) {
      setIsDeleteMode(false);
      setSelectedItemsForDeletion({ nodes: [], links: [] });
    }
  };

  const handleToggleDeleteMode = () => {
    setIsDeleteMode(prevIsDeleteMode => !prevIsDeleteMode);
    setSelectedItemsForDeletion({ nodes: [], links: [] });
    if (isPanning) setIsPanning(false);
    if (isLinkingMode) {
      setIsLinkingMode(false);
      setSelectedNodesForLinking([]);
    }
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
     // Prevent node selection if clicking on the open file button within NodeItem
    if ((event.target as HTMLElement).closest('[data-open-file-button="true"]')) {
        event.stopPropagation();
        return;
    }
    event.stopPropagation();

    if (isDeleteMode) {
      setSelectedItemsForDeletion((prev) => {
        const isCurrentlySelected = prev.nodes.includes(nodeId);
        return {
          ...prev,
          nodes: isCurrentlySelected
            ? prev.nodes.filter((id) => id !== nodeId)
            : [...prev.nodes, nodeId],
        };
      });
    } else if (isLinkingMode) {
      setSelectedNodesForLinking((prevSelected) => {
        if (prevSelected.includes(nodeId)) {
          return prevSelected.filter((id) => id !== nodeId);
        }
        const newSelected = [...prevSelected, nodeId];
        if (newSelected.length === 2) {
          const newLinkForDB = {
            id: uuidv4(),
            source: newSelected[0],
            target: newSelected[1],
          };
          const newLinkForUI: LinkData = {
            id: newLinkForDB.id,
            sourceNodeId: newSelected[0],
            targetNodeId: newSelected[1],
          };

          if (window.electronAPI) {
            window.electronAPI.addLink(newLinkForDB).catch(err => {
                console.error("Failed to add link to DB:", err);
                toast({title: "Error", description: "Failed to save link.", variant: "destructive"});
            });
          }
          setLinks((prevLinks) => [...prevLinks, newLinkForUI]);
          return [];
        }
        return newSelected;
      });
    }
  };

  const handleLinkClick = (linkId: string) => {
    if (isDeleteMode) {
      setSelectedItemsForDeletion((prev) => {
        const isCurrentlySelected = prev.links.includes(linkId);
        return {
          ...prev,
          links: isCurrentlySelected
            ? prev.links.filter((id) => id !== linkId)
            : [...prev.links, linkId],
        };
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

  const handleNodeDrag = useCallback(async (nodeId: string, x: number, y: number) => {
    setNodes(prevNodes =>
      prevNodes.map(node =>
        node.id === nodeId ? { ...node, x, y } : node
      )
    );
    try {
        if (window.electronAPI) {
            await window.electronAPI.updateNodePosition(nodeId, { x, y });
        }
    } catch (error) {
        console.error('Failed to update node position in DB:', error);
    }
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
  }, [isPanning]);


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
    const trimmedSearchTerm = searchTerm.trim();
    if (!trimmedSearchTerm && selectedFilterTags.length === 0) {
      return { displayNodes: nodes, displayLinks: links };
    }

    const searchTerms = trimmedSearchTerm.toLowerCase().split(/\s+/).filter(term => term.length > 0);

    let matchedInitialNodes = nodes.filter(node => {
      const matchesSelectedTags = selectedFilterTags.length > 0
        ? node.tags && node.tags.some(tag => selectedFilterTags.includes(tag))
        : true;

      let matchesSearchTerms = true; // デフォルトはtrue（検索語がない場合）
      if (searchTerms.length > 0) {
        matchesSearchTerms = searchTerms.every(term => { // すべての検索語に一致するか
          const titleMatch = node.title.toLowerCase().includes(term);
          const contentMatch = (node.type === 'note' || node.type === 'file') && node.content?.toLowerCase().includes(term);
          const tagMatch = node.tags && node.tags.some(tag => tag.toLowerCase().includes(term));
          return titleMatch || contentMatch || tagMatch;
        });
      }

      // フィルタリング条件の組み合わせ
      if (selectedFilterTags.length > 0 && searchTerms.length > 0) {
        return matchesSelectedTags && matchesSearchTerms;
      } else if (selectedFilterTags.length > 0) {
        return matchesSelectedTags;
      } else if (searchTerms.length > 0) {
        return matchesSearchTerms;
      }
      // 検索語もフィルタータグも空の場合は、最初のif文で早期リターンする
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

 const handleAutoLayout = useCallback((isAutomaticCall = false) => {
    const nodesToLayout = filteredNodesAndLinks.displayNodes;
    const linksToConsider = filteredNodesAndLinks.displayLinks;

    if (nodesToLayout.length === 0) {
      if (!isAutomaticCall) {
        toast({ title: "No nodes to layout", description: "No nodes are currently visible to arrange." });
      }
      return;
    }

    const layoutNodes = JSON.parse(JSON.stringify(nodesToLayout)) as NodeData[];

    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    const DEFAULT_NODE_WIDTH = 256;
    const DEFAULT_NODE_HEIGHT = 160;
    const HORIZONTAL_SPACING = 100;
    const VERTICAL_SPACING = 60;
    const PAGE_MARGIN_X = 50;
    const PAGE_MARGIN_Y = 50;

    layoutNodes.forEach(n => {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    });

    linksToConsider.forEach(link => {
      const sourceExists = layoutNodes.some(n => n.id === link.sourceNodeId);
      const targetExists = layoutNodes.some(n => n.id === link.targetNodeId);
      if (sourceExists && targetExists) {
        adj.get(link.sourceNodeId)?.push(link.targetNodeId);
        inDegree.set(link.targetNodeId, (inDegree.get(link.targetNodeId) || 0) + 1);
      }
    });

    let queue = layoutNodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
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

    const newPositionsMap = new Map<string, { x: number, y: number }>();

    layers.forEach((layer, layerIndex) => {
      let currentY = PAGE_MARGIN_Y;
      const layerX = PAGE_MARGIN_X + layerIndex * (DEFAULT_NODE_WIDTH + HORIZONTAL_SPACING);
      layer.forEach(nodeId => {
        const nodeToPosition = layoutNodes.find(n => n.id === nodeId);
        if (nodeToPosition) {
          newPositionsMap.set(nodeId, { x: layerX, y: currentY });
          currentY += (nodeToPosition.height || DEFAULT_NODE_HEIGHT) + VERTICAL_SPACING;
        }
      });
    });

    const positionedNodeIds = new Set(layers.flat());
    let lastX = PAGE_MARGIN_X + (layers.length > 0 ? layers.length -1 : 0) * (DEFAULT_NODE_WIDTH + HORIZONTAL_SPACING);
    if (layers.some(layer => layer.length > 0)) {
        lastX += DEFAULT_NODE_WIDTH + HORIZONTAL_SPACING;
    }

    let unPositionY = PAGE_MARGIN_Y;
    layoutNodes.forEach(node => {
      if (!positionedNodeIds.has(node.id)) {
        newPositionsMap.set(node.id, { x: lastX, y: unPositionY });
        unPositionY += (node.height || DEFAULT_NODE_HEIGHT) + VERTICAL_SPACING;
      }
    });

    setNodes(prevNodes =>
      prevNodes.map(n => {
        const newPosition = newPositionsMap.get(n.id);
        if (newPosition && window.electronAPI) {
            window.electronAPI.updateNodePosition(n.id, newPosition).catch(err => console.error("Failed to update node position during auto-layout:", err));
            return { ...n, x: newPosition.x, y: newPosition.y };
        }
        return n;
      })
    );
    if (nodesToLayout.length > 0 && !isAutomaticCall) {
     toast({ title: "Layout Applied", description: "Visible nodes have been automatically arranged." });
    }
  }, [filteredNodesAndLinks.displayNodes, filteredNodesAndLinks.displayLinks, toast]);

  const handleAutoLayoutRef = useRef(handleAutoLayout); 
  
  useEffect(() => {
    handleAutoLayoutRef.current = handleAutoLayout;
  }, [handleAutoLayout]); 

  useEffect(() => {
    if (isInitialRenderForAutoLayoutEffect.current) {
      isInitialRenderForAutoLayoutEffect.current = false;
      return;
    }
    handleAutoLayoutRef.current(true); 
  }, [searchTerm, selectedFilterTags, searchDepth]); 

  const handleDepthChange = useCallback((depthArr: number[]) => {
    setSearchDepth(depthArr[0]);
  }, []);

  const handleApplyAutoLayout = useCallback(() => {
    handleAutoLayout(false);
  }, [handleAutoLayout]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' && isDeleteMode) {
        const hasSelectedItems = selectedItemsForDeletion.nodes.length > 0 || selectedItemsForDeletion.links.length > 0;
        if (hasSelectedItems) {
          setIsDeleteConfirmOpen(true);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDeleteMode, selectedItemsForDeletion]);

  const handleConfirmDelete = async () => {
    try {
      for (const nodeId of selectedItemsForDeletion.nodes) {
        // If it's a file node with a filePath, consider deleting the local file
        const nodeToDelete = nodes.find(n => n.id === nodeId);
        if (nodeToDelete && nodeToDelete.type === 'file' && nodeToDelete.filePath && window.electronAPI) {
          // You might want to add a specific electronAPI for deleting local files
          // For now, we'll just delete the DB record.
          // To delete the file: await window.electronAPI.deleteLocalFile(nodeToDelete.filePath);
          // This would require a new IPC handler in main.js:
          // ipcMain.handle('file:deleteLocal', async (event, filePath) => { try { fs.unlinkSync(filePath); return true; } catch (e) { return false; } });
          // And exposed in preload.js
        }
        if (window.electronAPI) {
          await window.electronAPI.deleteNode(nodeId);
        }
      }

      for (const linkId of selectedItemsForDeletion.links) {
        if (window.electronAPI) {
          await window.electronAPI.deleteLink(linkId);
        }
      }

      setNodes(prevNodes => prevNodes.filter(node => !selectedItemsForDeletion.nodes.includes(node.id)));
      setLinks(prevLinks => prevLinks.filter(link => !selectedItemsForDeletion.links.includes(link.id)));
      
      setSelectedItemsForDeletion({ nodes: [], links: [] });
      setIsDeleteConfirmOpen(false);
      
      toast({
        title: "Success",
        description: `Deleted ${selectedItemsForDeletion.nodes.length} node(s) and ${selectedItemsForDeletion.links.length} link(s).`,
        variant: "default"
      });
    } catch (error) {
      console.error("Failed to delete items:", error);
      toast({
        title: "Error",
        description: "Failed to delete some items.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <Toolbar
        onFileUpload={handleFileUpload}
        onCreateNote={handleCreateNote}
        onSearch={setSearchTerm}
        currentSearchTerm={searchTerm}
        onDepthChange={handleDepthChange}
        currentDepth={searchDepth}
        onToggleLinkMode={handleToggleLinkMode}
        isLinkingMode={isLinkingMode}
        onToggleDeleteMode={handleToggleDeleteMode}
        isDeleteMode={isDeleteMode}
        allTags={allTags}
        selectedFilterTags={selectedFilterTags}
        onFilterTagToggle={handleFilterTagToggle}
        onAutoLayout={handleApplyAutoLayout}
      />
      <main className="flex-grow relative">
        <KnowledgeCanvas
          canvasRef={canvasRef}
          nodes={filteredNodesAndLinks.displayNodes}
          links={filteredNodesAndLinks.displayLinks}
          selectedNodeIdsForLinking={selectedNodesForLinking}
          isLinkingMode={isLinkingMode}
          isDeleteMode={isDeleteMode}
          selectedItemsForDeletion={selectedItemsForDeletion}
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
          onNodeContentUpdate={handleUpdateNodeContent}
          onLinkClick={handleLinkClick}
        />
      </main>
      <Toaster />

      <AlertDialog open={isNoteDialogOpen || isEditDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) handleCreateEditDialogClose(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {editingNodeId
                ? currentEditingNodeDetails?.type === 'note'
                  ? `Edit Note: ${currentEditingNodeDetails?.title}`
                  : `Edit File Details: ${currentEditingNodeDetails?.title}`
                : "Create New Note"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editingNodeId
                ? (currentEditingNodeDetails?.type === 'file' ? "Update the file description and tags." : "Update the details below.")
                : "Enter a title, content (optional), and tags (optional) for your new note."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dialog-title" className="text-right">
                Title
              </Label>
              <div className="col-span-3 relative">
                <Input
                  id="dialog-title"
                  value={editingNodeId ? currentEditData.title : currentNote.title}
                  onChange={(e) =>
                    editingNodeId
                      ? setCurrentEditData(prev => ({ ...prev, title: e.target.value }))
                      : setCurrentNote(prev => ({ ...prev, title: e.target.value }))
                  }
                  onFocus={() => setIsTitleFieldFocused(true)}
                  onBlur={() => setIsTitleFieldFocused(false)}
                  className="w-full"
                />
                {(() => {
                  if (!isTitleFieldFocused) return null;
                  
                  const currentTitle = editingNodeId ? currentEditData.title : currentNote.title;
                  const trimmedTitle = currentTitle.trim().toLowerCase();
                  
                  if (trimmedTitle.length < 2) return null;
                  
                  const matchingNodes = nodes.filter(node => 
                    node.id !== editingNodeId && 
                    node.title.toLowerCase().includes(trimmedTitle)
                  );
                  
                  if (matchingNodes.length === 0) return null;
                  
                  return (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-md max-h-32 overflow-y-auto">
                      <div className="p-2 text-xs text-muted-foreground border-b">
                        Similar titles found:
                      </div>
                      {matchingNodes.slice(0, 5).map(node => (
                        <div key={node.id} className="px-3 py-2 text-sm hover:bg-accent cursor-pointer flex items-center gap-2">
                          <span className="text-yellow-600">⚠️</span>
                          <span className="truncate">{node.title}</span>
                          <span className="text-xs text-muted-foreground">({node.type})</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            
            {(!editingNodeId || currentEditingNodeDetails?.type === 'note' || currentEditingNodeDetails?.type === 'file') && (
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="dialog-content" className="text-right pt-2">
                  {currentEditingNodeDetails?.type === 'file' ? "Description" : "Content"}
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
                  placeholder={currentEditingNodeDetails?.type === 'file' ? "Enter a description for this file..." : "Type your note here..."}
                />
              </div>
            )}

            {editingNodeId && currentEditingNodeDetails?.type === 'file' && currentEditingNodeDetails.filePath && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">File</Label>
                <div className="col-span-3 text-sm text-muted-foreground break-all flex items-center">
                  <FileIcon className="inline h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate" title={currentEditingNodeDetails.filePath}>
                    {currentEditingNodeDetails.filePath.substring(currentEditingNodeDetails.filePath.lastIndexOf(path.sep) + 1)}
                  </span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="ml-2 h-7 px-2 py-1"
                        onClick={async () => { // Make async
                            if (currentEditingNodeDetails?.filePath && window.electronAPI) {
                                try {
                                    await window.electronAPI.openLocalFile(currentEditingNodeDetails.filePath);
                                } catch (err) {
                                    toast({title: "Error", description: "Could not open file.", variant: "destructive"})
                                }
                            }
                        }}
                    >
                        Open
                    </Button>
                </div>
              </div>
            )}

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
                      <div className="p-2 border-b">
                        <Input
                          type="text"
                          placeholder="Search tags..."
                          value={tagSearchValue}
                          onChange={(e) => setTagSearchValue(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div className="flex flex-col gap-1 p-1 max-h-48 overflow-y-auto">
                        {allTags.length > 0 ? (
                          allTags
                            .filter(tag => tag.toLowerCase().includes(tagSearchValue.toLowerCase()))
                            .map(tag => {
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
                          <p className="text-xs text-muted-foreground text-center p-2">
                            {tagSearchValue ? 'No matching tags found.' : 'No existing tags to select.'}
                          </p>
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

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedItemsForDeletion.nodes.length} node(s) and {selectedItemsForDeletion.links.length} link(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}