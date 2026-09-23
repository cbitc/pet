import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { ChatSend, ClientMessage, EmotionName, ServerMessage } from '../shared/protocol'

/**
 * 内置 Mock 大脑：在本机随机端口起一个真实的 WebSocket 服务，
 * 完整实现 brain 协议，使前端在独立后端就绪前可全链路开发联调。
 */

interface Reply {
  text: string
  emotion: EmotionName
}

const RULES: { match: RegExp; replies: Reply[] }[] = [
  {
    match: /你(好|早|晚)|hi|hello|哈喽|嗨/i,
    replies: [
      { text: '主人好呀～我今天也精神满满！(≧▽≦)', emotion: 'happy' },
      { text: '嗨！我在屏幕角落蹲好久啦，终于理我了～', emotion: 'happy' }
    ]
  },
  {
    match: /名字|你叫什么|你是谁/,
    replies: [
      { text: '我是你的桌面小宠物呀！名字还没取呢，要不你给我起一个？', emotion: 'happy' }
    ]
  },
  {
    match: /累|困|加班|烦|难受|伤心|难过/,
    replies: [
      { text: '摸摸头…主人辛苦啦，休息一下吧，我陪你 (´･ω･`)', emotion: 'sad' },
      { text: '呜，听你这么说我也有点难过…要不要喝口水、看看窗外？', emotion: 'sad' }
    ]
  },
  {
    match: /笑话|讲个|来一段/,
    replies: [
      { text: '程序员最讨厌的两件事：一是别人不写注释，二是别人让自己写注释。', emotion: 'happy' },
      { text: '为什么电脑永远不会感冒？因为它有良好的「Windows」通风！嘿嘿。', emotion: 'happy' }
    ]
  },
  {
    match: /谢谢|感谢|爱你/,
    replies: [{ text: '嘿嘿，不用谢！陪着你我就很开心啦 (＾▽＾)', emotion: 'happy' }]
  },
  {
    match: /笨|傻|讨厌/,
    replies: [
      { text: '呜！我才不笨，我只是…只是比较可爱！哼！', emotion: 'angry' },
      { text: '你再说一遍试试！我就…我就在屏幕角落画个圈圈！哼！', emotion: 'angry' }
    ]
  },
  {
    match: /再见|拜拜|晚安|睡了/,
    replies: [{ text: '晚安主人～我就在这里守着，随时叫我哦！ζ°≡°ζ', emotion: 'neutral' }]
  }
]

const FALLBACKS: Reply[] = [
  { text: '嗯嗯，我在听～（歪头）', emotion: 'neutral' },
  { text: '原来是这样呀！然后呢然后呢？', emotion: 'surprised' },
  { text: '哇，这我还真没想到！主人继续说说？', emotion: 'surprised' },
  { text: '（认真记小本本）嗯…这条我记下了！', emotion: 'neutral' },
  { text: '嘿嘿，不管说什么，陪着你就好啦～', emotion: 'happy' },
  { text: '呼…刚才走神了，再说一遍好不好？', emotion: 'neutral' }
]

function pickReply(input: string): Reply {
  for (const rule of RULES) {
    if (rule.match.test(input)) {
      return rule.replies[Math.floor(Math.random() * rule.replies.length)]
    }
  }
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)]
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 按完整字符切分，避免流式增量拆坏 UTF-16 代理对 */
function* chunkText(text: string, size: number): Generator<string> {
  const chars = Array.from(text)
  for (let i = 0; i < chars.length; i += size) yield chars.slice(i, i + size).join('')
}

async function respond(ws: WebSocket, req: ChatSend): Promise<void> {
  const { text, emotion } = pickReply(req.text)
  await sleep(300 + Math.random() * 400)
  if (ws.readyState !== WebSocket.OPEN) return
  send(ws, { type: 'chat.directive', sessionId: req.sessionId, emotion })
  for (const delta of chunkText(text, 2)) {
    if (ws.readyState !== WebSocket.OPEN) return
    send(ws, { type: 'chat.delta', sessionId: req.sessionId, delta })
    await sleep(40 + Math.random() * 45)
  }
  send(ws, { type: 'chat.done', sessionId: req.sessionId, messageId: randomUUID() })
}

export interface MockBrainHandle {
  url: string
  close: () => void
}

export function startMockBrain(): Promise<MockBrainHandle> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        let msg: ClientMessage
        try {
          msg = JSON.parse(String(data)) as ClientMessage
        } catch {
          return
        }
        if (msg.type === 'session.hello') {
          send(ws, { type: 'session.ready', sessionId: msg.sessionId })
        } else if (msg.type === 'chat.send') {
          void respond(ws, msg)
        }
      })
    })
    wss.on('listening', () => {
      const addr = wss.address() as { address: string; port: number }
      resolve({
        url: `ws://${addr.address === '::' ? '127.0.0.1' : addr.address}:${addr.port}`,
        close: () => wss.close()
      })
    })
    wss.on('error', (err) => reject(err))
  })
}
