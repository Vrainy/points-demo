import * as THREE from "three";

export type TileMeta = {
  id: number;
  count: number;
  byteOffset: number; // Added for streaming
  byteLength: number; // Added for streaming
  aabb: THREE.Box3;
  center: THREE.Vector3;
  radius: number;
  geom: THREE.BufferGeometry;
  currentStride: number;
  pointIndices: Uint32Array;
  baseIndexAttr: THREE.BufferAttribute;
  aabbLineGeom?: THREE.BufferGeometry;
  isVisible?: boolean;
  isLoaded: boolean; // Added for streaming
  lruTimestamp?: number; // Added for LRU
  isRoot: boolean; // Added for Hierarchical LOD
};

export type StatsData = {
  visibleTiles: number;
  renderedPoints: number;
  drawCalls: number;
  avgStride: number;
  totalTiles: number;
};
