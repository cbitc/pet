/**
 * 宠物运行时——领域与世界的接线员。
 *
 * 它只做三件事：
 *   1) 把外界发生的事（手势、大脑回话、偏好变更）翻译成对宠物的命令；
 *   2) 把宠物产出的领域事件翻译成对外界的要求（摆姿势、出气泡、落盘……）；
 *   3) 维持少量跨事件的会话状态（当前回复气泡、落盘防抖、降级提示）。
 *
 * 这里没有任何 Electron / Pixi / DOM / WebSocket 细节——只对着 ports.ts 说话。
 * 换渲染引擎或换大脑后端，这个文件一行都不用改。
 */

import { match } from 'ts-pattern'
import { isSamePose, movePose } from '../domain/pose'
import { rectContains } from '../shared/geometry'
import { Pet } from '../domain/pet'
import type { Preferences } from '../domain/preferences'
import { toEmotion } from '../domain/emotion'
import type { DomainEvent } from '../domain/events'
import type {
  BrainChannel,
  ChatSurface,
  DeskGesture,
  DeskSurface,
  PetStage,
  PointerTarget,
  PreferencesStore,
  ReplyMessage,
  ReplySink,
  ScreenPoint,
  Unsubscribe
} from '../domain/ports'

/** 松手后延迟落盘，避免一次拖拽写很多次磁盘 */
const PERSIST_DEBOUNCE_MS = 400
/** 降级提示的重播间隔（宠物需要反复提醒主人「我少了点东西」） */
const NOTICE_REPEAT_MS = 5000

const WELCOME_TEXT = '嗨～我在这里！点我一下就能聊天，拖动可以帮我挪窝哦 (≧▽≦)'

/** 命中宠物时向外扩容的像素（让「摸到边缘」也有反应） */
const HIT_PADDING_PX = 12

export type CancelTimer = () => void
export type Schedule = (fn: () => void, delayMs: number) => CancelTimer

export interface PetRuntimeDeps {
  stage: PetStage
  desk: DeskSurface
  brain: BrainChannel
  chat: ChatSurface
  preferences: PreferencesStore
  /** 可注入的定时器（默认 setTimeout），便于测试落盘防抖与提示重播 */
  schedule?: Schedule
}

export interface PetRuntime {
  /** 让宠物现身并开始生活 */
  start(): Promise<void>
  /** 退场：解除所有订阅、取消定时器 */
  dispose(): void
}

const defaultSchedule: Schedule = (fn, delayMs) => {
  const id = setTimeout(fn, delayMs)
  return () => clearTimeout(id)
}

export function createPetRuntime(deps: PetRuntimeDeps): PetRuntime {
  let disposeInner: (() => void) | null = null

  return {
    async start(): Promise<void> {
      if (disposeInner) return
      disposeInner = await boot(deps)
    },
    dispose(): void {
      disposeInner?.()
      disposeInner = null
    }
  }
}

