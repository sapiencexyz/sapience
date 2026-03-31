import { useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export type CubeKey = 'OOO' | 'OOU' | 'OUO' | 'OUU' | 'UOO' | 'UOU' | 'UUO' | 'UUU';

export interface BestBid {
  counterparty: string;
  counterpartyCollateral: string;
  counterpartyNonce: number;
  counterpartyDeadline: number;
  counterpartySignature: string;
  counterpartySessionKeyData?: string;
}

export interface AuctionMeta {
  picks: Array<{ conditionResolver: string; conditionId: string; predictedOutcome: number }>;
  predictorCollateral: string;
  predictorNonce: number;
  predictorDeadline: number;
}

export interface CubeAuctionState {
  status: 'sending' | 'acked' | 'quoted' | 'expired' | 'error';
  auctionId?: string;
  probability?: number;
  bidAmount?: string;
  error?: string;
  bestBid?: BestBid;
  auctionMeta?: AuctionMeta;
}

interface QuoteCubeProps {
  position: THREE.Vector3;
  cubeKey: CubeKey;
  state?: CubeAuctionState;
  onClick: (key: CubeKey, leg1Over: boolean, leg2Over: boolean, leg3Over: boolean) => void;
  onHover: (key: CubeKey | null) => void;
  leg1Over: boolean;
  leg2Over: boolean;
  leg3Over: boolean;
}

const SPHERE_RADIUS = 0.6;
const HALF_PI = Math.PI / 2;
const GAP = 0.03;

// Target colors per state
const COL_IDLE = new THREE.Color('#8b6aae');
const COL_FOREGROUND = new THREE.Color('#e0e0e0');
const COL_GOLD = new THREE.Color('#ffd700');
const COL_GREEN = new THREE.Color('#4caf50');
const COL_RED = new THREE.Color('#f44336');


function getPhiStart(sx: number, sz: number): number {
  // Three.js SphereGeometry: x = -R*cos(phi)*sin(θ), z = R*sin(phi)*sin(θ)
  // phi=0 → -X, phi=PI/2 → +Z, phi=PI → +X, phi=3PI/2 → -Z
  if (sx < 0 && sz > 0) return 0;
  if (sx > 0 && sz > 0) return HALF_PI;
  if (sx > 0 && sz < 0) return Math.PI;
  return HALF_PI * 3; // sx < 0 && sz < 0
}

interface AnimTargets {
  opacity: number;
  emissive: number;
  yOffset: number;
  color: THREE.Color;
  speed: number;
}

function getTargets(status: string | undefined, hovered: boolean): AnimTargets {
  switch (status) {
    case 'quoted':
      return hovered
        ? { opacity: 0.9, emissive: 0.5, yOffset: 0, color: COL_GOLD, speed: 12 }
        : { opacity: 0.85, emissive: 0.25, yOffset: 0, color: COL_FOREGROUND, speed: 6 };
    default:
      return { opacity: 0.2, emissive: 0.1, yOffset: 0, color: COL_IDLE, speed: 8 };
  }
}

function QuoteOctant({ position, cubeKey, state, onClick, onHover, leg1Over, leg2Over, leg3Over }: QuoteCubeProps) {
  const [hovered, setHovered] = useState(false);

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

  const anim = useRef({
    opacity: 0.2,
    emissive: 0.1,
    color: COL_IDLE.clone(),
    prevStatus: undefined as string | undefined,
  });

  useFrame((_, delta) => {
    const a = anim.current;
    const status = state?.status;

    // Quick fade when quoted octant gets replaced by new batch
    const wasQuoted = a.prevStatus === 'quoted';
    const nowIdle = !status || status === 'sending' || status === 'acked' || status === 'expired';
    const quickFade = wasQuoted && nowIdle;

    const targets = getTargets(status, hovered);
    const speed = quickFade ? 15 : targets.speed;
    const t = 1 - Math.exp(-speed * delta);

    a.opacity += (targets.opacity - a.opacity) * t;
    a.color.lerp(targets.color, t);
    a.emissive += (targets.emissive - a.emissive) * t;

    a.prevStatus = status;

    // Apply to material
    if (matRef.current) {
      matRef.current.opacity = a.opacity;
      matRef.current.color.copy(a.color);
      matRef.current.emissive.copy(a.color);
      matRef.current.emissiveIntensity = a.emissive;
    }
  });

  return (
    <group>
      <mesh
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          onClick(cubeKey, leg1Over, leg2Over, leg3Over);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover(cubeKey);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <meshStandardMaterial
          ref={matRef}
          transparent
          opacity={0.2}
          color={COL_IDLE}
          emissive={COL_IDLE}
          emissiveIntensity={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// 8 octants = 2^3 over/under combos for 3 legs
// Signs encode which octant: +1 = Over, -1 = Under per axis
// Key: position 1 = leg1 (X), position 2 = leg3 (Y), position 3 = leg2 (Z)
export const OCTANTS: {
  key: CubeKey;
  label: string;
  leg1Over: boolean;
  leg2Over: boolean;
  leg3Over: boolean;
  sx: number;
  sy: number;
  sz: number;
}[] = [
  { key: 'OOO', label: 'O/O/O', leg1Over: true,  leg2Over: true,  leg3Over: true,  sx: +1, sy: +1, sz: +1 },
  { key: 'OOU', label: 'O/O/U', leg1Over: true,  leg2Over: true,  leg3Over: false, sx: +1, sy: -1, sz: +1 },
  { key: 'OUO', label: 'O/U/O', leg1Over: true,  leg2Over: false, leg3Over: true,  sx: +1, sy: +1, sz: -1 },
  { key: 'OUU', label: 'O/U/U', leg1Over: true,  leg2Over: false, leg3Over: false, sx: +1, sy: -1, sz: -1 },
  { key: 'UOO', label: 'U/O/O', leg1Over: false, leg2Over: true,  leg3Over: true,  sx: -1, sy: +1, sz: +1 },
  { key: 'UOU', label: 'U/O/U', leg1Over: false, leg2Over: true,  leg3Over: false, sx: -1, sy: -1, sz: +1 },
  { key: 'UUO', label: 'U/U/O', leg1Over: false, leg2Over: false, leg3Over: true,  sx: -1, sy: +1, sz: -1 },
  { key: 'UUU', label: 'U/U/U', leg1Over: false, leg2Over: false, leg3Over: false, sx: -1, sy: -1, sz: -1 },
];

interface QuoteCubesProps {
  latestPointRef: React.RefObject<THREE.Vector3>;
  onCubeClick: (key: CubeKey, leg1Over: boolean, leg2Over: boolean, leg3Over: boolean) => void;
  onCubeHover: (key: CubeKey | null) => void;
  cubeAuctions: Record<string, CubeAuctionState>;
}

export function QuoteCubes({ latestPointRef, onCubeClick, onCubeHover, cubeAuctions }: QuoteCubesProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const lp = latestPointRef.current;
    groupRef.current.position.set(lp.x, lp.y, lp.z);
  });

  return (
    <group ref={groupRef}>
      {OCTANTS.map((c) => (
        <QuoteOctant
          key={c.key}
          position={new THREE.Vector3(c.sx, c.sy, c.sz)}
          cubeKey={c.key}
          state={cubeAuctions[c.key]}
          onClick={onCubeClick}
          onHover={onCubeHover}
          leg1Over={c.leg1Over}
          leg2Over={c.leg2Over}
          leg3Over={c.leg3Over}
        />
      ))}
    </group>
  );
}
