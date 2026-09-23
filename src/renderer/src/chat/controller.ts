import type { PetAvatar } from '../avatar/types'
import type { ServerMessage } from '../../../shared/protocol'
import type { AssistantHandle, BubbleLayer } from './bubble'

type ChipState = 'online' | 'offline' | 'connecting'

const CHIP_TEXT: Record<ChipState, string> = {
  online: '大脑已连接',
  connecting: '大脑连接中…',
  offline: '大脑离线，自动重连中…'
}

/**
 * 聊天控制器：串起 输入 → 主进程网关 → 流式气泡 → 形象联动。
 * 一轮未结束前忽略新输入（v1 不做排队）。
 */
export class ChatController {
  private pending = false
  private handle: AssistantHandle | null = null
  private chip: HTMLElement
  private chipTimer: number | null = null

  constructor(
    private getAvatar: () => PetAvatar,
    private bubbles: BubbleLayer
  ) {
    this.chip = document.getElementById('status-chip')!
  }

  send(text: string): void {
    if (this.pending) return
    this.pending = true
    this.getAvatar().setTalking(true)
    this.bubbles.showUser(text)
    this.handle = this.bubbles.beginAssistant()
    window.pet.sendChat(text)
  }

  handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'chat.delta':
        this.handle?.append(msg.delta)
        break
      case 'chat.directive':
        this.getAvatar().setEmotion(msg.emotion ?? 'neutral', msg.motion)
        break
      case 'chat.done':
        this.finish()
        break
      case 'chat.error':
        this.handle?.fail(msg.message || '未知错误')
        this.finish()
        break
      default:
        // tts.chunk 等为 v1 预留，暂不消费
        break
    }
  }

  private finish(): void {
    this.handle?.finish()
    this.handle = null
    this.getAvatar().setTalking(false)
    this.pending = false
  }

  handleStatus(status: string): void {
    const state: ChipState =
      status === 'online' ? 'online' : status === 'connecting' ? 'connecting' : 'offline'
    this.chip.className = state
    this.chip.textContent = CHIP_TEXT[state]
    this.chip.hidden = false
    this.chip.classList.remove('fading')
    if (this.chipTimer) window.clearTimeout(this.chipTimer)
    if (state === 'online') {
      // 在线状态只提示片刻
      this.chipTimer = window.setTimeout(() => {
        this.chip.classList.add('fading')
        this.chipTimer = window.setTimeout(() => {
          this.chip.hidden = true
        }, 450)
      }, 2500)
    }
  }
}
