# 桌宠前端（Electron + Live2D + PixiJS v8）技术方案与实施计划

本仓库 = **桌宠前端（虚拟形象壳）**。LLM 大脑是未来的独立后端服务，前端通过 WebSocket 与其通信；为支持"先建前端"，内置一个 Mock 大脑用于开发期独立联调。前后端以一份协议文档（`docs/brain-protocol.md`）为契约。

## 一、技术栈定稿

| 层 | 选型 | 说明 |
|---|---|---|
| 运行时 | Electron（最新稳定版） | 透明置顶窗 + 托盘 + 跨平台 |
| 构建 | electron-vite + TypeScript | main/preload/renderer 三段式，dev HMR |
| 打包 | electron-builder | NSIS 安装包 + portable |
| 渲染 | PixiJS v8 + `pixi-live2d-display`（jannchie 分支，^1.4.0） | 原版库不支持 Pixi v8，此分支 2026-07 仍在维护，支持 Cubism 2.1/4 模型 |
| Live2D Core | `live2dcubismcore.min.js`（官方 SDK 手动放置） | Core 脚本许可禁止再分发 → 放 `public/` 并 .gitignore，附 setup 校验脚本 + README 说明 |
| UI | 纯 TS + DOM（不上 React） | 气泡/输入/设置都很轻量，减少依赖；后续复杂化再加框架 |
| 状态 | 自写事件总线 + 宠物状态机 | 依赖最小化 |
| 模型素材 | Live2D 官方免费示例（Hiyori 等，放 `resources/models/`） | 结构标准、免费；换模型零成本（见情绪映射设计） |

## 二、系统架构

```
┌─ Electron Main（Node）────────────────────┐   ┌─ 后端大脑服务（另建项目）─┐
│ PetWindow 透明/无边框/置顶/动态穿透          │   │  LLM 编排 / 人设 / 记忆   │
│ Tray 菜单（退出/设置/模型切换）              │◄─WS─►  (v1 由 Mock 大脑顶替) │
│ ConfigStore（JSON 持久化：位置/模型/后端地址）│   └────────────────────────┘
│ BrainGateway（WS 客户端 + 指数退避重连）     │
├─ Preload：contextBridge 暴露类型化 IPC      │
├─ Renderer（Chromium）──────────────────────│
│ Pixi Application（透明画布）                │
│  └ Live2DStage：加载/待机调度/表情/拖拽/点击 │
│ DOM overlay：聊天气泡 + 输入框（不进 Pixi）  │
│ ChatController：流式文本 + 情绪→形象联动     │
│ PetStateMachine：idle/dragging/talking/react│
└────────────────────────────────────────────┘
```

要点：
- **网络只走主进程**：WS 连接、后端地址、重连逻辑全在 Main，renderer 经 IPC 收发消息，为将来密钥管理留好位置。
- **渲染层隔离**：Live2D 相关代码收敛在 `renderer/src/live2d/` 模块内，若 jannchie 分支遇到硬伤可整体降级到 Pixi v7 + 原版路线，不动其他代码。
- **模型无关的情绪映射**：每模型配一份 `model.config.json` 声明 `情绪 → expression/motion组` 映射表，换模型不改代码。

## 三、前后端协议（WebSocket，JSON 文本行）

- C→S：`chat.send {text, sessionId, ts}`、`session.hello {clientId, persona版本}`
- S→C：`chat.delta {delta}`（流式增量）、`chat.directive {emotion?, motion?}`（结构化指令）、`chat.done {messageId}`、`tts.chunk {audio, fmt, seq}`（v1 前端忽略，为 TTS 预留）
- 设计原则：后端负责 LLM 调用与结构化输出解析，只下发「文本流 + 指令」；情绪到表情/动作的翻译在前端映射表完成；断线自动重连并在气泡上显示"大脑离线"。
- 开发期 Mock 大脑：dev server 附带 mock 模块，模拟流式回复 + 随机情绪指令，前端可完全独立开发。

## 四、关键技术实现点

1. **透明窗与点击穿透**：`transparent, frame:false, hasShadow:false, skipTaskbar:true, resizable:false` + `setAlwaysOnTop(true, 'screen-saver')` + `backgroundThrottling:false`（防失焦掉帧）。穿透：renderer 在 `mousemove` 里用 `document.elementFromPoint`/Pixi 命中检测判断是否悬停在宠物或 UI 上 → IPC 调 `setIgnoreMouseEvents(bool, {forward:true})` 动态切换。
2. **拖拽移动桌宠**：pointerdown 命中模型后不是移动 Pixi 坐标，而是 IPC 令主进程 `win.setPosition()` 移动窗口本身（真正的全局桌宠行为）。
3. **Live2D 行为**：待机时随机调度 idle motion 组；命中 hitAreas 触发 Tap 动作；说话时预留口型参数接口（TTS 接入后直接可用）。
4. **聊天气泡**：DOM overlay 定位在模型附近，流式逐字显示 + 打字动画；输入框通过点击宠物/托盘唤出。
5. **资源寻址**：写统一的资源路径解析函数，抹平 dev（HTTP）与 prod（file/custom protocol）差异；模型放 `resources/` 经 extraResources 打包。
6. **安全**：contextIsolation 开启、禁 nodeIntegration、CSP 收紧。

## 五、风险与对策

- **jannchie 分支文档少**：API 与原版基本一致，可对照原版源码排障；渲染层已隔离，最坏降级 v7 路线。
- **Core/模型许可**：Core 不入库；官方示例模型仅限开发与符合官方条款的使用，公开发布需自备授权模型；若开放"用户自选任意模型"属 Live2D"可扩展性 APP"，发布前需向官方报备（个人自用不涉及）。
- **透明窗兼容性**：个别 Windows 驱动下发黑/闪烁 → 设置项支持禁用硬件加速重启。
- **Linux X11 穿透 2026 年有回归 bug**：Windows 优先，Linux 标记 best-effort。

## 六、里程碑（每步可运行可验收）

- **M1 窗口骨架**：electron-vite 脚手架、透明置顶窗、托盘、命中检测动态穿透、HMR 跑通。
- **M2 虚拟形象**：Core 引导脚本、加载 Hiyori、待机动画调度、点击表情、拖拽窗口、DPI/多显示器位置持久化。
- **M3 对话链路**：气泡 + 输入、BrainGateway（WS + 重连）、Mock 大脑、流式逐字、情绪映射表驱动表情/动作；产出 `docs/brain-protocol.md` 契约文档。
- **M4 配置打磨**：设置窗口（后端地址/模型/人设/开机自启）、模型热切换。
- **M5 打包分发**：electron-builder 出 NSIS + portable、应用图标、启动性能与内存核查。

实施顺序即 M1→M5；每个里程碑完成后你都可以直接 `npm run dev` 看到对应效果。