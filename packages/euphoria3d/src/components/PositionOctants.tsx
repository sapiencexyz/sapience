import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OCTANTS, type CubeKey } from './QuoteCubes';

export interface SubmittedPosition {
  id: string;
  cubeKey: CubeKey;
  status: 'accepting' | 'accepted' | 'filled';
  predictionId?: string;
  won?: boolean;
  /** Frozen world position of the sphere group at click time */
  worldPos: { x: number; y: number; z: number };
  /** Auction/bid data for display and poller matching */
  auctionMeta: {
    picks: Array<{ conditionResolver: string; conditionId: string; predictedOutcome: number }>;
    predictorCollateral: string;
    predictorNonce: number;
    predictorDeadline: number;
  };
  bestBid: {
    counterparty: string;
    counterpartyCollateral: string;
    counterpartyNonce: number;
    counterpartyDeadline: number;
    counterpartySignature: string;
    counterpartySessionKeyData?: string;
  };
  bidAmount?: string;
  probability?: number;
}

const COL_GOLD = new THREE.Color('#ffd700');
const COL_FILLED = new THREE.Color('#ffab00'); // amber — distinct from pre-index gold
const COL_GREEN = new THREE.Color('#4caf50');
const COL_RED = new THREE.Color('#f44336');

const HALF_PI = Math.PI / 2;
const GAP = 0.03;
const SPHERE_RADIUS = 0.6;

function getPhiStart(sx: number, sz: number): number {
  if (sx > 0 && sz > 0) return 0;
  if (sx < 0 && sz > 0) return Math.PI / 2;
  if (sx < 0 && sz < 0) return Math.PI;
  return (3 * Math.PI) / 2;
}

function PositionOctant({
  position,
  worldPos,
  status,
  won,
  cubeKey,
  onClick,
}: {
  position: THREE.Vector3;
  worldPos: { x: number; y: number; z: number };
  status: string;
  won?: boolean;
  cubeKey: CubeKey;
  onClick: (key: CubeKey) => void;
}) {
  const sx = Math.sign(position.x);
  const sy = Math.sign(position.y);
  const sz = Math.sign(position.z);

  const phiStart = getPhiStart(sx, sz) + GAP;
  const phiLength = HALF_PI - 2 * GAP;
  const thetaStart = (sy > 0 ? 0 : HALF_PI) + GAP;
  const thetaLength = HALF_PI - 2 * GAP;

  const geometry = useMemo(
    () => new THREE.SphereGeometry(SPHERE_RADIUS, 24, 16, phiStart, phiLength, thetaStart, thetaLength),
    [phiStart, phiLength, thetaStart, thetaLength],
  );

  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const filledUnresolved = status === 'filled' && won === undefined;

  const anim = useRef({
    opacity: 0.7,
    emissive: 0.3,
    pulsePhase: 0,
    yOffset: 0,
    scale: 1,
    color: COL_GOLD.clone(),
  });

  useFrame((_, delta) => {
    const a = anim.current;

    if (status === 'accepting' || status === 'accepted') {
      // Pre-index: gentle pulse in gold
      const pulseRate = status === 'accepting' ? 4 : 6;
      a.pulsePhase += delta * pulseRate;
      const sine = 0.5 + 0.5 * Math.sin(a.pulsePhase);
      a.emissive = 0.2 + 0.4 * sine;
      a.opacity = 0.55 + 0.35 * sine;
      a.color.lerp(COL_GOLD, 0.1);
      a.scale += (1 - a.scale) * 0.1;
    } else if (filledUnresolved) {
      // Indexed, waiting for settlement: amber pulse + hover boost
      a.pulsePhase += delta * 5;
      const sine = 0.5 + 0.5 * Math.sin(a.pulsePhase);

      const targetScale = hovered ? 1.18 : 1;
      const baseEmissive = hovered ? 0.5 : 0.25;
      const baseOpacity = hovered ? 0.8 : 0.65;

      a.emissive = baseEmissive + 0.35 * sine;
      a.opacity = baseOpacity + 0.2 * sine;
      a.color.lerp(COL_FILLED, 0.15);
      a.scale += (targetScale - a.scale) * 0.12;
    } else if (status === 'filled' && won !== undefined) {
      // Settled — fade out with direction
      const targetColor = won ? COL_GREEN : COL_RED;
      const targetY = won ? 0.8 : -0.8;
      const t = 1 - Math.exp(-3 * delta);
      a.opacity += (0 - a.opacity) * t;
      a.yOffset += (targetY - a.yOffset) * t;
      a.color.lerp(targetColor, t);
      a.emissive += (0.3 - a.emissive) * t;
      a.scale += (1 - a.scale) * 0.1;
    }

    if (matRef.current) {
      matRef.current.opacity = a.opacity;
      matRef.current.color.copy(a.color);
      matRef.current.emissive.copy(a.color);
      matRef.current.emissiveIntensity = a.emissive;
    }

    if (groupRef.current) {
      groupRef.current.position.set(worldPos.x, worldPos.y + a.yOffset, worldPos.z);
      groupRef.current.scale.setScalar(a.scale);
    }
  });

  return (
    <group ref={groupRef} position={[worldPos.x, worldPos.y, worldPos.z]}>
      <mesh
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          onClick(cubeKey);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = filledUnresolved ? 'pointer' : 'default';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <meshStandardMaterial
          ref={matRef}
          transparent
          opacity={0.7}
          color={COL_GOLD}
          emissive={COL_GOLD}
          emissiveIntensity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

interface PositionOctantsProps {
  positions: SubmittedPosition[];
  onClick: (positionId: string) => void;
}

export function PositionOctants({ positions, onClick }: PositionOctantsProps) {
  return (
    <>
      {positions.map((pos) => {
        const octant = OCTANTS.find((o) => o.key === pos.cubeKey);
        if (!octant) return null;
        return (
          <PositionOctant
            key={pos.id}
            position={new THREE.Vector3(octant.sx, octant.sy, octant.sz)}
            worldPos={pos.worldPos}
            status={pos.status}
            won={pos.won}
            cubeKey={pos.cubeKey}
            onClick={() => onClick(pos.id)}
          />
        );
      })}
    </>
  );
}
