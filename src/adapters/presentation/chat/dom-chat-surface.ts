/**
 * DOM 对话界面——ChatSurface 端口的实现：气泡与输入框。
 *
 * 技术细节：DOM 操作、追赶式打字机、气泡容量与淡出、状态角标的显隐节奏。
 * 领域只知道「显示主人的话」「开始一段回复」「说一句」「提示」「跟随宠物」。
 */

import { clamp, rectContains } from '../../../shared/geometry'
import type {
  BrainStatus,
  ChatSurface,
  Rect,
  ReplySink,
  ScreenPoint,
  Unsubscribe
} from '../../../domain'

/** 屏幕上最多同时显示的气泡数 */
const MAX_VISIBLE_BUBBLES = 2
/** 气泡停留多久后淡出 */
const UTTERANCE_FADE_MS = 9000
const REPLY_FADE_MS = 14000
/** 追赶式打字机：每步间隔与追赶系数（落后越多吐字越快） */
const TYPE_TICK_MS = 26
const TYPE_CATCHUP = 6

const STATUS_TEXT: Record<BrainStatus, string> = {
  online: '大脑已连接',
  connecting: '大脑连接中…',
  offline: '大脑离线，自动重连中…'
}
/** 在线状态只提示片刻 */
const STATUS_ONLINE_LINGER_MS = 2500
const STATUS_FADE_MS = 450

class DomReplySink implements ReplySink {
  private readonly textSpan: HTMLSpanElement
  private readonly dots: HTMLSpanElement
  private buffer = ''
  private shown = 0
  private settled = false
  private timer: number | null = null

  constructor(
    private readonly element: HTMLElement,
    private readonly fade: (element: HTMLElement, delayMs: number) => void
  ) {
    this.dots = document.createElement('span')
    this.dots.className = 'dots'
    this.dots.innerHTML = '<i></i><i></i><i></i>'
    this.textSpan = document.createElement('span')
    this.element.append(this.dots, this.textSpan)
  }

  private tick = (): void => {
    this.timer = null
    if (this.shown >= this.buffer.length) {
      if (this.settled) this.fade(this.element, REPLY_FADE_MS)
      return
    }
    const step = Math.max(1, Math.round((this.buffer.length - this.shown) / TYPE_CATCHUP))
    this.shown = Math.min(this.buffer.length, this.shown + step)
    this.textSpan.textContent = this.buffer.slice(0, this.shown)
    if (this.shown < this.buffer.length || !this.settled) {
      this.timer = window.setTimeout(this.tick, TYPE_TICK_MS)
    } else {
      this.fade(this.element, REPLY_FADE_MS)
    }
  }

  append(chunk: string): void {
    this.buffer += chunk
    this.dots.remove()
    if (this.timer === null) this.tick()
  }

  finish(): void {
    this.settled = true
    this.dots.remove()
    if (this.timer === null) {
      this.shown = this.buffer.length
      this.textSpan.textContent = this.buffer
      this.fade(this.element, REPLY_FADE_MS)
    }
  }

  fail(reason: string): void {
    this.settled = true
    if (this.timer !== null) window.clearTimeout(this.timer)
    this.timer = null
    this.dots.remove()
    this.textSpan.textContent = `（连接出了点问题：${reason}）`
    this.fade(this.element, 6000)
  }
}

export class DomChatSurface implements ChatSurface {
  private readonly bubbleLayer: HTMLElement
  private readonly inputBar: HTMLElement
  private readonly input: HTMLInputElement
  private readonly statusChip: HTMLElement
  private statusTimer: number | null = null
  private sendHandler: ((text: string) => void) | null = null

  constructor() {
    this.bubbleLayer = document.getElementById('bubbles') as HTMLElement
    this.inputBar = document.getElementById('input-bar') as HTMLElement
    this.input = document.getElementById('chat-input') as HTMLInputElement
    this.statusChip = document.getElementById('status-chip') as HTMLElement

    const submit = (): void => {
      const text = this.input.value.trim()
      if (!text) return
      this.input.value = ''
      this.sendHandler?.(text)
    }
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit()
      else if (e.key === 'Escape') this.inputBar.hidden = true
      e.stopPropagation()
    })
    document.getElementById('chat-send')?.addEventListener('click', submit)
  }

  /* ---------- ChatSurface ---------- */

  showUtterance(text: string): void {
    const element = this.addBubble('user')
    element.textContent = text
    this.fadeOut(element, UTTERANCE_FADE_MS)
  }

  beginReply(): ReplySink {
    return new DomReplySink(this.addBubble('assistant'), (el, delay) => this.fadeOut(el, delay))
  }

  say(text: string): void {
    const sink = this.beginReply()
    sink.append(text)
    sink.finish()
  }

  showNotice(text: string): void {
    const element = this.addBubble('assistant')
    element.textContent = text
    this.fadeOut(element, REPLY_FADE_MS)
  }

  showStatus(status: BrainStatus): void {
    this.statusChip.className = status
    this.statusChip.textContent = STATUS_TEXT[status] ?? status
    this.statusChip.hidden = false
    this.statusChip.classList.remove('fading')

    if (this.statusTimer !== null) window.clearTimeout(this.statusTimer)
    if (status === 'online') {
      this.statusTimer = window.setTimeout(() => {
        this.statusChip.classList.add('fading')
        this.statusTimer = window.setTimeout(() => {
          this.statusChip.hidden = true
        }, STATUS_FADE_MS)
      }, STATUS_ONLINE_LINGER_MS)
    }
  }

  onSend(handler: (text: string) => void): Unsubscribe {
    this.sendHandler = handler
    return () => {
      this.sendHandler = null
    }
  }

  openInput(): void {
    this.inputBar.hidden = false
    this.input.focus()
  }

  toggleInput(): void {
    if (this.inputBar.hidden) this.openInput()
    else this.inputBar.hidden = true
  }

  isPointerOverUi(at: ScreenPoint): boolean {
    if (!this.inputBar.hidden && rectContains(at, this.inputBar.getBoundingClientRect(), 6)) {
      return true
    }
    return !this.statusChip.hidden && rectContains(at, this.statusChip.getBoundingClientRect())
  }

  placeNear(rect: Rect): void {
    const centerX = rect.x + rect.width / 2
    const top = rect.y
    const bottom = rect.y + rect.height

    this.bubbleLayer.style.left = `${clamp(centerX, 180, window.innerWidth - 180)}px`
    this.bubbleLayer.style.top = `${Math.max(top - 16, 100)}px`
    this.inputBar.style.left = `${clamp(centerX, 230, window.innerWidth - 230)}px`
    this.inputBar.style.top = `${Math.min(bottom + 22, window.innerHeight - 70)}px`
  }

  /* ---------- 内部 ---------- */

  private addBubble(kind: 'user' | 'assistant'): HTMLElement {
    const element = document.createElement('div')
    element.className = `bubble ${kind}`
    this.bubbleLayer.appendChild(element)
    // 容量裁剪必须同步完成：淡出是异步移除，放在条件里会死循环挂死渲染进程
    while (this.bubbleLayer.children.length > MAX_VISIBLE_BUBBLES) {
      const oldest = this.bubbleLayer.firstElementChild as HTMLElement | null
      if (!oldest) break
      oldest.remove()
    }
    return element
  }

  private fadeOut(element: HTMLElement, delayMs: number): void {
    window.setTimeout(
      () => {
        element.classList.add('fading')
        window.setTimeout(() => element.remove(), STATUS_FADE_MS)
      },
      Math.max(0, delayMs)
    )
  }
}
