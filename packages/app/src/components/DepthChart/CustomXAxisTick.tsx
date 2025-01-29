import type React from 'react';

const checkIsClosestTick = (
  tick: number,
  activeTickValue: number,
  tickSpacing: number
) => {
  return tick <= activeTickValue && tick + tickSpacing >= activeTickValue;
};

interface PayloadType {
  value: number;
}

interface CustomXAxisTickProps {
  props: {
    x: number;
    y: number;
    width: number;
    height: number;
    tick: number;
    index: number;
    payload: PayloadType;
  };
  activeTickValue: number;
  tickSpacing: number;
}

export const CustomXAxisTick: React.FC<CustomXAxisTickProps> = ({
  props,
  activeTickValue,
  tickSpacing,
}) => {
  const { payload, x, y } = props;

  const isClosestTick = checkIsClosestTick(
    payload.value,
    activeTickValue,
    tickSpacing
  );

  if (!isClosestTick) return null;

  return (
    <g transform={`translate(${x},${y})`} id="activeTicks">
      <text x={0} y={0} dy={12} textAnchor="middle" fontSize={12} opacity={0.5}>
        Active tick range
      </text>
    </g>
  );
};

export default CustomXAxisTick;
