
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
  onCanvasDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onFilesDrop: (files: File[]) => void;
  onNodeDrag: (nodeId: string, x: number, y: number) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
}

export function KnowledgeCanvas({
  nodes,
  links,
  selectedNodeIdsForLinking,
  isLinkingMode,
  onNodeClick,
  onCanvasClick,
  onCanvasDoubleClick,
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
      onFilesDrop(Array.from(event.dataTransfer.files));
    }
  };
  
  const getNodeCenter = (node: NodeData) => {
    const width = node.width || 256;
    // Approximate heights based on NodeItem structure
    const cardHeaderHeight = node.type === 'note' ? (node.title ? 40 : 20) : (node.title ? 40 : 20) ; // Simplified: assumes p-3 padding and icon/title
    const cardContentHeight = node.type === 'note' && node.content ? 80 : 0; // Simplified: approximates content area
    const baseCardHeight = node.type === 'note' ? 160 : 120; // From NodeItem minHeight + some padding for content

    // Use explicit height if available, otherwise calculate based on content
    let height = node.height;
    if (!height) {
        height = cardHeaderHeight + cardContentHeight + (node.type === 'note' ? 20 : 10) ; // Base padding for Card
        height = Math.max(height, baseCardHeight); // Ensure minimum height
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
        "w-full h-full relative bg-background overflow-auto p-4",
        isDraggingOver && "outline-dashed outline-2 outline-accent",
        isLinkingMode && "cursor-crosshair"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onCanvasClick}
      onDoubleClick={onCanvasDoubleClick} // Added double click handler
    >
      {nodes.map((node) => (
        <NodeItem
          key={node.id}
          node={node}
          isSelected={selectedNodeIdsForLinking.includes(node.id) && isLinkingMode}
          isLinkingCandidate={selectedNodeIdsForLinking.includes(node.id) && isLinkingMode}
          onNodeClick={onNodeClick}
          onNodeDrag={onNodeDrag} // Pass down drag handler
          canvasRef={canvasRef} // Pass canvasRef for boundary checks if needed
        />
      ))}
      <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] pointer-events-none">
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

    