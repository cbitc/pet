import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type { AppConfig } from '../../contracts/app-config'
import type { ClientMessage, ServerMessage } from '../../contracts/wire-protocol'
import type { BrainStatus } from '../../domain/ports'
import type { MockBrainHandle } from './mock-brain'
import { startMockBrain } from './mock-brain'

/**
 * 大脑网关：主进程内唯一的对外 WS 客户端。
 * mock 模式下连接内置 Mock 大脑（真实 WS 回环），remote 模式连接配置的后端服务。
 * 指数退避自动重连；状态与消息经 IPC 转发给渲染进程。
 */
export class BrainGateway extends EventEmitter {
  private ws: WebSocket | null = null
  private mock: MockBrainHandle | null = null
  private retryCount = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private stopped = true
  private connecting = false

  constructor(private getConfig: () => AppConfig) {
    super()
    this.setMaxListeners(20)
  }

  /** 事件：'status' (BrainStatus)、'message' (ServerMessage) */

  start(): void {
    this.stopped = false
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.closeSocket()
    this.closeMock()
  }

  restart(): void {
    this.stop()
    this.start()
  }

  dispose(): void {
    this.stop()
    this.removeAllListeners()
  }

  sendChat(text: string): void {
    const cfg = this.getConfig()
    this.send({ type: 'chat.send', text, sessionId: cfg.sessionId, ts: Date.now() })
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private closeSocket(): void {
    if (this.ws) {
      this.ws.removeAllListeners()
      const ws = this.ws
      this.ws = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    }
  }

  private closeMock(): void {
    if (this.mock) {
      this.mock.close()
      this.mock = null
    }
  }

  private async resolveUrl(): Promise<string> {
    const cfg = this.getConfig()
    if (cfg.brain.mode === 'remote') {
      this.closeMock()
      return cfg.brain.url
    }
    if (!this.mock) this.mock = await startMockBrain()
    return this.mock.url
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting || this.ws) return
    this.connecting = true
    try {
      const url = await this.resolveUrl()
      if (this.stopped) return
      this.emit('status', 'connecting' satisfies BrainStatus)
      const ws = new WebSocket(url)
      this.ws = ws

      ws.on('open', () => {
        if (this.ws !== ws) return
        this.retryCount = 0
        const cfg = this.getConfig()
        this.send({
          type: 'session.hello',
          clientId: 'desktop-pet',
          sessionId: cfg.sessionId,
          persona: cfg.brain.persona
        })
        this.emit('status', 'online' satisfies BrainStatus)
      })

      ws.on('message', (data) => {
        if (this.ws !== ws) return
        try {
          const msg = JSON.parse(String(data)) as ServerMessage
          if (typeof msg?.type === 'string') this.emit('message', msg)
        } catch {
          // 非 JSON 帧直接忽略
        }
      })

      const onDown = (): void => {
        if (this.ws !== ws) return
        this.closeSocket()
        this.emit('status', 'offline' satisfies BrainStatus)
        this.scheduleReconnect()
      }
      ws.on('close', onDown)
      ws.on('error', onDown)
    } catch {
      this.emit('status', 'offline' satisfies BrainStatus)
      this.scheduleReconnect()
    } finally {
      this.connecting = false
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = Math.min(1000 * 2 ** this.retryCount, 15000) + Math.random() * 500
    this.retryCount += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }
}
