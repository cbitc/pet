/**
 * 端口——宠物需要外部世界提供的六件事。
 *
 * 这份文件同时是「业务需求清单」：读完 domain/ 想知道这个宠物需要什么才能活，
 * 看这里就够了。每一个端口的实现都在 adapters/ 里（Electron / Pixi / DOM / WebSocket），
 * 领域只依赖这些形状，不依赖任何实现。
 */

import type { Appearance } from './appearance'
import type { Emotion } from './emotion'
import type { Rect, ScreenPoint, Viewport } from './geometry'
import type { Pose } from './pose'
import type { Preferences } from './preferences'

// 点/矩形/视口与其上工具是领域通用语言，定义在 geometry.ts，
// 这里原样转出，保证既有 `from './ports'` 的引用不受影响。
export { clamp, rectContains } from './geometry'
export type { Rect, ScreenPoint, Viewport } from './geometry'

export type Unsubscribe = () => void

/* ---------- 形象舞台：让宠物「有形」 ---------- */

export interface WearResult {
  /** 真正穿上的形象（可能因降级而为 null） */
  readonly wearing?: Appearance | null
  /** 无法按预期呈现时的原因（给人看的提示语） */
  readonly degraded?: string
}

export interface PetStage {
  /** 有哪些形象可以穿（形象资产清单，含各自表演表） */
  availableAppearances(): Promise<Appearance[]>
  /** 穿上指定形象；资产缺失或损坏时自行降级，并说明原因 */
  wear(appearance: Appearance | null): Promise<WearResult>
  /** 表演某种情绪（cue 可覆盖形象自带的动作提示） */
  express(mood: Emotion, cue?: string): void
  /** 说话中：口型应当开合 */
  setSpeaking(speaking: boolean): void
  /** 看向某处（眼睛跟随） */
  lookAt(at: ScreenPoint): void
  /** 被触摸时的反应（如播放 Tap 动作） */
  reactToTouch(): void
  /** 摆放到某个栖息姿态 */
  place(pose: Pose): void
  /** 当前占用的屏幕范围（全局像素坐标，供命中检测与气泡锚定） */
  bounds(): Rect
}

/* ---------- 桌面：宠物与主人指针、视口之间的边界 ---------- */

/** 指针落在哪里：宠物身上 / 界面部件上 / 空处（空处要放行点击） */
export type PointerTarget = 'pet' | 'ui' | 'none'

/**
 * 桌面手势——已经过识别的主人意图。
 * 「位移小于阈值算点击」这类指针惯用判定留在适配器里，领域只收到语义结果。
 */
export type DeskGesture =
  | { readonly kind: 'hover'; readonly at: ScreenPoint; readonly onPet: boolean; readonly onUi: boolean }
  | { readonly kind: 'leave' }
  | { readonly kind: 'tap' }
  | { readonly kind: 'dragBegin' }
  | { readonly kind: 'dragMove'; readonly delta: ScreenPoint }
  | { readonly kind: 'dragEnd' }

export interface DeskSurface {
  onGesture(handler: (gesture: DeskGesture) => void): Unsubscribe
  /** 告知适配器如何判定指针落点（由运行时结合舞台范围与界面部件合成） */
  setHitTest(hitTest: (at: ScreenPoint) => PointerTarget): void
  /** 捕获指针＝不漏点击；释放＝点击落到下层应用（「不打扰」的实现） */
  setPointerCapture(captured: boolean): void
  viewport(): Viewport
  onViewportChanged(handler: (viewport: Viewport) => void): Unsubscribe
}

/* ---------- 大脑信道：宠物的心智 ---------- */

export type BrainStatus = 'connecting' | 'online' | 'offline'

/** 心智发回的回复消息（原始语义，情绪值未经校验） */
export type ReplyMessage =
  | { readonly kind: 'chunk'; readonly text: string }
  | { readonly kind: 'mood'; readonly emotion: unknown; readonly cue?: string }
  | { readonly kind: 'done' }
  | { readonly kind: 'error'; readonly reason: string }

/** 宠物向心智自我介绍的身份 */
export interface PetIdentity {
  readonly sessionId: string
  readonly persona: string
}

export interface BrainChannel {
  /** 告知心智「我是谁、什么性格」（连接建立后由适配器随会话握手发出） */
  identify(identity: PetIdentity): void
  /** 替宠物把话说给心智听 */
  say(text: string): void
  onReply(handler: (message: ReplyMessage) => void): Unsubscribe
  onStatus(handler: (status: BrainStatus) => void): Unsubscribe
}

/* ---------- 对话界面：气泡与输入 ---------- */

export interface ReplySink {
  append(chunk: string): void
  finish(): void
  fail(reason: string): void
}

export interface ChatSurface {
  /** 主人的话（主人侧气泡） */
  showUtterance(text: string): void
  /** 开始一段回复，返回流式写入句柄 */
  beginReply(): ReplySink
  /** 宠物直接说一句（问候、闲聊，非流式） */
  say(text: string): void
  /** 提示与告警（降级、连接问题） */
  showNotice(text: string): void
  /** 心智连接状态角标 */
  showStatus(status: BrainStatus): void
  /** 主人从输入框发来一句话 */
  onSend(handler: (text: string) => void): Unsubscribe
  openInput(): void
  toggleInput(): void
  /** 输入框等界面部件是否遮在某点之上（用于命中检测） */
  isPointerOverUi(at: ScreenPoint): boolean
  /** 让气泡与输入条跟随宠物（传入宠物当前占用的屏幕范围） */
  placeNear(rect: Rect): void
}

/* ---------- 偏好存储 ---------- */

export interface PreferencesStore {
  load(): Promise<Preferences>
  save(patch: Partial<Preferences>): Promise<void>
  /** 偏好被其他入口（托盘、设置页）改动时通知 */
  onChange(handler: (preferences: Preferences) => void): Unsubscribe
}
