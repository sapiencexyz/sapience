'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useDraggable() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);

  const startDrag = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({ top: rect.top, left: rect.left });
    isDraggingRef.current = true;
    dragOffsetRef.current = { dx: clientX - rect.left, dy: clientY - rect.top };
  }, []);

  const endDrag = useCallback(() => {
    isDraggingRef.current = false;
    dragOffsetRef.current = null;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragOffsetRef.current) return;
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const { dx, dy } = dragOffsetRef.current;
      let nextLeft = e.clientX - dx;
      let nextTop = e.clientY - dy;
      const padding = 8;
      const maxLeft = Math.max(padding, window.innerWidth - w - padding);
      const maxTop = Math.max(padding, window.innerHeight - h - padding);
      nextLeft = Math.min(Math.max(padding, nextLeft), maxLeft);
      nextTop = Math.min(Math.max(padding, nextTop), maxTop);
      setPosition({ top: nextTop, left: nextLeft });
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || !dragOffsetRef.current) return;
      if (e.touches.length === 0) return;
      e.preventDefault();
      const t = e.touches[0];
      const el = containerRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const { dx, dy } = dragOffsetRef.current;
      let nextLeft = t.clientX - dx;
      let nextTop = t.clientY - dy;
      const padding = 8;
      const maxLeft = Math.max(padding, window.innerWidth - w - padding);
      const maxTop = Math.max(padding, window.innerHeight - h - padding);
      nextLeft = Math.min(Math.max(padding, nextLeft), maxLeft);
      nextTop = Math.min(Math.max(padding, nextTop), maxTop);
      setPosition({ top: nextTop, left: nextLeft });
    };

    const onUp = () => endDrag();

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove as any);
      window.removeEventListener('touchend', onUp);
    };
  }, [endDrag]);

  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (closeBtnRef.current && closeBtnRef.current.contains(e.target as Node))
        return;
      startDrag(e.clientX, e.clientY);
    },
    [startDrag]
  );

  const onHeaderTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (closeBtnRef.current && closeBtnRef.current.contains(e.target as Node))
        return;
      const t = e.touches[0];
      if (!t) return;
      startDrag(t.clientX, t.clientY);
    },
    [startDrag]
  );

  return {
    refs: { containerRef, headerRef, closeBtnRef },
    position,
    handlers: { onHeaderMouseDown, onHeaderTouchStart },
  } as const;
}
