/**
 * Electron 桌面适配器——DeskSurface 端口的实现。
 *
 * 技术细节：DOM 指针事件、屏幕坐标、位移阈值（点击 vs 拖动）、
 * 通过 IPC 让主进程切换「接住鼠标 / 放行点击」（不打扰的落地）。
 * 领域只收到语义手势。
 */

import type {
  DeskGesture,
  DeskSurface,
  PointerTarget,
  ScreenPoint,
  Unsubscribe,
  Viewport
} from '../../domain'

/** 位移小于该值（像素）视为点击而非拖动 */
const TAP_THRESHOLD_PX = 8
/**
 * 常态穿透：点击落到下层应用；forward 让 mousemove 仍能到达页面，
 * 否则一旦穿透就再也收不到"鼠标移回宠物"的消息，穿透状态会卡死。
 */


export interface DeskBridge {
  setIgnoreMouse(ignore: boolean): void
}

export class ElectronDesk implements DeskSurface {
  private gestureHandler: ((gesture: DeskGesture) => void) | null = null
  private viewportHandler: ((viewport: Viewport) => void) | null = null
  private hitTest: ((at: ScreenPoint) => PointerTarget) | null = null

  private captured = false
  private dragging = false
  private dragAnnounced = false
  private travelled = 0
  /** 拖动起点（用于累计位移） */
  private downAt: ScreenPoint = { x: 0, y: 0 }
  /** 上一次指针位置（用于计算逐段增量） */
  private lastAt: ScreenPoint = { x: 0, y: 0 }

  constructor(private readonly bridge: DeskBridge) {
    window.addEventListener('mousemove', this.onMouseMove, { passive: true })
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    document.addEventListener('mouseleave', this.onMouseLeave)
    window.addEventListener('resize', this.onResize)
  }

  /* ---------- DeskSurface ---------- */

  onGesture(handler: (gesture: DeskGesture) => void): Unsubscribe {
    this.gestureHandler = handler
    return () => {
      this.gestureHandler = null
    }
  }

  setHitTest(hitTest: (at: ScreenPoint) => PointerTarget): void {
    this.hitTest = hitTest
  }

  setPointerCapture(captured: boolean): void {
    if (captured === this.captured) return
    this.captured = captured
    this.bridge.setIgnoreMouse(!captured)
  }

  viewport(): Viewport {
    return { width: window.innerWidth, height: window.innerHeight }
  }

  onViewportChanged(handler: (viewport: Viewport) => void): Unsubscribe {
    this.viewportHandler = handler
    return () => {
      this.viewportHandler = null
    }
  }

  /* ---------- 指针事件 → 语义手势 ---------- */

  private emit(gesture: DeskGesture): void {
    this.gestureHandler?.(gesture)
  }

  private targetAt(at: ScreenPoint): PointerTarget {
    return this.hitTest?.(at) ?? 'none'
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (this.dragging) return
    const at = { x: e.clientX, y: e.clientY }
    const target = this.targetAt(at)
    // 悬停到宠物或界面部件上才接住鼠标
    this.emit({ kind: 'hover', at, onPet: target === 'pet', onUi: target === 'ui' })
    document.body.classList.toggle('pet-hover', target === 'pet')
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    const at = { x: e.clientX, y: e.clientY }
    const target = this.targetAt(at)
    if (target !== 'pet') return

    this.dragging = true
    this.travelled = 0
    this.dragAnnounced = false
    this.downAt = at
    this.lastAt = at
    this.setPointerCapture(true)
    // 合成事件（冒烟自检用的程序化事件）没有真实指针，捕获可能不可用
    try {
      ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
    } catch {
      // 指针捕获只是锦上添花，失败不影响手势识别
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return
    const at = { x: e.clientX, y: e.clientY }
    this.travelled = Math.max(
      this.travelled,
      Math.hypot(at.x - this.downAt.x, at.y - this.downAt.y)
    )

    if (!this.dragAnnounced && this.travelled >= TAP_THRESHOLD_PX) {
      this.dragAnnounced = true
      this.emit({ kind: 'dragBegin' })
    }
    if (this.dragAnnounced) {
      // 逐段增量：领域按视口尺寸换算成归一化位移
      this.emit({ kind: 'dragMove', delta: { x: at.x - this.lastAt.x, y: at.y - this.lastAt.y } })
      this.lastAt = at
    }
  }

  private onPointerUp = (): void => {
    if (!this.dragging) return
    this.dragging = false

    if (this.dragAnnounced) {
      this.emit({ kind: 'dragEnd' })
    } else {
      // 没超过阈值：算点击（「位移小于阈值算点击」的惯用判定留在适配器）
      this.emit({ kind: 'tap' })
    }
    this.dragAnnounced = false
    this.travelled = 0
  }

  private onMouseLeave = (): void => {
    if (!this.dragging) this.emit({ kind: 'leave' })
  }

  private onResize = (): void => {
    this.viewportHandler?.(this.viewport())
  }
}
