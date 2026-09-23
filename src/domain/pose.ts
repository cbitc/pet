/**
 * 栖息姿态——宠物在桌面上的位置与大小。
 *
 * 坐标一律归一化（相对桌面工作区的比例，0..1），因此与分辨率、显示器无关：
 * 可以直接持久化，换屏或改分辨率后也能原样回到记忆中的位置。
 * 「宠物的活动范围」这一规则也在这里定义（见 POSE_BOUNDS），
 * 而不是散落在拖拽代码里。
 */

import { clamp } from '../shared/geometry'

export interface Pose {
  /** 水平位置（占桌面宽度比例，锚点为宠物中心） */
  readonly x: number
  /** 垂直位置（占桌面高度比例） */
  readonly y: number
  /** 体型（占桌面高度比例） */
  readonly scale: number
}

/** 宠物的活动范围：中心不越界、体型在合理区间 */
export const POSE_BOUNDS = {
  x: [0.05, 0.95],
  y: [0.1, 0.95],
  scale: [0.15, 1.4]
} as const

export const DEFAULT_POSE: Pose = { x: 0.8, y: 0.68, scale: 0.55 }

export function clampPose(pose: Pose): Pose {
  return {
    x: clamp(pose.x, POSE_BOUNDS.x[0], POSE_BOUNDS.x[1]),
    y: clamp(pose.y, POSE_BOUNDS.y[0], POSE_BOUNDS.y[1]),
    scale: clamp(pose.scale, POSE_BOUNDS.scale[0], POSE_BOUNDS.scale[1])
  }
}

/** 挪窝：在当前姿态上叠加归一化位移（拖拽时按视口尺寸换算后调用） */
export function movePose(pose: Pose, dx: number, dy: number): Pose {
  return clampPose({ ...pose, x: pose.x + dx, y: pose.y + dy })
}

export function isSamePose(a: Pose, b: Pose, epsilon = 0.002): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.scale - b.scale) < epsilon
  )
}
