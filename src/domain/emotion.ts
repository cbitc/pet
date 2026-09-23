/**
 * 情绪——宠物心情的语义标签。
 *
 * 领域只认识标签本身；至于「happy」该配哪个表情、哪个动作，
 * 由当前形象的表演表（appearance.ts）决定。情绪不携带任何技术细节，
 * 因此心智（大脑）可以放心地只发标签。
 */

export const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised'] as const

export type Emotion = (typeof EMOTIONS)[number]

/** 没有情绪时的默认心情 */
export const DEFAULT_EMOTION: Emotion = 'neutral'

export function isEmotion(value: unknown): value is Emotion {
  return typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value)
}

/** 把不可信来源（大脑指令、配置文件）的情绪值收拢到已知标签 */
export function toEmotion(value: unknown, fallback: Emotion = DEFAULT_EMOTION): Emotion {
  return isEmotion(value) ? value : fallback
}
