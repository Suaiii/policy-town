/**
 * 鱼眼透镜变换：光标附近的节点平滑放大并轻微外扩。
 * 纯函数，不持有状态——逻辑位置是唯一事实源，鱼眼只是渲染层变换。
 */

export interface FisheyeOptions {
  /** 影响半径（世界坐标 px） */
  radius: number;
  /** 圆心处最大放大倍率 */
  maxScale: number;
  /** 圆心处最大外扩位移（世界坐标 px） */
  spread: number;
}

export const DEFAULT_FISHEYE: FisheyeOptions = {
  radius: 120,
  maxScale: 1.6,
  spread: 26,
};

/** smoothstep 衰减：边缘处一阶导为零，保证节点进出半径时不跳变。 */
export function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export interface FisheyeResult {
  x: number;
  y: number;
  scale: number;
}

/**
 * 将逻辑坐标 (x, y) 按光标位置做鱼眼变换。
 * 光标为 null 或节点在半径外时原样返回（scale = 1）。
 */
export function applyFisheye(
  x: number,
  y: number,
  cursor: { x: number; y: number } | null,
  options: FisheyeOptions = DEFAULT_FISHEYE,
): FisheyeResult {
  if (!cursor) return { x, y, scale: 1 };
  const dx = x - cursor.x;
  const dy = y - cursor.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= options.radius) return { x, y, scale: 1 };
  const s = smoothstep(1 - dist / options.radius);
  const scale = 1 + (options.maxScale - 1) * s;
  // 节点恰好在光标上时无外扩方向
  if (dist < 1e-6) return { x, y, scale };
  const push = (s * options.spread) / dist;
  return { x: x + dx * push, y: y + dy * push, scale };
}
