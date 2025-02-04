import type React from 'react';

const checkIsClosestTick = (
  tick: number,
  activeTickValue: number,
  tickSpacing: number
) => {
  return tick <= activeTickValue && tick + tickSpacing >= activeTickValue;
};

interface CustomBarProps {
  props: {
    x: number;
    y: number;
    width: number;
    height: number;
    tickIdx: number;
    index: number;
  };
  activeTickValue: number;
  tickSpacing: number;
  isTrade?: boolean;
}

export const CustomBar: React.FC<CustomBarProps> = ({
  props,
  activeTickValue,
  tickSpacing,
  isTrade = false,
}) => {
  const { x, y, width, height } = props;

  const isClosestTick = checkIsClosestTick(
    props.tickIdx,
    activeTickValue,
    tickSpacing
  );

  let fill = '#58585A';
  if (isClosestTick) {
    fill = '#8D895E';
  }

  return (
    !(isTrade && isClosestTick) && (
      <path
        d={`
          M ${x},${y + height}
          L ${x},${y + 2}
          Q ${x},${y} ${x + 2},${y}
          L ${x + width - 2},${y}
          Q ${x + width},${y} ${x + width},${y + 2}
          L ${x + width},${y + height}
          Z
        `}
        fill={fill}
        height="100%"
      />
    )
  );
};

export default CustomBar;
