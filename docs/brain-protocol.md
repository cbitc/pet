# 桌宠前端 ⇆ 大脑服务 协议（v1）

> 本文档是前后端的唯一契约。前端（本仓库）与大脑服务（独立项目）各自开发时以此为准。
> 传输层：**WebSocket，文本帧，每帧一个 JSON 对象**。

## 设计原则

1. **后端只下发「文本流 + 结构化指令」**：LLM 调用、提示词、记忆、结构化输出解析全部在后端完成；前端不做任何 LLM 相关逻辑。
2. **情绪的"翻译"在前端**：后端只说「happy」，前端按当前模型的 `pet.model.json` 映射为 expression/motion。这样换模型、换渲染引擎都不需要动后端。
3. **向前兼容**：未知 `type` 的消息必须忽略；已知消息中的未知字段必须忽略。

## 连接与会话

- 前端（主进程 BrainGateway）连接配置的 `brain.url`，断线后以指数退避自动重连（1s 起、15s 封顶）。
- 连接建立后前端立即发送 `session.hello`，服务端应答 `session.ready`。
- `sessionId` 标识一个宠物角色的连续对话（持久化在客户端）；`clientId` 标识一个安装实例。
- 人设（persona）由前端随 `session.hello` 同步给服务端，服务端可自行决定是否采用。

## 客户端 → 服务端

### `session.hello`

```json
{ "type": "session.hello", "clientId": "desktop-pet", "sessionId": "<uuid>", "persona": "……" }
```

### `chat.send`

```json
{ "type": "chat.send", "text": "你好呀", "sessionId": "<uuid>", "ts": 1730000000000 }
```

## 服务端 → 客户端

### `session.ready`

```json
{ "type": "session.ready", "sessionId": "<uuid>" }
```

### `chat.directive`（结构化指令，流内任意时刻可发，通常先于文本）

```json
{ "type": "chat.directive", "sessionId": "<uuid>", "emotion": "happy", "motion": "Tap" }
```

- `emotion` ∈ `neutral | happy | sad | angry | surprised`（可扩展，前端未知值按 neutral 处理）
- `motion` 可选：直接指定动作组名；缺省由前端按情绪映射选择

### `chat.delta`（流式文本增量）

```json
{ "type": "chat.delta", "sessionId": "<uuid>", "delta": "今天" }
```

- UTF-8 安全：前端按完整字符渲染，服务端也应按字符边界切片（不拆代理对）

### `chat.done`（一轮回复结束）

```json
{ "type": "chat.done", "sessionId": "<uuid>", "messageId": "<uuid>" }
```

### `chat.error`（本轮回复失败）

```json
{ "type": "chat.error", "sessionId": "<uuid>", "message": "upstream timeout" }
```

### `tts.chunk`（v1 预留，前端当前忽略）

```json
{ "type": "tts.chunk", "sessionId": "<uuid>", "fmt": "mp3", "seq": 0, "audio": "<base64>" }
```

接入语音时的约定（草案）：`seq` 从 0 连续递增；跟随在 `chat.done` 之后的 `tts.done`（v1.1 再定义）表示音频结束；前端用音频驱动 Live2D 口型同步。

## 一轮典型时序

```
client                          server
  │ session.hello ───────────────▶│
  │◀──────────────── session.ready│
  │ chat.send("讲个笑话") ────────▶│
  │◀── chat.directive(happy) ─────│   ← 宠物切表情/动作
  │◀── chat.delta("从前") ─────────│
  │◀── chat.delta("有座山…") ──────│   ← 气泡逐字出现，口型开合
  │◀── chat.done(messageId) ──────│   ← 收尾，口型停
```

## 内置 Mock 大脑

前端在 `brain.mode = mock` 时于本机随机端口启动一个实现本协议的 WebSocket 服务（`src/main/mock-brain.ts`），
走完全相同的网络代码路径，用于后端未就绪时的前端独立开发。
