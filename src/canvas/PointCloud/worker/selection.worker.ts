import * as Comlink from "comlink";

const workerApi = {
  selectPartial(
    sharedBuffer: SharedArrayBuffer,
    pvMatrix: number[],
    min: { x: number; y: number },
    max: { x: number; y: number },
    startIdx: number,
    endIdx: number
  ) {
    const positions = new Float32Array(sharedBuffer);

    const m = pvMatrix;
    const tempIndices = new Uint32Array(endIdx - startIdx);
    let count = 0;

    for (let i = startIdx; i < endIdx; i++) {
      const pIdx = i * 3;
      const x = positions[pIdx];
      const y = positions[pIdx + 1];
      const z = positions[pIdx + 2];

      const xw = m[0] * x + m[4] * y + m[8] * z + m[12];
      const yw = m[1] * x + m[5] * y + m[9] * z + m[13];
      const zw = m[2] * x + m[6] * y + m[10] * z + m[14];
      const ww = m[3] * x + m[7] * y + m[11] * z + m[15];

      const invW = 1.0 / ww;
      const nx = xw * invW * 0.5 + 0.5;
      const ny = yw * invW * 0.5 + 0.5;

      if (nx >= min.x && nx <= max.x && ny >= min.y && ny <= max.y && zw > 0) {
        tempIndices[count++] = i;
      }
    }

    const finalResult = tempIndices.slice(0, count);
    return Comlink.transfer(finalResult, [finalResult.buffer]);
  },
};

Comlink.expose(workerApi);
export type WorkerApi = typeof workerApi;
