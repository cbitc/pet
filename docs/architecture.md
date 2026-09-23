# 桌宠实现原理与代码映射

> 本文回答三个问题：**桌宠是怎么跑起来的（原理）**、**代码是怎么组织的（结构）**、
> **原理在代码里的哪里落地（映射）**。
>
> 阅读顺序建议：先读 [domain.md](domain.md)（宠物是什么、有什么规矩），
> 再读本文（技术怎么实现它）。
> 其他配套：[brain-protocol.md](brain-protocol.md)（前后端契约）、
> [white-screen-investigation.md](white-screen-investigation.md)（白屏排查实录）。

---

## 1. 两层阅读地图

代码被刻意分成「只讲业务」与「只讲技术」两层，**任何一层都能独立读完**：

| 想了解 | 读什么 | 特征 |
|---|---|---|
| 宠物能做什么、有什么规矩 | `src/domain/`（8 个文件，约 700 行） | 零技术依赖：不 import electron / pixi / DOM / ws，有测试守护 |
| 与业务无关的通用原语 | `src/shared/` | 最底层：不 import 任何模块（clamp / 命中判定），供各层共用 |
| 宠物与外界怎么协作 | `src/app/pet-runtime.ts` | 只对着端口说话，仍然零技术细节 |
| 宠物需要世界提供什么 | `src/domain/ports.ts` | 六个端口的形状 = 业务需求清单 |
| 具体怎么实现（Electron/Pixi/WS） | `src/adapters/` | 全部技术细节的家 |
| 这些零件怎么接起来 | `src/entries/` | main / preload / renderer 三个组装根 |

领域层与端口的关系（这张图是理解全部代码的钥匙）：

```
        ┌───────────────────────────────────────────────┐
        │  domain/   宠物（业务）                        │
        │    Pet 的行为 → 领域事件                       │
        │    只认识六个端口（不知道自己住在 Electron 里）  │
        └───────────────┬───────────────────────────────┘
                        │ 依赖方向（单向：领域 ← 适配器）
        ┌───────────────┴───────────────────────────────┐
        │  app/pet-runtime.ts   接线员                   │
        │    外界事件 → 宠物命令；宠物事件 → 外界要求      │
        └───────────────┬───────────────────────────────┘
                        │
        ┌───────────────┴───────────────────────────────┐
        │  adapters/    实现六个端口 + 外壳              │
        │    presentation/  Pixi 舞台、气泡输入、设置页   │
        │    bridge/        preload 桥 → 手势/心智/偏好   │
        │    brain/         WS 连接与 Mock 心智           │
        │    shell/         窗口、托盘、协议、存储、诊断   │
        └───────────────────────────────────────────────┘
                        ▲ 由组装根拼装
        ┌───────────────┴───────────────────────────────┐
        │  entries/  main.ts / preload.ts / renderer.ts  │
        └───────────────────────────────────────────────┘
```

**结构原则**：

1. **业务与技术分层**：领域只讲宠物；技术只在适配器里。改行为去 `domain/`，改实现去 `adapters/`。
2. **依赖单向且无环**：`shared/` 在最底（不依赖任何模块）→ `domain/` 只依赖自己与 shared → `app/adapters` 依赖领域；领域绝不反向依赖外层（`tests/domain/purity.test.ts` 机器守护）。
3. **能力最小化**：渲染进程无 Node、无直连网络；所有危险能力经 preload 白名单收口。
4. **网络唯一出口**：只有主进程碰网络，渲染进程连"心智地址"都不知道。
5. **降级不崩溃**：缺 Core、缺模型、模型损坏，都有兜底路径（占位躯体）。

---

## 2. 领域模型速览

完整说明见 [domain.md](domain.md)；这里只列代码入口。

| 领域概念 | 代码 | 职责 |
|---|---|---|
| 宠物 | `domain/pet.ts` | 聚合根：状态（栖姿/心情/形象/对话轮次）+ 行为（现身/听/说/表演/挪窝/换装），行为返回领域事件 |
| 栖息姿态 | `domain/pose.ts` | 归一化坐标 + 活动范围规则（不越界、体型区间） |
| 情绪 / 形象 | `domain/emotion.ts`、`domain/appearance.ts` | 情绪标签；形象的表演表与查表规则 |
| 对话轮次 | `domain/conversation.ts` | 一问一答的生命周期（等待→流式→结束）；"一轮未完成不接新话"的规则载体 |
| 偏好 | `domain/preferences.ts` | 主人的设定（形象/位置/人设/关系身份），含坏数据回退 |
| 领域事件 | `domain/events.ts` | 12 种过去时事件（PetAppeared / PetMoved / ReplyChunk / Degraded …） |
| 六个端口 | `domain/ports.ts` | 形象舞台、桌面、心智、对话界面、偏好存储 |

**关键设计**：`Pet` 不"做"任何事，它只**宣布发生了什么**（返回事件数组）。
"把宠物摆到新位置""把文字写进气泡"这些动作由运行时翻译成端口调用——
所以领域可以在没有 Electron、没有 Pixi、没有网络的环境里被完整测试（57 个用例）。

