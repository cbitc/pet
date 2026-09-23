# 桌宠实现原理与代码映射

> 本文回答三个问题：**这个桌宠是怎么跑起来的（原理）**、**代码是怎么组织的（结构）**、
> **原理在代码里的哪一行落地（映射）**。所有 `文件:行号` 均对应当前仓库代码。
>
> 配套文档：[brain-protocol.md](brain-protocol.md)（前后端契约）、
> [white-screen-investigation.md](white-screen-investigation.md)（白屏排查实录）。

---

## 1. 总体结构：四个运行单元

桌宠不是一个"应用"，而是**一组协作单元**。理解边界比理解细节更重要：

```
┌─ Electron 主进程（Node 环境，唯一能碰 OS 的地方）──────────────────────┐
│  pet-window   整屏透明窗（宠物/气泡/输入框都住在这里）                  │
│  store        配置持久化（JSON 原子写，变更广播）                      │
│  brain-gateway 唯一的外部网络出口（WS 客户端 + 重连）                  │
│  mock-brain   内置模拟大脑（真 WS 服务，后端未就绪时顶替）             │
│  tray/settings 托盘菜单、设置窗口                                      │
│  protocol     pet:// 静态资源协议                                     │
├─ preload（唯一桥梁，sandbox 内）───────────────────────────────────────┤
│  contextBridge 暴露 window.pet：类型化 IPC 白名单                      │
├─ 渲染进程（Chromium，无 Node 权限）────────────────────────────────────┤
│  Pixi v8 画布 → Live2D 模型（或占位史莱姆）                            │
│  DOM overlay → 气泡 / 输入条 / 状态角标                                │
│  interaction  命中检测驱动的动态穿透 + 拖拽/点击                        │
│  chat         聊天控制器（流式渲染 + 情绪联动）                         │
└───────────────────────────────────────────────────────────────────────┘
        ▲ WS（主进程发起）
        ▼
   独立后端大脑服务（另建项目；开发期由 mock-brain 顶替）
```

**结构原则**（每条都在后续章节展开）：

1. **能力最小化**：渲染进程无 Node、无直连网络；所有"危险能力"经 preload 白名单收口。
2. **网络唯一出口**：只有主进程说话，渲染进程连"大脑地址"都不知道是什么。
3. **表现与数据解耦**：大脑只发语义标签（`happy`），前端翻译成具体表情/动作。
4. **降级不崩溃**：缺 Core、缺模型、模型损坏，都有兜底路径（占位形象）。

目录与职责的速查表见 §13。

---

## 2. 窗口与进程模型

### 2.1 原理：为什么是"整屏透明窗"而不是"紧贴模型的窗口"

两种主流做法：

| 方案 | 做法 | 后果 |
|---|---|---|
| A. 小窗贴模型 | 窗口大小≈模型大小，拖窗口 | 气泡、输入框会被窗口边缘**裁剪**；窗口尺寸随模型缩放频繁变化；DPI 换算复杂 |
| B. 整屏透明层（本项目） | 窗口=显示器工作区，内部自由摆放 | 元素永不被裁剪；坐标体系统一；代价是必须处理**穿透**（§4）和**透明合成**（§3） |

选择 B 的直接后果：**"拖动宠物"= 移动舞台内模型的坐标，而不是移动窗口**。
窗口自始至终钉在工作区上（`src/main/pet-window.ts:88-98`，显示器参数变化时重新贴合）。

### 2.2 窗口参数逐项映射

`createPetWindow()`（`src/main/pet-window.ts:10-43`）：

| 参数 | 值 | 原理 |
|---|---|---|
| `frame` | `false` | 无系统边框，纯内容 |
| `transparent` | `true` | 窗口背景参与 alpha 合成，露出桌面 |
| `hasShadow` / `resizable` / `movable` / `minimizable` / `maximizable` / `fullscreenable` | 全 `false` | 整屏层不该有窗口行为；`movable:false` 防止系统级拖动与模型拖动冲突 |
| `skipTaskbar` | `true` | 桌宠是"挂件"，不进任务栏 |
| `backgroundColor` | `'#00000000'` | 全透明底色（注意与 §3 的 WebGL 预乘问题无关，这是 DOM 层底色） |
| `show: false` + `ready-to-show → showInactive()` | — | 避免白屏闪烁；`showInactive` 不抢焦点（桌宠不应打断用户） |
| `setAlwaysOnTop(true, 'screen-saver')` | — | `screen-saver` 层级高于普通置顶窗口，锁屏/屏保之上仍可见（`:41`） |
| `backgroundThrottling: false` | — | 窗口失焦后 Chromium 默认降帧，桌宠会"僵住"；关闭节流保持动画流畅（`:36`） |
| `setIgnoreMouseEvents(true, { forward: true })` | 初始全穿透 | 详见 §4（`:43`） |

安全三件套（`:32-35`）：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。

