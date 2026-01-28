# Point Cloud Visualization Demo

这是一个基于 React、Three.js 和 Vite 构建的高性能点云可视化与框选交互演示项目。它展示了如何处理和渲染海量点云数据（默认演示 1000 万个点），并利用 Web Worker 和 SharedArrayBuffer 实现高效的并行框选操作。

## ✨ 特性

-   **海量点云渲染**: 使用 `@react-three/fiber` 和自定义 Shader 高效渲染数百万级别的点云数据。
-   **高性能框选**:
    -   利用 **Web Worker** 将计算密集型的选点逻辑从主线程分离，确保 UI 流畅。
    -   使用 **SharedArrayBuffer** 在主线程和 Worker 之间共享数据，避免大数据的拷贝开销。
    -   自定义 Vertex Shader 实现 GPU 端的高亮显示。
-   **交互控制**: 集成 `OrbitControls` 进行场景漫游，支持自定义的框选交互。
-   **现代技术栈**: 基于 React 19, TypeScript, Vite, RxJS 构建。

## 🛠️ 技术栈

-   **核心框架**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
-   **3D 引擎**: [Three.js](https://threejs.org/), [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber), [@react-three/drei](https://github.com/pmndrs/drei)
-   **状态与事件**: [RxJS](https://rxjs.dev/), [Mitt](https://github.com/developit/mitt)
-   **多线程通讯**: [Comlink](https://github.com/GoogleChromeLabs/comlink)
-   **UI 组件**: [Ant Design](https://ant.design/)

## 🚀 快速开始

### 前置要求

请确保你已经安装了 [Node.js](https://nodejs.org/) (推荐 LTS 版本) 和 pnpm。

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

启动后，访问终端输出的本地地址（通常是 `http://localhost:5173`）。

> **注意**: 由于项目使用了 `SharedArrayBuffer`，需要确保服务器响应头包含 Cross-Origin Isolation 相关设置（Vite 配置中通常需要处理，或在安全上下文中使用）。

### 构建生产版本

```bash
pnpm build
```

## 📖 使用说明

1.  **场景漫游**:
    -   **旋转**: 按住鼠标左键拖动。
    -   **平移**: 按住鼠标右键拖动。
    -   **缩放**: 滚动鼠标滚轮。

2.  **框选操作**:
    -   按住键盘 **Shift** 键。
    -   同时按住 **鼠标左键** 并拖动，绘制选择框。
    -   框内的点将会被高亮显示（变为红色）。

## 📂 项目结构

```
src/
├── assets/          # 静态资源
├── canvas/           # 3D 场景相关组件
├── controls/        # 交互控制器
├── App.tsx          # 应用入口
└── main.tsx         # 渲染入口
```
