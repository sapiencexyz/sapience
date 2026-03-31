import { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { PricePoint } from '../hooks/usePythPrices';
import { QuoteCubes, type CubeKey, type CubeAuctionState } from './QuoteCubes';
import { ROUND_SECONDS } from '../lib/envConfig';

const CUBE_SIZE = 4;
const HALF = CUBE_SIZE / 2;

/** Map a value from [min,max] into [-HALF, +HALF] */
function normalize(val: number, min: number, max: number): number {
  if (max === min) return 0;
  return ((val - min) / (max - min)) * CUBE_SIZE - HALF;
}

function formatPrice(p: number): string {
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(2);
  return p.toPrecision(4);
}

const ARROW_LENGTH = HALF + 0.5;
const CONE_HEIGHT = 0.2;
const CONE_RADIUS = 0.06;

function AxisArrow({ dir, color, label }: { dir: [number, number, number]; color: string; label: string }) {
  const tip: [number, number, number] = [dir[0] * ARROW_LENGTH, dir[1] * ARROW_LENGTH, dir[2] * ARROW_LENGTH];
  const coneTip: [number, number, number] = [dir[0] * (ARROW_LENGTH + CONE_HEIGHT), dir[1] * (ARROW_LENGTH + CONE_HEIGHT), dir[2] * (ARROW_LENGTH + CONE_HEIGHT)];
  const labelPos: [number, number, number] = [dir[0] * (ARROW_LENGTH + 0.5), dir[1] * (ARROW_LENGTH + 0.5), dir[2] * (ARROW_LENGTH + 0.5)];

  // Rotation to point cone along the axis direction
  const rotation = useMemo(() => {
    if (dir[0] !== 0) return [0, 0, -Math.PI / 2 * dir[0]] as [number, number, number]; // X axis
    if (dir[1] !== 0) return [0, 0, dir[1] > 0 ? 0 : Math.PI] as [number, number, number]; // Y axis
    return [Math.PI / 2 * dir[2], 0, 0] as [number, number, number]; // Z axis
  }, [dir]);

  return (
    <group>
      <Line
        points={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(...tip)]}
        color={color}
        lineWidth={2}
      />
      <mesh position={coneTip} rotation={rotation}>
        <coneGeometry args={[CONE_RADIUS, CONE_HEIGHT, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Text position={labelPos} fontSize={0.22} color={color} anchorX="center" anchorY="middle">
        {label.toUpperCase()}
      </Text>
    </group>
  );
}

function AxisArrows({ leg1Label, leg2Label, leg3Label }: { leg1Label: string; leg2Label: string; leg3Label: string }) {
  return (
    <group>
      <AxisArrow dir={[1, 0, 0]} color="#bb86fc" label={leg1Label || 'X'} />
      <AxisArrow dir={[0, 0, 1]} color="#6ec6ff" label={leg2Label || 'Z'} />
      <AxisArrow dir={[0, 1, 0]} color="#4caf50" label={leg3Label || 'Y'} />
    </group>
  );
}

interface Bounds {
  minLeg1: number; maxLeg1: number;
  minLeg2: number; maxLeg2: number;
  minLeg3: number; maxLeg3: number;
}

const SPLINE_SAMPLES_PER_SEGMENT = 8;
const MAX_SPLINE_POINTS = 1600;
const DOT_TRAVEL_TIME = ROUND_SECONDS; // seconds to travel one segment along the spline
const BOUNDS_LERP_SPEED = 8; // fast but smooth bounds transition (~0.4s to 95%)

function smoothCurve(pts: THREE.Vector3[], samplesPerSeg: number): THREE.Vector3[] {
  if (pts.length < 3) return pts;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  return curve.getPoints((pts.length - 1) * samplesPerSeg);
}

function createLineObject(color: string): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPLINE_POINTS * 3), 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return line;
}

