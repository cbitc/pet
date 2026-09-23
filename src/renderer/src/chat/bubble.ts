function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 助手气泡句柄：接收流式增量，内部做逐字平滑显示 */
export interface AssistantHandle {
  append(chunk: string): void
  finish(): void
  fail(message: string): void
}

const MAX_VISIBLE = 2
const USER_FADE_MS = 9000
const ASSISTANT_FADE_MS = 14000

export class BubbleLayer {
  private root: HTMLElement

  constructor() {
    this.root = document.getElementById('bubbles')!
  }

  /** 气泡列锚定在宠物头顶（全局坐标，向下排布到锚点为止） */
  positionAt(x: number, y: number): void {
    this.root.style.left = `${clamp(x, 180, window.innerWidth - 180)}px`
    this.root.style.top = `${Math.max(y, 100)}px`
  }

  private addBubble(kind: 'user' | 'assistant'): HTMLElement {
    const el = document.createElement('div')
    el.className = `bubble ${kind}`
    this.root.appendChild(el)
    // 容量裁剪必须同步完成：fadeOut 是异步移除，放在 while 条件里会死循环挂死渲染进程
    while (this.root.children.length > MAX_VISIBLE) {
      const oldest = this.root.firstElementChild as HTMLElement | null
      if (!oldest) break
      oldest.remove()
    }
    return el
  }

  private fadeOut(el: HTMLElement, delayMs: number): void {
    window.setTimeout(
      () => {
        el.classList.add('fading')
        window.setTimeout(() => el.remove(), 450)
      },
      Math.max(0, delayMs)
    )
  }

  showUser(text: string): void {
    const el = this.addBubble('user')
    el.textContent = text
    this.fadeOut(el, USER_FADE_MS)
  }

  beginAssistant(): AssistantHandle {
    const el = this.addBubble('assistant')
    const dots = document.createElement('span')
    dots.className = 'dots'
    dots.innerHTML = '<i></i><i></i><i></i>'
    const span = document.createElement('span')
    el.append(dots, span)

    let buffer = ''
    let shown = 0
    let finished = false
    let timer: number | null = null

    const flush = (): void => {
      shown = buffer.length
      span.textContent = buffer
    }

    const tick = (): void => {
      timer = null
      if (shown >= buffer.length) {
        if (finished) {
          this.fadeOut(el, ASSISTANT_FADE_MS)
        }
        return
      }
      // 追赶式输出：落后越多吐字越快，避免长回复卡顿
      const step = Math.max(1, Math.round((buffer.length - shown) / 6))
      shown = Math.min(buffer.length, shown + step)
      span.textContent = buffer.slice(0, shown)
      if (shown < buffer.length || !finished) {
        timer = window.setTimeout(tick, 26)
      } else {
        this.fadeOut(el, ASSISTANT_FADE_MS)
      }
    }

    return {
      append: (chunk: string) => {
        buffer += chunk
        dots.remove()
        if (timer === null) tick()
      },
      finish: () => {
        finished = true
        dots.remove()
        if (timer === null) {
          flush()
          this.fadeOut(el, ASSISTANT_FADE_MS)
        }
      },
      fail: (message: string) => {
        finished = true
        timer !== null && window.clearTimeout(timer)
        timer = null
        dots.remove()
        span.textContent = `（连接出了点问题：${message}）`
        this.fadeOut(el, 6000)
      }
    }
  }
}
