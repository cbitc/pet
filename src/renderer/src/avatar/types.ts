import type { Container } from 'pixi.js'
import type { EmotionName } from '../../../shared/protocol'

/**
 * 宠物形象的统一抽象：Live2D 模型与无资产占位形象实现同一接口，
 * 交互/聊天/布局逻辑完全不感知底层差异。
 */
export interface PetAvatar {
  readonly view: Container
  /** 未缩放（scale=1）时的自然高度，布局用它换算显示比例 */
  readonly naturalHeight: number
  /** 命中判定用的松散边界（全局坐标） */
  hitBounds(): { x: number; y: number; width: number; height: number }
  /** 情绪绑定：映射到模型的表情/动作 */
  setEmotion(emotion: EmotionName, motion?: string): void
  /** 说话状态：驱动口型（TTS 就绪后也可复用） */
  setTalking(talking: boolean): void
  /** 注视全局坐标点（眼睛跟随） */
  focus(x: number, y: number): void
  /** 被点击时的反应动画 */
  playTap(): void
  dispose(): void
}