function updateLineGeometry(line: THREE.Line, pts: THREE.Vector3[], yOverride?: number) {
  const arr = line.geometry.attributes.position.array as Float32Array;
  const count = Math.min(pts.length, MAX_SPLINE_POINTS);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    arr[i3] = pts[i].x;
    arr[i3 + 1] = yOverride !== undefined ? yOverride : pts[i].y;
    arr[i3 + 2] = pts[i].z;
  }
  line.geometry.attributes.position.needsUpdate = true;
  line.geometry.setDrawRange(0, count);
}

function lerpScalar(current: number, target: number, t: number): number {
  return current + (target - current) * t;
}

/**
 * Fully imperative price path that animates the normalization bounds each frame
 * so the line, shadow, and dot all transition smoothly when new data arrives.
 */
function AnimatedPricePath({
  points,
  targetBounds,
  animatedLatest,
  lineEnd,
}: {
  points: PricePoint[];
  targetBounds: Bounds;
  animatedLatest: React.MutableRefObject<THREE.Vector3>;
  lineEnd: React.MutableRefObject<THREE.Vector3>;
}) {
  const boundsRef = useRef<Bounds>({ ...targetBounds });
  const targetRef = useRef(targetBounds);
  targetRef.current = targetBounds;

  const pointsRef = useRef(points);
  pointsRef.current = points;

  // Dot travels along the spline; t goes from 0..1 over DOT_TRAVEL_TIME per new point
  const dotT = useRef(1); // start at end
  const prevPointCount = useRef(0);
  const curveRef = useRef<THREE.CatmullRomCurve3 | null>(null);

  // Snap bounds on first data (avoid lerping from 0)
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current && points.length >= 2) {
      boundsRef.current = { ...targetBounds };
      initialized.current = true;
    }
  }, [points.length, targetBounds]);

  const { mainLine, shadowLine, dot } = useMemo(() => {
    const dotGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const dotMat = new THREE.MeshStandardMaterial({
      color: '#ff6ec7',
      emissive: new THREE.Color('#ff6ec7'),
      emissiveIntensity: 0.5,
    });
    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    dotMesh.visible = false;
    return {
      mainLine: createLineObject('#bb86fc'),
      shadowLine: createLineObject('#333333'),
      dot: dotMesh,
    };
  }, []);

  useFrame((_, delta) => {
    const pts = pointsRef.current;
    if (pts.length < 2) {
      mainLine.geometry.setDrawRange(0, 0);
      shadowLine.geometry.setDrawRange(0, 0);
      dot.visible = false;
      return;
    }

    // Fast-lerp bounds so line and scaling animate quickly
    const t = 1 - Math.exp(-BOUNDS_LERP_SPEED * delta);
    const b = boundsRef.current;
    const tb = targetRef.current;
    b.minLeg1 = lerpScalar(b.minLeg1, tb.minLeg1, t);
    b.maxLeg1 = lerpScalar(b.maxLeg1, tb.maxLeg1, t);
    b.minLeg2 = lerpScalar(b.minLeg2, tb.minLeg2, t);
    b.maxLeg2 = lerpScalar(b.maxLeg2, tb.maxLeg2, t);
    b.minLeg3 = lerpScalar(b.minLeg3, tb.minLeg3, t);
    b.maxLeg3 = lerpScalar(b.maxLeg3, tb.maxLeg3, t);

    const rawPts = pts.map((p) => new THREE.Vector3(
      normalize(p.leg1, b.minLeg1, b.maxLeg1),
      normalize(p.leg3, b.minLeg3, b.maxLeg3),
      normalize(p.leg2, b.minLeg2, b.maxLeg2),
    ));

    const smooth = smoothCurve(rawPts, SPLINE_SAMPLES_PER_SEGMENT);
    updateLineGeometry(mainLine, smooth);
    updateLineGeometry(shadowLine, smooth, -HALF);

    // Line end snaps instantly
    const last = rawPts[rawPts.length - 1];
    lineEnd.current.copy(last);

    // Build spline for dot to follow
    if (rawPts.length >= 3) {
      curveRef.current = new THREE.CatmullRomCurve3(rawPts, false, 'centripetal', 0.5);
    } else {
      curveRef.current = null;
    }

    // When new points arrive, reset dot progress to travel the last segment
    if (pts.length > prevPointCount.current && prevPointCount.current > 0) {
      // Place dot at the previous end position (one segment back from end)
      dotT.current = Math.max(0, (rawPts.length - 2) / (rawPts.length - 1));
    }
    prevPointCount.current = pts.length;

    // Advance dot along spline
    dot.visible = true;
    if (curveRef.current) {
      const segmentDuration = DOT_TRAVEL_TIME;
      const segmentT = 1 / (rawPts.length - 1); // fraction of curve per segment
      const advance = (delta / segmentDuration) * segmentT;
      dotT.current = Math.min(dotT.current + advance, 1);
      curveRef.current.getPoint(dotT.current, dot.position);
    } else {
      dot.position.copy(last);
    }

    animatedLatest.current.copy(dot.position);
  });

  return (
    <group>
      <primitive object={mainLine} />
      <primitive object={shadowLine} />
      <primitive object={dot} />
    </group>
  );
}

