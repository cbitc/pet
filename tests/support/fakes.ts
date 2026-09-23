/**
 * 测试替身——六个端口的假实现。
 * 只记录「运行时对它做了什么」，不做任何真实的技术动作（不画图、不连网、不写盘）。
 */

import {
  DEFAULT_PREFERENCES,
  defineAppearance,
  type Appearance,
  type AppearanceSpec,
  type BrainChannel,
  type BrainStatus,
  type ChatSurface,
  type DeskGesture,
  type DeskSurface,
  type Emotion,
  type PetIdentity,
  type PetStage,
  type PointerTarget,
  type Pose,
  type Preferences,
  type PreferencesStore,
  type Rect,
  type ReplyMessage,
  type ReplySink,
  type ScreenPoint,
  type Viewport,
  type WearResult,
  type Unsubscribe
} from '../../src/domain'
import { createPetRuntime, type PetRuntime } from '../../src/app/pet-runtime'

export function appearance(id: string, performances: AppearanceSpec['performances'] = {}): Appearance {
  return defineAppearance({ id, displayName: id, performances })
}

/* ---------- 形象舞台 ---------- */

export class FakeStage implements PetStage {
  readonly worn: (Appearance | null)[] = []
  readonly placements: Pose[] = []
  readonly expressions: { mood: Emotion; cue?: string }[] = []
  readonly speakingLog: boolean[] = []
  readonly looks: ScreenPoint[] = []
  touches = 0

  available: Appearance[] = []
  /** 设置后 wear() 一律以降级收场 */
  degradeWith: string | undefined
  boundsRect: Rect = { x: 0, y: 0, width: 200, height: 300 }

  async availableAppearances(): Promise<Appearance[]> {
    return this.available
  }

  async wear(target: Appearance | null): Promise<WearResult> {
    this.worn.push(target)
    if (this.degradeWith) return { wearing: null, degraded: this.degradeWith }
    return { wearing: target }
  }

  express(mood: Emotion, cue?: string): void {
    this.expressions.push({ mood, cue })
  }

  setSpeaking(speaking: boolean): void {
    this.speakingLog.push(speaking)
  }

  lookAt(at: ScreenPoint): void {
    this.looks.push(at)
  }

  reactToTouch(): void {
    this.touches += 1
  }

  place(pose: Pose): void {
    this.placements.push(pose)
  }

  bounds(): Rect {
    return this.boundsRect
  }

  get lastPlacement(): Pose | undefined {
    return this.placements[this.placements.length - 1]
  }
}

/* ---------- 桌面 ---------- */

export class FakeDesk implements DeskSurface {
  hitTest: ((at: ScreenPoint) => PointerTarget) | null = null
  readonly captureLog: boolean[] = []
  viewportSize: Viewport = { width: 1000, height: 800 }

  private gestureHandler: ((gesture: DeskGesture) => void) | null = null
  private viewportHandler: ((viewport: Viewport) => void) | null = null

  onGesture(handler: (gesture: DeskGesture) => void): Unsubscribe {
    this.gestureHandler = handler
    return () => {
      this.gestureHandler = null
    }
  }

  setHitTest(hitTest: (at: ScreenPoint) => PointerTarget): void {
    this.hitTest = hitTest
  }

  setPointerCapture(captured: boolean): void {
    this.captureLog.push(captured)
  }

  viewport(): Viewport {
    return this.viewportSize
  }

  onViewportChanged(handler: (viewport: Viewport) => void): Unsubscribe {
    this.viewportHandler = handler
    return () => {
      this.viewportHandler = null
    }
  }

  /* 以下为测试驱动手段 */

  gesture(gesture: DeskGesture): void {
    this.gestureHandler?.(gesture)
  }

  resize(viewport: Viewport): void {
    this.viewportSize = viewport
    this.viewportHandler?.(viewport)
  }

  hit(at: ScreenPoint): PointerTarget {
    return this.hitTest ? this.hitTest(at) : 'none'
  }
}

/* ---------- 大脑信道 ---------- */

export class FakeBrain implements BrainChannel {
  identity: PetIdentity | null = null
  readonly spoken: string[] = []

  private replyHandler: ((message: ReplyMessage) => void) | null = null
  private statusHandler: ((status: BrainStatus) => void) | null = null

  identify(identity: PetIdentity): void {
    this.identity = identity
  }

  say(text: string): void {
    this.spoken.push(text)
  }

  onReply(handler: (message: ReplyMessage) => void): Unsubscribe {
    this.replyHandler = handler
    return () => {
      this.replyHandler = null
    }
  }

  onStatus(handler: (status: BrainStatus) => void): Unsubscribe {
    this.statusHandler = handler
    return () => {
      this.statusHandler = null
    }
  }

