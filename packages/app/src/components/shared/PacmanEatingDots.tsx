'use client';

import { useEffect, useState } from 'react';

// Animated Pacman eating squares component
export default function PacmanEatingDots() {
  const [mouthFrame, setMouthFrame] = useState(0);

  useEffect(() => {
    // Only animate mouth on non-mobile devices
    const isMobileDevice = window.innerWidth < 768;
    if (!isMobileDevice) {
      const interval = setInterval(() => {
        setMouthFrame((prev) => (prev + 1) % 9);
      }, 50); // 0.45s / 9 frames ≈ 50ms per frame

      return () => clearInterval(interval);
    }
  }, []);

  // Mouth paths: 0° (closed) to 45° (open) in discrete steps - more frames for smoother chunky animation
  const mouthPaths = [
    'M 24 24 L 44.996 23.633 A 21 21 0 0 1 44.996 24.367 L 24 24 Z', // 0° - closed
    'M 24 24 L 44.8 21.5 A 21 21 0 0 1 44.8 26.5 L 24 24 Z', // ~11.25° - quarter open
    'M 24 24 L 44.5 20 A 21 21 0 0 1 44.5 28 L 24 24 Z', // ~22.5° - half open
    'M 24 24 L 43.9 17.5 A 21 21 0 0 1 43.9 30.5 L 24 24 Z', // ~33.75° - three quarters open
    'M 24 24 L 43.4 15.96 A 21 21 0 0 1 43.4 32.04 L 24 24 Z', // 45° - fully open
    'M 24 24 L 43.9 17.5 A 21 21 0 0 1 43.9 30.5 L 24 24 Z', // ~33.75° - three quarters open
    'M 24 24 L 44.5 20 A 21 21 0 0 1 44.5 28 L 24 24 Z', // ~22.5° - half open
    'M 24 24 L 44.8 21.5 A 21 21 0 0 1 44.8 26.5 L 24 24 Z', // ~11.25° - quarter open
    'M 24 24 L 44.996 23.633 A 21 21 0 0 1 44.996 24.367 L 24 24 Z', // 0° - closed
  ];
  return (
    <>
      <style jsx global>{`
        @keyframes pacman-move {
          0% {
            transform: translateX(0px) translateY(-50%);
          }
          100% {
            transform: translateX(calc(50% + 245px)) translateY(-50%);
          }
        }
        .pacman-container {
          animation: pacman-move 2.5s linear infinite;
          position: absolute;
          left: 0;
          top: 50%;
        }
        @keyframes square-eaten {
          0% {
            background-color: rgb(250 204 21);
          }
          0.5% {
            background-color: transparent;
          }
          2% {
            background-color: transparent;
          }
          100% {
            background-color: rgb(250 204 21);
          }
        }
        .pacman-dot {
          animation: square-eaten 2.5s linear infinite;
        }
        @media (prefers-color-scheme: dark) {
          @keyframes square-eaten {
            0% {
              background-color: rgb(234 179 8);
            }
            0.5% {
              background-color: transparent;
            }
            2% {
              background-color: transparent;
            }
            100% {
              background-color: rgb(234 179 8);
            }
          }
        }
        @media (max-width: 767px) {
          .pacman-container {
            display: none;
          }
          .pacman-cover {
            display: none;
          }
        }
      `}</style>
      <div className="flex flex-col items-center justify-center p-4">
        <div className="relative w-full max-w-xs h-20 mb-4 overflow-hidden flex items-center">
          {/* Simple circle with mouth - moves across screen */}
          <div className="pacman-container z-10">
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              className="drop-shadow-sm"
            >
              {/* Yellow circle */}
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="rgb(250 204 21)"
                stroke="none"
                className="dark:fill-yellow-400"
              />
              {/* Pacman's eye - black dot */}
              <circle
                cx="24"
                cy="14"
                r="3"
                fill="currentColor"
                className="text-background dark:text-background"
              />
              {/* Black mouth sector overlaying the yellow circle - animate sector angles from 0° to 45° */}
              {/* Single sector from 0° (closed) expanding to 45° (open) with chunky animation */}
              <path
                fill="rgba(28, 30, 32, 1)"
                className="text-background dark:text-background"
                shapeRendering="geometricPrecision"
                d={mouthPaths[mouthFrame]}
              />
            </svg>
          </div>
          {/* Left cover block - covers Pacman at the start */}
          <div
            className="pacman-cover absolute left-0 top-0 w-14 h-full z-20"
            style={{ backgroundColor: 'rgba(28, 30, 32, 1)' }}
          />
          {/* Right cover block - covers Pacman at the end */}
          <div
            className="pacman-cover absolute right-0 top-0 w-14 h-full z-20"
            style={{ backgroundColor: 'rgba(28, 30, 32, 1)' }}
          />
          {/* Squares being eaten - change color when Pacman is on them */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-4 items-center"
            style={{ marginLeft: '0px' }}
          >
            <div
              className="w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-500 pacman-dot"
              style={{ animationDelay: '0.2s' }}
            />
            <div
              className="w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-500 pacman-dot"
              style={{ animationDelay: '0.45s' }}
            />
            <div
              className="w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-500 pacman-dot"
              style={{ animationDelay: '0.75s' }}
            />
            <div
              className="w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-500 pacman-dot"
              style={{ animationDelay: '1.05s' }}
            />
            <div
              className="w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-500 pacman-dot"
              style={{ animationDelay: '1.35s' }}
            />
            <div
              className="w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-500 pacman-dot"
              style={{ animationDelay: '1.65s' }}
            />
            <div
              className="w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-500 pacman-dot"
              style={{ animationDelay: '1.95s' }}
            />
            <div
              className="w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-500 pacman-dot"
              style={{ animationDelay: '2.25s' }}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Waiting for position to be indexed...
        </p>
      </div>
    </>
  );
}
