
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { UploadCloud, StickyNote, Search, Layers, Link as LinkIcon, Tag, Tags as TagsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ToolbarProps {
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCreateNote: () => void;
  onSearch: (term: string) => void;
  currentSearchTerm: string;
  onDepthChange: (depth: number[]) => void;
  currentDepth: number;
  onToggleLinkMode: () => void;
  isLinkingMode: boolean;
  allTags: string[];
  selectedFilterTags: string[];
  onFilterTagToggle: (tag: string) => void;
  onOpenManageTagsDialog: () => void; 
}

export function Toolbar({
  onFileUpload,
  onCreateNote,
  onSearch,
  currentSearchTerm,
  onDepthChange,
  currentDepth,
  onToggleLinkMode,
  isLinkingMode,
  allTags,
  selectedFilterTags,
  onFilterTagToggle,
  onOpenManageTagsDialog, 
}: ToolbarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <header className="p-3 bg-card border-b border-border shadow-sm flex flex-col gap-3 print:hidden sticky top-0 z-10">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="outline" onClick={handleUploadClick} aria-label="Upload file">
          <UploadCloud className="mr-2 h-4 w-4" /> Upload File
        </Button>
        <Input
          type="file"
          ref={fileInputRef}
          onChange={onFileUpload}
          className="hidden"
          multiple
          accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
        />
        <Button variant="outline" onClick={onCreateNote} aria-label="Create new note">
          <StickyNote className="mr-2 h-4 w-4" /> Create Note
        </Button>
        <Button
          variant={isLinkingMode ? "default" : "outline"}
          onClick={onToggleLinkMode}
          aria-label={isLinkingMode ? "Cancel linking nodes" : "Link nodes"}
        >
          <LinkIcon className="mr-2 h-4 w-4" /> {isLinkingMode ? 'Linking...' : 'Link Nodes'}
        </Button>
         <Button variant="outline" onClick={onOpenManageTagsDialog} aria-label="Manage tags">
          <TagsIcon className="mr-2 h-4 w-4" /> Manage Tags
        </Button>
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search nodes (inc. tags)..."
            className="w-64"
            value={currentSearchTerm}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search nodes"
          />
        </div>
        <div className="flex items-center gap-3 min-w-[200px]">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <Label htmlFor="search-depth" className="whitespace-nowrap text-sm">
            Link Depth: {currentDepth}
          </Label>
          <Slider
            id="search-depth"
            min={0}
            max={5}
            step={1}
            defaultValue={[currentDepth]}
            onValueChange={onDepthChange}
            className={cn("w-full")}
            aria-label="Search depth slider"
          />
        </div>
      </div>
      {allTags.length > 0 && (
        <div className="w-full border-t border-border pt-2 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-5 w-5 text-muted-foreground" />
            <Label className="text-sm font-medium">Filter by Tags:</Label>
          </div>
          <div className="flex flex-wrap gap-2">
            {allTags.map(tag => (
              <Badge
                key={tag}
                variant={selectedFilterTags.includes(tag) ? 'default' : 'secondary'}
                onClick={() => onFilterTagToggle(tag)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                aria-pressed={selectedFilterTags.includes(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

