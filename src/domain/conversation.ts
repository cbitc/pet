/**
 * 对话轮次——主人说一句，宠物答一句，这一问一答的生命周期。
 *
 * 「一轮未结束前不接新话」是宠物的规矩：主人说个不停时，
 * 宠物不会把话岔开去处理一半的对话。这条规则在这里定义，
 * 而不是寄生在某个界面控制器里。
 */

export type TurnPhase = 'awaiting' | 'streaming' | 'settled'

export interface Turn {
  /** 主人说的话 */
  readonly ownerText: string
  /** 宠物已经收到的回复全文（流式累加） */
  readonly reply: string
  readonly phase: TurnPhase
}

export function startTurn(ownerText: string): Turn {
  return { ownerText, reply: '', phase: 'awaiting' }
}

export function appendReply(turn: Turn, chunk: string): Turn {
  if (turn.phase === 'settled' || chunk.length === 0) return turn
  return { ...turn, reply: turn.reply + chunk, phase: 'streaming' }
}

export function settleTurn(turn: Turn): Turn {
  return turn.phase === 'settled' ? turn : { ...turn, phase: 'settled' }
}

export function isOpen(turn: Turn | null): boolean {
  return turn !== null && turn.phase !== 'settled'
}
