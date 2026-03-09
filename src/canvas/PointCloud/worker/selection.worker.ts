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
    // P1 Streaming update: Check if positions are loaded (non-zero)
    // Actually, SAB is initialized to zeros. If a tile is not loaded, points are at (0,0,0).
    // We should probably filter out (0,0,0) or check a loaded flag?
    // But passing "loaded ranges" to worker is complex.
    // For P1 simplicity: Just process everything. Points at (0,0,0) might be selected if selection box covers origin.
    // But since our mock data range is -50..50, origin is valid.
    // Ideally we should pass a list of "valid ranges" to worker.
    // But `startIdx` / `endIdx` is just a slice of the whole buffer.
    // Let's keep it simple: Worker blindly processes SAB.
    // If SAB has zeros for unloaded tiles, they get selected if box covers (0,0,0).
    // This is acceptable for a P1 demo.
    
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