### 2.3 单实例与启动序列

- 单实例锁：`src/main/index.ts:22-25`，第二次启动直接退出并唤出已有实例。
- 启动顺序（有依赖关系，改代码时注意）：`applyDiagSwitches()`（改命令行开关必须在 ready 前）
  → `registerPetScheme()`（注册协议特权也必须在 ready 前，见 §5）
  → `app.whenReady()` → `store.init()` → `registerPetProtocol()` → 建窗 → 起网关 → 托盘 → 注册 IPC（`src/main/index.ts:27-109`）。

---

## 3. 透明合成与白屏（本项目最深的坑）

### 3.1 原理：页面的 alpha ≠ 屏幕上的 alpha

屏幕上最终看到的像素经过**两条不同的路径**：

```
路径1 页面内部:   DOM + WebGL 画布 → Chromium 渲染 → 页面自己的像素（含 alpha）
路径2 原生合成:   页面像素 → 原生窗口的透明合成 → 桌面像素（用户实际看到）
```

`webContents.capturePage()` 只能读路径 1；`desktopCapturer`/GDI 实拍读路径 2。
**白屏 bug 的全部特征都来自"路径 1 正常、路径 2 全白"**——这就是为什么排查时
必须双路取证（§10.2）。

### 3.2 触发条件与根因（实测结论）

在白屏调查中隔离出的变量（详见 [white-screen-investigation.md](white-screen-investigation.md)）：

- 与窗口参数无关（透明/不透明、大小窗均复现）；
- 与"是否绘制"无关——**Live2D 模型只要加入舞台（哪怕 `visible=false`）就触发**；
- Pixi 空场景、纯 DOM、Pixi Graphics 占位形象都不触发；
- 决定性变量是 WebGL 上下文的 **`premultipliedAlpha`**：置 `false` 后白屏消失。

原理层面的解释：预乘 alpha 的 WebGL 内容在透明窗的原生合成路径上被错误处理
（本机 Electron 44 + 显卡驱动栈环境），整窗被填成不透明白色。
`capturePage` 看不到它，因为问题发生在页面之后的合成环节。

### 3.3 代码映射

`src/renderer/src/app.ts:37-56`：

```ts
// 默认 premultipliedAlpha: false（修复态）；?premul=1 可复现白屏
const usePremul = new URLSearchParams(location.search).get('premul') === '1'
await this.app.init({
  canvas, resizeTo: window, antialias: true,
  background: 0x000000, backgroundAlpha: 0,
  preference: 'webgl',
  premultipliedAlpha: usePremul,   // ← 白屏开关（:53）
  resolution: 1,                    // ← 与 CSS 像素 1:1（:54）
  autoDensity: true
})
```

**`resolution: 1` 是同一修复的一部分**，它带来一个重要的全局简化：
画布缓冲区尺寸 == CSS 像素 == 窗口逻辑像素。
于是鼠标事件的 `clientX/clientY` **可以直接**当作画布坐标使用——
`focus()`（注视）和 `hitBounds()`（命中）不需要任何 DPI 换算（§8.1）。
代价是高 DPI 屏上渲染分辨率低于物理分辨率（对卡通形象可接受）。

### 3.4 复现与回归

- 复现：启动参数加 `?premul=1`（`app.ts:41`）。
- 回归防线：`npm run smoke` 会在应用运行中用 **外部 GDI 实拍**屏幕，
  统计透明区白点占比（>35% 判 FAIL），见 `scripts/smoke.mjs:78-89,143-148`。

---

## 4. 点击穿透：命中检测驱动的动态切换

### 4.1 原理：`setIgnoreMouseEvents` 与 `forward`

窗口全屏覆盖桌面，若不处理，桌面上所有点击都会被这层"玻璃"吃掉。
Electron 的解法是 `win.setIgnoreMouseEvents(ignore, { forward: true })`：

- `ignore: true` → 鼠标事件穿透到下层应用（桌面恢复可用）；
- `forward: true` → **即使穿透，`mousemove` 仍转发给页面**。

`forward` 是关键：没有它，一旦穿透页面收不到任何鼠标事件，
就永远无法检测到"鼠标又移回宠物身上了"，穿透状态会卡死。
`src/main/pet-window.ts:43` 以穿透态启动；`forward:true` 贯穿所有切换（`src/main/index.ts:96`）。

### 4.2 状态机

```
                mousemove: 命中宠物 or UI          mouseleave（非拖拽中）
  ┌──────────┐ ─────────────────────────▶ ┌──────────┐ ──────────────▶ ┌──────────┐
  │ 穿透态    │                            │ 捕获态    │                  │ 穿透态    │
  │ ignore=1 │ ◀───────────────────────── │ ignore=0 │ ◀──────────────  │          │
  └──────────┘   mousemove: 离开所有命中区   └──────────┘                  └──────────┘
```