---

## 3. 窗口与进程模型

### 3.1 原理：为什么是"整屏透明窗"而不是"紧贴模型的窗口"

两种主流做法：

| 方案 | 做法 | 后果 |
|---|---|---|
| A. 小窗贴模型 | 窗口大小≈模型大小，拖窗口 | 气泡、输入框会被窗口边缘**裁剪**；窗口尺寸随模型缩放频繁变化；DPI 换算复杂 |
| B. 整屏透明层（本项目） | 窗口=显示器工作区，内部自由摆放 | 元素永不被裁剪；坐标体系统一；代价是必须处理**穿透**（§4）与**透明合成**（§5） |

选择 B 的直接后果：**"拖动宠物"= 移动舞台内模型的坐标，而不是移动窗口**。
窗口自始至终钉在工作区上（`adapters/shell/pet-window.ts`，显示器参数变化时重新贴合）。

### 3.2 窗口参数逐项映射

`createPetWindow()`（`adapters/shell/pet-window.ts`）：

| 参数 | 值 | 原理 |
|---|---|---|
| `frame` | `false` | 无系统边框，纯内容 |
| `transparent` | `true` | 窗口背景参与 alpha 合成，露出桌面 |
| `hasShadow` / `resizable` / `movable` / `minimizable` / `maximizable` / `fullscreenable` | 全 `false` | 整屏层不该有窗口行为；`movable:false` 防止系统级拖动与模型拖动冲突 |
| `skipTaskbar` | `true` | 桌宠是"挂件"，不进任务栏 |
| `backgroundColor` | `'#00000000'` | 全透明底色（DOM 层底色，与 §5 的 WebGL 预乘问题无关） |
| `show:false` + `ready-to-show → showInactive()` | — | 避免白屏闪烁；不抢焦点（桌宠不应打断主人） |
| `setAlwaysOnTop(true, 'screen-saver')` | — | 层级高于普通置顶窗口，屏保之上仍可见 |
| `backgroundThrottling: false` | — | 窗口失焦后 Chromium 默认降帧，桌宠会"僵住" |
| `setIgnoreMouseEvents(true, { forward: true })` | 初始全穿透 | 详见 §4 |

安全三件套：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。

### 3.3 单实例与启动序列

- 单实例锁：`entries/main.ts` 顶部，第二次启动直接退出并唤出已有实例。
- 启动顺序（有依赖关系）：`applyDiagSwitches()`（改命令行开关必须在 ready 前）
  → `registerPetScheme()`（注册协议特权也必须在 ready 前，§6）
  → `app.whenReady()` → `store.init()` → `registerPetProtocol()` → 建窗 → 起心智连接
  → 托盘 → 注册 IPC。
- 渲染进程侧的启动序列在 `entries/renderer.ts`：装配阶段 → 初始化指针/气泡/心智/偏好
  → `runtime.start()`（宠物现身）。

---

## 4. 点击穿透：命中检测驱动

### 4.1 原理：`setIgnoreMouseEvents` 与 `forward`

窗口全屏覆盖桌面，若不处理，桌面上所有点击都会被这层"玻璃"吃掉。
Electron 的解法是 `win.setIgnoreMouseEvents(ignore, { forward: true })`：

- `ignore: true` → 鼠标事件穿透到下层应用（桌面恢复可用）；
- `forward: true` → **即使穿透，`mousemove` 仍转发给页面**。

`forward` 是关键：没有它，一旦穿透页面收不到任何鼠标事件，
就永远无法检测到"鼠标又移回宠物身上了"，穿透状态会卡死。

### 4.2 状态机（领域语义：捕获 / 放行）

```
                hover: 命中宠物或界面部件           leave（非拖拽中）
  ┌──────────┐ ─────────────────────────▶ ┌──────────┐ ──────────────▶ ┌──────────┐
  │ 放行      │                            │ 捕获      │                  │ 放行      │
  │ ignore=1 │ ◀───────────────────────── │ ignore=0 │ ◀──────────────  │          │
  └──────────┘   hover: 落点不在宠物/部件上  └──────────┘                  └──────────┘
```

代码：`adapters/bridge/electron-desk.ts` 的 `setPointerCapture()`（去抖：状态不变不重复发 IPC）；
IPC 落地在 `entries/main.ts`（含 sender 校验，只有宠物窗能调用）。

### 4.3 命中检测的两个来源

| 来源 | 判定方式 | 代码 |
|---|---|---|
| 宠物本体 | 舞台上报的包围盒（`PetStage.bounds()`，含 12px 容差） | `adapters/presentation/stage/pixi-stage.ts` + `app/pet-runtime.ts` 的 hitTest |
| 界面部件 | 输入条/角标的实际矩形（`getBoundingClientRect`） | `adapters/presentation/chat/dom-chat-surface.ts` 的 `isPointerOverUi` |

