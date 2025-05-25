import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import type { NodeData } from '@/types';
import { FileText, StickyNote as NoteIcon, Image as ImageIcon, ExternalLink } from 'lucide-react'; // Added ExternalLink
import { FilePdfIcon } from '@/components/icons/FilePdfIcon';
import { FileDocxIcon } from '@/components/icons/FileDocxIcon';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button'; // Added Button
import { useToast } from '@/hooks/use-toast'; // Added useToast

interface NodeItemProps {
  node: NodeData;
  isSelected: boolean;
  isLinkingCandidate: boolean;
  onNodeClick: (nodeId: string, event: React.MouseEvent) => void;
  onNodeDoubleClick: (nodeId: string, event: React.MouseEvent) => void;
  onNodeDrag: (nodeId: string, x: number, y: number) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
  isLinkingMode: boolean;
  isDeleteMode: boolean;
  isSelectedForDeletion: boolean;
  zoomLevel: number;
  onContentUpdate: (nodeId: string, newContent: string) => void; // Existing prop for inline editing
}

export function NodeItem({
  node,
  isSelected,
  isLinkingCandidate,
  onNodeClick,
  onNodeDoubleClick,
  onNodeDrag,
  canvasRef,
  isLinkingMode: propsIsLinkingMode,
  isDeleteMode,
  isSelectedForDeletion,
  zoomLevel,
  onContentUpdate, // Added for consistency, though file content isn't edited inline
}: NodeItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null);
  const didDragRef = useRef(false);
  const { toast } = useToast(); // For showing errors if file open fails

  // ... (renderIcon, handleMouseDown, mouseMoveHandler, mouseUpHandler, useEffect for drag remain the same)
  const renderIcon = () => {
    if (node.type === 'note') {
      return <NoteIcon className="h-6 w-6 text-primary" />;
    }
    if (node.type === 'file') {
      switch (node.fileType) {
        case 'PDF':
          return <FilePdfIcon className="h-6 w-6 text-red-600" />;
        case 'DOCX':
          return <FileDocxIcon className="h-6 w-6 text-blue-600" />;
        case 'TXT':
          return <FileText className="h-6 w-6 text-gray-600" />;
        case 'IMAGE':
          return <ImageIcon className="h-6 w-6 text-purple-600" />;
        default:
          return <FileText className="h-6 w-6 text-muted-foreground" />;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || propsIsLinkingMode) {
      return;
    }
    // Prevent drag if clicking on the open file button
    if ((e.target as HTMLElement).closest('[data-open-file-button="true"]')) {
        return;
    }
    e.preventDefault();
    e.stopPropagation();

    didDragRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
    };
    setIsDragging(true);
  };

  const mouseMoveHandler = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current || !canvasRef.current) return;

    const dxInView = e.clientX - dragStartRef.current.x;
    const dyInView = e.clientY - dragStartRef.current.y;

    const dxInWorld = dxInView / zoomLevel;
    const dyInWorld = dyInView / zoomLevel;

    let newX = dragStartRef.current.nodeX + dxInWorld;
    let newY = dragStartRef.current.nodeY + dyInWorld;

    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    if (Math.abs(dxInView) > 3 || Math.abs(dyInView) > 3) {
        didDragRef.current = true;
    }

    onNodeDrag(node.id, newX, newY);
  }, [node.id, onNodeDrag, canvasRef, zoomLevel]);


  const mouseUpHandler = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', mouseUpHandler);
    } else {
      dragStartRef.current = null;
    }

    return () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };
  }, [isDragging, mouseMoveHandler, mouseUpHandler]);


  const handleClick = (e: React.MouseEvent) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      e.stopPropagation();
      return;
    }
    // Prevent node selection if clicking on the open file button
    if ((e.target as HTMLElement).closest('[data-open-file-button="true"]')) {
        e.stopPropagation();
        return;
    }
    if (propsIsLinkingMode) {
      e.stopPropagation();
    }
    onNodeClick(node.id, e);
  };

  const handleCardDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Prevent double click if clicking on the open file button
    if ((e.target as HTMLElement).closest('[data-open-file-button="true"]')) {
        return;
    }
    if (!propsIsLinkingMode) {
        onNodeDoubleClick(node.id, e);
    }
  };

  const handleOpenFile = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection or drag
    if (node.type === 'file' && node.filePath && window.electronAPI) {
      try {
        const success = await window.electronAPI.openLocalFile(node.filePath);
        if (!success) {
          // Error message handled in main.js via dialog
          // Optionally, show a toast here too if main process returns specific error info
        }
      } catch (error) {
        console.error("Error opening file:", error);
        toast({ title: "Error", description: "Could not open the file.", variant: "destructive" });
      }
    }
  };

  const nodeWidth = node.width || 256;
  let nodeHeight = node.height || 'auto';
    if (node.type === 'note' && node.tags && node.tags.length > 0 && nodeHeight === 'auto') {
    // Basic auto-height adjustment if tags are present for notes.
  }

  return (
    <Card
      data-node-item="true"
      className={cn(
        "absolute shadow-lg hover:shadow-xl transition-shadow duration-200",
        "flex flex-col",
        isSelected && "ring-2 ring-accent shadow-accent/50",
        isSelectedForDeletion && "ring-2 ring-destructive shadow-destructive/50",
        isDragging ? "cursor-grabbing shadow-2xl z-10" :
          (propsIsLinkingMode || isDeleteMode ? "cursor-pointer" : "cursor-grab")
      )}
      style={{
        left: node.x,
        top: node.y,
        width: nodeWidth,
        minHeight: node.type === 'note' ? (node.content ? 160 : 100) : 160,
        height: nodeHeight
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleCardDoubleClick}
      aria-selected={isSelected}
    >
      <CardHeader className="p-3">
        <div className="flex items-start gap-2">
          <div className="flex-shrink-0 pt-1">{renderIcon()}</div>
          <div className="flex-grow min-w-0">
            <CardTitle className="text-base leading-tight truncate" title={node.title}>
              {node.title}
            </CardTitle>
            {node.fileType && <CardDescription className="text-xs">{node.fileType}</CardDescription>}
          </div>
          {node.type === 'file' && node.filePath && (
            <Button
              data-open-file-button="true"
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={handleOpenFile}
              title={`Open ${node.title}`}
              aria-label={`Open file ${node.title}`}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      {(node.type === 'note' || (node.type === 'file' && node.content)) && ( // Show content for notes, or for files if description exists
        <CardContent
          className="p-3 pt-0 text-sm overflow-hidden flex-grow"
          // Double click on content area for files could also open the file, or edit description
          // For notes, this is for inline editing if implemented.
        >
          <p className={cn(
              "whitespace-pre-wrap break-words",
              node.content ? "line-clamp-3" : "text-muted-foreground italic"
          )}>
            {node.content || (node.type === 'file' ? 'No description.' : '')}
          </p>
        </CardContent>
      )}
      {(node.tags && node.tags.length > 0) && (
        <CardFooter className="p-3 pt-1 flex flex-wrap gap-1 border-t mt-auto">
          {node.tags.map((tag, index) => (
            <Badge key={index} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </CardFooter>
      )}
    </Card>
  );
}