代码：`setInteractive()`（`src/renderer/src/interaction.ts:32-35`，去抖 —
状态不变不重复发 IPC）；`mousemove` 判定（`:55-63`）。

### 4.3 命中检测的两个来源

| 来源 | 判定方式 | 代码 |
|---|---|---|
| 宠物本体 | 模型/形象的**包围盒**（`hitBounds()` 全局坐标 + 12px 容差） | `interaction.ts:38-46` |
| DOM UI | `document.elementFromPoint` 找最近祖先带 `data-interactive` 属性 | `interaction.ts:48-52`；标记见 `src/renderer/index.html:20` |

用属性标记而不是硬编码元素 id，使"输入条、状态角标、未来任何新 UI"
只要加一个属性就自动获得交互权（穿透逻辑零修改）。

已知取舍：包围盒是矩形，比模型轮廓松散——宠物腋下/头发缝隙等
"透明但在矩形内"的区域也会捕获鼠标。对桌宠是可接受的（精确到像素需要
读模型 hitArea/mask，成本高收益低）。

### 4.4 与其他交互的配合

- 悬停即注视：命中宠物时同步调 `avatar.focus(clientX, clientY)`（`interaction.ts:61`），眼睛跟随鼠标。
- 拖拽中**不做穿透切换**（`interaction.ts:56` 提前 return），避免拖动过程中窗口突然穿透导致丢事件。
- 兜底：`mouseleave` 强制回穿透态（`interaction.ts:111-115`），防止"悬空卡在捕获态"。

---

## 5. 资源寻址：`pet://` 协议

### 5.1 问题与候选方案

Core 脚本与模型文件在运行时才需要，且**不能打进 asar**（Core 有再分发许可限制、
模型要允许用户替换）。候选方案对比：

| 方案 | 问题 |
|---|---|
| `file://` 直接引用 | 渲染进程页面（http:// 或 file://）跨源加载受限；打包后路径不可控 |
| 打进 asar 读包内路径 | Core 不能被"再分发打包"规避许可；用户无法替换模型 |
| **自定义协议 `pet://`（采用）** | 统一寻址，跨源可控，物理文件保持"用户可见可替换" |

### 5.2 实现

两步注册（Electron 的硬性要求）：

1. **`registerSchemesAsPrivileged`**（`src/main/protocol.ts:10-23`，必须在 app ready 前调用）：
   把 `pet` 声明为 `standard + secure + supportFetchAPI + stream + corsEnabled`。
   没有 `standard` 就没有正常的 URL 语义；没有 `secure` 浏览器会当不安全源。
2. **`protocol.handle`**（`src/main/protocol.ts:47-72`，ready 后）：把
   `pet://models/haru/xxx.model3.json` 映射到磁盘文件：
   - `host` 承载第一段路径（standard 协议的 URL 解析规则）；
   - **路径穿越防护**：`target` 必须落在资源根内，否则 403（`:55-58`）；
   - 带 MIME 表（`:25-45`）、`net.fetch(file://)` 流式返回、`no-cache`。

物理根目录由 `resourceRoot()` 决定（`src/main/resources.ts:7-9`）：
开发态 = 项目 `resources/`；打包态 = `process.resourcesPath`（即 electron-builder
`extraResources` 输出目录，见 `electron-builder.yml` 的 `core→core`、`models→models`）。
**同一段代码，dev/prod 寻址完全一致**。

### 5.3 许可约束如何在结构上落实

| 约束 | 结构落实 |
|---|---|
| Cubism Core 禁止再分发 | `resources/core/` 在 `.gitignore`；由 `scripts/fetch-core.mjs` 从官方下载；不进 git、不进安装包源码 |
| Core 仍需随应用运行 | 浏览器侧经 `<script src="pet://core/live2dcubismcore.min.js">` 引导（`src/renderer/index.html:11`） |
| 模型可替换 | 模型扫描/清单机制（§6.4），换目录即换模型 |

---

## 6. 形象层：Pixi + Live2D + PetAvatar 抽象

### 6.1 渲染管线

```
live2dcubismcore.min.js（官方 Core，WASM/JS，提供 moc3 解析与参数求值）
        ↓ 被
@jannchie/pixi-live2d-display（框架层：模型加载、动作/表情调度、眨眼呼吸物理、口型）
        ↓ 输出为
PIXI.Container（一个可变换的显示对象：position/scale/anchor）
        ↓ 加入
Pixi Application.stage（WebGL 渲染）
```

选型背景：Pixi v8 是当前主线，而原版 `pixi-live2d-display` 只到 Pixi v7；
`@jannchie/pixi-live2d-display`（1.4.x）是活跃维护的 v8 分支，API 与原版兼容，
且内置 lipSync。加载入口：`src/renderer/src/avatar/live2d-avatar.ts:44-52`
（`Live2DModel.from(url, { ticker, autoHitTest:false, autoFocus:false })`——
关掉库自带的鼠标交互，统一由我们的 `interaction.ts` 处理，避免双份事件逻辑）。

