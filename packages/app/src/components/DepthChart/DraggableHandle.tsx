import type React from 'react';

const RECHARTS_WRAPPER_SELECTOR = '.recharts-wrapper';

interface DraggableHandleProps {
  x: number;
  y: number;
  onDrag: (x: number) => void;
  onDragEnd: () => void;
  color?: string;
  isHighPrice?: boolean;
  chartRef: React.RefObject<HTMLDivElement>;
}

export function DraggableHandle({
  x,
  y,
  onDrag,
  onDragEnd,
  color = '#8D895E',
  isHighPrice = false,
  chartRef,
}: DraggableHandleProps) {
  // Offset the handle by 7 pixels left or right based on type
  const handleOffset = isHighPrice ? 7 : -7;

  // When PointerDown is fired, we capture the pointer so we can
  // reliably read pointer coordinates on subsequent moves.
  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // On pointer move, calculate the "relativeX" based on chart bounds
  // and pass it to your parent. The parent sets the new x in its state,
  // then rerenders DraggableHandle with the new x prop.
  const handlePointerMove = (e: React.PointerEvent<SVGGElement>) => {
    // Only move when the left mouse button is pressed
    if (e.buttons !== 1) return;
    if (!chartRef.current) return;

    const chartElement = chartRef.current.querySelector(
      RECHARTS_WRAPPER_SELECTOR
    ) as HTMLElement;
    if (!chartElement) return;

    const chartRect = chartElement.getBoundingClientRect();
    const relativeX = e.clientX - chartRect.left;

    const leftBound = 0;
    const rightBound = chartRect.width;
    const constrainedX = Math.max(leftBound, Math.min(rightBound, relativeX));

    // Subtract the left margin from the x position since it will be added back in the render
    onDrag(constrainedX - 0);
  };

  // On pointer up, we release the pointer capture and call onDragEnd
  const handlePointerUp = (e: React.PointerEvent<SVGGElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    onDragEnd();
  };

  const transitionStyle = { transition: 'transform 0.08s ease-out' };

  return (
    <g
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        cursor: 'ew-resize',
        transform: `translateX(${x}px)`,
        ...transitionStyle,
      }}
    >
      {/* Vertical bar */}
      <rect x={0} y={y} width={2} height="calc(100% - 35px)" fill={color} />

      {/* Handle icon at top */}
      <rect
        x={-6 + handleOffset}
        y={y}
        width={14}
        height={16}
        fill={color}
        rx={2}
      />

      {/* Little vertical lines inside the handle */}
      <line
        x1={-2 + handleOffset}
        y1={y + 4}
        x2={-2 + handleOffset}
        y2={y + 12}
        stroke="white"
        strokeWidth={1}
        opacity={0.5}
      />
      <line
        x1={1 + handleOffset}
        y1={y + 4}
        x2={1 + handleOffset}
        y2={y + 12}
        stroke="white"
        strokeWidth={1}
        opacity={0.5}
      />
      <line
        x1={4 + handleOffset}
        y1={y + 4}
        x2={4 + handleOffset}
        y2={y + 12}
        stroke="white"
        strokeWidth={1}
        opacity={0.5}
      />
    </g>
  );
}

export default DraggableHandle;
