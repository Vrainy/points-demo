import * as THREE from "three";

export type TileMeta = {
  id: number;
  start: number;
  count: number;
  aabb: THREE.Box3;
  center: THREE.Vector3;
  radius: number;
  geom: THREE.BufferGeometry;
  currentStride: number;
  aabbLineGeom?: THREE.BufferGeometry;
  isVisible?: boolean;
};

export type StatsData = {
  visibleTiles: number;
  renderedPoints: number;
  drawCalls: number;
  avgStride: number;
  totalTiles: number;
};
