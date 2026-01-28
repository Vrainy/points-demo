/* eslint-disable react-hooks/immutability */
/* eslint-disable react-hooks/purity */
import { useSelection } from "@/controls/Selector";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import * as Rx from "rxjs";
import useSelectionWorker from "./worker/useSelectionWorker";


const createShaderOptions = () => ({
    uniforms: {
        uSelectionMin: { value: new THREE.Vector2(0, 0) },
        uSelectionMax: { value: new THREE.Vector2(0, 0) },
        uIsSelecting: { value: false },

        uIsLocked: { value: false },
        uLockedPvMatrix: { value: new THREE.Matrix4() },
    },
    vertexShader: /* glsl */`
    attribute vec3 color;
    varying vec3 vColor;
    uniform vec2 uSelectionMin;
    uniform vec2 uSelectionMax;
    uniform bool uIsSelecting;

    uniform mat4 uLockedPvMatrix;
    uniform bool uIsLocked;

    bool isInSelection(vec4 clipPos) {
        vec2 screenPos = (clipPos.xy / clipPos.w) * 0.5 + 0.5;
        
        return all(greaterThan(screenPos, uSelectionMin)) && all(lessThan(screenPos, uSelectionMax));
    }

    void main() {
        vColor = color;
    
        vec4 pos4 = vec4(position, 1.0);
        vec4 mvPosition = modelViewMatrix * pos4;
        gl_Position = projectionMatrix * mvPosition;

        if (uIsSelecting || uIsLocked) {
            vec4 checkPos;
            
            if (uIsSelecting) {
                checkPos = gl_Position;
            } else {
                // 锁定模式下使用备份矩阵
                checkPos = uLockedPvMatrix * modelMatrix * pos4;
            }

            if (isInSelection(checkPos)) {
                vColor = vec3(1.0, 0.0, 0.0);
            }
        }
        
        gl_PointSize = 30.0 / -mvPosition.z; 
    }
    `,
    fragmentShader: /* glsl */`
    varying vec3 vColor;
    void main() {
        float dist = distance(gl_PointCoord, vec2(0.5));
        if (dist > 0.5) discard;

        gl_FragColor = vec4(vColor, 1.0);
    }
    `
});

export default function MillionPoints({ count = 10_000_000 }) {
    const { geometry, sharedBuffer } = useMemo(() => {
        const sharedBuffer = new SharedArrayBuffer(count * 3 * Float32Array.BYTES_PER_ELEMENT);

        const positions = new Float32Array(sharedBuffer);
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count * 3; i++) {
            positions[i] = (Math.random() - 0.5) * 100;
            colors[i] = Math.random() * 0.5 + 0.5;
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        return {
            geometry: geom,
            sharedBuffer,
        };
    }, [count]);

    const materialOptions = useMemo(() => createShaderOptions(), []);

    const { camera } = useThree();
    const { isSelecting, selectionBox, emitter } = useSelection();

    const { runParallelSelection } = useSelectionWorker({ count });

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
    });


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
    });

    return (
        <>
            <points geometry={geometry}>
                <shaderMaterial args={[materialOptions]} />
            </points>
        </>
    );
}