### 6.2 两处 CSP 放宽的原理

严格 CSP 下有两个硬需求（`src/renderer/index.html:7`）：

| CSP 项 | 为什么必须放宽 |
|---|---|
| `script-src 'self' pet:` | Core 脚本来自 `pet://`（`:11`） |
| `worker-src 'self' blob:` | Pixi 用 blob worker 做贴图上传/解码 |
| `style-src 'unsafe-inline'` | settings.html 有内联 `<style>`；另 Pixi 部分场景注入样式 |
| `connect-src ... blob:` | Pixi worker 通信 |

另外 Pixi v8 默认用 `new Function` 编译着色器，与 CSP 冲突，
官方提供无 eval 的实现：`import 'pixi.js/unsafe-eval'`（`src/renderer/src/app.ts:1-2`，
名字易误解，作用恰恰是**为 CSP 环境去 eval**，必须在创建 Application 之前 import）。

> 注意：**大脑的 WS 地址不需要出现在渲染进程 CSP 里**——网络在主进程（§7.2）。
> CSP 的 `ws://localhost:*` 只是给 Vite HMR 用的。

### 6.3 `PetAvatar` 接口 = 防崩溃契约

`src/renderer/src/avatar/types.ts:8-22` 定义了形象的全部能力（7 个方法）：
`view`（Pixi 对象）、`naturalHeight`（布局基准）、`hitBounds`、`setEmotion`、
`setTalking`、`focus`、`playTap`、`dispose`。

**两个实现共用一个接口**：

| 实现 | 文件 | 用途 |
|---|---|---|
| `Live2DAvatar` | `avatar/live2d-avatar.ts:31` | 真实模型；事件/表情/口型全能力 |
| `PlaceholderAvatar` | `avatar/placeholder-avatar.ts:20` | 一只史莱姆：Graphics 画的圆 + 手写眨眼/呼吸/口型动画（`:78-113`） |

收益：聊天、交互、布局、情绪逻辑**完全不感知**底下是谁——
换渲染引擎（如换 Live3D/精灵图）只改 `avatar/` 目录。

### 6.4 降级链

`createAvatar()`（`src/renderer/src/avatar/index.ts:17-43`）的判定顺序：

```
Cubism Core 缺失？ ──是──▶ 占位形象 + warning 气泡（提示跑 fetch:assets）
   │否
配置的模型存在？ ──否──▶ 占位形象 + warning
   │是
Live2DModel.from() 成功？ ──否──▶ 占位形象 + warning（catch 记录原因）
   │是
Live2DAvatar（正常路径）
```

warning 由 `app.ts:203-214 greet()` 以气泡滚动提示。整个链路保证：
**任何资产缺失都不影响应用可用性**。

### 6.5 情绪映射表：语义标签 → 模型细节

原理：LLM 不该知道"Haru 的开心表情是 f03"，它只输出语义 `happy`；
**模型细节翻译发生在前端**，配置在模型目录的 `pet.model.json`：

```jsonc
// resources/models/haru/pet.model.json（由 fetch-models 生成）
{ "displayName": "Haru（官方示例）", "entry": "haru_greeter_t03.model3.json",
  "idleGroup": "Idle", "tapMotion": "Tap",
  "emotions": {
    "neutral":   { "expression": null },            // null = 重置为默认表情
    "happy":     { "expression": "f03", "motion": "Tap" },
    "sad":       { "expression": "f05" },
    "angry":     { "expression": "f06" },
    "surprised": { "expression": "f04", "motion": "Tap" } } }
```

消费方：`Live2DAvatar.setEmotion()`（`live2d-avatar.ts:58-79`）——
expression 与 motion 都存在才触发动作，名字不存在时静默降级（try/catch）。
**换模型 = 换一份 json**，代码零改动。类型定义见 `src/shared/model.ts:6-25`。

### 6.6 三个"活起来"的机制

| 机制 | 原理 | 代码 |
|---|---|---|
| 说话口型 | 以 ~70ms 为周期给口型参数喂正弦+噪声包络（模拟说话的开合节奏） | `live2d-avatar.ts:81-96`（`startLipSync/setLipSyncValue`） |
| 眼睛注视 | 把鼠标位置传给模型，库换算为眼球参数 | `interaction.ts:61` → `live2d-avatar.ts:98-100` |
| 点击反应 | 强制优先级（3）播 Tap 动作组 + 打开输入条 | `live2d-avatar.ts:102-108`；`app.ts:101` |

**TTS 接入点**：`setTalking(true/false)` 是唯一的"说话态"开关。日后 TTS 音频到达时，
把 `live2d-avatar.ts:86-90` 的合成包络替换为音频振幅分析（或直接用库的
`model.speak(audioUrl)`），聊天链路其余部分不需要任何修改。

