/**
 * 占位躯体——资产缺失或加载失败时，宠物仍要「在场」。
 *
 * 一只会呼吸、眨眼、说话、跟睛会跟着鼠标的小史莱姆（纯 Pixi Graphics 绘制）。
 * 让整条交互链路在任何资产状况下都能被开发与验证。
 */

import { Container, Graphics, Ticker } from 'pixi.js'
import type { Emotion, Performance } from '../../../domain'
import type { StageBody } from './stage-body'

const EMOTION_TINT: Record<Emotion, number> = {
  neutral: 0x8fb7ff,
  happy: 0x7ee08a,
  sad: 0x6db3e8,
  angry: 0xe8756d,
  surprised: 0xf6c945
}

const DESIGN_HEIGHT = 200
const RADIUS = 86

export class PlaceholderBody implements StageBody {
  readonly view = new Container()
  readonly naturalHeight = DESIGN_HEIGHT

  private root = new Container()
  private body: Graphics
  private eyeL = new Container()
  private eyeR = new Container()
  private pupils: Graphics[] = []
  private mouth: Graphics
  private mood: Emotion = 'neutral'
  private t = Math.random() * 10
  private speaking = false
  private squash = 0
  private lookX = 0
  private lookY = 0
  private blinkTimer = 2 + Math.random() * 3
  private blinkLeft = 0

  constructor() {
    this.view.addChild(this.root)

    this.body = new Graphics()
    this.root.addChild(this.body)

    const makeEye = (ex: number, container: Container): void => {
      const white = new Graphics().circle(0, 0, 15).fill({ color: 0xffffff })
      const pupil = new Graphics().circle(0, 2, 7.5).fill({ color: 0x2c3040 })
      container.addChild(white, pupil)
      container.position.set(ex, -16)
      this.pupils.push(pupil)
      this.root.addChild(container)
    }
    makeEye(-30, this.eyeL)
    makeEye(30, this.eyeR)

    this.mouth = new Graphics().ellipse(0, 0, 11, 6).fill({ color: 0x6b4040 })
    this.mouth.position.set(0, 34)
    this.root.addChild(this.mouth)

    this.redrawBody()
    Ticker.shared.add(this.tick, this)
  }

  private redrawBody(): void {
    const g = this.body
    g.clear()
    g.circle(0, 0, RADIUS).fill({ color: EMOTION_TINT[this.mood] ?? EMOTION_TINT.neutral })
    // 高光与腮红
    g.ellipse(-32, -40, 20, 12).fill({ color: 0xffffff, alpha: 0.28 })
    g.circle(-48, 22, 9).fill({ color: 0xffffff, alpha: 0.35 })
    g.circle(48, 22, 9).fill({ color: 0xffffff, alpha: 0.35 })
  }

  private tick(): void {
    this.t += 1 / 60

    // 呼吸 + 点击挤压回弹
    this.squash *= 0.88
    const breathe = Math.sin(this.t * 2.2) * 0.03
    this.root.scale.set(1 + this.squash * 0.12, 1 - this.squash * 0.35 + breathe)

    // 眨眼
    this.blinkTimer -= 1 / 60
    if (this.blinkTimer <= 0 && this.blinkLeft <= 0) {
      this.blinkLeft = 0.14
      this.blinkTimer = 2.4 + Math.random() * 3
    }
    if (this.blinkLeft > 0) {
      this.blinkLeft -= 1 / 60
      this.eyeL.scale.y = this.eyeR.scale.y = 0.12
    } else {
      this.eyeL.scale.y = this.eyeR.scale.y = this.mood === 'sad' ? 0.55 : 1
    }

    // 情绪眼睛大小
    const eyeScaleX = this.mood === 'surprised' ? 1.25 : this.mood === 'angry' ? 0.85 : 1
    this.eyeL.scale.x = this.eyeR.scale.x = eyeScaleX

    // 说话口型
    const mouthOpen = this.speaking
      ? 0.5 + Math.abs(Math.sin(this.t * 13)) * 1.3
      : this.mood === 'happy'
        ? 1.1
        : 0.7
    this.mouth.scale.set(1, mouthOpen)

    // 视线
    for (const p of this.pupils) p.position.set(this.lookX * 5, 2 + this.lookY * 4)
  }

  perform(mood: Emotion, _performance: Performance | undefined): void {
    this.mood = mood
    this.redrawBody()
  }

  setSpeaking(speaking: boolean): void {
    this.speaking = speaking
  }

  lookAt(x: number, y: number): void {
    const center = this.view.getGlobalPosition()
    const dx = x - center.x
    const dy = y - center.y
    const len = Math.hypot(dx, dy) || 1
    this.lookX = Math.max(-1, Math.min(1, dx / len))
    this.lookY = Math.max(-1, Math.min(1, dy / len))
  }

  reactToTouch(): void {
    this.squash = 1
  }

  destroy(): void {
    Ticker.shared.remove(this.tick, this)
    this.view.destroy({ children: true })
  }
}
