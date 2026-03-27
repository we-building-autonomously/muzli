"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Text } from "@react-three/drei";
import * as THREE from "three";
import {
  pca,
  randomProjection,
  kMeansClustering,
  findNearestNeighbors,
} from "@/lib/dimensionality-reduction";
import type { VectorData } from "@/types";

const CLUSTER_COLORS = [
  "#22c55e", // green
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#6366f1", // indigo
];

interface VectorVisualizationProps {
  vectors: VectorData[];
  clusterCount?: number;
}

interface PointProps {
  position: [number, number, number];
  color: string;
  size: number;
  id: string;
  metadata?: Record<string, unknown>;
  highlighted: boolean;
  isNeighbor: boolean;
  onClick: () => void;
  onHover: (hovered: boolean) => void;
}

function Point({
  position,
  color,
  size,
  id,
  metadata,
  highlighted,
  isNeighbor,
  onClick,
  onHover,
}: PointProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const actualSize = highlighted
    ? size * 2
    : isNeighbor
    ? size * 1.5
    : hovered
    ? size * 1.3
    : size;

  const actualColor = highlighted
    ? "#ffffff"
    : isNeighbor
    ? "#fbbf24"
    : color;

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        onHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        onHover(false);
        document.body.style.cursor = "auto";
      }}
    >
      <sphereGeometry args={[actualSize, 16, 16]} />
      <meshStandardMaterial
        color={actualColor}
        emissive={actualColor}
        emissiveIntensity={hovered || highlighted ? 0.5 : 0.1}
        transparent
        opacity={isNeighbor ? 0.9 : highlighted ? 1 : 0.8}
      />
      {hovered && (
        <Html distanceFactor={10} style={{ pointerEvents: "none" }}>
          <div className="bg-background/95 border rounded-md px-3 py-2 text-xs shadow-lg max-w-[200px]">
            <div className="font-medium mb-1">{id}</div>
            {metadata &&
              Object.entries(metadata)
                .slice(0, 5)
                .map(([k, v]) => (
                  <div key={k} className="text-muted-foreground truncate">
                    {k}: {String(v)}
                  </div>
                ))}
          </div>
        </Html>
      )}
    </mesh>
  );
}

function NeighborLines({
  points,
  selectedIdx,
  neighborIndices,
}: {
  points: [number, number, number][];
  selectedIdx: number | null;
  neighborIndices: number[];
}) {
  if (selectedIdx === null || neighborIndices.length === 0) return null;
  const origin = points[selectedIdx];

  return (
    <>
      {neighborIndices.map((ni) => {
        const target = points[ni];
        const linePoints = [
          new THREE.Vector3(...origin),
          new THREE.Vector3(...target),
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        return (
          <line key={ni} geometry={geometry}>
            <lineBasicMaterial color="#fbbf24" opacity={0.4} transparent />
          </line>
        );
      })}
    </>
  );
}

export function VectorVisualization({
  vectors,
  clusterCount = 5,
}: VectorVisualizationProps) {
  const [method, setMethod] = useState<"pca" | "random">("pca");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const rawValues = useMemo(
    () => vectors.map((v) => v.values),
    [vectors]
  );

  const projected = useMemo(() => {
    if (rawValues.length === 0) return [];
    return method === "pca"
      ? pca(rawValues, 3)
      : randomProjection(rawValues, 3);
  }, [rawValues, method]);

  // Normalize to [-5, 5] range
  const normalizedPoints = useMemo((): [number, number, number][] => {
    if (projected.length === 0) return [];
    const maxAbs = Math.max(
      ...projected.flatMap((p) => p.map(Math.abs)),
      1e-10
    );
    const scale = 5 / maxAbs;
    return projected.map(
      (p) => [p[0] * scale, p[1] * scale, p[2] * scale] as [number, number, number]
    );
  }, [projected]);

  const clusters = useMemo(
    () => kMeansClustering(projected, clusterCount),
    [projected, clusterCount]
  );

  const neighborIndices = useMemo(() => {
    if (selectedIdx === null || rawValues.length === 0) return [];
    return findNearestNeighbors(rawValues, selectedIdx, 5);
  }, [rawValues, selectedIdx]);

  const neighborSet = useMemo(() => new Set(neighborIndices), [neighborIndices]);

  const clusterLabels = useMemo(() => {
    const labels = new Map<number, number>();
    clusters.forEach((c) => labels.set(c, (labels.get(c) || 0) + 1));
    return Array.from(labels.entries()).sort((a, b) => a[0] - b[0]);
  }, [clusters]);

  if (vectors.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">No vectors to visualize</p>
          <p className="text-xs mt-1">Run a query that returns vectors with values</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 h-10 border-b">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">3D Vector Visualization</span>
          <span className="text-xs text-muted-foreground">
            {vectors.length} vectors
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 p-0.5 bg-muted rounded text-xs">
            <button
              onClick={() => setMethod("pca")}
              className={`px-2 py-0.5 rounded transition-colors ${
                method === "pca"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              PCA
            </button>
            <button
              onClick={() => setMethod("random")}
              className={`px-2 py-0.5 rounded transition-colors ${
                method === "random"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Random
            </button>
          </div>
          {selectedIdx !== null && (
            <button
              onClick={() => setSelectedIdx(null)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 border rounded"
            >
              Clear selection
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <Canvas camera={{ position: [8, 6, 8], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <pointLight position={[-10, -10, -10]} intensity={0.3} />

          {normalizedPoints.map((pos, i) => (
            <Point
              key={vectors[i].id || i}
              position={pos}
              color={CLUSTER_COLORS[clusters[i] % CLUSTER_COLORS.length]}
              size={0.12}
              id={vectors[i].id}
              metadata={vectors[i].metadata}
              highlighted={selectedIdx === i}
              isNeighbor={neighborSet.has(i)}
              onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
              onHover={(h) => setHoveredIdx(h ? i : null)}
            />
          ))}

          <NeighborLines
            points={normalizedPoints}
            selectedIdx={selectedIdx}
            neighborIndices={neighborIndices}
          />

          <gridHelper args={[12, 12, "#333", "#222"]} />
          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
        </Canvas>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-background/90 border rounded-md p-2 text-xs">
          <div className="font-medium mb-1">Clusters</div>
          {clusterLabels.map(([cluster, count]) => (
            <div key={cluster} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor:
                    CLUSTER_COLORS[cluster % CLUSTER_COLORS.length],
                }}
              />
              <span className="text-muted-foreground">
                Cluster {cluster + 1} ({count})
              </span>
            </div>
          ))}
          {selectedIdx !== null && (
            <div className="mt-1.5 pt-1.5 border-t">
              <span className="text-yellow-400">● </span>
              <span className="text-muted-foreground">Nearest neighbors</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
