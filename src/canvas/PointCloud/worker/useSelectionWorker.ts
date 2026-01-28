import * as Comlink from "comlink";
import { useEffect, useRef } from "react";
import type { WorkerApi } from "./selection.worker";
import * as THREE from "three";
import { message } from "antd";

export default function useSelectionWorker({ count }: { count: number }) {
  const workerProxies = useRef<Comlink.Remote<WorkerApi>[]>([]);
  const workerCount = navigator.hardwareConcurrency || 4;

  useEffect(() => {
    const rawWorkers: Worker[] = [];
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(
        new URL("./selection.worker.ts", import.meta.url),
        { type: "module" }
      );
      const proxy = Comlink.wrap<WorkerApi>(worker);
      workerProxies.current.push(proxy);
      rawWorkers.push(worker);
    }
    return () => rawWorkers.forEach((w) => w.terminate());
  }, [workerCount]);

  const runParallelSelection = async ({
    sharedBuffer,
    pvMatrix,
    selectionMin,
    selectionMax,
  }: {
    sharedBuffer: SharedArrayBuffer;
    pvMatrix: THREE.Matrix4Tuple;
    selectionMin: THREE.Vector2;
    selectionMax: THREE.Vector2;
  }) => {
    console.time("Comlink-Parallel");

    const pointsPerWorker = Math.floor(count / workerCount);

    // 分派任务
    const tasks = workerProxies.current.map((proxy, i) => {
      const start = i * pointsPerWorker;
      const end = i === workerCount - 1 ? count : (i + 1) * pointsPerWorker;

      return proxy.selectPartial(
        sharedBuffer,
        pvMatrix,
        selectionMin,
        selectionMax,
        start,
        end
      );
    });

    // 并行执行
    const results = await Promise.all<Uint32Array>(tasks);

    const totalCount = results.reduce((sum, res) => sum + res.length, 0);
    const mergedIndices = new Uint32Array(totalCount);
    let offset = 0;
    for (const res of results) {
      mergedIndices.set(res, offset);
      offset += res.length;
    }

    console.timeEnd("Comlink-Parallel");
    console.log("选中索引总数:", totalCount);
    message.success(`选中 ${totalCount} 个点`);
    return mergedIndices;
  };

  return { runParallelSelection };
}
