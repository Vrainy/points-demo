import * as THREE from "three";
import type { TileMeta } from "./tileTypes";
import { useMemo, useState, useEffect, useRef } from "react";
import { createShaderOptions } from "./shader";
import * as Comlink from "comlink";
import type { DecoderWorkerApi } from "./worker/decoder.worker";

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
  count: _count,
  extent: _extent,
  maxPointsPerNode: _maxPointsPerNode,
  maxDepth: _maxDepth,
}: {
  count: number;
  extent: number;
  maxPointsPerNode: number;
  maxDepth: number;
}) {
  const [tiles, setTiles] = useState<TileMeta[]>([]);
  const [sharedBuffer, setSharedBuffer] = useState<SharedArrayBuffer | null>(null);
  const materialOptions = useMemo(() => createShaderOptions(), []);
  const material = useMemo(() => new THREE.ShaderMaterial(materialOptions), [materialOptions]);
  const workerRef = useRef<Comlink.Remote<DecoderWorkerApi> | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('./worker/decoder.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = Comlink.wrap<DecoderWorkerApi>(worker);
    return () => worker.terminate();
  }, []);

  // Load Metadata
  useEffect(() => {
    // Prevent re-fetching if already loaded
    if (tiles.length > 0) return;

    fetch('/data/mock/metadata.json')
      .then(res => res.json())
      .then(meta => {
        // Init Global Buffers
        const totalPoints = meta.totalPoints;
        const sab = new SharedArrayBuffer(totalPoints * 3 * Float32Array.BYTES_PER_ELEMENT);
        const globalColorBuffer = new Float32Array(totalPoints * 3);

        // Init ThreeJS Attributes
        const posAttr = new THREE.BufferAttribute(new Float32Array(sab), 3);
        const colAttr = new THREE.BufferAttribute(globalColorBuffer, 3);

        setSharedBuffer(sab);

        // Build TileMeta from JSON
        let currentGlobalIndex = 0;
        const newTiles: TileMeta[] = meta.tiles.map((t: any) => {
          const min = new THREE.Vector3(t.aabb.min[0], t.aabb.min[1], t.aabb.min[2]);
          const max = new THREE.Vector3(t.aabb.max[0], t.aabb.max[1], t.aabb.max[2]);
          const aabb = new THREE.Box3(min, max);
          const center = aabb.getCenter(new THREE.Vector3());
          const radius = aabb.getSize(new THREE.Vector3()).length() * 0.5;

          // Initially empty geometry, will be filled by loader
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', posAttr);
          geom.setAttribute('color', colAttr);

          geom.boundingBox = aabb.clone();
          geom.boundingSphere = new THREE.Sphere(center.clone(), radius);

          const tileStartIndex = currentGlobalIndex;
          currentGlobalIndex += t.count;

          // Attach hidden props for loader
          const tile: any = {
            id: t.id,
            count: t.count,
            byteOffset: t.byteOffset,
            byteLength: t.byteLength,
            aabb,
            center,
            radius,
            geom,
            currentStride: 0, // 0 means not loaded
            pointIndices: new Uint32Array(0), // empty until loaded
            baseIndexAttr: new THREE.BufferAttribute(new Uint32Array(0), 1),
            aabbLineGeom: createAabbLineGeometry(min, max),
            isVisible: t.isRoot, // Root is initially visible
            isLoaded: false,
            isRoot: t.isRoot,
            // Hidden loader props
            _globalStartIndex: tileStartIndex,
            _globalColorArr: globalColorBuffer
          };
          return tile as TileMeta;
        });
        setTiles(newTiles);
      });
  }, []);

  // Streaming Loader Logic
  useEffect(() => {
    if (!sharedBuffer || tiles.length === 0) return;

    // Use a timer to check for visible tiles and load them
    const interval = setInterval(() => {
      // 1. Identify tiles to load
      // Priority 1: Root tile (if not loaded) - Load IMMEDIATELY
      // Priority 2: Visible leaf tiles
      
      const rootTile = tiles.find(t => t.isRoot && !t.isLoaded);
      let toLoad: TileMeta[] = [];
      
      if (rootTile && !(rootTile as any)._isLoading) {
          toLoad = [rootTile];
      } else {
          // Normal LOD logic for leaves
          // Only load leaves if root is done? Or parallel?
          // Let's allow parallel, but Root has priority.
          const visibleTiles = tiles.filter(t => !t.isRoot && t.isVisible && !t.isLoaded);
          const MAX_CONCURRENT_LOADS = 4;
          toLoad = visibleTiles.slice(0, MAX_CONCURRENT_LOADS);
      }

      toLoad.forEach(tile => {
        // Mark as loading (to avoid duplicate requests) - simplistic check
        if ((tile as any)._isLoading) return;
        (tile as any)._isLoading = true;

        // Fetch range
        const start = tile.byteOffset;
        const end = start + tile.byteLength - 1;
        
        fetch('/data/mock/points.bin', {
          headers: { 'Range': `bytes=${start}-${end}` }
        })
        .then(res => res.arrayBuffer())
        .then(async buffer => {
           const count = tile.count;
           const globalStartIndex = (tile as any)._globalStartIndex;
           
           // Use Worker to decode and write to SAB
           // We need to transfer 'buffer' to avoid copy? 
           // Fetch response buffer is transferable.
           if (workerRef.current && sharedBuffer) {
               const { colBuffer } = await workerRef.current.decodeAndWrite(
                   Comlink.transfer(buffer, [buffer]),
                   sharedBuffer,
                   globalStartIndex,
                   count
               );
               
               // Worker returns detached Color Buffer
               const colData = new Float32Array(colBuffer);
               
               // Write Colors to Global Buffer (Main thread still handles this part for now)
               const globalColorArr = (tile as any)._globalColorArr;
               globalColorArr.set(colData, globalStartIndex * 3);
               
               // Mark as loaded
               tile.isLoaded = true;
               tile.pointIndices = new Uint32Array(count);
               for(let i=0; i<count; i++) tile.pointIndices[i] = globalStartIndex + i;
               
               // Init baseIndexAttr for stride=1 optimization
               tile.baseIndexAttr = new THREE.BufferAttribute(tile.pointIndices, 1);
    
               // Mark geometry attributes as needing update
               (tile.geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
               (tile.geom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
               
               // Trigger re-render logic (LOD update will pick up `isLoaded`)
               delete (tile as any)._isLoading;
               
               // Force update
               setTiles(prev => [...prev]);
           }
        });
      });
    }, 500); // Check every 500ms
    
    return () => clearInterval(interval);
  }, [sharedBuffer, tiles]);

  console.log('useTiles', tiles);

  return { tiles, sharedBuffer, materialOptions, material };
}
