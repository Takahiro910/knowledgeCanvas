// src/types/index.ts
export type NodeType = 'file' | 'note' | 'link';
export type FileType = 'PDF' | 'DOCX' | 'TXT' | 'IMAGE' | 'URL' | 'EXCEL' | 'POWERPOINT' | 'OTHER';

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
  // 力指向レイアウト用に追加
  vx?: number; // X方向の速度
  vy?: number; // Y方向の速度
  fx?: number | null; // X方向の固定位置
  fy?: number | null; // Y方向の固定位置
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

// レイアウトアルゴリズムの型を追加
export type LayoutAlgorithmType = 'hierarchical' | 'force-directed';