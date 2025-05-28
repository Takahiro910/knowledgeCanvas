// src/app/page.tsx
"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { KnowledgeCanvas } from '@/components/knowledge-canvas/KnowledgeCanvas';
import { Toolbar } from '@/components/knowledge-canvas/Toolbar';
import type { NodeData, LinkData, FileType as AppFileType, NodeType, DeleteModeState } from '@/types'; //
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast'; //
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"; //
import { Button } from "@/components/ui/button"; //
import { Input } from "@/components/ui/input"; //
import { Textarea } from "@/components/ui/textarea"; //
import { Label } from "@/components/ui/label"; //
import { Badge } from '@/components/ui/badge'; //
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { XIcon, PlusCircleIcon, CheckIcon, FileIcon, Search, Link as LinkIconLucide } from 'lucide-react';
import { cn } from '@/lib/utils'; //
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

interface NodeMetaData {
  title?: string;
  content?: string; // This will hold the description for link nodes
  fileType?: AppFileType;
  filePath?: string;
  url?: string;
  tags?: string[];
  width?: number;
  height?: number;
}

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
      saveLocalFile: (fileName: string, fileDataBuffer: ArrayBuffer) => Promise<string | null>;
      openLocalFile: (filePath: string) => Promise<boolean>;
      getUploadsDir: () => Promise<string>;
      openExternal: (url: string) => Promise<boolean>;
    };
  }
}

