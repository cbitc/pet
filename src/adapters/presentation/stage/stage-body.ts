/**
 * 舞台上的「躯体」——穿在宠物身上那个有形的东西。
 *
 * 两种躯体：真形象（Live2D 模型）与占位躯体（缺资产时的一只小史莱姆）。
 * 舞台（pixi-stage.ts）负责摆放与切换，躯体只负责「演」。
 */

import type { Container } from 'pixi.js'
import type { Emotion, Performance } from '../../../domain'

export interface StageBody {
  readonly view: Container
  /** 未缩放时的自然高度，用于把「体型」换算成缩放比例 */
  readonly naturalHeight: number
  /** 表演：情绪 + 该形象的表演提示（可能没有绑定） */
  perform(mood: Emotion, performance: Performance | undefined): void
  /** 说话中：口型开合 */
  setSpeaking(speaking: boolean): void
  /** 看向屏幕上的某点（全局像素坐标） */
  lookAt(x: number, y: number): void
  /** 被触摸时的反应（cue 为该形象的触摸动作提示） */
  reactToTouch(cue: string | undefined): void
  destroy(): void
}
