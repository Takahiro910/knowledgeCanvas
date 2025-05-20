import React from 'react';
import type { NodeData, LinkData } from '@/types';
import { NodeItem } from './NodeItem';
import { cn } from '@/lib/utils';

interface KnowledgeCanvasProps {
  nodes: NodeData[];
  links: LinkData[];
  selectedNodeIdsForLinking: string[];
  isLinkingMode: boolean;
  onNodeClick: (nodeId: string, event: React.MouseEvent) => void;
  onCanvasClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onFilesDrop: (files: File[]) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
}

export function KnowledgeCanvas({
  nodes,
  links,
  selectedNodeIdsForLinking,
  isLinkingMode,
  onNodeClick,
  onCanvasClick,
  onFilesDrop,
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
    // Check if it's a file drop
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      onFilesDrop(Array.from(event.dataTransfer.files));
    }
    // Could also handle node drops here if implementing node dragging on canvas
  };
  
  const getNodeCenter = (node: NodeData) => {
    const width = node.width || 256;
    const cardHeaderHeight = 60; // Approximate
    const cardContentHeight = node.type === 'note' ? 90 : 60; // Approximate
    const height = node.height || (cardHeaderHeight + (node.type === 'note' && node.content ? cardContentHeight : 0));
    return {
      x: node.x + width / 2,
      y: node.y + height / 2,
    };
  };


  return (
    <div
      ref={canvasRef}
      className={cn(
        "w-full h-full relative bg-background overflow-auto p-4", // Added padding
        isDraggingOver && "outline-dashed outline-2 outline-accent",
        isLinkingMode && "cursor-crosshair"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onCanvasClick}
    >
      {nodes.map((node) => (
        <NodeItem
          key={node.id}
          node={node}
          isSelected={selectedNodeIdsForLinking.includes(node.id) && isLinkingMode}
          isLinkingCandidate={selectedNodeIdsForLinking.includes(node.id) && isLinkingMode}
          onNodeClick={onNodeClick}
        />
      ))}
      <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] pointer-events-none"> {/* Ensure SVG is large enough */}
        {links.map((link) => {
          const sourceNode = nodes.find((n) => n.id === link.sourceNodeId);
          const targetNode = nodes.find((n) => n.id === link.targetNodeId);
          if (!sourceNode || !targetNode) return null;

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
            refX="8" // Adjust to position arrow correctly at the end of the line
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse" // Ensures arrow points towards target
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary opacity-70" />
          </marker>
        </defs>
      </svg>
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
