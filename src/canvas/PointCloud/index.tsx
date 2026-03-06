/* eslint-disable react-hooks/immutability */
import { useSelection } from "@/controls/Selector";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import * as Rx from "rxjs";
import useSelectionWorker from "./worker/useSelectionWorker";
import { usePointTiles } from "./useTiles";
import { usePointCloudGui } from "./gui";
import { updateVisibleAndLOD } from "./lod";

export default function MillionPoints({
    count = 10_000_000,
    grid = 8,
    extent = 100,
    targetDensity = 0.7,
    maxStride = 64,
}: {
    count?: number;
    grid?: number;
    extent?: number;
    targetDensity?: number;
    maxStride?: number;
}) {
    const { tiles, sharedBuffer, materialOptions, material } = usePointTiles({ count, grid, extent });

    const { camera, size } = useThree();
    const { isSelecting, selectionBox, emitter } = useSelection();

    const { runParallelSelection } = useSelectionWorker({ count });

    const { uiRef, statsRef } = usePointCloudGui({ targetDensity, maxStride }, tiles.length);

    useEffect(() => {
        if (!emitter) return;

        const subs: Rx.Subscription[] = [];

        subs.push(
            Rx.fromEvent(emitter, 'selectEnd').subscribe(() => {
                materialOptions.uniforms.uIsLocked.value = true;

                const projMat = camera.projectionMatrix.clone();
                const viewMat = camera.matrixWorldInverse.clone();
                const pvMatrix = new THREE.Matrix4().multiplyMatrices(projMat, viewMat);
                materialOptions.uniforms.uLockedPvMatrix.value.copy(pvMatrix);

                runParallelSelection({
                    sharedBuffer,
                    pvMatrix: pvMatrix.elements,
                    selectionMin: materialOptions.uniforms.uSelectionMin.value,
                    selectionMax: materialOptions.uniforms.uSelectionMax.value,
                });
            }),
            Rx.fromEvent(emitter, 'clearSelection').subscribe(() => {
                materialOptions.uniforms.uIsLocked.value = false;
            }),
        );

        return () => {
            subs.forEach(sub => sub.unsubscribe());
        };
    }, [emitter, camera, materialOptions, runParallelSelection, sharedBuffer]);


    useFrame(() => {
        materialOptions.uniforms.uIsSelecting.value = isSelecting;

        if (isSelecting && selectionBox) {
            const { start, end } = selectionBox;

            materialOptions.uniforms.uSelectionMin.value.set(
                Math.min(start.nx, end.nx),
                Math.min(start.ny, end.ny)
            );
            materialOptions.uniforms.uSelectionMax.value.set(
                Math.max(start.nx, end.nx),
                Math.max(start.ny, end.ny)
            );
        }

        const s = updateVisibleAndLOD({
            tiles,
            camera,
            viewport: { width: size.width, height: size.height },
            targetDensity: uiRef.current.targetDensity,
            maxStride: uiRef.current.maxStride,
        });
        statsRef.current.visibleTiles = s.visibleTiles;
        statsRef.current.renderedPoints = s.renderedPoints;
        statsRef.current.drawCalls = s.drawCalls;
        statsRef.current.avgStride = s.avgStride;
        statsRef.current.totalTiles = s.totalTiles;

        if (lineRefs.current.size) {
            for (const t of tiles) {
                const ref = lineRefs.current.get(t.id);
                if (ref) {
                    ref.visible = !!(uiRef.current.showAABB && t.isVisible);
                }
            }
        }
    });

    const wireMat = useMemo(() => new THREE.LineBasicMaterial({ color: 0xffff00 }), []);
    const lineRefs = useRef<Map<number, THREE.LineSegments>>(new Map());

    return (
        <>
            {tiles.map((t) => (
                <points key={t.id} geometry={t.geom} material={material} />
            ))}
            {tiles.map((t) =>
                t.aabbLineGeom ? (
                    <lineSegments
                        key={`aabb-${t.id}`}
                        geometry={t.aabbLineGeom}
                        material={wireMat}
                        ref={(el) => {
                            if (el) lineRefs.current.set(t.id, el);
                        }}
                        visible={false}
                    />
                ) : null
            )}
        </>
    );
}
