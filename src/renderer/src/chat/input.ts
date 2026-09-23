function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export class ChatInput {
  private bar: HTMLElement
  private input: HTMLInputElement

  constructor(onSend: (text: string) => void) {
    this.bar = document.getElementById('input-bar')!
    this.input = document.getElementById('chat-input') as HTMLInputElement

    const submit = (): void => {
      const text = this.input.value.trim()
      if (!text) return
      this.input.value = ''
      onSend(text)
    }
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit()
      else if (e.key === 'Escape') this.hide()
      e.stopPropagation()
    })
    document.getElementById('chat-send')!.addEventListener('click', submit)
  }

  toggle(forceShow?: boolean): void {
    const show = forceShow ?? this.bar.hidden
    this.bar.hidden = !show
    if (show) this.input.focus()
  }

  show(): void {
    this.toggle(true)
  }

  hide(): void {
    this.bar.hidden = true
  }

  get visible(): boolean {
    return !this.bar.hidden
  }

  /** 输入条锚定在宠物脚底下方（全局坐标） */
  positionAt(x: number, y: number): void {
    this.bar.style.left = `${clamp(x, 230, window.innerWidth - 230)}px`
    this.bar.style.top = `${Math.min(y, window.innerHeight - 70)}px`
  }
}
