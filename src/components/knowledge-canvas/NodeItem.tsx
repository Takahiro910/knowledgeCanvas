import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { NodeData } from '@/types';
import { FileText, StickyNote as NoteIcon, Image as ImageIcon } from 'lucide-react';
import { FilePdfIcon } from '@/components/icons/FilePdfIcon';
import { FileDocxIcon } from '@/components/icons/FileDocxIcon';
import { cn } from '@/lib/utils';

interface NodeItemProps {
  node: NodeData;
  isSelected: boolean;
  isLinkingCandidate: boolean; // Highlighted if selected for linking
  onNodeClick: (nodeId: string, event: React.MouseEvent) => void;
}

export function NodeItem({ node, isSelected, isLinkingCandidate, onNodeClick }: NodeItemProps) {
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

  const nodeWidth = node.width || 256; // default w-64
  const nodeHeight = node.height || 'auto'; // default auto height

  return (
    <Card
      className={cn(
        "absolute shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer",
        "flex flex-col", // Ensure card content flows vertically
        isSelected && "ring-2 ring-accent shadow-accent/50",
        isLinkingCandidate && "ring-2 ring-primary shadow-primary/50",
      )}
      style={{ 
        left: node.x, 
        top: node.y, 
        width: nodeWidth, 
        minHeight: node.type === 'note' ? 150 : 120, // Minimum height
        height: nodeHeight 
      }}
      onClick={(e) => onNodeClick(node.id, e)}
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
