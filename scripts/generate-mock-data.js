import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 模拟生成二进制瓦片数据
// 格式：
// [TileCount: uint32]
// [Tile1 Meta: id(u32), count(u32), byteOffset(u32), byteLength(u32), minX(f32), minY(f32), minZ(f32), maxX(f32), maxY(f32), maxZ(f32)]
// ...
// [Tile Payload 1: positions(3*f32), colors(3*f32)]
// ...

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../public/data/mock');
const TOTAL_POINTS = 1_000_000; // 演示用 100万个点
const EXTENT = 100; // 空间范围
const MAX_POINTS_PER_NODE = 50_000; // 每个节点最大点数

// 简单的伪随机数生成器 (Seeded Random)
function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

const rand = mulberry32(12345);

// 1. 生成点数据
console.log('Generating points...');
const positions = new Float32Array(TOTAL_POINTS * 3);
const colors = new Float32Array(TOTAL_POINTS * 3);
const indices = new Uint32Array(TOTAL_POINTS);
const half = EXTENT / 2;

for (let i = 0; i < TOTAL_POINTS; i++) {
    indices[i] = i;
    const p = i * 3;
    // 使用简单的随机分布，也可以改成噪声或模型
    positions[p] = (rand() - 0.5) * EXTENT;
    positions[p + 1] = (rand() - 0.5) * EXTENT;
    positions[p + 2] = (rand() - 0.5) * EXTENT;
    
    colors[p] = rand();
    colors[p + 1] = rand();
    colors[p + 2] = rand();
}

// 2. 构建八叉树（包含 LOD 层级）
console.log('Building Octree...');
let tiles = [];
let tileIdCounter = 0;

// 单独存储 LOD 0（根节点）以便快速加载
const LOD0_SAMPLE_RATE = 0.01; // LOD 0 采样 1% 的点
const lod0Indices = [];

/**
 * 递归构建八叉树
 * @param {Uint32Array} indices - 当前节点的点索引
 * @param {number[]} min - 当前节点的最小坐标
 * @param {number[]} max - 当前节点的最大坐标
 * @param {number} depth - 当前深度
 */
function buildOctree(indices, min, max, depth) {
    if (indices.length === 0) return;
    
    // 收集 LOD 0 的采样点
    if (depth === 0) {
        const step = Math.floor(1 / LOD0_SAMPLE_RATE);
        for(let i=0; i<indices.length; i+=step) {
            lod0Indices.push(indices[i]);
        }
    }

    // 如果点数小于阈值或达到最大深度，则作为叶子节点
    if (indices.length <= MAX_POINTS_PER_NODE || depth >= 8) {
        // 叶子节点 -> 创建瓦片
        tiles.push({
            id: tileIdCounter++,
            indices: indices, // 保留引用
            min: [...min],
            max: [...max],
            count: indices.length,
            depth: depth,
            isRoot: false
        });
        return;
    }

    // 计算中心点
    const mid = [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5
    ];

    // 初始化 8 个子节点的索引列表
    const children = Array(8).fill().map(() => []);
    
    // 将点分配到 8 个子节点中
    for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const px = positions[idx * 3];
        const py = positions[idx * 3 + 1];
        const pz = positions[idx * 3 + 2];
        
        // 根据坐标判断属于哪个子节点 (0-7)
        const code = (px >= mid[0] ? 1 : 0) | (py >= mid[1] ? 2 : 0) | (pz >= mid[2] ? 4 : 0);
        children[code].push(idx);
    }

    // 递归处理子节点
    for (let i = 0; i < 8; i++) {
        if (children[i].length === 0) continue;
        const cMin = [
            (i & 1) ? mid[0] : min[0],
            (i & 2) ? mid[1] : min[1],
            (i & 4) ? mid[2] : min[2]
        ];
        const cMax = [
            (i & 1) ? max[0] : mid[0],
            (i & 2) ? max[1] : mid[1],
            (i & 4) ? max[2] : mid[2]
        ];
        buildOctree(new Uint32Array(children[i]), cMin, cMax, depth + 1);
    }
}

buildOctree(indices, [-half, -half, -half], [half, half, half], 0);

