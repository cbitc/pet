import { describe, expect, it } from 'vitest'
import { performanceFor, type Appearance } from '../../src/domain/appearance'
import { toEmotion, isEmotion } from '../../src/domain/emotion'

const HARU: Appearance = {
  id: 'haru',
  displayName: 'Haru',
  tapCue: 'Tap',
  performances: {
    happy: { expression: 'f03', cue: 'Tap' },
    neutral: { expression: null },
    sad: { expression: 'f05' }
  }
}

describe('形象与表演表', () => {
  it('按情绪查表演表；没有绑定时返回 undefined', () => {
    expect(performanceFor(HARU, 'happy')).toEqual({ expression: 'f03', cue: 'Tap' })
    expect(performanceFor(HARU, 'neutral')).toEqual({ expression: null })
    expect(performanceFor(HARU, 'sad')).toEqual({ expression: 'f05' })
    expect(performanceFor(HARU, 'angry')).toBeUndefined()
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
