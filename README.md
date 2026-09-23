# Live2D 桌宠（前端）

虚拟形象 + LLM 大脑的桌面宠物。**本仓库是前端（Electron 壳 + Live2D 形象 + 聊天交互）**，
LLM 大脑是独立的后续项目，双方以 [docs/brain-protocol.md](docs/brain-protocol.md) 的 WebSocket 协议为契约；
后端未就绪时使用内置 **Mock 大脑**（真实 WS 回环）全链路联调。

## 技术栈

| 层 | 选型 |
|---|---|
| 壳 | Electron（透明无边框置顶窗 + 托盘 + 动态点击穿透） |
| 构建 | electron-vite + TypeScript（main / preload / renderer 三段式） |
| 渲染 | PixiJS v8 + `@jannchie/pixi-live2d-display`（Cubism 4，内置口型同步） |
| 大脑接入 | 主进程 BrainGateway（WebSocket + 指数退避重连），渲染进程零网络 |
| UI | 纯 TS + DOM（聊天气泡 / 输入条 / 设置页），无前端框架 |

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
| `npm run typecheck` | main + renderer 双工程类型检查 |
| `npm run fetch:assets` | 下载 Cubism Core 与示例模型（可重复执行） |
| `npm run gen:icon` | 重新生成图标（纯 Node，无原生依赖） |
| `npm run smoke` | 冒烟自检：启动 → 自动发消息（截图存 `.smoke/`）→ 外部 GDI 实拍屏幕校验**透明窗无白屏** |
| `npm run dist:win` | 打包 Windows NSIS 安装包 + portable（产物在 `dist/`） |

> 打包工具链若被网络卡住，使用镜像：
> `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm run dist:win`

## 目录结构

```
src/
├─ main/            # Electron 主进程
│  ├─ index.ts      # 生命周期 + IPC 汇总
│  ├─ pet-window.ts # 整屏透明置顶窗（模型/气泡/输入同窗，免裁剪）
│  ├─ protocol.ts   # pet:// 静态资源协议（抹平 dev/prod 路径）
│  ├─ brain-gateway.ts # 唯一的 WS 客户端（重连/状态转发）
│  ├─ mock-brain.ts # 内置 Mock 大脑（实现 brain 协议的 ws 服务）
│  ├─ store.ts      # JSON 配置持久化（原子写）
│  ├─ tray.ts / settings-window.ts
│  └─ resources.ts  # 资源定位 / 模型扫描
├─ preload/index.ts # contextBridge 类型化桥（sandbox 开启）
├─ shared/          # 协议 & 配置类型（主/渲染共用）
└─ renderer/
   ├─ index.html    # 宠物页（引入 pet:// Cubism Core）
   ├─ settings.html # 设置页
   └─ src/
      ├─ app.ts             # 总装：Pixi 初始化 / 布局 / 事件接线
      ├─ avatar/            # PetAvatar 抽象：Live2D 实现 + 占位史莱姆 + 工厂
      ├─ chat/              # 气泡（流式逐字）/ 输入条 / 聊天控制器
      ├─ interaction.ts     # 命中检测驱动的动态穿透 + 拖拽/点击/注视
      └─ styles.css
```

## 关键设计

> 完整的原理讲解与 `文件:行号` 级代码映射见 **[docs/architecture.md](docs/architecture.md)**。
> 以下是速览：

- **整屏透明窗 + 动态穿透**：`setIgnoreMouseEvents(true, {forward:true})` 常态穿透，
  渲染进程在 `mousemove` 中做命中检测（模型包围盒 / `data-interactive` DOM），
  命中才捕获鼠标——空白处点击直接落到下层应用。
- **透明合成修复（重要）**：本机环境需 `premultipliedAlpha:false`，否则 WebGL 内容出现后
  整窗变白（详见 [docs/white-screen-investigation.md](docs/white-screen-investigation.md)；
  `npm run smoke` 含白屏回归检测）。
- **渲染栈隔离**：Live2D 相关代码收敛在 `renderer/src/avatar/`，`PetAvatar` 接口之下
  可整体替换实现（当前：Live2D / 占位史莱姆），降级不影响其余模块。
- **情绪映射表**：每个模型目录一份 `pet.model.json`（由 fetch 脚本生成），声明
  `情绪 → expression/motion`，换模型不改代码；后端只发 `emotion` 语义标签。
- **口型同步已接好**：说话状态经 `startLipSync/setLipSyncValue` 驱动，TTS 接入后
  复用同一管道。

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
