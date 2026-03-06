import * as THREE from "three";
import type { TileMeta } from "./tileTypes";
import { useMemo } from "react";
import { createShaderOptions } from "./shader";

function createAabbLineGeometry(min: THREE.Vector3, max: THREE.Vector3) {
  const pts = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, max.z),
    new THREE.Vector3(min.x, max.y, max.z),
  ];
  const indices = [
    0, 1, 1, 2, 2, 3, 3, 0, // bottom
    4, 5, 5, 6, 6, 7, 7, 4, // top
    0, 4, 1, 5, 2, 6, 3, 7, // verticals
  ];
  const positions = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const p = pts[indices[i]];
    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.boundingBox = new THREE.Box3(min.clone(), max.clone());
  geom.computeBoundingSphere();
  return geom;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function usePointTiles({
  count,
  grid,
  extent,
}: {
  count: number;
  grid: number;
  extent: number;
}) {
  const gridCount = grid * grid;
  const perTile = Math.floor(count / gridCount);
  const remainder = count - perTile * gridCount;

  return useMemo(() => {
    const sharedBuffer = new SharedArrayBuffer(count * 3 * Float32Array.BYTES_PER_ELEMENT);
    const positions = new Float32Array(sharedBuffer);
    const colors = new Float32Array(count * 3);

    const half = extent / 2;
    const tileSize = extent / grid;
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);

    const tiles: TileMeta[] = [];
    let cursor = 0;
    let id = 0;
    const rand = mulberry32(12345);

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const tileIndex = gy * grid + gx;
        const tilePoints = perTile + (tileIndex < remainder ? 1 : 0);
        const start = cursor;
        const countInTile = tilePoints;

        const minX = -half + gx * tileSize;
        const minY = -half + gy * tileSize;
        const maxX = minX + tileSize;
        const maxY = minY + tileSize;
        const min = new THREE.Vector3(minX, minY, -half);
        const max = new THREE.Vector3(maxX, maxY, half);
        const aabb = new THREE.Box3(min, max);
        const center = aabb.getCenter(new THREE.Vector3());
        const radius = aabb.getSize(new THREE.Vector3()).length() * 0.5;

        for (let i = 0; i < countInTile; i++) {
          const idx = (start + i) * 3;
          positions[idx] = minX + rand() * tileSize;
          positions[idx + 1] = minY + rand() * tileSize;
          positions[idx + 2] = -half + rand() * extent;
          colors[idx] = rand() * 0.5 + 0.5;
          colors[idx + 1] = rand() * 0.5 + 0.5;
          colors[idx + 2] = rand() * 0.5 + 0.5;
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", posAttr);
        geom.setAttribute("color", colAttr);
        geom.boundingBox = aabb.clone();
        geom.boundingSphere = new THREE.Sphere(center.clone(), radius);
        const aabbLineGeom = createAabbLineGeometry(min, max);

        tiles.push({
          id: id++,
          start,
          count: countInTile,
          aabb,
          center,
          radius,
          geom,
          currentStride: 0,
          aabbLineGeom,
          isVisible: false,
        });

        cursor += countInTile;
      }
    }

    const materialOptions = createShaderOptions();
    const material = new THREE.ShaderMaterial(materialOptions);

    return { tiles, sharedBuffer, materialOptions, material };
  }, [count, grid, extent, perTile, remainder]);
}
