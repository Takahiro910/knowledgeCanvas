
export type NodeType = 'file' | 'note';
export type FileType = 'PDF' | 'DOCX' | 'TXT' | 'IMAGE' | 'OTHER';

export interface NodeData {
  id: string;
  type: NodeType;
  title: string; // For notes: title; For files: filename
  content?: string; // For notes: body of the note
  fileType?: FileType; // Relevant if type is 'file'
  x: number; // Position on canvas
  y: number; // Position on canvas
  width?: number; // Optional: for differing node sizes
  height?: number; // Optional
}

export interface LinkData {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}