async function boot(deps: PetRuntimeDeps): Promise<() => void> {
  const schedule = deps.schedule ?? defaultSchedule
  const disposers: Unsubscribe[] = []

  const preferences = await deps.preferences.load()
  const pet = new Pet({ pose: preferences.pose })
  const identity = { sessionId: preferences.sessionId, persona: preferences.persona }

  let reply: ReplySink | null = null
  let cancelPersist: CancelTimer | null = null
  let cancelNotice: CancelTimer | null = null
  let degradedReason: string | null = null
  let disposed = false

  /* ---------- 领域事件 → 外界 ---------- */

  const dispatch = (events: DomainEvent[]): void => {
    for (const event of events) apply(event)
  }

  const apply = (event: DomainEvent): void =>
    match(event)
      .with({ type: 'PetAppeared' }, () => {
        placePet()
        greet()
      })
      .with({ type: 'PetMoved' }, () => placePet())
      .with({ type: 'PetSettled' }, () => persistPoseSoon())
      .with({ type: 'PetTapped' }, () => {
        deps.stage.reactToTouch()
        deps.chat.openInput()
      })
      .with({ type: 'OwnerSpoke' }, (e) => {
        deps.chat.showUtterance(e.text)
        deps.brain.say(e.text)
      })
      .with({ type: 'ReplyStarted' }, () => {
        reply = deps.chat.beginReply()
        deps.stage.setSpeaking(true)
      })
      .with({ type: 'ReplyChunk' }, (e) => reply?.append(e.chunk))
      .with({ type: 'ReplyCompleted' }, () => {
        reply?.finish()
        reply = null
        deps.stage.setSpeaking(false)
      })
      .with({ type: 'ReplyFailed' }, (e) => {
        reply?.fail(e.reason)
        reply = null
        deps.stage.setSpeaking(false)
      })
      .with({ type: 'MoodChanged' }, (e) => deps.stage.express(e.mood, e.cue))
      .with({ type: 'Degraded' }, (e) => {
        degradedReason = e.reason
        // 已经在桌面上的话立刻提醒；还没现身则交给 greet 一起说
        if (pet.hasAppeared) deps.chat.showNotice(e.reason)
      })
      .with({ type: 'AppearanceChanged' }, () => {
        // 形象只在舞台内部生效，这里无需额外动作
      })
      .exhaustive()

  function placePet(): void {
    deps.stage.place(pet.pose)
    deps.chat.placeNear(deps.stage.bounds())
  }

  function persistPoseSoon(): void {
    cancelPersist?.()
    cancelPersist = schedule(() => {
      cancelPersist = null
      void deps.preferences.save({ pose: pet.pose })
    }, PERSIST_DEBOUNCE_MS)
  }

  function greet(): void {
    if (degradedReason) {
      deps.chat.showNotice(degradedReason)
      repeatNotice()
      return
    }
    deps.chat.say(WELCOME_TEXT)
  }

  function repeatNotice(): void {
    if (cancelNotice || disposed) return
    cancelNotice = schedule(() => {
      cancelNotice = null
      if (degradedReason) {
        deps.chat.showNotice(degradedReason)
        repeatNotice()
      }
    }, NOTICE_REPEAT_MS)
  }

  /* ---------- 外界 → 领域命令 ---------- */

  function wearAppearance(appearanceId: string): Promise<void> {
    return (async () => {
      const available = await deps.stage.availableAppearances()
      const chosen = available.find((a) => a.id === appearanceId) ?? available[0] ?? null
      const result = await deps.stage.wear(chosen)

      dispatch(pet.changeAppearance(result.wearing ?? chosen))
      placePet()

      if (result.degraded) {
        dispatch([{ type: 'Degraded', reason: result.degraded }])
      } else {
        // 换上了像样的形象，之前的降级提示不再需要
        degradedReason = null
        cancelNotice?.()
        cancelNotice = null
      }
    })()
  }

  function onGesture(gesture: DeskGesture): void {
    match(gesture)
      .with({ kind: 'hover' }, (g) => {
        deps.desk.setPointerCapture(g.onPet || g.onUi)
        if (g.onPet) deps.stage.lookAt(g.at)
      })
      .with({ kind: 'leave' }, () => deps.desk.setPointerCapture(false))
      .with({ kind: 'tap' }, () => dispatch(pet.tap()))
      .with({ kind: 'dragBegin' }, () => {
        dispatch(pet.beginDrag())
        deps.desk.setPointerCapture(true)
      })
      .with({ kind: 'dragMove' }, (g) => {
        const viewport = deps.desk.viewport()
        const dx = viewport.width > 0 ? g.delta.x / viewport.width : 0
        const dy = viewport.height > 0 ? g.delta.y / viewport.height : 0
        dispatch(pet.moveTo(movePose(pet.pose, dx, dy)))
      })
      .with({ kind: 'dragEnd' }, () => dispatch(pet.endDrag()))
      .exhaustive()
  }

  async function reconcile(next: Preferences): Promise<void> {
    if (!isSamePose(next.pose, pet.pose)) {
      dispatch(pet.moveTo(next.pose, 'restore'))
    }
    if (next.appearanceId !== (pet.appearance?.id ?? '')) {
      await wearAppearance(next.appearanceId)
    }
    if (next.persona !== identity.persona || next.sessionId !== identity.sessionId) {
      identity.persona = next.persona
      identity.sessionId = next.sessionId
      deps.brain.identify({ sessionId: next.sessionId, persona: next.persona })
    }
  }

  /* ---------- 装配 ---------- */

  const hitTest = (at: ScreenPoint): PointerTarget =>
    rectContains(at, deps.stage.bounds(), HIT_PADDING_PX)
      ? 'pet'
      : deps.chat.isPointerOverUi(at)
        ? 'ui'
        : 'none'

  deps.desk.setHitTest(hitTest)
  disposers.push(deps.desk.onGesture(onGesture))
  disposers.push(
    deps.desk.onViewportChanged(() => {
      placePet()
    })
  )

  disposers.push(
    deps.chat.onSend((text) => {
      dispatch(pet.say(text))
    })
  )

  const handleReply = (message: ReplyMessage): void =>
    match(message)
      .with({ kind: 'chunk' }, (m) => dispatch(pet.receiveReplyChunk(m.text)))
      .with({ kind: 'mood' }, (m) => dispatch(pet.express(toEmotion(m.emotion), m.cue)))
      .with({ kind: 'done' }, () => dispatch(pet.completeReply()))
      .with({ kind: 'error' }, (m) => dispatch(pet.failReply(m.reason)))
      .exhaustive()

  disposers.push(deps.brain.onReply(handleReply))
  disposers.push(deps.brain.onStatus((status) => deps.chat.showStatus(status)))

  disposers.push(
    deps.preferences.onChange((next) => {
      void reconcile(next)
    })
  )

  deps.brain.identify({ sessionId: preferences.sessionId, persona: preferences.persona })
  await wearAppearance(preferences.appearanceId)
  dispatch(pet.appear())

  return () => {
    disposed = true
    cancelPersist?.()
    cancelNotice?.()
    for (const off of disposers.splice(0)) off()
  }
}
