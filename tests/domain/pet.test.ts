import { describe, expect, it } from 'vitest'
import { Pet } from '../../src/domain/pet'
import { defineAppearance } from '../../src/domain/appearance'
import { DEFAULT_POSE, POSE_BOUNDS } from '../../src/domain/pose'

const HARU = defineAppearance({
  id: 'haru',
  displayName: 'Haru',
  tapMotion: 'Tap',
  performances: { happy: { expression: 'f03', motion: 'Tap' } }
})

describe('宠物', () => {
  it('现身只发生一次', () => {
    const pet = new Pet()

    expect(pet.appear()).toEqual([{ type: 'PetAppeared' }])
    expect(pet.appear()).toEqual([])
    expect(pet.hasAppeared).toBe(true)
  })

  it('主人说话会产生「主人的话」与「开始等待回复」，并进入说话状态', () => {
    const pet = new Pet()

    expect(pet.say('  你好呀  ')).toEqual([
      { type: 'OwnerSpoke', text: '你好呀' },
      { type: 'ReplyStarted', forText: '你好呀' }
    ])
    expect(pet.isSpeaking).toBe(true)
    expect(pet.hasOpenTurn).toBe(true)
  })

  it('空话不理会', () => {
    const pet = new Pet()

    expect(pet.say('   ')).toEqual([])
    expect(pet.isSpeaking).toBe(false)
  })

  it('一轮未结束前，主人的新话会被忽略（宠物一次只想清楚一件事）', () => {
    const pet = new Pet()
    pet.say('第一句')

    expect(pet.say('第二句')).toEqual([])

    pet.completeReply()
    expect(pet.say('收拾好心情再听')).toHaveLength(2)
  })

  it('回复逐段累加，结束时给出全文', () => {
    const pet = new Pet()
    pet.say('讲个笑话')

    expect(pet.receiveReplyChunk('从前')).toEqual([{ type: 'ReplyChunk', chunk: '从前' }])
    expect(pet.receiveReplyChunk('有座山')).toEqual([{ type: 'ReplyChunk', chunk: '有座山' }])
    expect(pet.completeReply()).toEqual([{ type: 'ReplyCompleted', reply: '从前有座山' }])
    expect(pet.isSpeaking).toBe(false)
    expect(pet.currentTurn).toBeNull()
  })

  it('没有进行中的对话时，回复片段与结束都不会有意料之外的动作', () => {
    const pet = new Pet()

    expect(pet.receiveReplyChunk('迟到的话')).toEqual([])
    expect(pet.completeReply()).toEqual([])
    expect(pet.failReply('迟到的事故')).toEqual([])
  })

  it('回复失败会结束这一轮并保留原因', () => {
    const pet = new Pet()
    pet.say('在吗')

    expect(pet.failReply('连接超时')).toEqual([{ type: 'ReplyFailed', reason: '连接超时' }])
    expect(pet.isSpeaking).toBe(false)
    expect(pet.hasOpenTurn).toBe(false)
  })

  it('表达心情总是产生事件——同一心情重复表达也要再演一次', () => {
    const pet = new Pet()

    expect(pet.express('happy')).toEqual([{ type: 'MoodChanged', mood: 'happy', cue: undefined }])
    expect(pet.express('happy')).toHaveLength(1)
    expect(pet.mood).toBe('happy')
    expect(pet.express('sad', 'Wave')).toEqual([{ type: 'MoodChanged', mood: 'sad', cue: 'Wave' }])
    expect(pet.mood).toBe('sad')
  })

  it('挪窝会夹在活动范围内，且移动时产生「位置变了」', () => {
    const pet = new Pet({ pose: { x: 0.5, y: 0.5, scale: 0.5 } })

    const events = pet.moveTo({ x: 0.9, y: 0.5, scale: 0.5 })

    expect(events).toEqual([
      { type: 'PetMoved', pose: { x: 0.9, y: 0.5, scale: 0.5 }, reason: 'drag' }
    ])
    expect(pet.pose.x).toBe(0.9)

    pet.moveTo({ x: 5, y: 0.5, scale: 0.5 })
    expect(pet.pose.x).toBe(POSE_BOUNDS.x[1])
  })

  it('挪到相同位置不会有任何动静', () => {
    const pet = new Pet({ pose: { x: 0.5, y: 0.5, scale: 0.5 } })

    expect(pet.moveTo({ x: 0.5001, y: 0.5, scale: 0.5 })).toEqual([])
  })

  it('松手只在拖动中才有「落定」', () => {
    const pet = new Pet()

    expect(pet.endDrag()).toEqual([])

    pet.beginDrag()
    expect(pet.isBeingMoved).toBe(true)
    expect(pet.endDrag()).toEqual([{ type: 'PetSettled', pose: pet.pose }])
    expect(pet.isBeingMoved).toBe(false)
  })

  it('被摸之后不再算作正在挪窝', () => {
    const pet = new Pet()
    pet.beginDrag()

    expect(pet.tap()).toEqual([{ type: 'PetTapped' }])
    expect(pet.isBeingMoved).toBe(false)
    expect(pet.endDrag()).toEqual([])
  })

  it('重置位置回到默认姿态，并立刻值得记住', () => {
    const pet = new Pet({ pose: { x: 0.1, y: 0.1, scale: 0.5 } })

    expect(pet.resetPose()).toEqual([
      { type: 'PetMoved', pose: DEFAULT_POSE, reason: 'reset' },
      { type: 'PetSettled', pose: DEFAULT_POSE }
    ])
  })

  it('换形象产生形象变更事件；没有形象也能存活', () => {
    const pet = new Pet()

    expect(pet.changeAppearance(HARU)).toEqual([{ type: 'AppearanceChanged', appearance: HARU }])
    expect(pet.appearance?.id).toBe('haru')
    expect(pet.changeAppearance(null)).toEqual([{ type: 'AppearanceChanged', appearance: null }])
    expect(pet.appearance).toBeNull()
  })

  it('能按心情查当前形象的表演', () => {
    const pet = new Pet({ appearance: HARU })

    expect(pet.performanceOf('happy')).toEqual({ expression: 'f03', cue: 'Tap' })
    expect(pet.performanceOf('sad')).toBeUndefined()
  })
})
