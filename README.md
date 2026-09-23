# Live2D 桌宠（前端）

虚拟形象 + LLM 大脑的桌面宠物。**本仓库是前端（Electron 壳 + Live2D 形象 + 聊天交互）**，
LLM 大脑是独立的后续项目，双方以 [docs/brain-protocol.md](docs/brain-protocol.md) 的 WebSocket 协议为契约；
后端未就绪时使用内置 **Mock 大脑**（真实 WS 回环）全链路联调。

> **先读什么**：想知道这个桌宠「是什么、有什么规矩」——读 [docs/domain.md](docs/domain.md)（领域说明书）；
> 想知道「技术怎么落地」——读 [docs/architecture.md](docs/architecture.md)。

## 技术栈

| 层 | 选型 |
|---|---|
| 壳 | Electron（透明无边框置顶窗 + 托盘 + 动态点击穿透） |
| 构建 | electron-vite + TypeScript（main / preload / renderer 三段式） |
| 渲染 | PixiJS v8 + `@jannchie/pixi-live2d-display`（Cubism 4，内置口型同步） |
| 大脑接入 | 主进程心智连接（WebSocket + 指数退避重连），渲染进程零网络 |
| UI | 纯 TS + DOM（聊天气泡 / 输入条 / 设置页），无前端框架 |
| 结构 | 通用原语（shared，零依赖）+ 领域模型（纯逻辑，零技术依赖）+ 端口适配器 + 组装根 |
| 测试 | vitest（领域/边界/运行时，66 用例）+ 三层冒烟（见「验证」） |

## 快速开始

```bash
npm install
npm run fetch:assets   # 下载 Cubism Core（官方直链）+ 官方示例模型 Haru
npm run dev            # 启动开发（HMR）
```

- 点击宠物 → 唤出输入条聊天；按住拖动 → 挪窝（位置自动持久化）
- 托盘菜单：模型切换 / 大脑模式（Mock ⇄ 远程）/ 设置 / 开机自启 / 退出
- 设置页：`ws://` 大脑地址、人设、模型、大小（实时生效）

> 缺少 Core/模型时自动降级为占位小史莱姆，交互链路（拖拽/点击/情绪/口型）照常可用。

## 常用脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发模式（renderer HMR） |
| `npm run typecheck` | 双工程类型检查（node 侧 / web 侧） |
| `npm test` | 领域与运行时测试（vitest，含领域纯净性守护） |
| `npm run fetch:assets` | 下载 Cubism Core 与示例模型（可重复执行） |
| `npm run gen:icon` | 重新生成图标（纯 Node，无原生依赖） |
| `npm run smoke` | 冒烟自检：启动 → 点击/拖动/对话（截图存 `.smoke/`）→ 外部 GDI 实拍校验**透明窗无白屏** |
| `npm run dist:win` | 打包 Windows NSIS 安装包 + portable（产物在 `dist/`） |

> 打包工具链若被网络卡住，使用镜像：
> `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm run dist:win`

## 目录结构

```
src/
├─ shared/          通用原语：clamp / 命中判定（零依赖最底层，供各层共用）
├─ domain/          领域：宠物模型（纯逻辑，禁止依赖 electron/pixi/DOM/ws）
│  ├─ pet.ts        宠物聚合根：行为方法 → 领域事件
│  ├─ ports.ts      六个端口＝「宠物需要世界提供什么」的需求清单
│  ├─ pose.ts       栖息姿态（归一化坐标 + 活动范围规则）
│  ├─ emotion.ts / appearance.ts   情绪与形象（表演表查表规则）
│  ├─ conversation.ts / preferences.ts / events.ts
├─ app/
│  └─ pet-runtime.ts  接线员：领域事件 ⇄ 端口调用（用例编排）
├─ adapters/        一切技术细节的居所
│  ├─ shell/        主进程壳：透明窗 / 托盘 / 设置窗 / pet:// 协议 /
│  │                资产扫描 / 配置持久化 / 诊断 / 冒烟钩子
│  ├─ brain/        心智：WS 连接与重连（brain-link）/ Mock 大脑
│  ├─ presentation/ 渲染：Pixi 舞台（含 Live2D 与占位躯体）/ 气泡输入 /
│  │                设置页 / 渲染侧诊断
│  └─ bridge/       preload 桥 → 领域端口（手势、心智、偏好、形象清单）
├─ contracts/       跨进程契约：IPC 通道与载荷 / 大脑协议 / 应用配置 / 资产清单
├─ entries/         组装根：main.ts / preload.ts / renderer.ts
└─ renderer/        静态宿主：index.html / settings.html / styles.css
tests/              领域与运行时测试（含领域纯净性守护）
```