// 添加根瓦片 (LOD 0)
const rootTile = {
    id: tileIdCounter++,
    indices: new Uint32Array(lod0Indices),
    min: [-half, -half, -half],
    max: [half, half, half],
    count: lod0Indices.length,
    depth: 0,
    isRoot: true
};
// 将根瓦片放在列表/文件的最前面，便于访问
// tiles.unshift(rootTile);
tiles = [rootTile];

console.log(`Generated ${tiles.length} tiles (1 Root + ${tiles.length-1} Leafs).`);

// 3. 写入二进制文件
// 布局结构:
// 文件头: [Magic: 4b][Version: 4b][TileCount: 4b]
// 索引区: [TileID: 4b][Count: 4b][Offset: 4b][Length: 4b][Bounds(6*4b)][IsRoot: 4b]... (每个瓦片 44 字节)
// 数据区: [Positions...][Colors...] (每个瓦片紧密排列)

const HEADER_SIZE = 12;
const TILE_INDEX_SIZE = 44; // 40 + 4 (flags)
const indexOffset = HEADER_SIZE;
const payloadOffset = indexOffset + tiles.length * TILE_INDEX_SIZE;

// 计算总大小
let currentPayloadOffset = payloadOffset;
tiles.forEach(tile => {
    tile.byteOffset = currentPayloadOffset;
    // 每个点: 3*4 (pos) + 3*4 (col) = 24 字节
    tile.byteLength = tile.count * 24;
    currentPayloadOffset += tile.byteLength;
});

const totalSize = currentPayloadOffset;
const buffer = new Uint8Array(totalSize);
const view = new DataView(buffer.buffer);

// 写入文件头
view.setUint32(0, 0x50434C44, true); // Magic: 'PCLD'
view.setUint32(4, 1, true); // Version 1
view.setUint32(8, tiles.length, true); // Tile Count

// 写入索引和负载数据
tiles.forEach((tile, i) => {
    const idxBase = indexOffset + i * TILE_INDEX_SIZE;
    // 写入索引信息
    view.setUint32(idxBase, tile.id, true);
    view.setUint32(idxBase + 4, tile.count, true);
    view.setUint32(idxBase + 8, tile.byteOffset, true);
    view.setUint32(idxBase + 12, tile.byteLength, true);
    
    // 写入包围盒 (Bounds)
    view.setFloat32(idxBase + 16, tile.min[0], true);
    view.setFloat32(idxBase + 20, tile.min[1], true);
    view.setFloat32(idxBase + 24, tile.min[2], true);
    view.setFloat32(idxBase + 28, tile.max[0], true);
    view.setFloat32(idxBase + 32, tile.max[1], true);
    view.setFloat32(idxBase + 36, tile.max[2], true);
    
    // 写入标志位 (IsRoot)
    view.setUint32(idxBase + 40, tile.isRoot ? 1 : 0, true);

    // 写入负载数据 (Payload)
    let pOff = tile.byteOffset;
    for (let k = 0; k < tile.count; k++) {
        const ptIdx = tile.indices[k];
        // 写入位置 (Pos)
        view.setFloat32(pOff, positions[ptIdx * 3], true);
        view.setFloat32(pOff + 4, positions[ptIdx * 3 + 1], true);
        view.setFloat32(pOff + 8, positions[ptIdx * 3 + 2], true);
        // 写入颜色 (Col)
        view.setFloat32(pOff + 12, colors[ptIdx * 3], true);
        view.setFloat32(pOff + 16, colors[ptIdx * 3 + 1], true);
        view.setFloat32(pOff + 20, colors[ptIdx * 3 + 2], true);
        
        pOff += 24;
    }
});

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

fs.writeFileSync(path.join(OUTPUT_DIR, 'points.bin'), buffer);

// 写入 JSON 元数据以便调试和加载
const metadata = {
    totalPoints: tiles.reduce((acc, t) => acc + t.count, 0), // 注意：总点数现在包含重复点 (LOD0 + Leaf)
    extent: EXTENT,
    tileCount: tiles.length,
    rootTileId: rootTile.id,
    tiles: tiles.map(t => ({
        id: t.id,
        count: t.count,
        byteOffset: t.byteOffset,
        byteLength: t.byteLength,
        aabb: { min: t.min, max: t.max },
        isRoot: t.isRoot
    }))
};

fs.writeFileSync(path.join(OUTPUT_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));

console.log('Done! Mock data generated in public/data/mock');