**领域语义**：运行时把两者合成为一个 `PointerTarget = 'pet' | 'ui' | 'none'` 判定函数交给桌面适配器
（`DeskSurface.setHitTest`）——"什么算宠物、什么算界面"是业务判断（运行时），
"这个坐标在不在矩形里"是技术动作（适配器）。

### 4.4 与其他交互的配合

- 悬停即注视：命中宠物时调用 `stage.lookAt()`，眼睛跟随鼠标。
- 拖拽中不做穿透切换，避免拖动过程中窗口突然穿透导致丢事件。
- 兜底：`mouseleave` 强制放行，防止"悬空卡在捕获态"。

---

## 5. 透明合成与白屏（本项目最深的坑）

### 5.1 原理：页面的 alpha ≠ 屏幕上的 alpha

屏幕上最终看到的像素经过**两条不同的路径**：

```
路径1 页面内部:   DOM + WebGL 画布 → Chromium 渲染 → 页面自己的像素（含 alpha）
路径2 原生合成:   页面像素 → 原生窗口的透明合成 → 桌面像素（用户实际看到）
```

`webContents.capturePage()` 只能读路径 1；`desktopCapturer`/GDI 实拍读路径 2。
**白屏 bug 的全部特征都来自"路径 1 正常、路径 2 全白"**——这就是为什么排查时必须双路取证。

### 5.2 触发条件与根因（实测结论）

- 与窗口参数无关（透明/不透明、大小窗均复现）；
- 与"是否绘制"无关——Live2D 模型只要加入舞台（哪怕 `visible=false`）就触发；
- Pixi 空场景、纯 DOM、占位躯体都不触发；
- 决定性变量是 WebGL 上下文的 **`premultipliedAlpha`**：置 `false` 后白屏消失。

原理层面的解释：预乘 alpha 的 WebGL 内容在透明窗的原生合成路径上被错误处理
（本机 Electron 44 + 显卡驱动栈环境），整窗被填成不透明白色。

### 5.3 代码映射

`adapters/presentation/stage/pixi-stage.ts` 的 `PixiStage.create()`：

```ts
premultipliedAlpha: options.premultipliedAlpha ?? false,  // ← 白屏开关（默认修复态）
resolution: options.resolution ?? 1,                      // ← 与 CSS 像素 1:1
```

组装根通过 URL 参数暴露排障开关（`entries/renderer.ts`）：`?premul=1` 复现白屏。

`resolution: 1` 是同一修复的一部分，它带来一个全局简化：
画布缓冲区尺寸 == CSS 像素 == 窗口逻辑像素，于是鼠标的 `clientX/clientY`
**可以直接**当作画布坐标使用（注视与命中都不需要 DPI 换算）。

### 5.4 复现与回归

- 复现：启动参数加 `?premul=1`。
- 回归防线：`npm run smoke` 会在应用运行中用**外部 GDI 实拍**屏幕，
  统计透明区白点占比（>35% 判 FAIL），见 `scripts/smoke.mjs`。

---

## 6. 资源寻址：`pet://` 协议

### 6.1 问题与候选方案

Core 脚本与模型文件在运行时才需要，且**不能打进 asar**（Core 有再分发许可限制、模型要允许用户替换）。

| 方案 | 问题 |
|---|---|
| `file://` 直接引用 | 渲染进程页面跨源加载受限；打包后路径不可控 |
| 打进 asar 读包内路径 | Core 不能被"再分发打包"规避许可；用户无法替换模型 |
| **自定义协议 `pet://`（采用）** | 统一寻址，跨源可控，物理文件保持"用户可见可替换" |

### 6.2 实现

两步注册（Electron 的硬性要求），在 `adapters/shell/asset-protocol.ts`：

1. **`registerSchemesAsPrivileged`**（必须在 app ready 前调用）：
   把 `pet` 声明为 `standard + secure + supportFetchAPI + stream + corsEnabled`。
2. **`protocol.handle`**（ready 后）：把 `pet://models/haru/xxx.model3.json` 映射到磁盘文件：
   - `host` 承载第一段路径（standard 协议的 URL 解析规则）；
   - **路径穿越防护**：目标必须落在资源根内，否则 403；
   - 带 MIME 表、流式返回、`no-cache`。

物理根目录由 `adapters/shell/asset-catalog.ts` 的 `resourceRoot()` 决定：
开发态 = 项目 `resources/`；打包态 = `process.resourcesPath`（electron-builder 的 `extraResources`）。
**同一段代码，dev/prod 寻址完全一致**。

### 6.3 许可约束如何在结构上落实

| 约束 | 结构落实 |
|---|---|
| Cubism Core 禁止再分发 | `resources/core/` 在 `.gitignore`；由 `scripts/fetch-core.mjs` 从官方下载 |
| Core 仍需随应用运行 | 页面经 `<script src="pet://core/live2dcubismcore.min.js">` 引导（`src/renderer/index.html`） |
| 模型可替换 | 资产扫描 + 形象清单机制（§7.3），换目录即换模型 |