---

## 7. 大脑通信：协议、网关与 Mock

### 7.1 职责切分原理

前后端契约（完整定义见 [brain-protocol.md](brain-protocol.md)）只有一句话：
**后端管"说什么"，前端管"怎么表现"。**

| 关注点 | 归属 |
|---|---|
| LLM 调用、提示词、记忆、多轮上下文、结构化输出解析 | 后端 |
| 文本流的**逐字呈现**、情绪/动作的**具体翻译**、口型、气泡 | 前端 |

因此后端消息永远只有两类内容：**文本增量**（`chat.delta`）与
**语义指令**（`chat.directive{emotion}`）。类型定义：`src/shared/protocol.ts:39-86`。

| 方向 | 消息 | 说明 |
|---|---|---|
| C→S | `session.hello` | 连接后立即发送；携带 clientId/sessionId/persona（`:19-26`） |
| C→S | `chat.send` | 用户消息 + ts（`:28-33`） |
| S→C | `session.ready` | 会话确认（`:39`） |
| S→C | `chat.directive` | 情绪指令，流内任意时刻可发，通常先于文本（`:52-58`） |
| S→C | `chat.delta` | 文本增量（UTF-16 安全切片，不拆代理对）（`:45-49`） |
| S→C | `chat.done` | 本轮结束（`:60-64`） |
| S→C | `tts.chunk` | **v1 预留**，前端收到忽略（`:67-73`） |
| S→C | `chat.error` | 本轮失败（`:76-80`） |

未知消息类型必须忽略（向前兼容），前端已如此实现（`controller.ts:54-57` 的 default 分支）。

### 7.2 为什么网络放在主进程

1. **安全面收窄**：渲染进程（跑着 WebGL、加载远端模型）是攻击面最大的地方；
   它连自己的 WS 都开不了，只能通过 preload 白名单说"帮我发这段话"。
2. **CSP 不用为后端放行**：任意后端地址都不会进入页面 CSP（§6.2 注）。
3. **未来密钥预留**：若协议加鉴权，API Key 只存在于主进程。
4. **重连不依赖页面**：页面刷新/崩溃重载时，网关连接可保持，
   重连逻辑不会因渲染进程状态而归零。

### 7.3 网关状态机

`BrainGateway`（`src/main/brain-gateway.ts:14-147`）：

```
mock 模式：startMockBrain() 起真实 WS 服务（127.0.0.1 随机端口）→ 连它
remote 模式：直接连 cfg.brain.url
      │
      ├─ open → 发 session.hello → status: online（retryCount 清零）
      ├─ message → JSON.parse → emit('message') → IPC 转发渲染进程
      └─ close/error → status: offline → 指数退避重连
                         delay = min(1000·2ⁿ, 15000) + 随机 ≤500ms（:138-147）
```

状态经 `brain:status` 事件 → 渲染进程显示角标（`controller.ts:67-84`：
绿=已连接自动淡出 / 黄=连接中 / 红=离线重连中）。

`sendChat()` 的输入在主进程边界截断 2000 字符（`src/main/index.ts:91`），
防御渲染进程被注入后发送畸形大 payload。

### 7.4 Mock 大脑：为什么要"真 WS 回环"

`mock-brain.ts:108-135` 在随机端口起一个**真实的 WebSocketServer**，
网关用**完全相同的网络代码路径**连接它。收益：

- 前端独立开发期，`chat.delta/directive/done` 的时序、分片、异步行为全是真货；
- 后端替换时，前端只需把 `brain.mode` 从 `mock` 切到 `remote`，**零代码改动**；
- 集成测试（如冒烟）天然覆盖网络层。

回复逻辑：规则表匹配（`mock-brain.ts:15-58`，你好/笑话/情绪词等）→
先发 `directive(emotion)`，再以 2 字符/40~85ms 流式发 `delta`，
最后 `done`（`:90-101`）。这个"指令先行"的时序是**有意设计的**：
宠物先变表情再开口，比反过来自然。

### 7.5 流式渲染：追赶式打字机

气泡收到 `delta` 后**不直接显示**，而是进缓冲由定时器逐字吐出
（`src/renderer/src/chat/bubble.ts:58-118`）：

```ts
const step = Math.max(1, Math.round((buffer.length - shown) / 6))  // :85
// 每 26ms 吐 step 个字符：落后越多吐越快，长回复不会"打字打不完"
```

效果：网络抖动（一大块 delta 突然到达）被视觉上平滑掉，
用户看到的是匀速但会"加速追赶"的打字感。气泡容量上限 2 条、用户气泡 9s /
助手气泡 14s 后淡出（`:12-14`）。

**这里有一个必须记住的坑**（已修复，注释保留在 `:33-34`）：
容量裁剪的 `while` 循环里只能做**同步移除**。早期版本在循环里调
`fadeOut()`（异步 450ms 后才 remove），条件永远为真 → 死循环挂死渲染进程，
且不产生任何错误日志。这类"静默死循环"是冒烟测试存在的另一个理由。

