import * as THREE from "three";
import type { TileMeta, StatsData } from "./tileTypes";

export function projectSphereArea(
  center: THREE.Vector3,
  radius: number,
  camera: THREE.Camera,
  viewport: { width: number; height: number }
) {
  // 1. 计算相机到球心的距离（并限制最小值以防除零）
  const dist = Math.max(0.1, camera.position.distanceTo(center));

  // 2. 如果是透视相机，计算投影后的半径
  let projectedRadius = radius;
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const slope = Math.tan(fov * 0.5);
    // 投影缩放因子：屏幕高度的一半 / tan(fov/2)
    const projFactor = (viewport.height * 0.5) / slope;
    projectedRadius = (radius / dist) * projFactor;
  } else if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    // 正交相机：根据 zoom 和 height 缩放
    const ortho = camera as THREE.OrthographicCamera;
    const h = (ortho.top - ortho.bottom) / ortho.zoom;
    projectedRadius = (radius / h) * viewport.height;
  }

  // 3. 计算屏幕空间面积（圆形近似）
  const area = Math.PI * projectedRadius * projectedRadius;

  // 4. 限制最大面积为屏幕总像素数的 4 倍（允许一定的过采样，但不允许无限大）
  const maxArea = viewport.width * viewport.height * 4;
  return Math.min(area, maxArea);
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
    // 1. Root handling
    // If root tile is loaded, always render it (as base layer)
    // But we might want to hide it if leaves are loaded?
    // For P2 simple hierarchy: Render Root AND Leaves.
    // Overdraw is acceptable for better visual continuity.
    // If we want to avoid overdraw, we need to check if children cover the root.
    // Given LOD 0 is only 1% density, rendering it always is cheap.
    
    // 2. Frustum Culling
    const intersects = frustum.intersectsBox(t.aabb);
    t.isVisible = intersects;
    if (!intersects) continue;
    
    // Skip if not loaded
    if (!t.isLoaded) continue;
    
    visible++;

    // 3. Stride Calculation
    const area = projectSphereArea(t.center, t.radius, camera, viewport);
    const target = Math.max(100, area * targetDensity);
    
    // If Root: Use fixed stride (e.g. 1) to show all its points (it's already subsampled)
    // If Leaf: Use adaptive stride
    let stride = 1;
    if (!t.isRoot) {
        stride = Math.min(maxStride, Math.max(1, Math.ceil(t.count / target)));
    }

    if (stride !== t.currentStride) {
      if (stride === 1) {
        t.geom.setIndex(t.baseIndexAttr);
      } else {
        const sampleCount = Math.floor((t.count - 1) / stride) + 1;
        const idx = new Uint32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
          idx[i] = t.pointIndices[i * stride] as number;
        }
        t.geom.setIndex(new THREE.BufferAttribute(idx, 1));
      }
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
