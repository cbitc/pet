/**
 * 形象——宠物身上的一套外观资产（模型 + 表演表），以及「情绪 → 表演」的查表规则。
 *
 * 这里只描述形象「是什么」：叫什么名字、每种情绪表演什么。
 * 资产放在哪个文件、怎么加载、怎么渲染，全在适配器里——
 * 换模型只需要换一份形象清单（pet.model.json），领域代码不动。
 */

import { isEmotion, type Emotion } from './emotion'

/** 表演：某个情绪下的表情与动作提示（名字是形象内部的标识，由适配器解释） */
export interface Performance {
  /** 表情名；null 表示恢复默认表情 */
  readonly expression?: string | null
  /** 动作提示（动作组名） */
  readonly cue?: string
}

export interface Appearance {
  /** 形象标识（与模型目录同名） */
  readonly id: string
  /** 给人看的名字 */
  readonly displayName: string
  readonly performances: Readonly<Partial<Record<Emotion, Performance>>>
  /** 被触摸时的动作提示 */
  readonly tapCue?: string
}

/**
 * 形象清单的中立数据形态：磁盘上的 pet.model.json 与跨进程消息都长这样。
 * 读文件、解析 JSON 是适配器的事；把它变成合法的 Appearance 是这里的事。
 */
export interface AppearanceSpec {
  readonly id: string
  readonly displayName?: string
  readonly performances?: Readonly<
    Record<string, { readonly expression?: string | null; readonly motion?: string }>
  >
  readonly tapMotion?: string
}

function cleanName(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** 净化并构造形象：丢弃未知情绪、空绑定与坏值，保证领域侧数据始终合法 */
export function defineAppearance(spec: AppearanceSpec): Appearance {
  const performances: Partial<Record<Emotion, Performance>> = {}

  for (const [key, binding] of Object.entries(spec.performances ?? {})) {
    if (!isEmotion(key) || !binding || typeof binding !== 'object') continue

    const expression =
      binding.expression === null ? null : cleanName(binding.expression)
    const cue = cleanName(binding.motion)

    if (expression === undefined && cue === undefined) continue
    performances[key] = {
      ...(expression !== undefined ? { expression } : {}),
      ...(cue !== undefined ? { cue } : {})
    }
  }

  return {
    id: cleanName(spec.id) ?? 'unknown',
    displayName: cleanName(spec.displayName) ?? cleanName(spec.id) ?? 'unknown',
    performances,
    tapCue: cleanName(spec.tapMotion)
  }
}

/** 查表：这个形象如何表演某种情绪（没有专门绑定时返回 undefined，由适配器决定兜底） */
export function performanceFor(
  appearance: Appearance | null,
  emotion: Emotion
): Performance | undefined {
  return appearance?.performances[emotion]
}