---

## 7. 形象层：Pixi + Live2D + StageBody 抽象

### 7.1 渲染管线

```
live2dcubismcore.min.js（官方 Core，moc3 解析与参数求值）
        ↓ 被
@jannchie/pixi-live2d-display（模型加载、动作/表情调度、眨眼呼吸物理、口型）
        ↓ 输出为
PIXI.Container（可变换的显示对象）
        ↓ 加入
Pixi Application.stage（WebGL 渲染）
```

选型背景：原版 `pixi-live2d-display` 只到 Pixi v7；`@jannchie/pixi-live2d-display`
是活跃维护的 v8 分支，API 兼容且内置 lipSync。

> ⚠️ 该分支缓存原始 `WebGLTexture` 并绕过 Pixi 的纹理绑定，会被 Pixi 8.15+ 的
> `GCSystem` 在约 60s 后回收，导致模型消失。修复与原理见 §7.5 和
> [live2d-texture-gc.md](live2d-texture-gc.md)。

### 7.2 两种"躯体"，一个抽象

`adapters/presentation/stage/stage-body.ts` 定义 `StageBody`（view / naturalHeight /
perform / setSpeaking / lookAt / reactToTouch / destroy），两个实现：

| 实现 | 文件 | 用途 |
|---|---|---|
| `Live2DBody` | `stage/live2d-body.ts` | 真模型：动作优先级、表情、口型包络、注视 |
| `PlaceholderBody` | `stage/placeholder-body.ts` | 占位史莱姆：Graphics 绘制 + 手写眨眼/呼吸/口型 |

`PixiStage`（实现 `PetStage` 端口）负责加载、切换、摆放与降级。
**换渲染引擎或加一种躯体，只动这个目录。**

### 7.3 降级链与情绪映射

`PixiStage.wear()` 的判定顺序：

```
没有形象可选 → 占位躯体 + 说明原因
有形象但缺入口文件 → 占位躯体 + 说明原因
Live2DModel.from() 失败 → 占位躯体 + 说明原因（catch 记录）
成功 → Live2DBody（正常路径）
```

降级原因经 `WearResult.degraded` 上传，运行时转成 `Degraded` 领域事件 →
气泡提示（并周期性重播，直到换上像样的形象）。

情绪映射：模型目录里的 `pet.model.json` 声明 `情绪 → 表情/动作`；
清单由 `adapters/bridge/appearance-catalog.ts` 经 `contracts/schemas.ts` 的
`parseAppearanceSpec`（zod）净化成领域形象，查表规则是 `domain/appearance.ts` 的 `performanceFor`。
**领域只认识情绪标签，不认识"f03"这种模型内部的表达式名。**

### 7.4 CSP 放宽的四个理由

`src/renderer/index.html` 的 CSP 之所以有几处放宽，各有硬需求：

| CSP 项 | 为什么必须放宽 |
|---|---|
| `script-src 'self' pet:` | Core 脚本来自 `pet://` |
| `worker-src 'self' blob:` | Pixi 用 blob worker 做贴图上传/解码 |
| `style-src 'unsafe-inline'` | 设置页有内联样式 |
| `connect-src ... blob:` | Pixi worker 通信 |

另外 Pixi v8 默认用 `new Function` 编译着色器，与 CSP 冲突；
官方提供无 eval 实现：`import 'pixi.js/unsafe-eval'`（`pixi-stage.ts` 顶部，
**名字易误解，作用恰恰是为 CSP 环境去 eval**），必须在创建 Application 之前 import。

> 注意：**心智的 WS 地址不出现在渲染进程 CSP 里**——网络在主进程（§8.2）。

### 7.5 纹理 GC：模型为什么会在 1 分钟后消失（第二个坑）

Pixi 8.15+ 引入 `GCSystem`，默认 `gcActive: true`、`gcMaxUnusedTime: 60s`、
`gcFrequency: 30s`：凡是被 Pixi `GlTextureSystem` 绑定过、且 60s 内没再被绑定/取用的纹理，
会被 `gl.deleteTexture` 回收。

问题在于 Live2D 分支**只第一次**经 `getGlSource()` 取得 `WebGLTexture`（此刻刷新一次
`_gcLastUsed`），其后每帧直接 `gl.bindTexture` 自己缓存的纹理，不再经过 Pixi，于是
`_gcLastUsed` 永不更新；库里用于防 GC 的 `texture.source.touched` 又只对旧
`TextureGCSystem` 有效（`TextureSource` 已无 `touched` 字段）。
大约 60s 后纹理被删，模型画不出来，但 CPU 侧的包围盒/变换还在——**表现为“消失但仍可点击”**。

修复在 `adapters/presentation/stage/pixi-stage.ts`：

```ts
app.init({
  // ...
  gcActive: false, // 关闭 Pixi GPU 资源 GC，规避 Live2D 纹理被误收（见 docs/live2d-texture-gc.md）
})
```

