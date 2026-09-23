import type { PetAvatar } from './avatar/types'

export interface InteractionHooks {
  getAvatar: () => PetAvatar | null
  /** 拖拽结束且位置发生变化（移动超过阈值）后回调，由外部负责持久化 */
  onPosePersist: () => void
  /** 单击宠物（非拖拽） */
  onTap: () => void
  /** 拖拽过程中每次移动（气泡/输入条跟随） */
  onDragMove: () => void
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * 桌面级交互：
 * - 命中检测驱动窗口动态穿透（命中宠物/输入框 → 捕获鼠标；空白 → 点击落到下层应用）
 * - 拖拽 = 移动舞台内模型坐标；位移小于阈值视为点击
 * - 悬停时注视（眼睛跟随）+ 指针光标
 */
export function setupInteraction(hooks: InteractionHooks): void {
  let interactive = false
  let dragging = false
  let downX = 0
  let downY = 0
  let baseX = 0
  let baseY = 0
  let moved = 0

  const setInteractive = (on: boolean): void => {
    if (on === interactive) return
    interactive = on
    window.pet.setIgnoreMouse(!on)
  }

  const overAvatar = (x: number, y: number): boolean => {
    const av = hooks.getAvatar()
    if (!av) return false
    const b = av.hitBounds()
    const pad = 12
    return (
      x >= b.x - pad && x <= b.x + b.width + pad && y >= b.y - pad && y <= b.y + b.height + pad
    )
  }

  const overUi = (x: number, y: number): boolean => {
    const el = document.elementFromPoint(x, y)
    return !!el && !!el.closest('[data-interactive]')
  }

  window.addEventListener(
    'mousemove',
    (e) => {
      if (dragging) return
      const over = overAvatar(e.clientX, e.clientY)
      const hit = over || overUi(e.clientX, e.clientY)
      setInteractive(hit)
      document.body.classList.toggle('pet-hover', over)
      if (over) hooks.getAvatar()?.focus(e.clientX, e.clientY)
    },
    { passive: true }
  )

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const av = hooks.getAvatar()
    if (!av) return
    const x = e.clientX
    const y = e.clientY
    if (!overAvatar(x, y) || overUi(x, y)) return

    dragging = true
    moved = 0
    downX = x
    downY = y
    baseX = av.view.position.x
    baseY = av.view.position.y
    setInteractive(true)
    ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
  })

  window.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const av = hooks.getAvatar()
    if (!av) return
    const dx = e.clientX - downX
    const dy = e.clientY - downY
    moved = Math.max(moved, Math.hypot(dx, dy))
    av.view.position.set(
      clamp(baseX + dx, 50, window.innerWidth - 50),
      clamp(baseY + dy, 80, window.innerHeight - 30)
    )
    hooks.onDragMove()
  })

  const endDrag = (): void => {
    if (!dragging) return
    dragging = false
    if (moved < 8) {
      hooks.getAvatar()?.playTap()
      hooks.onTap()
    } else {
      hooks.onPosePersist()
    }
  }
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)

  // 指针离开窗口时回到穿透态，避免悬空卡住
  document.addEventListener('mouseleave', () => {
    if (!dragging) setInteractive(false)
  })
}
