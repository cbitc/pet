import { describe, expect, it } from 'vitest'
import { appearance, flush, harness } from '../support/fakes'

describe('宠物运行时：现身', () => {
  it('现身时穿上偏好里的形象、摆在记忆位置、并打招呼', async () => {
    const h = harness({ appearanceId: 'haru', pose: { x: 0.3, y: 0.4, scale: 0.5 } })
    h.stage.available = [appearance('haru')]

    await h.runtime.start()

    expect(h.stage.worn.map((a) => a?.id)).toEqual(['haru'])
    expect(h.stage.lastPlacement).toEqual({ x: 0.3, y: 0.4, scale: 0.5 })
    expect(h.chat.spoken).toHaveLength(1)
    expect(h.chat.spoken[0]).toContain('点我')
    expect(h.brain.identity).toEqual({
      sessionId: h.preferences.current.sessionId,
      persona: h.preferences.current.persona
    })
  })

  it('偏好里的形象不存在时，穿第一件可用形象', async () => {
    const h = harness({ appearanceId: '不存在的形象' })
    h.stage.available = [appearance('miku'), appearance('haru')]

    await h.runtime.start()

    expect(h.stage.worn[0]?.id).toBe('miku')
  })

  it('没有可用形象时降级：不崩溃，并提示主人', async () => {
    const h = harness()
    h.stage.available = []
    h.stage.degradeWith = '未找到 Live2D 模型，当前为占位形象'

    await h.runtime.start()

    expect(h.chat.notices).toEqual(['未找到 Live2D 模型，当前为占位形象'])
    // 降级提示会周期性重播，且不是问候语
    expect(h.chat.spoken).toEqual([])
    expect(h.scheduler.pending).toBe(1)
  })

  it('降级提示会反复提醒，直到换上像样的形象', async () => {
    const h = harness()
    h.stage.available = []
    h.stage.degradeWith = '缺少 Cubism Core'

    await h.runtime.start()
    h.scheduler.fire()
    expect(h.chat.notices).toHaveLength(2)

    h.stage.degradeWith = undefined
    h.stage.available = [appearance('haru')]
    h.preferences.change({ appearanceId: 'haru' })

    await flush()
    const afterWear = h.chat.notices.length
    expect(h.scheduler.pending).toBe(0)
    expect(afterWear).toBe(2)
  })
})