---

## 8. 交互与布局

### 8.1 归一化坐标系统

所有持久化的位置都是**相对值**，与分辨率/显示器无关（`src/shared/config.ts:12-18`）：

| 字段 | 含义 | 范围 |
|---|---|---|
| `pose.x` / `pose.y` | 模型锚点相对工作区的比例（锚点在模型中心） | (0,1) |
| `pose.scale` | **模型显示高度 ÷ 屏幕高度** | 0.15 ~ 1.4 |

换算（正向，`app.ts:169-178`）：

```
scale_px = (h × pose.scale) / naturalHeight     // naturalHeight 是模型的"设计高度"
pos      = (w × pose.x, h × pose.y)
```

反向（拖拽结束后，`app.ts:180-193`）：把像素位置除回窗口尺寸，
防抖 400ms 后写回配置——拖动过程中的每次 pointermove 不产生磁盘写。

### 8.2 元素的相对锚定

气泡与输入条不写死坐标，而是**每次布局后跟随模型包围盒**（`app.ts:195-201`）：

```
气泡:   锚在 包围盒顶边中点上方 16px（transform: translate(-50%,-100%)，styles.css:34-47）
输入条: 锚在 包围盒底边中点下方 22px
```

因此拖拽（`onDragMove`）、换模型、改缩放（`config:changed`）、窗口 resize
四条路径都会调用 `repositionChat()`，UI 始终"长在宠物身上"。
两者都做了视口内 clamp（`bubble.ts:24-27`、`input.ts:46-49`），
防止贴边时飘出屏幕。

### 8.3 点击 vs 拖拽

同一次按压可能是"点击宠物"也可能是"拖胖宠物"，判定在抬手时做
（`interaction.ts:98-107`）：

```
位移 < 8px  → 点击：playTap() 动作 + 呼出输入条
位移 ≥ 8px  → 拖拽：持久化新位置
```

拖拽会把模型 clamp 在工作区内（`,50` / `,80` / `-50` / `-30` 的边距，
`interaction.ts:92-95`），保证宠物不会被拖到完全不可见。

---

## 9. 配置与 IPC

### 9.1 `ConfigStore` 的三个要点

`src/main/store.ts:24-76`：

1. **原子写**：先写 `pet-config.json.tmp` 再 `rename`（`:44-49`）——
   断电/崩溃时不会留下半截 JSON。
2. **defaults 深合并**：读盘后与 `DEFAULT_CONFIG` 深合并（`:13-22,35-42`）——
   新增配置项后老配置文件自动补齐，无需迁移。
3. **净化**：`sanitizeConfig()`（`src/shared/config.ts:53-64`）对所有数值 clamp、
   非法枚举回退——**配置永不导致崩溃**（手改坏了也只是回到默认）。

`sessionId` 在首次启动时生成 UUID（`store.ts:63-68`），此后同一安装保持同一会话身份。

### 9.2 IPC 通道全表

preload 白名单（`src/preload/index.ts:27-53`）与主进程注册（`src/main/index.ts:73-109`）一一对应：

| 通道 | 方向/形式 | 用途 |
|---|---|---|
| `config:get` | invoke | 读配置（渲染进程启动时） |
| `config:set` | invoke | 写配置补丁；主进程据 diff 触发网关重启/开机自启设置 |
| `models:list` | invoke | Core 是否存在 + 模型清单 |
| `brain:send` | send（C→M） | 发一条用户消息（主进程截断 2000 字符） |
| `window:set-ignore-mouse` | send（C→M） | 穿透切换（带 **sender 校验**：只有宠物窗能调，`:94-97`） |
| `app:quit` | send（C→M） | 退出（同样校验 sender） |
| `app:open-settings` | send（C→M） | 打开设置窗 |
| `brain:status` | 事件（M→C） | 网关状态 → 角标 |
| `brain:message` | 事件（M→C） | 大脑消息（流式文本/指令） |
| `config:changed` | 事件（M→C） | 任何来源（托盘/设置窗）改了配置 → 宠物页同步 |
| `ui:toggle-input` / `ui:reset-pose` | 事件（M→C） | 托盘菜单动作 |

### 9.3 单向数据流

配置有**多个写入口**（托盘菜单、设置窗、宠物页自己持久化 pose），
但只有一个真相源（主进程 `store`）：

```
任何入口 → store.set() → 持久化 → onChange 广播 config:changed → 各窗口刷新
```

因此设置窗改"模型"后，宠物页无需知道是谁改的，收到广播即换装
（`app.ts:156-167 onConfigChanged`）。托盘菜单也在每次变更后重建
（`tray.ts:27-77`，保证 radio 勾选状态与配置一致）。

---

## 10. 验证体系

