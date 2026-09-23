/**
 * 领域事件——宠物身上发生过的事，用过去时描述。
 *
 * 宠物不认识 Electron、Pixi、DOM：它只产出这些事件，
 * 由运行时（app/pet-runtime.ts）把它们翻译成对外界的要求（重画、说话、落盘……）。
 * 事件是手写的判别联合，没有总线、没有订阅表——保持可读。
 */

import type { Appearance } from './appearance'
import type { Emotion } from './emotion'
import type { Pose } from './pose'

export type DomainEvent =
  /** 宠物现身（启动完成，准备出现在桌面上） */
  | { readonly type: 'PetAppeared' }
  /** 位置或大小变了，需要重新摆放 */
  | { readonly type: 'PetMoved'; readonly pose: Pose; readonly reason: PoseChangeReason }
  /** 挪窝结束（或被重置）——这是值得记住的位置 */
  | { readonly type: 'PetSettled'; readonly pose: Pose }
  /** 被主人点了一下 */
  | { readonly type: 'PetTapped' }
  /** 主人说了一句话 */
  | { readonly type: 'OwnerSpoke'; readonly text: string }
  /** 开始等待回复（气泡出现打字点，口型开始动） */
  | { readonly type: 'ReplyStarted'; readonly forText: string }
  /** 收到一段回复文字 */
  | { readonly type: 'ReplyChunk'; readonly chunk: string }
  /** 一轮回复结束 */
  | { readonly type: 'ReplyCompleted'; readonly reply: string }
  /** 一轮回复失败 */
  | { readonly type: 'ReplyFailed'; readonly reason: string }
  /** 心情变了（同一心情重复表达也会发，用来再次触发表演） */
  | { readonly type: 'MoodChanged'; readonly mood: Emotion; readonly cue?: string }
  /** 换了形象 */
  | { readonly type: 'AppearanceChanged'; readonly appearance: Appearance | null }
  /** 只能以降级形态出现（缺形象资产等），原因给人看 */
  | { readonly type: 'Degraded'; readonly reason: string }

export type PoseChangeReason = 'drag' | 'reset' | 'restore'
