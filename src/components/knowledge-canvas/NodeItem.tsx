import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea'; // Textarea をインポート
import type { NodeData } from '@/types';
import { FileText, StickyNote as NoteIcon, Image as ImageIcon } from 'lucide-react';
import { FilePdfIcon } from '@/components/icons/FilePdfIcon';
import { FileDocxIcon } from '@/components/icons/FileDocxIcon';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NodeItemProps {
  node: NodeData;
  isSelected: boolean;
  isLinkingCandidate: boolean;
  onNodeClick: (nodeId: string, event: React.MouseEvent) => void;
  onNodeDoubleClick: (nodeId: string, event: React.MouseEvent) => void; // モーダルを開くための既存のハンドラ
  onNodeDrag: (nodeId: string, x: number, y: number) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
  isLinkingMode: boolean;
  isDeleteMode: boolean;
  isSelectedForDeletion: boolean;
  zoomLevel: number;
  onContentUpdate: (nodeId: string, newContent: string) => void; // ★ 新しいプロパティ
}

export function NodeItem({
  node,
  isSelected,
  isLinkingCandidate,
  onNodeClick,
  onNodeDoubleClick,
  onNodeDrag,
  canvasRef,
  isLinkingMode: propsIsLinkingMode,
  isDeleteMode,
  isSelectedForDeletion,
  zoomLevel,
  onContentUpdate, // ★ 新しいプロパティを受け取る
}: NodeItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null);
  const didDragRef = useRef(false);

  // ★ コンテンツ編集用のステート
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editedContent, setEditedContent] = useState(node.content || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);


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
    // テキストエリア編集中はドラッグを開始しない
    if (isEditingContent && (e.target as HTMLElement).closest('textarea')) {
      e.stopPropagation(); // Card の onMouseDown をトリガーさせない
      return;
    }
    if (e.button !== 0 || propsIsLinkingMode) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    didDragRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
    };
    setIsDragging(true);
  };

  const mouseMoveHandler = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current || !canvasRef.current) return;

    const dxInView = e.clientX - dragStartRef.current.x;
    const dyInView = e.clientY - dragStartRef.current.y;

    const dxInWorld = dxInView / zoomLevel;
    const dyInWorld = dyInView / zoomLevel;

    let newX = dragStartRef.current.nodeX + dxInWorld;
    let newY = dragStartRef.current.nodeY + dyInWorld;

    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    if (Math.abs(dxInView) > 3 || Math.abs(dyInView) > 3) {
        didDragRef.current = true;
    }

    onNodeDrag(node.id, newX, newY);
  }, [node.id, onNodeDrag, canvasRef, zoomLevel]);


  const mouseUpHandler = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', mouseUpHandler);
    } else {
      dragStartRef.current = null;
    }

    return () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };
  }, [isDragging, mouseMoveHandler, mouseUpHandler]);


  const handleClick = (e: React.MouseEvent) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      e.stopPropagation();
      return;
    }
    if (propsIsLinkingMode) {
      e.stopPropagation();
    }
    onNodeClick(node.id, e);
  };

  // Card全体のダブルクリックは既存の onNodeDoubleClick (モーダル表示用)
  const handleCardDoubleClick = (e: React.MouseEvent) => {
    // コンテンツ編集中はモーダルを開かない
    if (isEditingContent || (e.target as HTMLElement).closest('[data-editing-content="true"]')) {
        e.stopPropagation();
        return;
    }
    e.stopPropagation();
    if (!propsIsLinkingMode) {
        onNodeDoubleClick(node.id, e);
    }
  };

  // ★ コンテンツエリアのダブルクリックでインライン編集を開始
  const handleContentDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Cardのダブルクリックイベントを止める
    if ((node.type === 'note' || node.type === 'file') && !propsIsLinkingMode && !isEditingContent) {
      setEditedContent(node.content || ''); // 編集開始時に現在のノードのコンテンツを設定
      setIsEditingContent(true);
    }
  };

  // ★ Textarea の変更をローカルステートに反映
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedContent(e.target.value);
  };

  // ★ Textarea からフォーカスが外れたら更新を通知
  const handleContentBlur = () => {
    if (node.content !== editedContent) { // 内容に変更があった場合のみ更新
      onContentUpdate(node.id, editedContent);
    }
    setIsEditingContent(false);
  };

  // ★ Textarea でのキー入力処理 (Enterで保存, Escapeでキャンセル)
  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // デフォルトの改行を防ぐ
      if (node.content !== editedContent) {
        onContentUpdate(node.id, editedContent);
      }
      setIsEditingContent(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditedContent(node.content || ''); // 変更を元に戻す
      setIsEditingContent(false);
    }
  };
  
  // ★ 編集モードになったらTextareaにフォーカス
  useEffect(() => {
    if (isEditingContent && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select(); // テキストを選択状態にする
    }
  }, [isEditingContent]);


  const nodeWidth = node.width || 256;
  let nodeHeight = node.height || 'auto';
  if (node.type === 'note' && node.tags && node.tags.length > 0 && nodeHeight === 'auto') {
    // Basic auto-height adjustment if tags are present for notes.
  }


  return (
    <Card
      data-node-item="true"
      className={cn(
        "absolute shadow-lg hover:shadow-xl transition-shadow duration-200",
        "flex flex-col",
        isSelected && "ring-2 ring-accent shadow-accent/50",
        isSelectedForDeletion && "ring-2 ring-destructive shadow-destructive/50",
        isDragging ? "cursor-grabbing shadow-2xl z-10" :
          (propsIsLinkingMode || isDeleteMode ? "cursor-pointer" : "cursor-grab")
      )}
      style={{
        left: node.x,
        top: node.y,
        width: nodeWidth,
        minHeight: node.type === 'note' ? (node.content ? 160 : 100) : 160,
        height: nodeHeight
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleCardDoubleClick} // Card全体のダブルクリック
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
      {(node.type === 'note' || node.type === 'file') && ( // noteタイプまたはfileタイプであればCardContentを表示
        <CardContent
          className="p-3 pt-0 text-sm overflow-hidden flex-grow"
          onDoubleClick={handleContentDoubleClick} // ★ コンテンツエリアのダブルクリック
          data-editing-content={isEditingContent} // ドラッグ抑止やモーダル表示抑止のため
        >
          {isEditingContent ? (
            <Textarea
              ref={textareaRef}
              value={editedContent}
              onChange={handleContentChange}
              onBlur={handleContentBlur}
              onKeyDown={handleContentKeyDown}
              className="w-full h-full resize-none border border-accent ring-accent focus-visible:ring-accent"
              onMouseDown={(e) => e.stopPropagation()} // ★ ドラッグを防ぐ
              placeholder={node.type === 'note' ? "ノート内容を入力..." : "ファイル内容を入力..."}
            />
          ) : (
            <p className={cn(
                "whitespace-pre-wrap break-words",
                node.content ? "line-clamp-3" : "text-muted-foreground italic" // コンテンツがない場合はプレースホルダー表示
            )}>
              {node.content || (propsIsLinkingMode || isDragging ? '' : '（ダブルクリックして編集）')}
            </p>
          )}
        </CardContent>
      )}
      {(node.tags && node.tags.length > 0) && (
        <CardFooter className="p-3 pt-1 flex flex-wrap gap-1 border-t mt-auto">
          {node.tags.map((tag, index) => (
            <Badge key={index} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </CardFooter>
      )}
    </Card>
  );
}