describe('宠物运行时：挪窝与触摸', () => {
  it('挪窝改变摆放位置，松手后延迟落盘', async () => {
    const h = harness({ pose: { x: 0.5, y: 0.5, scale: 0.5 } })
    h.stage.available = [appearance('haru')]
    h.desk.viewportSize = { width: 1000, height: 500 }
    await h.runtime.start()
    const before = h.stage.placements.length

    h.desk.gesture({ kind: 'dragBegin' })
    h.desk.gesture({ kind: 'dragMove', delta: { x: 100, y: 50 } })

    expect(h.stage.lastPlacement).toEqual({ x: 0.6, y: 0.6, scale: 0.5 })
    expect(h.stage.placements.length).toBeGreaterThan(before)

    h.desk.gesture({ kind: 'dragEnd' })
    expect(h.scheduler.pending).toBe(1)

    h.scheduler.fire()
    expect(h.preferences.saved).toEqual([{ pose: { x: 0.6, y: 0.6, scale: 0.5 } }])
  })

  it('连续挪窝只落盘一次（防抖）', async () => {
    const h = harness()
    h.stage.available = [appearance('haru')]
    await h.runtime.start()

    h.desk.gesture({ kind: 'dragBegin' })
    h.desk.gesture({ kind: 'dragMove', delta: { x: 10, y: 0 } })
    h.desk.gesture({ kind: 'dragMove', delta: { x: 10, y: 0 } })
    h.desk.gesture({ kind: 'dragMove', delta: { x: 10, y: 0 } })
    h.desk.gesture({ kind: 'dragEnd' })

    expect(h.scheduler.pending).toBe(1)
    h.scheduler.fire()
    expect(h.preferences.saved).toHaveLength(1)
  })

  it('被摸一下：形象给出反应，输入框打开', async () => {
    const h = harness()
    h.stage.available = [appearance('haru')]
    await h.runtime.start()

    h.desk.gesture({ kind: 'tap' })

    expect(h.stage.touches).toBe(1)
    expect(h.chat.opened).toBe(1)
  })

  it('悬停宠物身上会捕获指针并看过去；移到空处则放开指针', async () => {
    const h = harness()
    h.stage.available = [appearance('haru')]
    await h.runtime.start()

    h.desk.gesture({ kind: 'hover', at: { x: 10, y: 20 }, onPet: true, onUi: false })
    expect(h.stage.looks).toEqual([{ x: 10, y: 20 }])
    expect(h.desk.captureLog.at(-1)).toBe(true)

    h.desk.gesture({ kind: 'hover', at: { x: 900, y: 900 }, onPet: false, onUi: false })
    expect(h.desk.captureLog.at(-1)).toBe(false)

    h.desk.gesture({ kind: 'leave' })
    expect(h.desk.captureLog.at(-1)).toBe(false)
  })

  it('悬停在界面部件上也会捕获指针（否则输入框点不到）', async () => {
    const h = harness()
    h.stage.available = [appearance('haru')]
    await h.runtime.start()

    h.desk.gesture({ kind: 'hover', at: { x: 5, y: 5 }, onPet: false, onUi: true })

    expect(h.desk.captureLog.at(-1)).toBe(true)
    expect(h.stage.looks).toEqual([])
  })
})

describe('宠物运行时：对话', () => {
  async function talkingHarness() {
    const h = harness()
    h.stage.available = [appearance('haru')]
    await h.runtime.start()
    return h
  }

  it('主人发话：气泡出现、话传给心智、口型开始动', async () => {
    const h = await talkingHarness()

    h.chat.send('讲个笑话')

    expect(h.chat.utterances).toEqual(['讲个笑话'])
    expect(h.brain.spoken).toEqual(['讲个笑话'])
    expect(h.stage.speakingLog.at(-1)).toBe(true)
    expect(h.chat.lastSink).toBeDefined()
  })

  it('回复流式写入气泡，心跳/情绪指令先于文字也能生效', async () => {
    const h = await talkingHarness()
    h.chat.send('你好')

    h.brain.reply({ kind: 'mood', emotion: 'happy' })
    h.brain.reply({ kind: 'chunk', text: '嗨' })
    h.brain.reply({ kind: 'chunk', text: '～' })

    expect(h.stage.expressions.at(-1)).toEqual({ mood: 'happy', cue: undefined })
    expect(h.chat.lastSink?.text).toBe('嗨～')
  })

  it('心智指定动作提示时覆盖形象默认表演', async () => {
    const h = await talkingHarness()

    h.brain.reply({ kind: 'mood', emotion: 'sad', cue: 'Wave' })

    expect(h.stage.expressions.at(-1)).toEqual({ mood: 'sad', cue: 'Wave' })
  })

  it('不认识的情绪标签收拢为 neutral（不把未知值透传给形象）', async () => {
    const h = await talkingHarness()

    h.brain.reply({ kind: 'mood', emotion: '睡眼惺忪' })

    expect(h.stage.expressions.at(-1)?.mood).toBe('neutral')
  })

  it('一轮结束：气泡收尾、口型停下', async () => {
    const h = await talkingHarness()
    h.chat.send('你好')
    h.brain.reply({ kind: 'chunk', text: '嗨' })

    h.brain.reply({ kind: 'done' })

    expect(h.chat.lastSink?.finished).toBe(true)
    expect(h.stage.speakingLog.at(-1)).toBe(false)
  })

  it('一轮失败：气泡给出原因，口型停下', async () => {
    const h = await talkingHarness()
    h.chat.send('你好')

    h.brain.reply({ kind: 'error', reason: '连接超时' })

    expect(h.chat.lastSink?.failure).toBe('连接超时')
    expect(h.stage.speakingLog.at(-1)).toBe(false)
  })

  it('一轮未结束前，主人的新话被忽略（气泡与心智都收不到）', async () => {
    const h = await talkingHarness()
    h.chat.send('第一句')

    h.chat.send('第二句')

    expect(h.chat.utterances).toEqual(['第一句'])
    expect(h.brain.spoken).toEqual(['第一句'])
  })

  it('一轮结束后可以继续聊', async () => {
    const h = await talkingHarness()
    h.chat.send('第一句')
    h.brain.reply({ kind: 'done' })

    h.chat.send('第二句')

    expect(h.brain.spoken).toEqual(['第一句', '第二句'])
  })

  it('心智连接状态直接反映到界面角标', async () => {
    const h = await talkingHarness()

    h.brain.status('connecting')
    h.brain.status('online')
    h.brain.status('offline')

    expect(h.chat.statuses).toEqual(['connecting', 'online', 'offline'])
  })
})

