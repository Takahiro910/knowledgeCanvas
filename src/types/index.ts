// src/types/index.ts
// src/types/index.ts
export type NodeType = 'file' | 'note' | 'link';
export type FileType = 'PDF' | 'DOCX' | 'TXT' | 'IMAGE' | 'URL' | 'EXCEL' | 'POWERPOINT' | 'OTHER'; // Add 'EXCEL', 'POWERPOINT'

export interface NodeData {
  id: string;
  type: NodeType;
  title: string;
  content?: string;
  fileType?: FileType;
  filePath?: string;
  url?: string;
  tags?: string[];
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface LinkData {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface DeleteModeState {
  isDeleteMode: boolean;
  selectedItemsForDeletion: {
    nodes: string[];
    links: string[];
  };
}