关闭 GC 后，本该由 GC 兜底的释放需要显式完成；本应用只有 Live2D 纹理会跨形象切换累积，
因此 `adapters/presentation/stage/live2d-body.ts` 的 `destroy()` 改为
`view.destroy({ texture: true, textureSource: true })`。完整证据链、备选方案与复现步骤见
[live2d-texture-gc.md](live2d-texture-gc.md)。

---

## 8. 心智通信：契约、连接与 Mock

### 8.1 职责切分原理

契约见 [brain-protocol.md](brain-protocol.md)，只有一句话：
**心智管"说什么"，宠物管"怎么表现"。**

| 关注点 | 归属 |
|---|---|
| LLM 调用、提示词、记忆、多轮上下文、结构化输出解析 | 心智（独立后端项目） |
| 文本流的逐字呈现、情绪/动作的具体翻译、口型、气泡 | 前端 |

心智消息只有两类内容：**文本增量**（`chat.delta`）与 **语义指令**（`chat.directive{emotion}`）。
类型定义：`contracts/wire-protocol.ts`（只有类型，无实现，主/渲染共用）。

### 8.2 为什么网络放在主进程

1. **安全面收窄**：渲染进程（跑 WebGL、加载模型）是最大攻击面，它连 WS 都开不了。
2. **CSP 不用为后端放行**：任意后端地址都不会进入页面 CSP。
3. **未来密钥预留**：若协议加鉴权，API Key 只存在于主进程。
4. **重连不依赖页面**：页面刷新/崩溃重载时连接可保持，重连逻辑不会归零。

### 8.3 连接的状态机与消息流转

`adapters/brain/brain-link.ts`（`BrainGateway`）：

```
mock 模式：起一个真实 WS 服务（127.0.0.1 随机端口）→ 连它
remote 模式：直接连配置地址
      ├─ open → 发 session.hello（含身份与性格）→ status: online（重试计数清零）
      ├─ message → JSON.parse → 转发渲染进程（经 IPC.brainMessage）
      └─ close/error → status: offline → 指数退避重连（1s 起、15s 封顶 + 抖动）
```

渲染侧由 `adapters/bridge/ipc-brain-channel.ts` 翻译成领域消息
（`{kind:'chunk'|'mood'|'done'|'error'}`），**未知形状一律忽略**（向前兼容）。
`sendChat` 的输入在主进程边界截断 2000 字符（防御渲染进程被注入后发畸形大 payload）。

### 8.4 Mock 心智：为什么要"真 WS 回环"

`adapters/brain/mock-brain.ts` 在随机端口起一个真实的 WebSocketServer，
连接走**完全相同的网络代码路径**。收益：

- 前端独立开发期，`chat.delta/directive/done` 的时序、分片、异步行为全是真货；
- 后端替换时只需把大脑模式从 mock 切到 remote，**零代码改动**；
- 端到端测试（冒烟）天然覆盖网络层。

回复逻辑：规则表匹配 → 先发 `directive(emotion)`，再以 2 字符/40~85ms 流式发 `delta`，
最后 `done`。**"指令先行"是刻意的时序**：宠物先变表情再开口，比反过来自然。

### 8.5 流式渲染：追赶式打字机

气泡收到文字片段后不直接显示，而是进缓冲由定时器逐字吐出
（`adapters/presentation/chat/dom-chat-surface.ts`）：

```ts
const step = Math.max(1, Math.round((buffer.length - shown) / 6))  // 落后越多吐越快
```

效果：网络抖动被视觉上平滑掉，用户看到的是匀速但会"加速追赶"的打字感。

**一个必须记住的坑**（注释保留在代码里）：气泡容量裁剪的 `while` 循环里
只能做**同步移除**。早期版本在循环里调异步淡出，条件永远为真 → 死循环挂死渲染进程，
且不产生任何错误日志。这类"静默死循环"是冒烟测试存在的理由之一。

---

## 9. 交互与布局

### 9.1 归一化坐标系统

所有持久化的位置都是**相对值**，与分辨率/显示器无关（`domain/pose.ts`）：

| 字段 | 含义 | 范围 |
|---|---|---|
| `x` / `y` | 模型锚点（中心）相对工作区的比例 | 0.05~0.95 / 0.1~0.95 |
| `scale` | 模型显示高度 ÷ 屏幕高度 | 0.15 ~ 1.4 |

换算（正向）在 `adapters/presentation/stage/pixi-stage.ts` 的 `place()`：

```
scale_px = (画布高 × pose.scale) / naturalHeight
position = (画布宽 × pose.x, 画布高 × pose.y)
```

反向（拖拽结束）由运行时把像素增量换算成归一化增量后调 `Pet.moveTo()`
（`app/pet-runtime.ts`）；落盘有 400ms 防抖，一次拖拽只写一次磁盘。

### 9.2 元素的相对锚定

气泡与输入条不写死坐标，而是**每次布局后跟随宠物包围盒**
（`app/pet-runtime.ts` 调 `ChatSurface.placeNear(stage.bounds())`）：

