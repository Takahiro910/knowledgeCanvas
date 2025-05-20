
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
}

export function NodeItem({ node, isSelected, isLinkingCandidate, onNodeClick, onNodeDrag, canvasRef }: NodeItemProps) {
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
    // Prevent drag from initiating on right-click or for non-primary buttons
    if (e.button !== 0) return;
    
    // If in linking mode, don't allow dragging, let click handler manage selection
    if (isLinkingCandidate || isSelected) { 
        // If node is already selected for linking, mousedown could be start of new link creation or deselect.
        // So, we do not start dragging here to allow onNodeClick to work as intended for linking.
        // We still call onNodeClick for selection/deselection logic in linking mode.
        onNodeClick(node.id, e);
        return;
    }


    e.preventDefault(); // Prevent text selection and other default behaviors
    e.stopPropagation(); // Prevent canvas click if node is clicked

    setIsDragging(true);
    didDragRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
    };
    // Add global listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragStartRef.current || !canvasRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    
    let newX = dragStartRef.current.nodeX + dx;
    let newY = dragStartRef.current.nodeY + dy;

    // Basic boundary collision with canvas (optional, can be improved)
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const nodeWidth = node.width || 256;
    const nodeHeight = node.height || (node.type === 'note' ? 160 : 120);
    
    // Ensure node stays within canvas bounds (considering node dimensions)
    newX = Math.max(0, Math.min(newX, canvasRect.width - nodeWidth));
    newY = Math.max(0, Math.min(newY, canvasRect.height - nodeHeight));


    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { // Threshold to consider it a drag
        didDragRef.current = true;
    }

    onNodeDrag(node.id, newX, newY);
  }, [isDragging, node.id, onNodeDrag, canvasRef, node.width, node.height, node.type]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    setIsDragging(false);
    dragStartRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // If it was a drag, we might not want to trigger onNodeClick logic immediately
    // The didDragRef handles this in the handleClick function.
  }, [handleMouseMove]);


  useEffect(() => {
    // Cleanup global listeners when component unmounts or dragging stops
    return () => {
      if (isDragging) { // Ensure cleanup if component unmounts mid-drag
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);


  const handleClick = (e: React.MouseEvent) => {
    // If it was a drag, prevent click action (unless it's for linking mode)
    if (didDragRef.current && !isLinkingCandidate && !isSelected) {
      didDragRef.current = false; // Reset for next interaction
      e.stopPropagation(); // Stop propagation if it was a drag
      return;
    }
    // Otherwise, proceed with the original onNodeClick behavior (for selection, linking, etc.)
    onNodeClick(node.id, e);
    didDragRef.current = false; // Ensure it's reset
  };


  const nodeWidth = node.width || 256;
  const nodeHeight = node.height || 'auto';

  return (
    <Card
      className={cn(
        "absolute shadow-lg hover:shadow-xl transition-shadow duration-200",
        "flex flex-col", 
        isSelected && "ring-2 ring-accent shadow-accent/50", // General selection highlight
        isLinkingCandidate && "ring-2 ring-primary shadow-primary/50", // Highlight for linking
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
      onClick={handleClick} // Use the wrapper handleClick
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

    