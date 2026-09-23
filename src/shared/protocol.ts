/**
 * 桌宠前端 ⇆ 大脑服务的 WebSocket 消息协议（v1）
 * 契约文档见 docs/brain-protocol.md。
 * 设计原则：后端只下发「文本流 + 结构化指令」，情绪到表情/动作的翻译由前端完成。
 */

export type EmotionName = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised'

export const EMOTIONS: readonly EmotionName[] = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised'
]

/* ---------- 客户端 → 服务端 ---------- */

export interface SessionHello {
  type: 'session.hello'
  /** 应用安装级实例 id */
  clientId: string
  /** 会话 id（同一宠物角色的连续对话） */
  sessionId: string
  persona?: string
}

export interface ChatSend {
  type: 'chat.send'
  text: string
  sessionId: string
  ts: number
}

export type ClientMessage = SessionHello | ChatSend

/* ---------- 服务端 → 客户端 ---------- */

export interface SessionReady {
  type: 'session.ready'
  sessionId: string
}

/** 流式文本增量（UTF-8 安全：按完整字符切片） */
export interface ChatDelta {
  type: 'chat.delta'
  sessionId: string
  delta: string
}

/** 结构化指令：驱动形象的表情/动作，可在流式过程中任意时刻下发 */
export interface ChatDirective {
  type: 'chat.directive'
  sessionId: string
  emotion?: EmotionName
  /** 可选：直接指定动作组名（前端按模型能力兜底，缺省则用情绪映射） */
  motion?: string
}

export interface ChatDone {
  type: 'chat.done'
  sessionId: string
  messageId: string
}

/** TTS 预留：v1 前端收到后忽略；接入语音后由音频管线消费 */
export interface TtsChunk {
  type: 'tts.chunk'
  sessionId: string
  fmt: 'mp3' | 'wav' | 'pcm'
  seq: number
  /** base64 编码的音频分片 */
  audio: string
}

export interface BrainErrorMessage {
  type: 'chat.error'
  sessionId: string
  message: string
}

export type ServerMessage =
  | SessionReady
  | ChatDelta
  | ChatDirective
  | ChatDone
  | TtsChunk
  | BrainErrorMessage
