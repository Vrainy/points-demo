import * as THREE from "three";
import type { TileMeta, StatsData } from "./tileTypes";

export function projectAabbPixels(aabb: THREE.Box3, camera: THREE.Camera, viewport: { width: number; height: number }) {
  const points = [
    new THREE.Vector3(aabb.min.x, aabb.min.y, aabb.min.z),
    new THREE.Vector3(aabb.min.x, aabb.min.y, aabb.max.z),
    new THREE.Vector3(aabb.min.x, aabb.max.y, aabb.min.z),
    new THREE.Vector3(aabb.min.x, aabb.max.y, aabb.max.z),
    new THREE.Vector3(aabb.max.x, aabb.min.y, aabb.min.z),
    new THREE.Vector3(aabb.max.x, aabb.min.y, aabb.max.z),
    new THREE.Vector3(aabb.max.x, aabb.max.y, aabb.min.z),
    new THREE.Vector3(aabb.max.x, aabb.max.y, aabb.max.z),
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const v = new THREE.Vector3();
  for (const p of points) {
    v.copy(p).project(camera as THREE.PerspectiveCamera);
    const sx = (v.x * 0.5 + 0.5) * viewport.width;
    const sy = (1 - (v.y * 0.5 + 0.5)) * viewport.height;
    minX = Math.min(minX, sx);
    minY = Math.min(minY, sy);
    maxX = Math.max(maxX, sx);
    maxY = Math.max(maxY, sy);
  }
  const w = Math.max(0, maxX - minX);
  const h = Math.max(0, maxY - minY);
  return { w, h, area: w * h };
}

export function updateVisibleAndLOD({
  tiles,
  camera,
  viewport,
  targetDensity,
  maxStride,
}: {
  tiles: TileMeta[];
  camera: THREE.Camera;
  viewport: { width: number; height: number };
  targetDensity: number;
  maxStride: number;
}): StatsData {
  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4().multiplyMatrices(
    (camera as THREE.PerspectiveCamera).projectionMatrix,
    (camera as THREE.PerspectiveCamera).matrixWorldInverse
  );
  frustum.setFromProjectionMatrix(pv);

  let visible = 0;
  let drawnPoints = 0;
  let sumStride = 0;

  for (const t of tiles) {
    const intersects = frustum.intersectsBox(t.aabb);
    t.isVisible = intersects;
    if (!intersects) continue;
    visible++;

    const proj = projectAabbPixels(t.aabb, camera, viewport);
    const target = Math.max(100, proj.area * targetDensity);
    const stride = Math.min(maxStride, Math.max(1, Math.ceil(t.count / target)));

    if (stride !== t.currentStride) {
      const sampleCount = Math.floor((t.count - 1) / stride) + 1;
      const use32 = t.start + t.count > 65535;
      const idx = use32 ? new Uint32Array(sampleCount) : new Uint16Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        idx[i] = (t.start + i * stride) as number;
      }
      t.geom.setIndex(new THREE.BufferAttribute(idx, 1));
      t.currentStride = stride;
    }
    const currentIndex = t.geom.getIndex();
    drawnPoints += currentIndex ? currentIndex.count : t.count;
    sumStride += t.currentStride || 1;
  }

  return {
    visibleTiles: visible,
    renderedPoints: drawnPoints,
    drawCalls: visible,
    avgStride: visible > 0 ? sumStride / visible : 0,
    totalTiles: tiles.length,
  };
}