```
气泡:   锚在包围盒顶边中点上方 16px（CSS transform: translate(-50%,-100%)）
输入条: 锚在包围盒底边中点下方 22px
```

因此挪窝、换形象、改体型、窗口 resize 四条路径都会重新锚定，UI 始终"长在宠物身上"。
两者都做了视口内 clamp，防止贴边时飘出屏幕。

### 9.3 点击 vs 拖拽

同一次按压可能是"点击宠物"也可能是"拖走宠物"，判定在适配器完成
（`adapters/bridge/electron-desk.ts`，阈值 8px），领域只收到语义手势：

```
位移 < 8px  → tap：reactToTouch() + 打开输入框
位移 ≥ 8px  → dragBegin → dragMove（增量）→ dragEnd（落定、持久化）
```

拖拽会把姿态夹在活动范围内（`domain/pose.ts` 的 `POSE_BOUNDS`），
保证宠物不会被拖到完全不可见。

---

## 10. 配置与 IPC

### 10.1 配置存储的三个要点

`adapters/shell/config-store.ts`：

1. **原子写**：先写临时文件再 `rename`——断电/崩溃不会留下半截 JSON。
2. **defaults 深合并**：读盘后与默认配置深合并——新增配置项后老文件自动补齐，无需迁移。
3. **净化**：`contracts/app-config.ts` 的 `AppConfigSchema`（zod）对所有数值 clamp、
   非法枚举回退——**配置永不导致崩溃**。

`sessionId` 在首次启动时生成 UUID，此后同一安装保持同一关系身份。

### 10.2 IPC 契约：唯一真相源

`contracts/ipc.ts` 集中定义**全部 12 个通道名与载荷类型**：

| 通道 | 方向/形式 | 用途 |
|---|---|---|
| `config:get` / `config:set` | invoke | 读/写应用配置（补丁深合并） |
| `models:list` | invoke | 资产清单（Core 是否就位 + 模型列表） |
| `brain:send` | send | 把主人的话交给心智（主进程截断 2000 字符） |
| `window:set-ignore-mouse` | send | 捕获/放行鼠标（带 sender 校验） |
| `app:quit` / `app:open-settings` | send | 退出 / 打开设置窗 |
| `brain:status` / `brain:message` | 事件 | 心智状态与回话 |
| `config:changed` | 事件 | 配置被任何入口改动 |
| `ui:toggle-input` / `ui:reset-pose` | 事件 | 托盘菜单动作 |

**为什么集中**：这些字符串以前散落在主进程、preload、渲染进程共 12+ 处，
改一个名字要全局搜索；现在两端共用同一常量与类型，编译器负责检查。
`entries/preload.ts` 按白名单暴露 `window.pet`，因此渲染进程拿不到任意通道。

### 10.3 单向数据流

配置有**多个写入口**（托盘菜单、设置页、宠物页的挪窝持久化），但只有一个真相源：

```
任何入口 → config-store.set() → 持久化 → 广播 config:changed
        → bridge/ipc-preferences 转成偏好变更 → 运行时 reconcile → 宠物自己挪过去/换装
```

因此设置页改"模型"后，宠物页无需知道是谁改的：收到偏好变更即换装。
托盘菜单也在每次变更后重建（保证勾选状态与配置一致）。

---

## 11. 一次聊天的完整数据流

```
主人按回车
  │ adapters/presentation/chat/dom-chat-surface.ts   输入框 Enter → onSend 回调
  ▼
app/pet-runtime.ts                                  Pet.say(文本)
  │ 领域事件：OwnerSpoke、ReplyStarted
  ├─▶ ChatSurface.showUtterance(文本)                主人的话进气泡
  ├─▶ BrainChannel.say(文本)                         话递给心智（经 IPC → 主进程 → WS）
  └─▶ PetStage.setSpeaking(true)                     口型开始开合

  ……心智回话（跨进程）……
  │ IPC.brainMessage → ipc-brain-channel 翻译 → 运行时分发
  ├─ chat.directive{emotion}  → Pet.express() → MoodChanged → stage.perform()（先表情）
  ├─ chat.delta{text}         → Pet.receiveReplyChunk() → ReplyChunk → 气泡.append()（逐字）
  └─ chat.done                → Pet.completeReply() → ReplyCompleted
                                → 气泡.finish()、口型停、轮次锁释放（可以听下一句了）
```

**领域视角**：宠物只是"听到一句、开始等待、收到几段、说完"；
至于消息怎么跨进程、怎么走 WebSocket，它一概不知——那些在 §8 的适配器里。

---

## 12. 验证体系（三层防线）

### 12.1 静态层

- `npm run typecheck`：node 侧（contracts+domain+app+shell+brain）与 web 侧
  （contracts+domain+app+presentation+bridge+entries）分别严格检查。
