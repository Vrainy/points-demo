import GUI from "lil-gui";
import { useEffect, useRef } from "react";
import type { StatsData } from "./tileTypes";

export function usePointCloudGui(initial: { targetDensity: number; maxStride: number }, totalTiles: number) {
  const uiRef = useRef<{ targetDensity: number; maxStride: number; showAABB: boolean }>({
    targetDensity: initial.targetDensity,
    maxStride: initial.maxStride,
    showAABB: false,
  });
  const statsRef = useRef<StatsData>({
    visibleTiles: 0,
    renderedPoints: 0,
    drawCalls: 0,
    avgStride: 0,
    totalTiles,
  });

  useEffect(() => {
    const gui = new GUI({ title: "PointCloud LOD" });
    const fParams = gui.addFolder("Params");
    fParams.add(uiRef.current, "targetDensity", 0.1, 2.0, 0.05).name("目标密度").listen();
    fParams.add(uiRef.current, "maxStride", 1, 256, 1).name("最大Stride").listen();
    fParams.add(uiRef.current, "showAABB").name("显示AABB").listen();
    fParams.open();
    const fStats = gui.addFolder("Stats");
    fStats.add(statsRef.current, "visibleTiles").name("可见瓦片").listen();
    fStats.add(statsRef.current, "renderedPoints").name("渲染点数").listen();
    fStats.add(statsRef.current, "drawCalls").name("DrawCalls").listen();
    fStats.add(statsRef.current, "avgStride").name("平均Stride").listen();
    fStats.add(statsRef.current, "totalTiles").name("总瓦片").listen();
    fStats.open();
    return () => {
      gui.destroy();
    };
  }, []);

  return { uiRef, statsRef };
}
