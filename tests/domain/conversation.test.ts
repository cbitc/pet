import { describe, expect, it } from 'vitest'
import { appendReply, isOpen, settleTurn, startTurn } from '../../src/domain/conversation'

describe('对话轮次', () => {
  it('新的一轮从「等待回复」开始', () => {
    const turn = startTurn('你好')

    expect(turn).toEqual({ ownerText: '你好', reply: '', phase: 'awaiting' })
    expect(isOpen(turn)).toBe(true)
  })

  it('收到回复后进入「流式」并累加文字', () => {
    let turn = startTurn('你好')
    turn = appendReply(turn, '嗨')
    turn = appendReply(turn, '～')

    expect(turn.reply).toBe('嗨～')
    expect(turn.phase).toBe('streaming')
  })

  it('空片段不会改变轮次（避免阶段被无意义地推进）', () => {
    const turn = startTurn('你好')

    expect(appendReply(turn, '')).toBe(turn)
  })

  it('结束后不再接受新内容，也不会重复结束', () => {
    const settled = settleTurn(appendReply(startTurn('你好'), '嗨'))

    expect(settled.phase).toBe('settled')
    expect(settleTurn(settled)).toBe(settled)
    expect(appendReply(settled, '还有一句')).toBe(settled)
    expect(isOpen(settled)).toBe(false)
  })

  it('没有轮次时不算有进行中的对话', () => {
    expect(isOpen(null)).toBe(false)
  })
})
