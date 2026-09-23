import { describe, expect, it } from 'vitest'
import { DEFAULT_POSE, POSE_BOUNDS } from '../../src/domain/pose'
import { DEFAULT_PERSONA, DEFAULT_PREFERENCES } from '../../src/domain/preferences'
import { AppConfigSchema, DEFAULT_CONFIG } from '../../src/contracts/app-config'
import {
  ModelManifestSchema,
  parseAppearanceSpec,
  parsePose,
  parsePreferences,
  preferencesFromConfig
} from '../../src/contracts/schemas'

describe('姿态解析', () => {
  it('坏数据回退到默认姿态', () => {
    expect(parsePose(undefined)).toEqual(DEFAULT_POSE)
    expect(parsePose({ x: '左边', y: Number.NaN, scale: null })).toEqual(DEFAULT_POSE)
  })

  it('只接受合法数值，其余按字段回退', () => {
    expect(parsePose({ x: 0.3, y: Infinity, scale: 0.9 })).toEqual({
      x: 0.3,
      y: DEFAULT_POSE.y,
      scale: 0.9
    })
  })

  it('越界数值夹回活动范围', () => {
    expect(parsePose({ x: 2, y: -1, scale: 9 })).toEqual({
      x: POSE_BOUNDS.x[1],
      y: POSE_BOUNDS.y[0],
      scale: POSE_BOUNDS.scale[1]
    })
  })
})

describe('形象清单解析', () => {
  it('把清单数据净化成合法形象', () => {
    const appearance = parseAppearanceSpec({
      id: 'haru',
      displayName: '  Haru  ',
      tapMotion: 'Tap',
      performances: {
        happy: { expression: 'f03', motion: 'Tap' },
        neutral: { expression: null },
        sad: { expression: 'f05' },
        // 未知情绪与空绑定都应被丢弃
        sleepy: { expression: 'f99' },
        angry: {}
      }
    })

    expect(appearance.id).toBe('haru')
    expect(appearance.displayName).toBe('Haru')
    expect(appearance.tapCue).toBe('Tap')
    expect(appearance.performances.happy).toEqual({ expression: 'f03', cue: 'Tap' })
    expect(appearance.performances.neutral).toEqual({ expression: null })
    expect(appearance.performances.sad).toEqual({ expression: 'f05' })
    expect(appearance.performances.angry).toBeUndefined()
    expect(Object.keys(appearance.performances)).toEqual(['happy', 'neutral', 'sad'])
  })

  it('缺名字时用 id 兜底，缺表演表时为空表', () => {
    const appearance = parseAppearanceSpec({ id: 'miku' })

    expect(appearance.displayName).toBe('miku')
    expect(appearance.performances).toEqual({})
  })
})

describe('模型清单解析', () => {
  it('只保留已知字段，坏清单整体回退为空', () => {
    expect(ModelManifestSchema.parse({ displayName: 'Haru', extra: 1 })).toEqual({
      displayName: 'Haru'
    })
    expect(ModelManifestSchema.safeParse(42).success).toBe(false)
  })
})

describe('偏好解析', () => {
  it('应用配置形状映射成领域偏好', () => {
    const preferences = preferencesFromConfig({
      modelDir: 'miku',
      pose: { x: 0.2, y: 0.3, scale: 0.4 },
      brain: { persona: '新性格' },
      sessionId: 's-1'
    })

    expect(preferences).toEqual({
      appearanceId: 'miku',
      pose: { x: 0.2, y: 0.3, scale: 0.4 },
      persona: '新性格',
      sessionId: 's-1'
    })
  })

  it('缺失或非对象输入回退到默认偏好', () => {
    expect(preferencesFromConfig(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(preferencesFromConfig(42)).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences({ pose: { x: '坏' } })).toEqual(DEFAULT_PREFERENCES)
  })
})

describe('应用配置解析', () => {
  it('空配置落到默认值（schema 即真相源）', () => {
    expect(DEFAULT_CONFIG).toEqual({
      version: 1,
      brain: { mode: 'mock', url: 'ws://127.0.0.1:17321/brain', persona: DEFAULT_PERSONA },
      modelDir: 'haru',
      pose: DEFAULT_POSE,
      openAtLogin: false,
      sessionId: ''
    })
    expect(AppConfigSchema.parse({})).toEqual(DEFAULT_CONFIG)
  })

  it('坏字段就地回退/夹紧', () => {
    const config = AppConfigSchema.parse({
      pose: { scale: 9 },
      brain: { mode: 'nonsense' },
      modelDir: '   '
    })

    expect(config.pose.scale).toBe(POSE_BOUNDS.scale[1])
    expect(config.brain.mode).toBe('mock')
    expect(config.modelDir).toBe('haru')
  })
})
