import { describe, expect, it } from 'vitest'
import { defineAppearance, performanceFor } from '../../src/domain/appearance'
import { toEmotion, isEmotion } from '../../src/domain/emotion'

describe('形象与表演表', () => {
  it('把清单数据净化成合法形象', () => {
    const appearance = defineAppearance({
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
    expect(performanceFor(appearance, 'happy')).toEqual({ expression: 'f03', cue: 'Tap' })
    expect(performanceFor(appearance, 'neutral')).toEqual({ expression: null })
    expect(performanceFor(appearance, 'sad')).toEqual({ expression: 'f05' })
    expect(performanceFor(appearance, 'angry')).toBeUndefined()
    expect(Object.keys(appearance.performances)).toEqual(['happy', 'neutral', 'sad'])
  })

  it('缺名字时用 id 兜底，缺表演表时为空表', () => {
    const appearance = defineAppearance({ id: 'miku' })

    expect(appearance.displayName).toBe('miku')
    expect(appearance.performances).toEqual({})
    expect(performanceFor(appearance, 'happy')).toBeUndefined()
  })

  it('没有形象时查表演表是安全的', () => {
    expect(performanceFor(null, 'happy')).toBeUndefined()
  })
})

describe('情绪收拢', () => {
  it('认识的情绪原样保留', () => {
    expect(toEmotion('happy')).toBe('happy')
    expect(isEmotion('sad')).toBe(true)
  })

  it('不认识的情绪收拢为默认心情', () => {
    expect(toEmotion('sleepy')).toBe('neutral')
    expect(toEmotion(undefined)).toBe('neutral')
    expect(toEmotion(42, 'surprised')).toBe('surprised')
    expect(isEmotion('sleepy')).toBe(false)
  })
})