  reply(message: ReplyMessage): void {
    this.replyHandler?.(message)
  }

  status(status: BrainStatus): void {
    this.statusHandler?.(status)
  }
}

/* ---------- 对话界面 ---------- */

export class RecordingSink implements ReplySink {
  text = ''
  finished = false
  failure: string | null = null

  append(chunk: string): void {
    this.text += chunk
  }

  finish(): void {
    this.finished = true
  }

  fail(reason: string): void {
    this.failure = reason
  }
}

export class FakeChat implements ChatSurface {
  readonly utterances: string[] = []
  readonly spoken: string[] = []
  readonly notices: string[] = []
  readonly statuses: BrainStatus[] = []
  readonly placed: Rect[] = []
  readonly sinks: RecordingSink[] = []
  opened = 0
  toggled = 0
  uiZone: Rect | null = null

  private sendHandler: ((text: string) => void) | null = null

  showUtterance(text: string): void {
    this.utterances.push(text)
  }

  beginReply(): ReplySink {
    const sink = new RecordingSink()
    this.sinks.push(sink)
    return sink
  }

  say(text: string): void {
    this.spoken.push(text)
  }

  showNotice(text: string): void {
    this.notices.push(text)
  }

  showStatus(status: BrainStatus): void {
    this.statuses.push(status)
  }

  onSend(handler: (text: string) => void): Unsubscribe {
    this.sendHandler = handler
    return () => {
      this.sendHandler = null
    }
  }

  openInput(): void {
    this.opened += 1
  }

  toggleInput(): void {
    this.toggled += 1
  }

  isPointerOverUi(at: ScreenPoint): boolean {
    const zone = this.uiZone
    if (!zone) return false
    return at.x >= zone.x && at.x <= zone.x + zone.width && at.y >= zone.y && at.y <= zone.y + zone.height
  }

  placeNear(rect: Rect): void {
    this.placed.push(rect)
  }

  /* 以下为测试驱动手段 */

  send(text: string): void {
    this.sendHandler?.(text)
  }

  get lastSink(): RecordingSink | undefined {
    return this.sinks[this.sinks.length - 1]
  }
}

/* ---------- 偏好存储 ---------- */

export class FakePreferences implements PreferencesStore {
  readonly saved: Partial<Preferences>[] = []
  current: Preferences

  private changeHandler: ((preferences: Preferences) => void) | null = null

  constructor(initial: Partial<Preferences> = {}) {
    this.current = { ...DEFAULT_PREFERENCES, ...initial }
  }

  async load(): Promise<Preferences> {
    return this.current
  }

  async save(patch: Partial<Preferences>): Promise<void> {
    this.saved.push(patch)
    this.current = { ...this.current, ...patch }
  }

  onChange(handler: (preferences: Preferences) => void): Unsubscribe {
    this.changeHandler = handler
    return () => {
      this.changeHandler = null
    }
  }

  change(next: Partial<Preferences>): void {
    this.current = { ...this.current, ...next }
    this.changeHandler?.(this.current)
  }
}

/* ---------- 可控定时器 ---------- */

export class FakeScheduler {
  private tasks: { fn: () => void; delay: number }[] = []

  readonly schedule = (fn: () => void, delay: number): (() => void) => {
    const task = { fn, delay }
    this.tasks.push(task)
    return () => {
      this.tasks = this.tasks.filter((t) => t !== task)
    }
  }

  /** 触发当前所有待办（新排入的留到下次） */
  fire(): void {
    const pending = [...this.tasks]
    this.tasks = []
    for (const task of pending) task.fn()
  }

  get pending(): number {
    return this.tasks.length
  }

  delayOfLast(): number | undefined {
    return this.tasks[this.tasks.length - 1]?.delay
  }
}

/* ---------- 装配 ---------- */

/** 等异步链（reconcile → wear → …）跑完：让出若干轮事件循环 */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export interface Harness {
  stage: FakeStage
  desk: FakeDesk
  brain: FakeBrain
  chat: FakeChat
  preferences: FakePreferences
  scheduler: FakeScheduler
  runtime: PetRuntime
}

export function harness(preferences: Partial<Preferences> = {}): Harness {
  const stage = new FakeStage()
  const desk = new FakeDesk()
  const brain = new FakeBrain()
  const chat = new FakeChat()
  const prefs = new FakePreferences(preferences)
  const scheduler = new FakeScheduler()
  const runtime = createPetRuntime({
    stage,
    desk,
    brain,
    chat,
    preferences: prefs,
    schedule: scheduler.schedule
  })
  return { stage, desk, brain, chat, preferences: prefs, scheduler, runtime }
}
