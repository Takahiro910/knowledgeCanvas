import React from 'react';
import type { NodeData, LinkData } from '@/types';
import { NodeItem } from './NodeItem';
import { cn } from '@/lib/utils';

interface KnowledgeCanvasProps {
  nodes: NodeData[];
  links: LinkData[];
  selectedNodeIdsForLinking: string[];
  isLinkingMode: boolean;
  isDeleteMode: boolean;
  selectedItemsForDeletion: { nodes: string[]; links: string[]; };
  isPanning: boolean;
  canvasOffset: { x: number; y: number };
  zoomLevel: number;
  onNodeClick: (nodeId: string, event: React.MouseEvent) => void;
  onNodeDoubleClick: (nodeId: string, event: React.MouseEvent) => void;
  onCanvasClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCanvasDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCanvasMouseDownForPan: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCanvasWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onFilesDrop: (items: DataTransferItemList | File[], dropX?: number, dropY?: number) => void; // Modified to accept DataTransferItemList
  onNodeDrag: (nodeId: string, x: number, y: number) => void;
  onNodeDragEnd: (nodeId: string) => void; // ★ 追加
  canvasRef: React.RefObject<HTMLDivElement>;
  onNodeContentUpdate: (nodeId: string, newContent: string) => void; // ★ 新しいプロパティ
  onLinkClick?: (linkId: string) => void;
}

export function KnowledgeCanvas({
  nodes,
  links,
  selectedNodeIdsForLinking,
  isLinkingMode,
  isDeleteMode,
  selectedItemsForDeletion,
  isPanning,
  canvasOffset,
  zoomLevel,
  onNodeClick,
  onNodeDoubleClick,
  onCanvasClick,
  onCanvasDoubleClick,
  onCanvasMouseDownForPan,
  onCanvasWheel,
  onFilesDrop,
  onNodeDrag,
  onNodeDragEnd, // ★ 追加
  canvasRef,
  onNodeContentUpdate, // ★ 新しいプロパティを受け取る
  onLinkClick,
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
    if (canvasRef.current) { // Ensure canvasRef.current is not null
      const canvasBounds = canvasRef.current.getBoundingClientRect();
      const viewX = event.clientX - canvasBounds.left;
      const viewY = event.clientY - canvasBounds.top;

      const worldX = (viewX - canvasOffset.x) / zoomLevel;
      const worldY = (viewY - canvasOffset.y) / zoomLevel;

      if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
        onFilesDrop(event.dataTransfer.items, worldX, worldY);
      } else if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        onFilesDrop(Array.from(event.dataTransfer.files), worldX, worldY);
      }
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
        "w-full h-full relative bg-background overflow-hidden p-0",
        isDraggingOver && "outline-dashed outline-2 outline-accent",
        isLinkingMode && "cursor-crosshair",
        isPanning && "cursor-grabbing",
        !isLinkingMode && !isPanning && "cursor-grab"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onCanvasClick}
      onDoubleClick={onCanvasDoubleClick}
      onMouseDown={onCanvasMouseDownForPan}
      onWheel={onCanvasWheel}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoomLevel})`,
          transformOrigin: '0 0',
          width: '5000px', // 十分な広さ
          height: '5000px', // 十分な高さ
        }}
      >
        {nodes.map((node) => (
          <NodeItem
            key={node.id}
            node={node}
            isSelected={selectedNodeIdsForLinking.includes(node.id) && isLinkingMode}
            isLinkingCandidate={selectedNodeIdsForLinking.includes(node.id) && isLinkingMode}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDrag={onNodeDrag}
            onNodeDragEnd={onNodeDragEnd} // ★ 追加
            canvasRef={canvasRef}
            isLinkingMode={isLinkingMode}
            isDeleteMode={isDeleteMode}
            isSelectedForDeletion={selectedItemsForDeletion.nodes.includes(node.id)}
            zoomLevel={zoomLevel}
            onContentUpdate={onNodeContentUpdate} // ★ プロパティを渡す
          />
        ))}
        <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
        >
          {links.map((link) => {
            const sourceNode = nodes.find((n) => n.id === link.sourceNodeId);
            const targetNode = nodes.find((n) => n.id === link.targetNodeId);
            if (!sourceNode || !targetNode) return null;

            const sourceCenter = getNodeCenter(sourceNode);
            const targetCenter = getNodeCenter(targetNode);

            const isSelectedForDeletion = selectedItemsForDeletion.links.includes(link.id);
            
            return (
              <line
                key={link.id}
                x1={sourceCenter.x}
                y1={sourceCenter.y}
                x2={targetCenter.x}
                y2={targetCenter.y}
                className={isDeleteMode ? 
                  `stroke-primary ${isSelectedForDeletion ? 'stroke-destructive opacity-90' : 'opacity-70'} cursor-pointer` :
                  "stroke-primary opacity-70"
                }
                strokeWidth={isSelectedForDeletion ? 4 / zoomLevel : 2.5 / zoomLevel}
                markerEnd="url(#arrow)"
                onClick={isDeleteMode ? (e) => {
                  e.stopPropagation();
                  onLinkClick?.(link.id);
                } : undefined}
                style={{ pointerEvents: isDeleteMode ? 'stroke' : 'none' }}
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