const getFileTypeFromFileName = (fileName: string): AppFileType => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'PDF';
  if (extension === 'docx' || extension === 'doc') return 'DOCX';
  if (extension === 'txt') return 'TXT';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(extension || '')) return 'IMAGE';
  if (['xlsx', 'xls', 'xlsm'].includes(extension || '')) return 'EXCEL';
  if (['pptx', 'ppt'].includes(extension || '')) return 'POWERPOINT';
  return 'OTHER';
};

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
  
  // const [tagInputValue, setTagInputValue] = useState('');
  // const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
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
  const shortcutFileInputRef = useRef<HTMLInputElement>(null);
  const [tagInputValue, setTagInputValue] = useState('');
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false); // 既存のPopover用

  // ★ 新しいタグサジェスト機能のためのState
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [showTagSuggestionsDropdown, setShowTagSuggestionsDropdown] = useState(false);
  const [activeTagSuggestionIndex, setActiveTagSuggestionIndex] = useState(-1);
  const tagInputRef = useRef<HTMLInputElement>(null); // タグ入力フィールドの参照


  useEffect(() => {
    if (!isTagSelectorOpen) {
      setTagSearchValue('');
    }
  }, [isTagSelectorOpen]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const isFirstRenderForLinkModeToast = useRef(true);
  const previousLinksLengthRef = useRef(links.length);
  const isInitialRenderForAutoLayoutEffect = useRef(true);

    // ★ タグ入力値が変更された時にサジェストを更新するuseEffect
  useEffect(() => {
    if (tagInputValue.trim() === '') {
      setTagSuggestions([]);
      setShowTagSuggestionsDropdown(false); // 入力が空ならサジェスト非表示
      return;
    }
    const lowerInput = tagInputValue.toLowerCase();
    // 現在編集中のノート/ノードにまだ追加されていないタグのみを候補とする
    const currentDialogTags = editingNodeId ? currentEditData.tags : currentNote.tags;
    
    const filtered = allTags.filter(tag =>
      tag.toLowerCase().includes(lowerInput) &&
      !currentDialogTags.includes(tag) // 既にダイアログで追加済みのタグは候補から除外
    );
    setTagSuggestions(filtered);
    setActiveTagSuggestionIndex(-1); // 入力変更時はアクティブサジェストをリセット
    setShowTagSuggestionsDropdown(filtered.length > 0); // 候補があれば表示
  }, [tagInputValue, allTags, editingNodeId, currentEditData.tags, currentNote.tags, isNoteDialogOpen, isEditDialogOpen]);

  // ★ サジェストからタグを追加する関数
  const handleAddTagFromSuggestion = (suggestedTag: string) => {
    const tagToAdd = suggestedTag; // サジェストされたタグ名をそのまま使用

    if (isNoteDialogOpen) {
      if (!currentNote.tags.includes(tagToAdd)) {
        setCurrentNote(prev => ({ ...prev, tags: [...prev.tags, tagToAdd] }));
      }
    } else if (isEditDialogOpen) {
      if (!currentEditData.tags.includes(tagToAdd)) {
        setCurrentEditData(prev => ({ ...prev, tags: [...prev.tags, tagToAdd] }));
      }
    }
    setTagInputValue(''); // 入力フィールドをクリア
    setShowTagSuggestionsDropdown(false); // サジェストを非表示
    setActiveTagSuggestionIndex(-1);
    tagInputRef.current?.focus(); // 入力フィールドにフォーカスを戻す
  };

  // ★ Enterキーでタグを追加する処理 (サジェスト選択も含む)
  const handleConfirmTagInput = () => {
    if (activeTagSuggestionIndex >= 0 && tagSuggestions[activeTagSuggestionIndex]) {
      // アクティブなサジェストがある場合はそれを追加
      handleAddTagFromSuggestion(tagSuggestions[activeTagSuggestionIndex]);
    } else {
      // アクティブなサジェストがない場合は、入力値を新しいタグとして（または既存タグとして）追加
      const newTagValue = tagInputValue.trim();
      if (!newTagValue) {
        setShowTagSuggestionsDropdown(false);
        return;
      }

      let tagToAdd = newTagValue;
      // 既存タグと大文字・小文字を無視して一致するか確認
      const existingTagMatch = allTags.find(t => t.toLowerCase() === newTagValue.toLowerCase());
      if (existingTagMatch) {
        tagToAdd = existingTagMatch; // 一致する場合は既存の正式なタグ名を使用
      }
      
      // 現在のダイアログのタグリストに追加 (重複チェック含む)
      if (isNoteDialogOpen) {
        if (!currentNote.tags.includes(tagToAdd)) {
          setCurrentNote(prev => ({ ...prev, tags: [...prev.tags, tagToAdd] }));
        }
      } else if (isEditDialogOpen) {
        if (!currentEditData.tags.includes(tagToAdd)) {
          setCurrentEditData(prev => ({ ...prev, tags: [...prev.tags, tagToAdd] }));
        }
      }
      setTagInputValue('');
      setShowTagSuggestionsDropdown(false);
      setActiveTagSuggestionIndex(-1);
    }
    tagInputRef.current?.focus();
  };

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
              filePath: metaData.filePath,
              url: metaData.url,
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
    nodeSpecificContent?: string, 
    fileType?: AppFileType,
    filePath?: string,
    url?: string,
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
      content: nodeSpecificContent || (type === 'link' ? "" : undefined), 
      fileType,
      filePath,
      url,
      tags: tags || [],
      x: Math.max(0, worldX),
      y: Math.max(0, worldY),
      width: width || 256,
      height: height || (type === 'note' ? (nodeSpecificContent && nodeSpecificContent.length > 50 ? 200 : 160) : (type === 'link' ? 160 : 160)), 
    };

    const nodeDataForDB: NodeMetaData = {
        title: newNodeForUI.title,
        content: newNodeForUI.content, 
        fileType: newNodeForUI.fileType,
        filePath: newNodeForUI.filePath,
        url: newNodeForUI.url,
        tags: newNodeForUI.tags,
        width: newNodeForUI.width,
        height: newNodeForUI.height,
    };

    const nodeForDB = {
        id: newNodeForUI.id,
        type: newNodeForUI.type,
        position: JSON.stringify({ x: newNodeForUI.x, y: newNodeForUI.y }),
        data: JSON.stringify(nodeDataForDB),
    };

    try {
        if (window.electronAPI) {
            await window.electronAPI.addNode(nodeForDB);
        }
        setNodes((prevNodes) => [...prevNodes, newNodeForUI]);
        toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} Node Created`, description: `"${title}" added.` });
    } catch (error) {
        console.error('Failed to add node:', error);
        toast({ title: "Error", description: `Failed to add ${type} node.`, variant: "destructive" });
    }
    return newNodeForUI;
  }, [canvasOffset.x, canvasOffset.y, zoomLevel, toast]);

  const handleUrlDrop = useCallback(async (url: string, dropX?: number, dropY?: number) => {
    if (!url || !url.trim().startsWith('http')) {
      toast({ title: "Invalid URL", description: "The dropped item is not a valid URL.", variant: "destructive" });
      return;
    }

    const isDuplicateUrl = nodes.some(node => node.type === 'link' && node.url === url);
    if (isDuplicateUrl) {
      toast({
        title: "Duplicate URL",
        description: "A link node for this URL already exists.",
        variant: "destructive",
      });
      return;
    }

    let nodeTitle = url;
    try {
      const parsedUrl = new URL(url);
      nodeTitle = parsedUrl.hostname + (parsedUrl.pathname === '/' ? '' : parsedUrl.pathname);
    } catch (e) {
      console.warn("Could not parse URL for title generation:", e);
    }
    nodeTitle = nodeTitle.length > 50 ? nodeTitle.substring(0, 47) + "..." : nodeTitle;


    try {
      await internalAddNode('link', nodeTitle, "", 'URL', undefined, url, [], dropX, dropY, 256, 160); 
    } catch (error) {
      console.error("Error processing dropped URL:", error);
      toast({ title: "Error Processing URL", description: `Failed to create link node for "${url}".`, variant: "destructive" });
    }
  }, [internalAddNode, nodes, toast]);

  const handleFilesDrop = useCallback(async (droppedItems: DataTransferItemList | File[], dropX?: number, dropY?: number) => {
    if (!window.electronAPI) {
        toast({ title: "Error", description: "File/URL operations are not available.", variant: "destructive" });
        return;
    }

    const files: File[] = [];
    let potentialUrl: string | null = null;

    if (droppedItems instanceof FileList || Array.isArray(droppedItems)) {
        for (const item of Array.from(droppedItems as File[])) {
            files.push(item);
        }
    } else if (droppedItems instanceof DataTransferItemList) {
        for (let i = 0; i < droppedItems.length; i++) {
            const item = droppedItems[i];
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) files.push(file);
            } else if (item.kind === 'string' && (item.type === 'text/uri-list' || item.type === 'text/plain')) {
                potentialUrl = await new Promise<string | null>((resolve) => item.getAsString(resolve));
                if (potentialUrl && potentialUrl.startsWith('http')) {
                    break; 
                } else {
                    potentialUrl = null;
                }
            }
        }
    }


    if (potentialUrl) {
        await handleUrlDrop(potentialUrl, dropX, dropY);
    } else if (files.length > 0) {
        for (const file of files) {
          const nodeTypeForFile: NodeType = 'file';
          const appFileType = getFileTypeFromFileName(file.name);
          const originalFilePath = (file as any).path; 

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
            await internalAddNode(nodeTypeForFile, file.name, undefined, appFileType, originalFilePath, undefined, [], dropX, dropY);
          } catch (error) {
            console.error("Error processing dropped file:", error);
            toast({ title: "Error Processing File", description: `Failed to process "${file.name}".`, variant: "destructive" });
          }
        }
    } else {
        toast({ title: "No items to process", description: "No files or valid URLs found in the dropped items.", variant: "default" });
    }
  }, [internalAddNode, nodes, toast, handleUrlDrop]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      await handleFilesDrop(Array.from(files));
    }
    if (event.target) {
      event.target.value = ""; 
    }
  }, [handleFilesDrop]);


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
    await internalAddNode('note', currentNote.title, currentNote.content, undefined, undefined, undefined, currentNote.tags, currentNoteCreationCoords?.x, currentNoteCreationCoords?.y);
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


  const handleUpdateNodeContent = useCallback(async (nodeId: string, newContent: string) => {
      const nodeToUpdate = nodes.find(n => n.id === nodeId);
      if (!nodeToUpdate) {
          toast({ title: "Error", description: "Node not found for content update.", variant: "destructive" });
          return;
      }
      if (nodeToUpdate.type !== 'note') { 
          toast({ title: "Info", description: "Edit file/link descriptions via double-click.", variant: "default" });
          return;
      }

      const newHeight = newContent && newContent.length > 50 ? 200 : 160;

      const dataToUpdateInDB: Partial<NodeMetaData> = {
          title: nodeToUpdate.title,
          content: newContent,
          fileType: nodeToUpdate.fileType,
          filePath: nodeToUpdate.filePath,
          url: nodeToUpdate.url,
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
    
    const isDuplicateTitle = nodes.some(
      (node) => node.id !== editingNodeId && node.title.toLowerCase() === currentEditData.title.trim().toLowerCase()
    );

    if (isDuplicateTitle) {
      toast({
        title: "Duplicate Title",
        description: "Another node with this title already exists. Please use a different title.",
        variant: "destructive",
      });
      return;
    }

    const newHeight = (nodeBeingEdited.type === 'note' || nodeBeingEdited.type === 'link') 
        ? (currentEditData.content && currentEditData.content.length > 50 ? 200 : 160)
        : nodeBeingEdited.height;

    const dataToUpdateInDB: Partial<NodeMetaData> = {
        title: currentEditData.title,
        content: currentEditData.content, 
        fileType: nodeBeingEdited.fileType,
        filePath: nodeBeingEdited.filePath,
        url: nodeBeingEdited.url, 
        tags: currentEditData.tags,
        width: nodeBeingEdited.width, 
        height: newHeight, 
    };


    try {
        if (window.electronAPI) {
            await window.electronAPI.updateNodeData(editingNodeId, dataToUpdateInDB);
        }
        setNodes(prevNodes =>
          prevNodes.map(n =>
            n.id === editingNodeId
              ? {
                  ...n,
                  title: dataToUpdateInDB.title!,
                  content: dataToUpdateInDB.content, 
                  tags: dataToUpdateInDB.tags!,
                  height: newHeight, 
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
  
  const handleToggleLinkMode = useCallback(() => {
    setIsLinkingMode(prevIsLinkingMode => !prevIsLinkingMode);
    setSelectedNodesForLinking([]);
    if (isPanning) setIsPanning(false);
    if (isDeleteMode) {
      setIsDeleteMode(false);
      setSelectedItemsForDeletion({ nodes: [], links: [] });
    }
  }, [isPanning, isDeleteMode]);

  const handleToggleDeleteMode = useCallback(() => {
    setIsDeleteMode(prevIsDeleteMode => !prevIsDeleteMode);
    setSelectedItemsForDeletion({ nodes: [], links: [] });
    if (isPanning) setIsPanning(false);
    if (isLinkingMode) {
      setIsLinkingMode(false);
      setSelectedNodesForLinking([]);
    }
  }, [isPanning, isLinkingMode]);


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

      let matchesSearchTerms = true;
      if (searchTerms.length > 0) {
        matchesSearchTerms = searchTerms.every(term => {
          const titleMatch = node.title.toLowerCase().includes(term);
          const contentMatch = (node.type === 'note' || node.type === 'file' || node.type === 'link') && node.content?.toLowerCase().includes(term); 
          const tagMatch = node.tags && node.tags.some(tag => tag.toLowerCase().includes(term));
          return titleMatch || contentMatch || tagMatch;
        });
      }
      
      if (selectedFilterTags.length > 0 && searchTerms.length > 0) {
        return matchesSelectedTags && matchesSearchTerms;
      } else if (selectedFilterTags.length > 0) {
        return matchesSelectedTags;
      } else if (searchTerms.length > 0) {
        return matchesSearchTerms;
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

  const handleCreateEditDialogClose = useCallback(() => {
    setIsNoteDialogOpen(false);
    setIsEditDialogOpen(false);
    setEditingNodeId(null);
    setCurrentNoteCreationCoords(null);
    setCurrentNote({ title: '', content: '', tags: [] });
    setCurrentEditData({ title: '', content: '', tags: [] });
    setTagInputValue('');
    setIsTagSelectorOpen(false);
  }, []);
  
  // ★ 修正: handleAddTagToDialog の中でタグ追加後にポップオーバーを閉じる
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
    setIsTagSelectorOpen(false); // ポップオーバーを閉じる
  };

  const handleRemoveTagFromDialog = (tagToRemove: string) => {
    if (isNoteDialogOpen) {
      setCurrentNote(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) }));
    } else if (isEditDialogOpen) {
      setCurrentEditData(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) }));
    }
  };
  
  // 既存のPopover（全タグリスト）からタグを選択する関数
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
    // この関数は既存のPopoverから呼ばれるため、ここでは入力フィールドのクリアやPopoverのクローズはしない
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

    const layoutNodesMap = new Map(nodesToLayout.map(n => [n.id, JSON.parse(JSON.stringify(n)) as NodeData])); // Deep copy for safety

    const adj = new Map<string, string[]>();
    const revAdj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();

    layoutNodesMap.forEach(n => {
      adj.set(n.id, []);
      revAdj.set(n.id, []);
      inDegree.set(n.id, 0);
      outDegree.set(n.id, 0);
    });

    linksToConsider.forEach(link => {
      if (layoutNodesMap.has(link.sourceNodeId) && layoutNodesMap.has(link.targetNodeId)) {
        adj.get(link.sourceNodeId)!.push(link.targetNodeId);
        revAdj.get(link.targetNodeId)!.push(link.sourceNodeId);
        inDegree.set(link.targetNodeId, (inDegree.get(link.targetNodeId) || 0) + 1);
        outDegree.set(link.sourceNodeId, (outDegree.get(link.sourceNodeId) || 0) + 1);
      }
    });

    // --- Calculate Longest Path To Sink (layerRTL) ---
    
    // 1. Get standard topological sort (sources first)
    const topoOrder: string[] = [];
    const qForTopo = Array.from(layoutNodesMap.values())
                           .filter(n => (inDegree.get(n.id) || 0) === 0)
                           .map(n => n.id);
    const tempInDegree = new Map(inDegree);
    let headTopo = 0;
    while(headTopo < qForTopo.length) {
        const u_id = qForTopo[headTopo++];
        topoOrder.push(u_id);
        (adj.get(u_id) || []).forEach(v_id => {
            if (layoutNodesMap.has(v_id)) { // Process only nodes in the current layout
                tempInDegree.set(v_id, (tempInDegree.get(v_id) || 1) - 1);
                if ((tempInDegree.get(v_id) || 0) === 0) {
                    qForTopo.push(v_id);
                }
            }
        });
    }

    // 2. Calculate layerRTL by iterating in reverse topological order
    const layerRTL = new Map<string, number>();
    layoutNodesMap.forEach(n => layerRTL.set(n.id, 0)); // Initialize

    for (let i = topoOrder.length - 1; i >= 0; i--) {
        const u_id = topoOrder[i];
        const nodeOutDegree = (outDegree.get(u_id) || 0);

        if (nodeOutDegree === 0) { // Is a sink node
            layerRTL.set(u_id, 0);
        } else {
            let maxChildLayerRTL = -1;
            (adj.get(u_id) || []).forEach(v_id => { // For each child v_id of u_id
                 if (layoutNodesMap.has(v_id)) { // Check if child is in current consideration
                    maxChildLayerRTL = Math.max(maxChildLayerRTL, layerRTL.get(v_id) || 0);
                 }
            });
             // if maxChildLayerRTL remains -1 (e.g. node had children but none are in layoutNodesMap), treat as sink.
            layerRTL.set(u_id, (maxChildLayerRTL === -1 ? -1 : maxChildLayerRTL) + 1);
        }
    }
    
    let maxLayerRTL = 0;
    layerRTL.forEach(val => { if (val > maxLayerRTL) maxLayerRTL = val; });
    // --- End LayerRTL Calculation ---

    const newPositionsMap = new Map<string, { x: number, y: number }>();
    const DEFAULT_NODE_WIDTH = 256;
    const DEFAULT_NODE_HEIGHT = 160;
    const HORIZONTAL_SPACING = 100;
    const VERTICAL_SPACING = 60;
    const PAGE_MARGIN_X = 50;
    const PAGE_MARGIN_Y = 50;

    const nodesByVisualColumn = new Map<number, string[]>();
    let effectiveMaxVisualColumn = 0;

    layoutNodesMap.forEach(node => {
        const rtl = layerRTL.get(node.id) || 0;
        // visualColumn index makes sources (maxLayerRTL) appear on left (column 0)
        // and sinks (layerRTL 0) appear on right (column maxLayerRTL)
        const visualColumnIndex = maxLayerRTL - rtl; 
        
        if (!nodesByVisualColumn.has(visualColumnIndex)) {
            nodesByVisualColumn.set(visualColumnIndex, []);
        }
        nodesByVisualColumn.get(visualColumnIndex)!.push(node.id);
        if (visualColumnIndex > effectiveMaxVisualColumn) {
            effectiveMaxVisualColumn = visualColumnIndex;
        }
    });
    
    Array.from(nodesByVisualColumn.keys()).sort((a, b) => a - b).forEach(visualColKey => {
        const nodesInColumn = nodesByVisualColumn.get(visualColKey)!;
        nodesInColumn.sort((idA, idB) => {
            const nodeA = layoutNodesMap.get(idA)!;
            const nodeB = layoutNodesMap.get(idB)!;
            if (nodeA.y !== nodeB.y) return nodeA.y - nodeB.y;
            return nodeA.title.localeCompare(nodeB.title) || nodeA.id.localeCompare(nodeB.id);
        });

        const layerX = PAGE_MARGIN_X + visualColKey * (DEFAULT_NODE_WIDTH + HORIZONTAL_SPACING);
        let currentY = PAGE_MARGIN_Y;
        
        nodesInColumn.forEach(nodeId => {
            const nodeToPosition = layoutNodesMap.get(nodeId);
            if (nodeToPosition) {
                newPositionsMap.set(nodeId, { x: layerX, y: currentY });
                currentY += (nodeToPosition.height || DEFAULT_NODE_HEIGHT) + VERTICAL_SPACING;
            }
        });
    });
    
    const positionedNodeIds = new Set(newPositionsMap.keys());
    let unPositionedColumnX = PAGE_MARGIN_X + (effectiveMaxVisualColumn + 1) * (DEFAULT_NODE_WIDTH + HORIZONTAL_SPACING);
    if (nodesByVisualColumn.size === 0) {
        unPositionedColumnX = PAGE_MARGIN_X;
    }

    let unPositionY = PAGE_MARGIN_Y;
    Array.from(layoutNodesMap.values()).forEach(node => { // Iterate over a copy or a map's values
      if (!positionedNodeIds.has(node.id)) {
        newPositionsMap.set(node.id, { x: unPositionedColumnX, y: unPositionY });
        unPositionY += (node.height || DEFAULT_NODE_HEIGHT) + VERTICAL_SPACING;
        positionedNodeIds.add(node.id); 
      }
    });

    setNodes(prevNodes =>
      prevNodes.map(n => {
        const newPosition = newPositionsMap.get(n.id);
        if (newPosition) {
            if (window.electronAPI && (n.x !== newPosition.x || n.y !== newPosition.y)) {
                window.electronAPI.updateNodePosition(n.id, newPosition).catch(err => console.error("Failed to update node position during auto-layout:", err));
            }
            return { ...n, x: newPosition.x, y: newPosition.y };
        }
        return n;
      })
    );

    if (nodesToLayout.length > 0 && !isAutomaticCall) {
     toast({ title: "Layout Applied", description: "Nodes arranged with children as 'roots' on the right, parents extending left." });
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
        const nodeToDelete = nodes.find(n => n.id === nodeId);
        if (nodeToDelete && nodeToDelete.type === 'file' && nodeToDelete.filePath && window.electronAPI) {
          // No file deletion logic
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

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
        const isCtrlOrCmd = event.ctrlKey || event.metaKey;

        const activeElement = document.activeElement;
        const isTypingInProtectedInput = 
            activeElement &&
            (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') &&
            !((activeElement as HTMLElement).id === 'toolbar-search-input' && event.key.toLowerCase() === 'f' && isCtrlOrCmd);

        if (isTypingInProtectedInput && !(isCtrlOrCmd && ['c', 'v', 'x', 'a', 'z', 'y'].includes(event.key.toLowerCase())) ) {
           if (isCtrlOrCmd && ['n', 'l', 'd', 'u'].includes(event.key.toLowerCase())) {
               // Block specific app shortcuts if typing in general inputs/textareas
           } else {
                return; 
           }
        }

        if (isCtrlOrCmd) {
            switch (event.key.toLowerCase()) {
                case 'n':
                    event.preventDefault();
                    handleCreateNote();
                    break;
                case 'l':
                    event.preventDefault();
                    handleToggleLinkMode();
                    break;
                case 'd':
                    event.preventDefault();
                    handleToggleDeleteMode();
                    break;
                case 'u':
                    event.preventDefault();
                    shortcutFileInputRef.current?.click();
                    break;
                case 'f':
                    event.preventDefault();
                    const searchInput = document.getElementById('toolbar-search-input') as HTMLInputElement | null;
                    searchInput?.focus();
                    searchInput?.select();
                    break;    
            }
        } else if (event.key === 'Escape') {
             if (isNoteDialogOpen || isEditDialogOpen) {
                event.preventDefault();
                handleCreateEditDialogClose();
            } else if (isLinkingMode || isDeleteMode) {
                event.preventDefault();
                setIsLinkingMode(false);
                setIsDeleteMode(false);
                setSelectedNodesForLinking([]);
                setSelectedItemsForDeletion({ nodes: [], links: [] });
                toast({ title: "Mode Deactivated", description: "Returned to select mode."});
            }
        }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
        window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [
    handleCreateNote, 
    handleToggleLinkMode, 
    handleToggleDeleteMode, 
    isNoteDialogOpen, 
    isEditDialogOpen, 
    isLinkingMode, 
    isDeleteMode, 
    handleCreateEditDialogClose,
    toast
  ]);

  // ★ 修正: タグ候補リストのフィルタリングロジック
  const displayedTagsInPopover = useMemo(() => {
    const filterTerm = tagInputValue.trim().toLowerCase();
    if (filterTerm === '') {
      return allTags; // 入力が空なら全てのタグを表示（ボタンで開いた場合など）
    }
    return allTags.filter(tag => tag.toLowerCase().includes(filterTerm));
  }, [allTags, tagInputValue]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <input
          type="file"
          ref={shortcutFileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          multiple
          accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.gif,.svg,.xlsx, .xlsm,.xls,.pptx,.ppt"
      />
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
                  : currentEditingNodeDetails?.type === 'file'
                    ? `Edit File Details: ${currentEditingNodeDetails?.title}`
                    : `Edit Link Details: ${currentEditingNodeDetails?.title}` 
                : "Create New Note"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editingNodeId
                ? (currentEditingNodeDetails?.type === 'file' ? "Update the file description and tags."
                  : currentEditingNodeDetails?.type === 'link' ? "Update the link title, description, and tags. The URL itself is not editable here."
                  : "Update the details below.")
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

            {(!editingNodeId || currentEditingNodeDetails?.type === 'note' || currentEditingNodeDetails?.type === 'file' || currentEditingNodeDetails?.type === 'link') && (
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="dialog-content" className="text-right pt-2">
                  {editingNodeId && (currentEditingNodeDetails?.type === 'file' || currentEditingNodeDetails?.type === 'link')
                    ? "Description" 
                    : "Content"}
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
                  placeholder={
                    editingNodeId && currentEditingNodeDetails?.type === 'file' ? "Enter a description for this file..." :
                    editingNodeId && currentEditingNodeDetails?.type === 'link' ? "Enter a description for this URL..." : 
                    "Type your note here..."
                  }
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
                        onClick={async () => {
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

            {editingNodeId && currentEditingNodeDetails?.type === 'link' && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">URL</Label>
                <div className="col-span-3 text-sm text-blue-500 hover:underline cursor-pointer break-all flex items-center"
                     onClick={async () => {
                         if(currentEditingNodeDetails?.url && window.electronAPI) {
                             await window.electronAPI.openExternal(currentEditingNodeDetails.url);
                         }
                     }}
                     title={`Open ${currentEditingNodeDetails.url}`}>
                  <LinkIconLucide className="inline h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">{currentEditingNodeDetails.url}</span>
                </div>
              </div>
            )}


            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="dialog-tags-input" className="text-right pt-2">
                Tags
              </Label>
              <div className="col-span-3">
                <div className="flex gap-2 relative"> {/* ★ 親要素に relative を設定 */}
                  <Input
                    ref={tagInputRef} // ★ ref を設定
                    id="dialog-tags-input"
                    value={tagInputValue}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setTagInputValue(newValue);
                      // 入力があればサジェスト表示を試みる (useEffectが候補を更新)
                      if (newValue.trim() !== "") {
                        setShowTagSuggestionsDropdown(true);
                      } else {
                        setShowTagSuggestionsDropdown(false); // 空なら非表示
                      }
                    }}
                    onFocus={() => {
                      // フォーカス時、入力があればサジェスト表示
                      if (tagInputValue.trim() !== "" && tagSuggestions.length > 0) {
                         setShowTagSuggestionsDropdown(true);
                      }
                    }}
                    onBlur={() => {
                      // クリックイベントがサジェストアイテムで発生するのを待つために遅延させる
                      setTimeout(() => {
                        setShowTagSuggestionsDropdown(false);
                        setActiveTagSuggestionIndex(-1);
                      }, 150); // 150msの遅延
                    }}
                    className="flex-grow"
                    placeholder="Add new tag"
                    onKeyDown={(e) => {
                      if (showTagSuggestionsDropdown && tagSuggestions.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setActiveTagSuggestionIndex(prev =>
                            prev < tagSuggestions.length - 1 ? prev + 1 : 0
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setActiveTagSuggestionIndex(prev =>
                            prev > 0 ? prev - 1 : tagSuggestions.length - 1
                          );
                        }
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConfirmTagInput();
                      } else if (e.key === 'Escape') {
                        setShowTagSuggestionsDropdown(false);
                        setActiveTagSuggestionIndex(-1);
                      }
                    }}
                  />
                  {/* ★ 修正: Popover の open と onOpenChange, および onClick */}
                  <Popover open={isTagSelectorOpen} onOpenChange={setIsTagSelectorOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" size="icon" onClick={() => {
                        setIsTagSelectorOpen(prev => !prev);
                        setShowTagSuggestionsDropdown(false); // 新しいサジェストとは排他的に
                      }}>
                        <PlusCircleIcon className="h-4 w-4" />
                        <span className="sr-only">Add existing tag from list</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0">
                       {<div className="p-2 border-b">
                        <Input
                          type="text"
                          placeholder="Search tags..."
                          value={tagSearchValue}
                          onChange={(e) => setTagSearchValue(e.target.value)}
                          className="h-8"
                        />
                      </div>}
                      <div className="flex flex-col gap-1 p-1 max-h-48 overflow-y-auto">
                        {allTags.length > 0 ? (
                          allTags
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
                                      handleSelectTagFromList(tag); // 既存の関数でタグ追加
                                    }
                                    // setIsTagSelectorOpen(false); // Popoverを閉じる
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
                            No existing tags.
                          </p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* ★ 新しいタグサジェストドロップダウンの描画 */}
                  {showTagSuggestionsDropdown && tagSuggestions.length > 0 && (
                    <div 
                      className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto"
                      style={{ width: tagInputRef.current?.offsetWidth }} // 入力フィールドの幅に合わせる
                    >
                      {tagSuggestions.map((tag, index) => (
                        <button
                          key={tag}
                          type="button" // フォームの送信を防ぐ
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none",
                            index === activeTagSuggestionIndex && "bg-accent text-accent-foreground"
                          )}
                          onClick={() => handleAddTagFromSuggestion(tag)}
                          // onMouseDown を使うことで onBlur より先にイベントを処理し、リストが消えるのを防ぐ
                          onMouseDown={(e) => e.preventDefault()} 
                          onMouseEnter={() => setActiveTagSuggestionIndex(index)}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}

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