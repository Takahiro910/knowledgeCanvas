
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { NodeData } from '@/types';
import { FileText, StickyNote as NoteIcon, Image as ImageIcon } from 'lucide-react';
import { FilePdfIcon } from '@/components/icons/FilePdfIcon';
import { FileDocxIcon } from '@/components/icons/FileDocxIcon';
import { cn } from '@/lib/utils';

interface NodeItemProps {
  node: NodeData;
  isSelected: boolean;
  isLinkingCandidate: boolean;
  onNodeClick: (nodeId: string, event: React.MouseEvent) => void;
  onNodeDrag: (nodeId: string, x: number, y: number) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
  isLinkingMode: boolean;
  zoomLevel: number; // New prop for zoom level
}

export function NodeItem({ node, isSelected, isLinkingCandidate, onNodeClick, onNodeDrag, canvasRef, isLinkingMode: propsIsLinkingMode, zoomLevel }: NodeItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null);
  const didDragRef = useRef(false);

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
    if (e.button !== 0) return;

    if (propsIsLinkingMode) {
        onNodeClick(node.id, e);
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    didDragRef.current = false;
    dragStartRef.current = {
      x: e.clientX, // Store initial mouse clientX
      y: e.clientY, // Store initial mouse clientY
      nodeX: node.x,
      nodeY: node.y,
    };
    setIsDragging(true);
  };

  const mouseMoveHandler = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current || !canvasRef.current) return;

    const dxInView = e.clientX - dragStartRef.current.x; // Delta in view coordinates
    const dyInView = e.clientY - dragStartRef.current.y; // Delta in view coordinates

    // Convert view delta to world delta by dividing by zoomLevel
    const dxInWorld = dxInView / zoomLevel;
    const dyInWorld = dyInView / zoomLevel;

    let newX = dragStartRef.current.nodeX + dxInWorld;
    let newY = dragStartRef.current.nodeY + dyInWorld;

    newX = Math.max(0, newX); // Basic boundary check
    newY = Math.max(0, newY); // Basic boundary check

    if (Math.abs(dxInView) > 3 || Math.abs(dyInView) > 3) { // Use view delta for drag detection threshold
        didDragRef.current = true;
    }

    onNodeDrag(node.id, newX, newY);
  }, [node.id, onNodeDrag, canvasRef, zoomLevel]); // Added zoomLevel


  const mouseUpHandler = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, [setIsDragging]);

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
    if (propsIsLinkingMode) {
      e.stopPropagation();
      didDragRef.current = false; 
      return;
    }

    if (didDragRef.current) {
      didDragRef.current = false;
      e.stopPropagation();
      return;
    }
    onNodeClick(node.id, e);
    didDragRef.current = false; 
  };

  const nodeWidth = node.width || 256;
  const nodeHeight = node.height || 'auto';

  return (
    <Card
      data-node-item="true"
      className={cn(
        "absolute shadow-lg hover:shadow-xl transition-shadow duration-200",
        "flex flex-col",
        isSelected && "ring-2 ring-accent shadow-accent/50",
        isDragging ? "cursor-grabbing shadow-2xl z-10" :
          (propsIsLinkingMode ? "cursor-pointer" : "cursor-grab")
      )}
      style={{
        left: node.x,
        top: node.y,
        width: nodeWidth,
        minHeight: node.type === 'note' ? 160 : 120,
        height: nodeHeight
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
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
        </div>
      </CardHeader>
      {node.type === 'note' && node.content && (
        <CardContent className="p-3 text-sm overflow-hidden flex-grow">
          <p className="whitespace-pre-wrap break-words line-clamp-4">
            {node.content}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
