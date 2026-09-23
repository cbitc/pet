import { describe, expect, it } from 'vitest'
import {
  clampPose,
  DEFAULT_POSE,
  isSamePose,
  movePose,
  POSE_BOUNDS,
  poseFrom,
  type Pose
} from '../../src/domain/pose'

describe('栖息姿态', () => {
  it('把超出活动范围的姿态夹回边界', () => {
    const loose: Pose = { x: 2, y: -1, scale: 9 }
    const clamped = clampPose(loose)

    expect(clamped.x).toBe(POSE_BOUNDS.x[1])
    expect(clamped.y).toBe(POSE_BOUNDS.y[0])
    expect(clamped.scale).toBe(POSE_BOUNDS.scale[1])
  })

  it('挪窝会累加位移并受边界约束', () => {
    const start: Pose = { x: 0.5, y: 0.5, scale: 0.5 }

    expect(movePose(start, 0.1, -0.2)).toEqual({ x: 0.6, y: 0.3, scale: 0.5 })
    expect(movePose(start, 100, 0).x).toBe(POSE_BOUNDS.x[1])
  })

  it('坏数据回退到默认姿态', () => {
    expect(poseFrom(undefined)).toEqual(DEFAULT_POSE)
    expect(poseFrom({ x: '左边', y: Number.NaN, scale: null })).toEqual(DEFAULT_POSE)
  })

  it('只接受合法数值，其余按字段回退', () => {
    const pose = poseFrom({ x: 0.3, y: Infinity, scale: 0.9 })

    expect(pose).toEqual({ x: 0.3, y: DEFAULT_POSE.y, scale: 0.9 })
  })

  it('微小差异视为同一姿态（避免无意义的搬运）', () => {
    const a: Pose = { x: 0.5, y: 0.5, scale: 0.5 }
    const b: Pose = { x: 0.5005, y: 0.5, scale: 0.5 }

    expect(isSamePose(a, b)).toBe(true)
    expect(isSamePose(a, { ...a, x: 0.52 })).toBe(false)
  })
})
