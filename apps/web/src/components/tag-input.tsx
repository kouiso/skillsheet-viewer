'use client';

import { X } from 'lucide-react';
import { useRef, useState } from 'react';

interface TagInputProps {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function TagInput({ tags = [], onChange, placeholder }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    // カンマ区切りで複数追加
    const newTags = trimmed
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !tags.includes(t));
    if (newTags.length > 0) {
      onChange([...tags, ...newTags]);
    }
    setInputValue('');
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  return (
    <fieldset
      className="m-0 flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 focus-within:ring-1 focus-within:ring-ring"
      onClick={() => inputRef.current?.focus()}
      onKeyDown={() => {}}
    >
      {tags.map((tag, i) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(i);
            }}
            className="ml-0.5 rounded hover:text-destructive"
            aria-label={`${tag} を削除`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(inputValue)}
        placeholder={tags.length === 0 ? placeholder : undefined}
        className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </fieldset>
  );
}
