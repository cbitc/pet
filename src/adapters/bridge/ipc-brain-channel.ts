/**
 * IPC 大脑信道——BrainChannel 端口的渲染侧实现。
 *
 * 宠物的"心智"其实住在主进程后面（那里才有网络与密钥），
 * 这里只通过 preload 白名单通信：把话递过去、把回话接回来。
 */

import { match } from 'ts-pattern'
import type { BrainChannel, BrainStatus, PetIdentity, ReplyMessage, Unsubscribe } from '../../domain'
import { IPC } from '../../contracts/ipc'
import { BrainInboundSchema } from '../../contracts/schemas'

/** preload 暴露的桥形状（见 contracts 与 preload 入口） */
export interface BrainBridge {
  sendChat(text: string): void
  on(event: typeof IPC.brainMessage, handler: (payload: unknown) => void): Unsubscribe
  on(event: typeof IPC.brainStatus, handler: (payload: unknown) => void): Unsubscribe
}

const isStatus = (value: unknown): value is BrainStatus =>
  value === 'connecting' || value === 'online' || value === 'offline'

/** 把主进程转来的原始消息翻译成领域语义（未知形状一律忽略） */
export function toReplyMessage(raw: unknown): ReplyMessage | null {
  const parsed = BrainInboundSchema.safeParse(raw)
  if (!parsed.success) return null

  return match(parsed.data)
    .with({ type: 'chat.delta' }, (m): ReplyMessage => ({ kind: 'chunk', text: m.delta }))
    .with(
      { type: 'chat.directive' },
      (m): ReplyMessage => ({ kind: 'mood', emotion: m.emotion, cue: m.motion })
    )
    .with({ type: 'chat.done' }, (): ReplyMessage => ({ kind: 'done' }))
    .with(
      { type: 'chat.error' },
      (m): ReplyMessage => ({ kind: 'error', reason: m.message || '未知错误' })
    )
    .exhaustive()
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
    return this.bridge.on(IPC.brainMessage, (raw) => {
      const message = toReplyMessage(raw)
      if (message) handler(message)
    })
  }

  onStatus(handler: (status: BrainStatus) => void): Unsubscribe {
    return this.bridge.on(IPC.brainStatus, (raw) => {
      if (isStatus(raw)) handler(raw)
    })
  }
}
