/**
 * IPC 大脑信道——BrainChannel 端口的渲染侧实现。
 *
 * 宠物的"心智"其实住在主进程后面（那里才有网络与密钥），
 * 这里只通过 preload 白名单通信：把话递过去、把回话接回来。
 */

import type { BrainChannel, BrainStatus, PetIdentity, ReplyMessage, Unsubscribe } from '../../domain'

/** preload 暴露的桥形状（见 contracts 与 preload 入口） */
export interface BrainBridge {
  sendChat(text: string): void
  on(event: 'brain:message', handler: (payload: unknown) => void): Unsubscribe
  on(event: 'brain:status', handler: (payload: unknown) => void): Unsubscribe
}

const isStatus = (value: unknown): value is BrainStatus =>
  value === 'connecting' || value === 'online' || value === 'offline'

/** 把主进程转来的原始消息翻译成领域语义（未知形状一律忽略） */
export function toReplyMessage(raw: unknown): ReplyMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const message = raw as { type?: unknown; delta?: unknown; emotion?: unknown; motion?: unknown; message?: unknown }

  switch (message.type) {
    case 'chat.delta':
      return typeof message.delta === 'string' ? { kind: 'chunk', text: message.delta } : null
    case 'chat.directive':
      return {
        kind: 'mood',
        emotion: message.emotion,
        cue: typeof message.motion === 'string' ? message.motion : undefined
      }
    case 'chat.done':
      return { kind: 'done' }
    case 'chat.error':
      return {
        kind: 'error',
        reason: typeof message.message === 'string' && message.message ? message.message : '未知错误'
      }
    default:
      // tts.chunk 等为后续预留，暂时不消费
      return null
  }
}

export class IpcBrainChannel implements BrainChannel {
  constructor(private readonly bridge: BrainBridge) {}

  /**
   * 身份不需要单独通道：会话身份与人设都存在偏好里，
   * 主进程的心智连接（BrainGateway）在握手时直接读配置发送。
   * 这里刻意什么也不做，避免与真相源重复。
   */
  identify(_identity: PetIdentity): void {
    // 见上：由壳（主进程）在连接握手时处理
  }

  say(text: string): void {
    this.bridge.sendChat(text)
  }

  onReply(handler: (message: ReplyMessage) => void): Unsubscribe {
    return this.bridge.on('brain:message', (raw) => {
      const message = toReplyMessage(raw)
      if (message) handler(message)
    })
  }

  onStatus(handler: (status: BrainStatus) => void): Unsubscribe {
    return this.bridge.on('brain:status', (raw) => {
      if (isStatus(raw)) handler(raw)
    })
  }
}