三层防线，全部可脚本化执行：

### 10.1 静态层

`npm run typecheck`：main（含 shared）与 renderer 两个 TS 工程分别严格检查。
shared 目录被两边同时 include，**协议/配置类型的改动会在编译期同时约束前后端两侧**。

### 10.2 运行时冒烟（`npm run smoke`）

`scripts/smoke.mjs` 的三段式：

1. **桌面基线**：先拍一张屏幕（GDI 实拍），计算透明区白点比例作为环境噪声参考（`:91-94`）；
2. **启动应用**：`PET_SMOKE=1` 环境下启动**真实应用**，主进程自动走
   "填输入框 → 回车 → 等待回复 → `capturePage` 截图 → 打开设置窗截图 → 退出"
   （`src/main/index.ts:111-156`）。这条路径覆盖了
   渲染→IPC→网关→Mock 大脑→流式回包→气泡**全链路**；
3. **判定**：页面内容占比 >0.2%（有宠物和气泡）+ 运行中屏幕白点 <35%（透明正常）。

**为什么必须外部 GDI 实拍**：`capturePage` 读的是页面自己的像素（§3.1），
白屏 bug 恰恰发生在它之后。冒烟脚本用 `scripts/gdi-shot.ps1`（Windows GDI，
独立于 Chromium）拍屏幕，才能捕获"页面正常但屏幕全白"这类合成层故障。

### 10.3 诊断层（白屏调查留下的实验工具箱）

| 工具 | 用途 | 入口 |
|---|---|---|
| 双路截图对比 | 页面 vs 屏幕，多个时间点（0~5200ms） | `PET_DIAG=1` + `scripts/diag-render.mjs` |
| 场景矩阵 | 隔离"内容类型"变量（blank/dom/webgl/opaque） | `PET_DIAG_SCENARIO=` + `scripts/analyze-scenario.mjs` |
| 最小探针 | 无 Pixi 的透明窗，判定环境级 vs 应用级 | `PET_DIAG=1 PET_DIAG_MINIMAL=1` |
| GPU 探针 | 延迟查询 GPU/合成状态 | `npx electron scripts/gpu-probe.cjs` |
| 图像分析 | ASCII 缩略图/区域取样 | `scripts/inspect-png.mjs`、`probe-region.mjs` |
| 参数注入 | 任意 Chromium 开关/渲染参数 A/B | `PET_SWITCH=` `PET_RENDER_QUERY=` `?premul=1` 等 |

实验方法论（"一次只动一个变量"+ 双路取证）详见
[white-screen-investigation.md](white-screen-investigation.md)，遇新型透明窗问题先跑这组工具。

---

## 11. 全景：一次聊天的完整数据流

```
用户按回车
  │ chat/input.ts:9-26          输入框 keydown(Enter) → 回调
  ▼
chat/controller.ts:30-37        pending 闩锁 → setTalking(true)（口型开始）
  │                             → showUser 气泡 → beginAssistant 占位气泡(打字点)
  ▼
preload/index.ts   window.pet.sendChat(text)
  │ IPC 'brain:send'
  ▼
main/index.ts:89-92             sender 校验 → gateway.sendChat(text.slice(0,2000))
  ▼
brain-gateway.ts:52-55          WS 发送 chat.send
  ▼
mock-brain.ts:90-101            （或真实后端）
  │ ① chat.directive{emotion:"happy"}     ← 先表情后说话
  │ ② chat.delta × N（2 字符/40~85ms）
  │ ③ chat.done
  ▼
main/index.ts:63                emit('message') → webContents.send('brain:message')
  │ IPC
  ▼
app.ts:110                      分发到 controller.handleServerMessage
  ├ directive → avatar.setEmotion() → pet.model.json 查表 → expression+motion   (live2d-avatar.ts:58-79)
  ├ delta     → bubble.append() → 追赶式打字机 26ms/步                          (bubble.ts:58-118)
  └ done      → controller.finish() → setTalking(false)（口型停）→ pending 解锁  (controller.ts:60-65)
```

---

## 12. 关键设计决策与权衡

