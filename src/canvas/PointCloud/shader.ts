import * as THREE from "three";

export const createShaderOptions = () => ({
  uniforms: {
    uSelectionMin: { value: new THREE.Vector2(0, 0) },
    uSelectionMax: { value: new THREE.Vector2(0, 0) },
    uIsSelecting: { value: false },
    uIsLocked: { value: false },
    uLockedPvMatrix: { value: new THREE.Matrix4() },
  },
  vertexShader: `
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
        vec4 checkPos = uIsSelecting ? gl_Position : (uLockedPvMatrix * modelMatrix * pos4);
        if (isInSelection(checkPos)) {
          vColor = vec3(1.0, 0.0, 0.0);
        }
      }
      gl_PointSize = 30.0 / -mvPosition.z;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    void main() {
      float dist = distance(gl_PointCoord, vec2(0.5));
      if (dist > 0.5) discard;
      gl_FragColor = vec4(vColor, 1.0);
    }
  `,
});

