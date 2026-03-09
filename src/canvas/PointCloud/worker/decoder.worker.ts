import * as Comlink from "comlink";

const workerApi = {
  decodeAndWrite(
    buffer: ArrayBuffer,
    sharedBuffer: SharedArrayBuffer,
    globalStartIndex: number,
    pointCount: number
  ) {
    // 1. Create views
    const view = new Float32Array(buffer);
    const sabFloats = new Float32Array(sharedBuffer);

    // 2. Extract Data (Assuming Mock layout: [Pos...][Col...])
    const posData = view.subarray(0, pointCount * 3);
    const colData = view.subarray(pointCount * 3, pointCount * 6);

    // 3. Write Positions to SharedArrayBuffer
    // This is the heavy lifting - writing to shared memory
    sabFloats.set(posData, globalStartIndex * 3);

    // 4. Return Colors (Transferable)
    // We need to return a detached buffer for transfer
    // colData is a subarray view of 'buffer'. 'buffer' will be detached when transferred?
    // Wait, 'buffer' is passed IN. We can't transfer it back easily if we used part of it.
    // We should copy colData to a new specific buffer if we want to be clean.
    // Or just return the whole 'buffer' if we don't need it?
    // But 'buffer' contains posData too which is now in SAB.
    // Let's copy colData to be safe and clean.
    const colBuffer = colData.slice().buffer;
    
    return Comlink.transfer({ colBuffer }, [colBuffer]);
  },
};

Comlink.expose(workerApi);
export type DecoderWorkerApi = typeof workerApi;
