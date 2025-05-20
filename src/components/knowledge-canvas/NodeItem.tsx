
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
  isLinkingMode: boolean; // Explicitly add this prop
}

export function NodeItem({ node, isSelected, isLinkingCandidate, onNodeClick, onNodeDrag, canvasRef, isLinkingMode: propsIsLinkingMode }: NodeItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null);
  const didDragRef = useRef(false); // To distinguish drag from click

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

    // If in linking mode, all mousedown events on nodes should be treated as potential link selections, not drags.
    if (propsIsLinkingMode) {
        onNodeClick(node.id, e); // Propagate click for linking logic
        return; // Prevent drag initiation
    }

    // If not in linking mode, proceed with drag logic
    e.preventDefault(); 
    e.stopPropagation(); 

    didDragRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
    };
    setIsDragging(true); // This triggers the useEffect to add listeners
  };

  const mouseMoveHandler = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current || !canvasRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    
    let newX = dragStartRef.current.nodeX + dx;
    let newY = dragStartRef.current.nodeY + dy;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) {
        // Canvas dimensions not yet available or invalid, skip drag update
        return;
    }
    
    const nodeWidth = node.width || 256;
    const nodeHeight = node.height || (node.type === 'note' ? 160 : 120);
    
    newX = Math.max(0, Math.min(newX, canvasRect.width - nodeWidth));
    newY = Math.max(0, Math.min(newY, canvasRect.height - nodeHeight));

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { 
        didDragRef.current = true;
    }

    onNodeDrag(node.id, newX, newY);
  }, [node.id, node.width, node.height, node.type, onNodeDrag, canvasRef]);


  const mouseUpHandler = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null; 
  }, [setIsDragging]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', mouseUpHandler);
    } else {
      // Ensure dragStartRef is cleared if isDragging becomes false through other means (though unlikely here)
      dragStartRef.current = null;
    }

    return () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };
  }, [isDragging, mouseMoveHandler, mouseUpHandler]);


  const handleClick = (e: React.MouseEvent) => {
    // If it was a drag AND we are NOT in linking mode, suppress the click.
    if (didDragRef.current && !propsIsLinkingMode) {
      didDragRef.current = false; 
      e.stopPropagation(); 
      return;
    }
    // Otherwise (it was a click, OR we are in linking mode), proceed with onNodeClick.
    onNodeClick(node.id, e);
    didDragRef.current = false; // Reset for next interaction
  };

  const nodeWidth = node.width || 256;
  const nodeHeight = node.height || 'auto';

  return (
    <Card
      className={cn(
        "absolute shadow-lg hover:shadow-xl transition-shadow duration-200",
        "flex flex-col", 
        // isSelected is used for styling when a node is chosen for linking
        isSelected && "ring-2 ring-accent shadow-accent/50", 
        // isLinkingCandidate was identical to isSelected, if specific styling is needed, it can be differentiated
        // isLinkingCandidate && "ring-2 ring-primary shadow-primary/50", 
        isDragging ? "cursor-grabbing shadow-2xl z-10" : "cursor-grab"
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
