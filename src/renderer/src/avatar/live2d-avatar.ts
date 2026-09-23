import { Container, Ticker } from 'pixi.js'
import type { ModelMeta } from '../../../shared/model'
import { modelEntryUrl } from '../../../shared/model'
import type { EmotionName } from '../../../shared/protocol'
import type { PetAvatar } from './types'

/** 与库内 MotionPriority 对应：1=idle 2=normal 3=force */
const PRIORITY_NORMAL = 2
const PRIORITY_FORCE = 3

/**
 * 我们只依赖库的这部分表面 API，避免与其内部类型耦合；
 * 运行时经动态 import 加载（Core 缺失时根本不会走到这里）。
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

export class Live2DAvatar implements PetAvatar {
  readonly view: Live2DModelLike
  readonly naturalHeight: number
  private talking = false
  private lipTimer: ReturnType<typeof setInterval> | null = null
  private lipPhase = 0

  private constructor(model: Live2DModelLike, private meta: ModelMeta) {
    this.view = model
    model.anchor.set(0.5, 0.5)
    this.naturalHeight = Math.max(1, model.getLocalBounds().height)
  }

  static async load(meta: ModelMeta): Promise<Live2DAvatar> {
    const { Live2DModel } = await import('@jannchie/pixi-live2d-display/cubism4')
    const model = (await Live2DModel.from(modelEntryUrl(meta), {
      ticker: Ticker.shared,
      autoHitTest: false,
      autoFocus: false
    })) as unknown as Live2DModelLike
    return new Live2DAvatar(model, meta)
  }

  hitBounds(): { x: number; y: number; width: number; height: number } {
    return this.view.getBounds()
  }

  setEmotion(emotion: EmotionName, motion?: string): void {
    const binding = this.meta.emotions[emotion] ?? {}
    if (binding.expression !== undefined) {
      if (binding.expression === null) {
        this.view.internalModel.motionManager?.expressionManager?.resetExpression?.()
      } else {
        try {
          this.view.expression(binding.expression)
        } catch {
          // 表达式名不存在时静默降级
        }
      }
    }
    const group = motion ?? binding.motion
    if (group) {
      try {
        this.view.motion(group, undefined, PRIORITY_NORMAL)
      } catch {
        // 动作组不存在时静默降级
      }
    }
  }

  setTalking(talking: boolean): void {
    if (this.talking === talking) return
    this.talking = talking
    if (talking) {
      this.view.startLipSync()
      this.lipTimer = setInterval(() => {
        this.lipPhase += 0.32 + Math.random() * 0.25
        const envelope = 0.35 + Math.random() * 0.45
        this.view.setLipSyncValue(Math.min(1, Math.abs(Math.sin(this.lipPhase)) * envelope + 0.1))
      }, 70)
    } else {
      if (this.lipTimer) clearInterval(this.lipTimer)
      this.lipTimer = null
      this.view.stopLipSync()
    }
  }

  focus(x: number, y: number): void {
    this.view.focus(x, y)
  }

  playTap(): void {
    try {
      this.view.motion(this.meta.tapMotion ?? 'Tap', undefined, PRIORITY_FORCE)
    } catch {
      // 无 Tap 组时忽略
    }
  }

  dispose(): void {
    this.setTalking(false)
    this.view.removeFromParent()
    try {
      this.view.destroy()
    } catch {
      // 库内部销毁异常不影响整体
    }
  }
}
