/**
 * Live2D 躯体——把领域语义翻译成 Live2D 模型的动作、表情与口型。
 *
 * 技术细节都在这里：Cubism 模型加载、动作优先级、口型包络、表达式重置。
 * 领域只知道「表演什么心情」和「在不在说话」。
 */

import { Ticker, type Container } from 'pixi.js'
import type { Emotion, Performance } from '../../../domain'
import type { StageBody } from './stage-body'

/** 与库内 MotionPriority 对应：1=idle 2=normal 3=force */
const PRIORITY_NORMAL = 2
const PRIORITY_FORCE = 3

/** 口型节奏：约 70ms 一次开合，正弦包络 + 随机扰动，模拟说话 */
const LIP_TICK_MS = 70

/**
 * 我们只依赖库的这部分表面 API，避免与其内部类型耦合。
 */
interface Live2DModelLike extends Container {
  anchor: { set(x: number, y: number): void }
  motion(group: string, index?: number, priority?: number): unknown
  expression(id?: string | number): unknown
  focus(x: number, y: number): void
  startLipSync(): void
  stopLipSync(): void
  setLipSyncValue(v: number): void
  internalModel: {
    motionManager?: {
      expressionManager?: { resetExpression?: () => void }
    }
  }
  destroy(): void
}

/** 模型入口地址（由组装根通过 pet:// 协议提供） */
export type ModelUrlResolver = (appearanceId: string) => string | null

export class Live2DBody implements StageBody {
  readonly view: Live2DModelLike
  readonly naturalHeight: number
  private speaking = false
  private lipTimer: ReturnType<typeof setInterval> | null = null
  private lipPhase = 0

  private constructor(
    model: Live2DModelLike,
    /** 该形象的触摸动作提示（pet.model.json 的 tapMotion） */
    private readonly touchCue: string | undefined
  ) {
    this.view = model
    model.anchor.set(0.5, 0.5)
    this.naturalHeight = Math.max(1, model.getLocalBounds().height)
  }

  static async load(entryUrl: string, touchCue?: string): Promise<Live2DBody> {
    const { Live2DModel } = await import('@jannchie/pixi-live2d-display/cubism4')
    const model = (await Live2DModel.from(entryUrl, {
      ticker: Ticker.shared,
      // 交互统一由桌面适配器处理，关掉库自带的鼠标逻辑，避免双份
      autoHitTest: false,
      autoFocus: false
    })) as unknown as Live2DModelLike
    return new Live2DBody(model, touchCue)
  }

  perform(_mood: Emotion, performance: Performance | undefined): void {
    if (performance?.expression !== undefined) {
      if (performance.expression === null) {
        this.view.internalModel.motionManager?.expressionManager?.resetExpression?.()
      } else {
        try {
          this.view.expression(performance.expression)
        } catch {
          // 表达式名不存在时静默降级
        }
      }
    }
    if (performance?.cue) {
      try {
        this.view.motion(performance.cue, undefined, PRIORITY_NORMAL)
      } catch {
        // 动作组不存在时静默降级
      }
    }
  }

  setSpeaking(speaking: boolean): void {
    if (this.speaking === speaking) return
    this.speaking = speaking

    if (speaking) {
      this.view.startLipSync()
      this.lipTimer = setInterval(() => {
        this.lipPhase += 0.32 + Math.random() * 0.25
        const envelope = 0.35 + Math.random() * 0.45
        this.view.setLipSyncValue(Math.min(1, Math.abs(Math.sin(this.lipPhase)) * envelope + 0.1))
      }, LIP_TICK_MS)
    } else {
      if (this.lipTimer) clearInterval(this.lipTimer)
      this.lipTimer = null
      this.view.stopLipSync()
    }
  }

  lookAt(x: number, y: number): void {
    this.view.focus(x, y)
  }

  reactToTouch(): void {
    try {
      this.view.motion(this.touchCue ?? 'Tap', undefined, PRIORITY_FORCE)
    } catch {
      // 无触摸动作时忽略
    }
  }

  destroy(): void {
    this.setSpeaking(false)
    this.view.removeFromParent()
    try {
      this.view.destroy()
    } catch {
      // 库内部销毁异常不影响整体
    }
  }
}
