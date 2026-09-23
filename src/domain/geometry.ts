/**
 * 几何与数值小工具——领域里「点 / 矩形 / 视口 / 取值」的共同语言。
 *
 * 纯函数、零依赖。以前 `clamp` 在 3 个文件里各写一份、命中判定又在
 * 运行时与界面里重复实现，这里收敛成唯一的真相源。
 */

export interface ScreenPoint {
  readonly x: number
  readonly y: number
}

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Viewport {
  readonly width: number
  readonly height: number
}

/** 把数值夹进 [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 点是否落在矩形内；padding 为命中检测留出的外扩容差（手感） */
export function rectContains(point: ScreenPoint, rect: Rect, padding = 0): boolean {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  )
}