## 想改某处，该动哪个文件

| 想做的事 | 改哪里 |
|---|---|
| 改宠物的行为或规矩（如"被摸时别打断说话"） | `domain/pet.ts`（并加 `tests/domain/pet.test.ts` 用例） |
| 改某句话的时序（先表情后文字？） | `app/pet-runtime.ts` |
| 换渲染引擎 / 改表情口型表现 | `adapters/presentation/stage/` |
| 换大脑后端 / 改重连策略 | `adapters/brain/` |
| 改桌面交互（阈值、穿透、吸附） | `adapters/bridge/electron-desk.ts` |
| 改气泡外观 / 打字机节奏 | `adapters/presentation/chat/dom-chat-surface.ts` |
| 加一个 IPC 通道 | `contracts/ipc.ts` + `entries/preload.ts` + `entries/main.ts` |
| 调窗口行为（透明、置顶、跟随显示器） | `adapters/shell/pet-window.ts` |


## 关键设计

> 完整的原理讲解与 `文件:行号` 级代码映射见 **[docs/architecture.md](docs/architecture.md)**。
> 以下是速览：

- **整屏透明窗 + 动态穿透**：`setIgnoreMouseEvents(true, {forward:true})` 常态穿透，
  渲染进程做命中检测（宠物包围盒 / 界面部件），命中才捕获鼠标——空白处点击落到下层应用。
  领域语义是「捕获 / 放行」，实现在 `adapters/bridge/electron-desk.ts`。
- **透明合成修复（重要）**：本机环境需 `premultipliedAlpha:false`，否则 WebGL 内容出现后
  整窗变白（详见 [docs/white-screen-investigation.md](docs/white-screen-investigation.md)；
  `npm run smoke` 含白屏回归检测）。该开关在 `adapters/presentation/stage/pixi-stage.ts`。
- **Live2D 纹理 GC 规避（重要）**：Pixi 8.15+ 默认约 60s 回收「未使用」纹理，而 Live2D
  分支绕过 Pixi 的纹理绑定，模型会在大约 1 分钟后消失（但仍可点击）。保持
  `gcActive:false`，换形象时显式销毁纹理（详见 [docs/live2d-texture-gc.md](docs/live2d-texture-gc.md)）。
- **渲染栈隔离**：Live2D 相关代码只存在于 `adapters/presentation/stage/`，
  底下是 `StageBody` 两种实现（Live2D / 占位史莱姆），换引擎不影响领域与运行时。
- **情绪映射表**：每个模型目录一份 `pet.model.json`，声明 `情绪 → 表情/动作`；
  领域只认识情绪标签（`happy`），查表规则在 `domain/appearance.ts`。
- **口型同步已接好**：说话状态经口型包络驱动（`stage/live2d-body.ts`），TTS 接入后复用同一管道。

## 资产与许可（重要）

- `resources/core/live2dcubismcore.min.js`：Live2D Cubism Core，**禁止再分发**，不入库，
  由 `npm run fetch:assets` 从官方下载；公开发布应用前请确认符合
  [Live2D SDK 发行许可](https://www.live2d.com/eula/)（小规模使用者免费）。
- 示例模型 Haru/Shizuku 音效依 Live2D
  [免费素材许可协议](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html)
  使用/再分发，仅适合开发与学习；正式发布请替换为有授权的模型。
- 若产品做成「用户可自行加载任意模型」的可扩展性应用并公开发布，需先向 Live2D 报备审查。

## Roadmap

- [ ] TTS 出声（协议已预留 `tts.chunk`，口型管道已就绪）
- [ ] 大脑后端（人设/记忆/多轮上下文/结构化输出）
- [ ] 多显示器漫游、待机小动作调度器、亲密度系统