- `npm test`：66 个用例。
  - `tests/domain/*.test.ts`：宠物规则（现身只一次、一轮未结束不接新话、姿态夹紧…）
  - `tests/domain/purity.test.ts`：**分层纯净性守护**——`src/domain/` 只允许领域内部与
    `../shared/`（出现 electron/pixi/DOM/ws/node 或反向依赖外层即失败）；
    并要求 `src/shared/` 零 import
  - `tests/contracts/schemas.test.ts`：zod 边界解析（坏值回退、越界夹紧、未知字段丢弃…）
  - `tests/app/pet-runtime.test.ts`：运行时行为（挪窝防抖落盘、降级反复提醒、
    偏好变更 → 宠物响应、命中检测优先级…），用假端口驱动，不需要 Electron

### 12.2 运行时冒烟（`npm run smoke`）

三段式（`scripts/smoke.mjs` + `adapters/shell/smoke-check.ts`）：

1. **桌面基线**：先 GDI 实拍一张，计算透明区白点比例作为环境噪声参考；
2. **启动真实应用**（PET_SMOKE=1），主进程自动模拟主人操作：
   点击宠物（应为点击而非拖动，输入框弹出）→ 拖动宠物（位置改变并防抖落盘）
   → 说一句话（输入→运行时→IPC→心智→流式回包全链路）→ 截图宠物页与设置页；
3. **判定**：页面内容占比 >0.2%（有宠物与气泡）+ 运行中屏幕白点 <35%（透明正常）。

**为什么必须外部 GDI 实拍**：`capturePage` 读的是页面自身像素（§5.1），
白屏 bug 恰恰发生在它之后。冒烟用 `scripts/gdi-shot.ps1`（独立于 Chromium）
拍屏幕，才能捕获"页面正常但屏幕全白"这类合成层故障。

**隔离**：冒烟会真的拖动宠物并落盘，因此脚本通过 `PET_USER_DATA` 把数据目录
指向 `.smoke/user-data`——**绝不触碰主人正在使用的配置与位置**；
该环境变量同时让自检实例与正在运行的实例互不占用单实例锁，可以边开发边自检。

### 12.3 诊断层（白屏调查留下的实验工具箱）

| 工具 | 用途 | 入口 |
|---|---|---|
| 双路截图对比 | 页面 vs 屏幕，多时间点 | `PET_DIAG=1` + `scripts/diag-render.mjs` |
| 场景矩阵 | 隔离"内容类型"变量 | `PET_DIAG_SCENARIO=` + `scripts/analyze-scenario.mjs` |
| 最小探针 | 无 Pixi 的透明窗，判定环境级 vs 应用级 | `PET_DIAG=1 PET_DIAG_MINIMAL=1` |
| GPU 探针 | 延迟查询 GPU/合成状态 | `npx electron scripts/gpu-probe.cjs` |
| 图像分析 | ASCII 缩略图 / 区域取样 | `scripts/inspect-png.mjs`、`probe-region.mjs` |
| 参数注入 | 任意 Chromium 开关 / 渲染参数 A/B | `PET_SWITCH=`、`PET_RENDER_QUERY=`、`?premul=1` |

诊断代码是**旁路**：`adapters/shell/diagnostics.ts`（主进程侧）与
`adapters/presentation/diagnostics.ts`（渲染侧），由组装根按环境变量装配，不进领域。

---

## 13. 目录 → 职责速查

```
src/
├─ shared/                     通用原语（零依赖最底层：clamp / 命中判定）
├─ domain/                     领域（纯逻辑，有纯净性测试守护）
│  ├─ pet.ts                   宠物聚合根：行为 → 领域事件
│  ├─ ports.ts                 六个端口 = 业务需求清单
│  ├─ pose.ts / emotion.ts / appearance.ts / conversation.ts / preferences.ts
│  └─ events.ts                领域事件（判别联合）
├─ app/
│  └─ pet-runtime.ts           接线员：领域 ⇄ 端口（用例编排）
├─ adapters/
│  ├─ shell/                   主进程壳
│  │  ├─ pet-window.ts         整屏透明窗 + 显示器跟随
│  │  ├─ settings-window.ts    设置窗
│  │  ├─ tray.ts               托盘菜单
│  │  ├─ asset-protocol.ts     pet:// 协议（特权注册 + 穿越防护）
│  │  ├─ asset-catalog.ts      资源根 / 模型扫描 / Core 探测
│  │  ├─ config-store.ts       配置持久化（原子写/深合并/广播）
│  │  ├─ diagnostics.ts        白屏诊断工具箱（默认关闭）
│  │  └─ smoke-check.ts        冒烟自检钩子（PET_SMOKE=1）
│  ├─ brain/
│  │  ├─ brain-link.ts         心智连接（唯一网络出口；重连/状态）
│  │  └─ mock-brain.ts         Mock 心智（规则回复 + 流式时序）
│  ├─ presentation/
│  │  ├─ stage/                Pixi 舞台 + 两种躯体（Live2D / 占位）
│  │  ├─ chat/                 气泡与输入框（含追赶式打字机）
│  │  ├─ settings-page.ts      设置页逻辑
│  │  └─ diagnostics.ts        渲染侧诊断日志（?diag=1）
│  └─ bridge/
│     ├─ electron-desk.ts      手势识别 + 指针捕获（不打扰）
│     ├─ ipc-brain-channel.ts  IPC → 心智消息翻译
│     ├─ ipc-preferences.ts    偏好 ⇄ 应用配置映射
│     └─ appearance-catalog.ts 资产 → 形象清单
├─ contracts/                  跨进程契约（只有类型与常量）
│  ├─ ipc.ts                   12 个通道名 + 载荷类型
│  ├─ wire-protocol.ts         心智协议消息
│  ├─ app-config.ts            应用配置 + 默认值 + 净化
│  └─ model-catalog.ts         资产清单类型
├─ entries/                    组装根
│  ├─ main.ts / preload.ts / renderer.ts
└─ renderer/                   静态宿主（index.html / settings.html / styles.css）
resources/                     core（不入库）/ models（可替换）/ icon.png
tests/                         领域与运行时测试 + 纯净性守护
scripts/                       fetch-core / fetch-models / gen-icon / smoke / 诊断系列
docs/                          本文件 / domain / brain-protocol / white-screen-investigation / live2d-texture-gc
```