| # | 决策 | 理由（原理） | 代价 / 替代 |
|---|---|---|---|
| 1 | 整屏透明窗（非贴模型小窗） | 气泡/输入条永不被裁剪，坐标统一 | 必须实现穿透（§4）与透明合成修复（§3） |
| 2 | 拖拽=移动模型非移动窗口 | 窗口是固定坐标系，配置只需存归一化位置 | 需自己做边距 clamp |
| 3 | `premultipliedAlpha:false` + `resolution:1` | 绕开本环境透明合成白屏；坐标 1:1 简化一切换算 | 高 DPI 渲染分辨率略降 |
| 4 | 网络全部在主进程 | 安全面收窄、CSP 不需放行后端、密钥预留、重连不随页面归零 | 每条消息多一跳 IPC（本地 <1ms，无感） |
| 5 | `pet://` 自定义协议 | dev/prod 寻址统一；Core/模型可保持为可替换的物理文件 | 需要一个路径穿越防护 |
| 6 | `PetAvatar` 抽象 + 占位实现 | 资产缺失/库故障不崩溃；换渲染方案只动一个目录 | 抽象成本（7 方法接口） |
| 7 | 情绪映射放前端（`pet.model.json`） | 后端只产语义，换模型后端零感知 | 每个新模型要写一份映射（一次性） |
| 8 | Mock 大脑走真 WS | 前端可独立开发；切后端零代码改动；测试覆盖网络层 | Mock 本身要维护协议一致性 |
| 9 | 气泡/输入条用 DOM 而非 Pixi 文本 | 文字排版/滚动/输入法（IME）在 DOM 天然可用 | 两个渲染体系的坐标要对齐（靠 hitBounds 锚定） |
| 10 | 无前端框架（纯 TS + DOM） | 交互面小（3 个 UI 元件），依赖最小化 | 若后续设置页复杂化可能要引入框架 |
| 11 | 配置"多入口单真相源 + 广播" | 托盘/设置窗/宠物页任何一方改动，其余自动同步 | 需注意广播回环（当前各入口做了幂等） |

---

## 13. 目录 → 职责速查

```
src/
├─ main/                     主进程（Node）
│  ├─ index.ts               生命周期 + IPC 注册 + 冒烟脚本钩子（:111-156）
│  ├─ pet-window.ts          整屏透明窗 + 显示器跟随
│  ├─ settings-window.ts     设置窗（480×620，同 preload）
│  ├─ protocol.ts            pet:// 协议（特权注册 + 句柄 + 穿越防护）
│  ├─ resources.ts           资源根目录/模型扫描/Core 存在性
│  ├─ store.ts               配置持久化（原子写/深合并/净化/广播）
│  ├─ brain-gateway.ts       WS 网关（唯一网络出口；重连/状态机）
│  ├─ mock-brain.ts          内置 Mock 大脑（规则回复 + 流式时序）
│  ├─ tray.ts                托盘菜单（随配置重建）
│  └─ diagnostics.ts         白屏诊断工具箱（环境变量驱动，默认关闭）
├─ preload/index.ts          contextBridge 白名单（window.pet）
├─ shared/                   主/渲染共用类型（编译期双端契约）
│  ├─ protocol.ts            WS 消息类型（§7.1 表）
│  ├─ config.ts              AppConfig + DEFAULT + sanitize
│  └─ model.ts               ModelMeta / 情绪绑定 / pet:// URL 构造
└─ renderer/
   ├─ index.html             宠物页（CSP + pet:// Core 引导 + DOM overlay 骨架）
   ├─ settings.html          设置页（内联样式）
   └─ src/
      ├─ app.ts              总装：Pixi 初始化(§3) / 布局(§8) / 事件接线
      ├─ interaction.ts      穿透状态机 + 拖拽/点击/注视(§4,§8.3)
      ├─ diagnostics.ts      渲染侧诊断日志（?diag=1）
      ├─ avatar/             PetAvatar 抽象 + Live2D 实现 + 占位史莱姆(§6)
      ├─ chat/               控制器(§7.5) / 气泡打字机 / 输入条
      └─ styles.css          气泡/输入条/角标样式（透明底、毛玻璃）
scripts/                     fetch-core / fetch-models / gen-icon /
                             smoke / inspect-png / 白屏诊断系列
resources/                   core（不入库）/ models（可替换）/ icon.png
docs/                        本文件 / brain-protocol / white-screen-investigation
```

---

## 14. 已知现象与扩展点

**已知现象（非缺陷）**

- 日志中偶见 CSP 拦截一条 `data:image/png;base64,…1×1…` 的 fetch
  （Pixi 空纹理路径），已被 `connect-src` 拦截但**不影响渲染**
  （dev/prod 截图逐像素基线一致）；若要去噪可在 CSP `connect-src` 加 `data:`。

**扩展点（按接入成本排序）**

| 想做的事 | 改动位置 |
|---|---|
| TTS 出声 | 替换 `live2d-avatar.ts:86-90` 的合成口型为音频驱动；消费 `tts.chunk`（协议已预留） |
| 新增情绪 | `shared/protocol.ts:7` 加标签 + 各模型 `pet.model.json` 加映射（均向后兼容） |
| 新模型 | 丢进 `resources/models/<dir>/` + 一份 `pet.model.json`（托盘自动出现） |
| 待机小动作调度 | `Live2DAvatar` 内加计时器按 `idleGroup` 随机播（接口不变） |
| 多显示器 | `pet-window.ts:88-98` 的 refit 改为跟随目标显示器；pose 需按显示器存储 |
| 复杂设置 UI | 设置页引入框架时，IPC 契约（§9.2）不变，只换渲染层实现 |
