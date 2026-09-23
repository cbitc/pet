/**
 * 宠物——这一切的主角。
 *
 * 它只知道自己的事：栖在哪里、心情如何、穿着什么形象、正在和主人聊什么。
 * 它的每个动作都返回一串「发生了什么」（领域事件），由运行时去安排外界配合。
 *
 * 这里没有 Electron、没有 Pixi、没有 DOM、没有 WebSocket——
 * 想了解「这个桌宠能做什么、有什么规矩」，读完这一个文件就够了。
 */

import { performanceFor, type Appearance } from './appearance'
import { isOpen, startTurn, appendReply, type Turn } from './conversation'
import { DEFAULT_EMOTION, type Emotion } from './emotion'
import type { DomainEvent, PoseChangeReason } from './events'
import { clampPose, DEFAULT_POSE, isSamePose, type Pose } from './pose'

export interface PetInit {
  /** 初次栖息的位置（来自偏好；缺省为默认位置） */
  readonly pose?: Pose
  readonly mood?: Emotion
  readonly appearance?: Appearance | null
}

export class Pet {
  private currentPose: Pose
  private currentMood: Emotion
  private currentAppearance: Appearance | null
  private turn: Turn | null = null
  private beingMoved = false
  private appearedBefore = false

  constructor(init: PetInit = {}) {
    this.currentPose = clampPose(init.pose ?? DEFAULT_POSE)
    this.currentMood = init.mood ?? DEFAULT_EMOTION
    this.currentAppearance = init.appearance ?? null
  }

  /* ---------- 状态 ---------- */

  get pose(): Pose {
    return this.currentPose
  }

  get mood(): Emotion {
    return this.currentMood
  }

  get appearance(): Appearance | null {
    return this.currentAppearance
  }

  /** 正在说话（口型应当开合） */
  get isSpeaking(): boolean {
    return this.turn !== null
  }

  /** 有一轮对话还没结束 */
  get hasOpenTurn(): boolean {
    return isOpen(this.turn)
  }

  /** 正在被主人挪窝 */
  get isBeingMoved(): boolean {
    return this.beingMoved
  }

  get hasAppeared(): boolean {
    return this.appearedBefore
  }

  /** 当前这一轮对话（供运行时读取主人的话等） */
  get currentTurn(): Turn | null {
    return this.turn
  }

  /* ---------- 行为 ---------- */

  /** 现身：出现在桌面上（重复调用无效果） */
  appear(): DomainEvent[] {
    if (this.appearedBefore) return []
    this.appearedBefore = true
    return [{ type: 'PetAppeared' }]
  }

  /**
   * 主人说了一句话。
   * 若上一轮还没结束，这句话会被忽略——宠物一次只想清楚一件事。
   */
  say(text: string): DomainEvent[] {
    const spoken = text.trim()
    if (!spoken || this.hasOpenTurn) return []

    this.turn = startTurn(spoken)
    return [
      { type: 'OwnerSpoke', text: spoken },
      { type: 'ReplyStarted', forText: spoken }
    ]
  }

  /** 收到一段回复文字 */
  receiveReplyChunk(chunk: string): DomainEvent[] {
    if (!this.turn) return []
    this.turn = appendReply(this.turn, chunk)
    return [{ type: 'ReplyChunk', chunk }]
  }

  /** 一轮回复说完 */
  completeReply(): DomainEvent[] {
    if (!this.turn) return []
    const reply = this.turn.reply
    this.turn = null
    return [{ type: 'ReplyCompleted', reply }]
  }

  /** 这一轮回复出了差错 */
  failReply(reason: string): DomainEvent[] {
    if (!this.turn) return []
    this.turn = null
    return [{ type: 'ReplyFailed', reason }]
  }

  /** 表达心情；cue 可覆盖形象自带的动作提示（来自心智的直接指定） */
  express(mood: Emotion, cue?: string): DomainEvent[] {
    this.currentMood = mood
    return [{ type: 'MoodChanged', mood, cue }]
  }

  /** 被摸了一下（此时不再算作正在挪窝） */
  tap(): DomainEvent[] {
    this.beingMoved = false
    return [{ type: 'PetTapped' }]
  }

  /** 主人开始拖动 */
  beginDrag(): DomainEvent[] {
    this.beingMoved = true
    return []
  }

  /** 挪到新位置（位置没变则什么也不发生） */
  moveTo(pose: Pose, reason: PoseChangeReason = 'drag'): DomainEvent[] {
    const next = clampPose(pose)
    if (isSamePose(next, this.currentPose)) return []

    this.currentPose = next
    return [{ type: 'PetMoved', pose: next, reason }]
  }

  /** 松手：挪窝结束，这个位置值得记住 */
  endDrag(): DomainEvent[] {
    if (!this.beingMoved) return []
    this.beingMoved = false
    return [{ type: 'PetSettled', pose: this.currentPose }]
  }

  /** 回到默认位置 */
  resetPose(): DomainEvent[] {
    return [...this.moveTo(DEFAULT_POSE, 'reset'), { type: 'PetSettled', pose: this.currentPose }]
  }

  /** 换一身形象（null 表示没有可用形象，只能以降级形态出现） */
  changeAppearance(appearance: Appearance | null): DomainEvent[] {
    this.currentAppearance = appearance
    return [{ type: 'AppearanceChanged', appearance }]
  }

  /** 查询：当前形象如何表演某种情绪（供适配器渲染时使用） */
  performanceOf(emotion: Emotion = this.currentMood) {
    return performanceFor(this.currentAppearance, emotion)
  }
}
