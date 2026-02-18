'use client';

import { useEffect, useRef } from 'react';

type Line = {
  x: number;
  y: number;
  width: number;
  speed: number;
  opacity: number;
};

type HeroBackgroundLinesProps = {
  className?: string;
};

// Renders animated horizontal lines that move left->right across the screen.
// Lines use a left-to-right gradient from #382F2D to #F0E1CD and are 2px tall.
export default function HeroBackgroundLines({
  className = 'opacity-25',
}: HeroBackgroundLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const linesRef = useRef<Line[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const canvasEl: HTMLCanvasElement = canvas;
    const ctxEl: CanvasRenderingContext2D = ctx;

    let isRunning = true;

    function resize() {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const { clientWidth, clientHeight } = canvasEl;
      canvasEl.width = Math.floor(clientWidth * dpr);
      canvasEl.height = Math.floor(clientHeight * dpr);
      ctxEl.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seedLines() {
      const height = canvasEl.clientHeight;
      const numLines = Math.floor(height / 18); // density
      const result: Line[] = [];
      for (let i = 0; i < numLines; i++) {
        const width = 60 + Math.random() * 280;
        // Ensure the entire line starts fully offscreen to the left, then slides in
        // Spread spawn positions so they don't all enter at once
        const spawnOffset = Math.random() * canvasEl.clientWidth;
        result.push({
          x: -width - spawnOffset,
          y: Math.random() * height,
          width,
          speed: 120 + Math.random() * 160, // a bit faster overall
          opacity: 0.25 + Math.random() * 0.5,
        });
      }
      linesRef.current = result;
    }

    function drawGradientLine(
      x: number,
      y: number,
      width: number,
      opacity: number
    ) {
      const h = 2; // 2px tall
      const grad = ctxEl.createLinearGradient(x, y, x + width, y);
      grad.addColorStop(0, `rgba(56,47,45,${opacity})`); // #382F2D
      grad.addColorStop(1, `rgba(240,225,205,${opacity})`); // #F0E1CD
      ctxEl.fillStyle = grad;
      ctxEl.fillRect(x, y, width, h);
    }

    let lastTs = performance.now();
    function frame(now: number) {
      if (!isRunning) return;
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      ctxEl.clearRect(0, 0, canvasEl.clientWidth, canvasEl.clientHeight);

      for (const line of linesRef.current) {
        line.x += line.speed * dt;
        // When the entire line has moved beyond the right edge, respawn fully offscreen left
        if (line.x > canvasEl.clientWidth + 40) {
          const newWidth = 60 + Math.random() * 300;
          const respawnOffset = Math.random() * canvasEl.clientWidth * 0.75; // stagger re-entry
          line.x = -newWidth - respawnOffset;
          line.y = Math.random() * canvasEl.clientHeight;
          line.width = newWidth;
          line.speed = 120 + Math.random() * 180;
          line.opacity = 0.2 + Math.random() * 0.6;
        }
        drawGradientLine(line.x, line.y, line.width, line.opacity);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    function handleVisibility() {
      if (document.visibilityState === 'hidden' && rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (document.visibilityState === 'visible' && !rafRef.current) {
        lastTs = performance.now();
        rafRef.current = requestAnimationFrame(frame);
      }
    }

    resize();
    seedLines();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibility);
    lastTs = performance.now();
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      isRunning = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 ${className}`}>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
