import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import type { NodeData } from '@/types';
import { FileText, StickyNote as NoteIcon, Image as ImageIcon } from 'lucide-react';
import { FilePdfIcon } from '@/components/icons/FilePdfIcon';
import { FileDocxIcon } from '@/components/icons/FileDocxIcon';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NodeItemProps {
  node: NodeData;
  isSelected: boolean;
  isLinkingCandidate: boolean;
  onNodeClick: (nodeId: string, event: React.MouseEvent) => void;
  onNodeDoubleClick: (nodeId: string, event: React.MouseEvent) => void; // モーダルを開くための既存のハンドラ
  onNodeDrag: (nodeId: string, x: number, y: number) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
  isLinkingMode: boolean;
  isDeleteMode: boolean;
  isSelectedForDeletion: boolean;
  zoomLevel: number;
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
}: NodeItemProps) {
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
    if (e.button !== 0 || propsIsLinkingMode) {
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
    if (propsIsLinkingMode) {
      e.stopPropagation();
    }
    onNodeClick(node.id, e);
  };

  // Card全体のダブルクリックは既存の onNodeDoubleClick (モーダル表示用)
  const handleCardDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!propsIsLinkingMode) {
        onNodeDoubleClick(node.id, e);
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
      onDoubleClick={handleCardDoubleClick} // Card全体のダブルクリック
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
      {(node.type === 'note' || node.type === 'file') && ( // noteタイプまたはfileタイプであればCardContentを表示
        <CardContent
          className="p-3 pt-0 text-sm overflow-hidden flex-grow"
        >
          <p className={cn(
              "whitespace-pre-wrap break-words",
              node.content ? "line-clamp-3" : "text-muted-foreground italic"
          )}>
            {node.content || ''}
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