interface SceneProps {
  points: PricePoint[];
  leg1Label: string;
  leg2Label: string;
  leg3Label: string;
  onCubeClick: (key: CubeKey, leg1Over: boolean, leg2Over: boolean, leg3Over: boolean) => void;
  onCubeHover: (key: CubeKey | null) => void;
  cubeAuctions: Record<string, CubeAuctionState>;
}

export function Scene({ points, leg1Label, leg2Label, leg3Label, onCubeClick, onCubeHover, cubeAuctions }: SceneProps) {
  const targetBounds = useMemo<Bounds>(() => {
    if (points.length === 0) {
      return { minLeg1: 0, maxLeg1: 1, minLeg2: 0, maxLeg2: 1, minLeg3: 0, maxLeg3: 1 };
    }

    let min1 = Infinity, max1 = -Infinity;
    let min2 = Infinity, max2 = -Infinity;
    let min3 = Infinity, max3 = -Infinity;

    for (const p of points) {
      if (p.leg1 < min1) min1 = p.leg1;
      if (p.leg1 > max1) max1 = p.leg1;
      if (p.leg2 < min2) min2 = p.leg2;
      if (p.leg2 > max2) max2 = p.leg2;
      if (p.leg3 < min3) min3 = p.leg3;
      if (p.leg3 > max3) max3 = p.leg3;
    }

    const pad1 = (max1 - min1) * 0.1 || max1 * 0.01 || 1;
    const pad2 = (max2 - min2) * 0.1 || max2 * 0.01 || 1;
    const pad3 = (max3 - min3) * 0.1 || max3 * 0.01 || 1;
    min1 -= pad1; max1 += pad1;
    min2 -= pad2; max2 += pad2;
    min3 -= pad3; max3 += pad3;

    return { minLeg1: min1, maxLeg1: max1, minLeg2: min2, maxLeg2: max2, minLeg3: min3, maxLeg3: max3 };
  }, [points]);

  const animatedLatest = useRef(new THREE.Vector3());
  const lineEnd = useRef(new THREE.Vector3());

  return (
    <Canvas camera={{ position: [4, 3, 4], fov: 50 }}>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <AxisArrows leg1Label={leg1Label} leg2Label={leg2Label} leg3Label={leg3Label} />
      <AnimatedPricePath
        points={points}
        targetBounds={targetBounds}
        animatedLatest={animatedLatest}
        lineEnd={lineEnd}
      />
      <QuoteCubes
        latestPointRef={lineEnd}
        onCubeClick={onCubeClick}
        onCubeHover={onCubeHover}
        cubeAuctions={cubeAuctions}
      />
      <OrbitControls enableZoom={true} />
    </Canvas>
  );
}
