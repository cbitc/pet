/**
 * 通用几何 / 数值原语——最底层模块，**不 import 任何东西**（由测试守护）。
 *
 * 归属判据：把「桌宠」这个业务整个换掉，这些函数依然成立。它们被 domain、
 * contracts、表现层共同使用，因此不归任何一层所有。参数刻意用结构化类型，
 * 调用方可以直接传 domain 的 `Rect` / `ScreenPoint`，无需搬运类型定义。
 */

/** 把数值夹进 [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 点是否落在矩形内；padding 为命中检测留出的外扩容差（手感） */
export function rectContains(
  point: { readonly x: number; readonly y: number },
  rect: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  },
  padding = 0
): boolean {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  )
}
