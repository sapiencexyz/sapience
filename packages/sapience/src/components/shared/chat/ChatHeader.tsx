'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { MessageCircle, X } from 'lucide-react';
import type React from 'react';

type Props = {
  onClose: () => void;
  headerRef: React.RefObject<HTMLDivElement>;
  closeBtnRef: React.RefObject<HTMLButtonElement>;
  onHeaderPointerDown: (e: React.PointerEvent<Element>) => void;
};

export function ChatHeader({
  onClose,
  headerRef,
  closeBtnRef,
  onHeaderPointerDown,
}: Props) {
  return (
    <div
      ref={headerRef}
      className="flex items-center justify-between p-3 border-b select-none cursor-grab active:cursor-grabbing"
      onPointerDown={onHeaderPointerDown}
    >
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 opacity-80" />
        <span className="text-sm font-medium">Chat</span>
      </div>
      <Button
        ref={closeBtnRef}
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
