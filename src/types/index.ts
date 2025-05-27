// src/types/index.ts
export type NodeType = 'file' | 'note' | 'link'; // Add 'link'
export type FileType = 'PDF' | 'DOCX' | 'TXT' | 'IMAGE' | 'URL' | 'OTHER'; // Add 'URL'

export interface NodeData {
  id: string;
  type: NodeType;
  title: string;
  content?: string;
  fileType?: FileType; // For 'file' and 'link' types
  filePath?: string; // Path to the locally stored file (for 'file' type)
  url?: string;      // URL for 'link' type
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