---

## 14. 开发环境注意事项

**HTML 引用渲染根之外的脚本**（`index.html` 加载 `entries/renderer.ts`、
`settings.html` 加载 `adapters/presentation/settings-page.ts`）之所以能工作，
靠的是 `electron.vite.config.ts` 里 renderer 段的两条别名：

```ts
alias: { '/entries': resolve(__dirname, 'src/entries'), '/adapters': resolve(__dirname, 'src/adapters') }
```

原因：dev 下 Vite 以 `src/renderer` 为根，浏览器会把 `../entries/renderer.ts`
归一化成 `/entries/renderer.ts` 再来请求——根目录下并没有 `entries/`，
于是 Vite 找不到模块（日志报 `Failed to load url`，页面白屏）；
生产构建走 Rollup 的原生相对路径解析，不受影响，所以这个坑**只在 dev 暴露**。
新增"根之外的入口"时，记得同步加一条别名。

**环境变量一览**（都在 `adapters/shell/` 与 `entries/main.ts` 里读取）：

| 变量 | 用途 |
|---|---|
| `PET_USER_DATA` | 改数据目录：自检实例与正在运行的实例互不干扰（也是冒烟隔离的基础） |
| `PET_SMOKE=1` | 启动自检流程（点击/拖动/对话 + 截图），见 §12.2 |
| `PET_DIAG=1` / `PET_DIAG_MINIMAL` / `PET_DIAG_SCENARIO` / `PET_DIAG_NOGPU` | 白屏诊断工具箱，见 §12.3 |
| `PET_SWITCH=<a;b>` / `PET_NOGPU=1` | 注入 Chromium 开关 / 关闭硬件加速（A/B 实验） |
| `PET_RENDER_QUERY=<aa=0&premul=1>` | 从主进程向页面注入渲染参数 |

---

## 15. 已知现象与扩展点

**已知现象（非缺陷）**

- 日志中偶见 CSP 拦截一条 `data:image/png;base64,…1×1…` 的 fetch
  （Pixi 空纹理路径），**不影响渲染**；若要去噪可在 CSP `connect-src` 加 `data:`。
- 本机 WebGL 走 SwiftShader 软件后端（真机 GPU 在 Electron 下未被选用），
  白屏根因在预乘 alpha 的合成路径，与后端软/硬无关。

**已修复的坑（改动前先读，不要回退）**

- **透明窗白屏**：`premultipliedAlpha` 必须为 `false`（§5、[white-screen-investigation.md](white-screen-investigation.md)）。
- **模型静置后消失**：Pixi 8.15+ 的 `GCSystem` 会回收 Live2D 直接绑定的纹理；
  必须保持 `gcActive: false`，且换形象时显式销毁纹理（§7.5、[live2d-texture-gc.md](live2d-texture-gc.md)）。

**扩展点（按接入成本排序）**

| 想做的事 | 改动位置 |
|---|---|
| TTS 出声 | `stage/live2d-body.ts` 的口型包络换成音频驱动；消费 `tts.chunk`（协议已预留） |
| 新情绪 | `domain/emotion.ts` 加标签 + 各模型 `pet.model.json` 加映射（向后兼容） |
| 新形象 | 丢进 `resources/models/<dir>/` + 一份 `pet.model.json`（托盘自动出现） |
| 待机小动作（自主行为） | `domain/pet.ts` 加行为（如 `doze()`）+ 事件；`pet-runtime` 接一个节奏器 |
| 亲密度/成长 | `domain/pet.ts` 加状态与规则；累计数据可放偏好或心智侧 |
| 多显示器漫游 | `domain/ports.ts` 的视口扩展为多屏模型；`adapters/shell/pet-window.ts` 跟随目标屏 |
| 复杂设置 UI | 换 `adapters/presentation/settings-page.ts`；IPC 契约（§10.2）不变 |