describe('宠物运行时：偏好变更与窗口变化', () => {
  it('别处改了栖息位置，宠物会挪过去', async () => {
    const h = harness()
    h.stage.available = [appearance('haru')]
    await h.runtime.start()

    h.preferences.change({ pose: { x: 0.2, y: 0.3, scale: 0.4 } })
    await Promise.resolve()

    expect(h.stage.lastPlacement).toEqual({ x: 0.2, y: 0.3, scale: 0.4 })
  })

  it('别处换了形象，宠物会换装', async () => {
    const h = harness()
    h.stage.available = [appearance('haru'), appearance('miku')]
    await h.runtime.start()

    h.preferences.change({ appearanceId: 'miku' })
    await Promise.resolve()

    expect(h.stage.worn.map((a) => a?.id)).toEqual(['haru', 'miku'])
  })

  it('人设或会话身份变化会告知心智', async () => {
    const h = harness()
    h.stage.available = [appearance('haru')]
    await h.runtime.start()

    h.preferences.change({ persona: '新的性格', sessionId: 's-2' })
    await Promise.resolve()

    expect(h.brain.identity).toEqual({ sessionId: 's-2', persona: '新的性格' })
  })

  it('桌面尺寸变化后重新摆放，并让气泡跟上', async () => {
    const h = harness()
    h.stage.available = [appearance('haru')]
    await h.runtime.start()
    const before = h.stage.placements.length

    h.desk.resize({ width: 2000, height: 1000 })

    expect(h.stage.placements.length).toBeGreaterThan(before)
    expect(h.chat.placed.length).toBeGreaterThan(0)
  })

  it('命中检测：宠物 > 界面部件 > 空处（空处要放行点击）', async () => {
    const h = harness()
    h.stage.available = [appearance('haru')]
    h.stage.boundsRect = { x: 100, y: 100, width: 200, height: 300 }
    h.chat.uiZone = { x: 400, y: 400, width: 200, height: 40 }
    await h.runtime.start()

    expect(h.desk.hit({ x: 150, y: 150 })).toBe('pet')
    expect(h.desk.hit({ x: 500, y: 410 })).toBe('ui')
    expect(h.desk.hit({ x: 900, y: 900 })).toBe('none')
  })

  it('退场后不再响应任何外界消息', async () => {
    const h = harness()
    h.stage.available = [appearance('haru')]
    await h.runtime.start()

    h.runtime.dispose()
    h.chat.send('还在吗')
    h.brain.reply({ kind: 'chunk', text: '喂' })

    expect(h.brain.spoken).toEqual([])
    expect(h.chat.lastSink).toBeUndefined()
  })
})
