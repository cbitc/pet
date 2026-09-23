/**
 * 形象——宠物身上的一套外观资产（模型 + 表演表），以及「情绪 → 表演」的查表规则。
 *
 * 这里只描述形象「是什么」：叫什么名字、每种情绪表演什么。
 * 资产放在哪个文件、怎么加载、怎么渲染，全在适配器里——
 * 换模型只需要换一份形象清单（pet.model.json），领域代码不动。
 */

import type { Emotion } from './emotion'

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
  /** 允许 undefined（清单里的 Partial 结构天然如此），非法项在 parseAppearanceSpec 中丢弃 */
  readonly performances?: Readonly<
    Record<string, { readonly expression?: string | null; readonly motion?: string } | undefined>
  >
  readonly tapMotion?: string
}

/** 查表：这个形象如何表演某种情绪（没有专门绑定时返回 undefined，由适配器决定兜底） */
export function performanceFor(
  appearance: Appearance | null,
  emotion: Emotion
): Performance | undefined {
  return appearance?.performances[emotion]
}
