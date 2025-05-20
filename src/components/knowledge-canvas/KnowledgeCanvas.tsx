
import React from 'react';
import type { NodeData, LinkData } from '@/types';
import { NodeItem } from './NodeItem';
import { cn } from '@/lib/utils';

interface KnowledgeCanvasProps {
  nodes: NodeData[];
  links: LinkData[];
  selectedNodeIdsForLinking: string[];
  isLinkingMode: boolean;
  isPanning: boolean; // New prop for panning state
  canvasOffset: { x: number; y: number }; // New prop for canvas offset
  onNodeClick: (nodeId: string, event: React.MouseEvent) => void;
  onCanvasClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCanvasDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCanvasMouseDownForPan: (event: React.MouseEvent<HTMLDivElement>) => void; // New prop for pan mousedown
  onFilesDrop: (files: File[]) => void;
  onNodeDrag: (nodeId: string, x: number, y: number) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
}

export function KnowledgeCanvas({
  nodes,
  links,
  selectedNodeIdsForLinking,
  isLinkingMode,
  isPanning,
  canvasOffset,
  onNodeClick,
  onCanvasClick,
  onCanvasDoubleClick,
  onCanvasMouseDownForPan,
  onFilesDrop,
  onNodeDrag,
  canvasRef,
}: KnowledgeCanvasProps) {
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      // Convert drop coordinates from view to world if dropping at a specific point
      // For now, handleFilesDrop in page.tsx manages random placement with offset
      onFilesDrop(Array.from(event.dataTransfer.files));
    }
  };
  
  const getNodeCenter = (node: NodeData) => {
    const width = node.width || 256;
    let height = node.height;
    if (!height) {
        const cardHeaderHeight = node.type === 'note' ? (node.title ? 40 : 20) : (node.title ? 40 : 20) ;
        const cardContentHeight = node.type === 'note' && node.content ? 80 : 0; 
        const baseCardHeight = node.type === 'note' ? 160 : 120; 
        height = cardHeaderHeight + cardContentHeight + (node.type === 'note' ? 20 : 10) ; 
        height = Math.max(height, baseCardHeight); 
    }
    return {
      x: node.x + width / 2,
      y: node.y + height / 2,
    };
  };


  return (
    <div
      ref={canvasRef}
      className={cn(
        "w-full h-full relative bg-background overflow-hidden p-0", // p-4 removed, overflow hidden for panning
        isDraggingOver && "outline-dashed outline-2 outline-accent",
        isLinkingMode && "cursor-crosshair",
        isPanning && "cursor-grabbing",
        !isLinkingMode && !isPanning && "cursor-grab" // Default grab cursor if not linking or panning
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onCanvasClick}
      onDoubleClick={onCanvasDoubleClick}
      onMouseDown={onCanvasMouseDownForPan} // Hook up mousedown for panning
    >
      <div
        className="absolute top-0 left-0" // This is the pannable container
        style={{
          transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
          // Ensure this container is large enough for content to pan into
          width: '5000px', // Or a sufficiently large size
          height: '5000px', // Or a sufficiently large size
        }}
      >
        {nodes.map((node) => (
          <NodeItem
            key={node.id}
            node={node} // node.x and node.y are world coordinates
            isSelected={selectedNodeIdsForLinking.includes(node.id) && isLinkingMode}
            isLinkingCandidate={selectedNodeIdsForLinking.includes(node.id) && isLinkingMode} // Kept for consistency, though might be redundant if isSelected covers it
            onNodeClick={onNodeClick}
            onNodeDrag={onNodeDrag} 
            canvasRef={canvasRef} // Passed for node drag boundary checks (relative to pannable world)
            isLinkingMode={isLinkingMode}
          />
        ))}
        <svg 
            className="absolute top-0 left-0 w-full h-full pointer-events-none" 
            // SVG dimensions should match its container (the pannable div)
            // Or be large enough to contain all links.
            // Using w-full h-full makes it relative to the 5000x5000 div.
        >
          {links.map((link) => {
            const sourceNode = nodes.find((n) => n.id === link.sourceNodeId);
            const targetNode = nodes.find((n) => n.id === link.targetNodeId);
            if (!sourceNode || !targetNode) return null;

            // getNodeCenter uses node.x, node.y which are world coordinates
            const sourceCenter = getNodeCenter(sourceNode);
            const targetCenter = getNodeCenter(targetNode);

            return (
              <line
                key={link.id}
                x1={sourceCenter.x}
                y1={sourceCenter.y}
                x2={targetCenter.x}
                y2={targetCenter.y}
                className="stroke-primary opacity-70"
                strokeWidth="2.5"
                markerEnd="url(#arrow)"
              />
            );
          })}
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8" 
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse" 
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary opacity-70" />
            </marker>
          </defs>
        </svg>
      </div>
       {isDraggingOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
          <p className="text-lg font-semibold text-accent-foreground bg-accent p-4 rounded-md">
            Drop files here to upload
          </p>
        </div>
      )}
    </div>
  );
}
