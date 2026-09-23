# 透明窗白屏问题排查记录

> 状态：已关闭（修复已落地） · 类型：事故排查 · 日期：2026-09-23 · 关联：[0002](0002-live2d-texture-gc.md)
>
> 两条问题都在引入 Live2D 内容后暴露，但发生性完全不同：本文是「原生合成」，0002 是「GPU 资源生命周期」。

## 结论（TL;DR）

Windows + Electron 44 + 本机显卡驱动栈环境下，Pixi 默认的 **`premultipliedAlpha: true`** 会让
WebGL 画布在合成到**透明窗口**时把整窗渲染成不透明白色。修复：初始化为 `premultipliedAlpha: false`
（见 `src/adapters/presentation/stage/pixi-stage.ts` 的 `PixiStage.create`）。

## 症状

- 启动后整个宠物窗口区域（覆盖主显示器工作区的整屏透明层）变成**纯白**，遮挡桌面；任务栏不受影响。
- 白屏在**首个 WebGL 内容出现后**发生，且随后**不可逆**（移除模型、隐藏模型均不恢复）。
- `capturePage()`（页面自身结果）显示完全正常且透明——白屏只发生在原生合成环节。

## 关键实验与证据

| 实验         | 方法                                                             | 结果                                                           |
| ------------ | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| 双路截图     | `capturePage`（页面 alpha） vs `desktopCapturer`/GDI（屏幕合成） | 页面 96.7% 透明，屏幕 95% 全白 → 问题在页面之外                |
| 分组对照     | Google Chrome（同 Chromium）vs Electron                          | Chrome GPU 正常 → 问题在 Electron 运行环境                     |
| 窗口参数矩阵 | 小窗/全屏、默认参数/我们的参数、透明/不透明                      | **所有参数组合都正常** → 与窗口属性无关                        |
| 内容隔离     | 空白页 / DOM 内容 / Pixi 空场景 / 占位形象 / Live2D              | 仅 **Live2D 内容**触发（Pixi 空场景与占位形象均正常）          |
| 阶段隔离     | 仅加载模型 / 加入舞台但 `visible=false` / 完整渲染               | 加入舞台即触发（`visible=false` 也白屏）→ 与是否绘制无关       |
| WebGL 参数   | `antialias` / `premultipliedAlpha` 各自关掉                      | **`premultipliedAlpha=false` → 白屏消失**（1.2s~13s 全程稳定） |
| 等价性验证   | 冻结动画后逐像素对比页面 vs 屏幕                                 | 平均差 **0.03**、最大差 **4**（同色同位置）→ 模型渲染正确**    |
| 稳定性       | 30s 内 8 个采样点                                                | 全程无白屏复现                                                 |
| 桌面基线     | 不启动应用，8s 内两次采样                                        | 桌面自身变化 0% → 排除环境噪声干扰                             |

## 排查工具（保留在仓库中）

```bash
# 渲染诊断：主进程 GPU/窗口状态 + 渲染进程 DOM/WebGL 状态 + 多时间点双路截图（.diag/）
node scripts/diag-render.mjs              # 可选 --nogpu / --switch=<chromium 开关> / --minimal
node scripts/analyze-diag.mjs             # 分析截图：白/黑/透明/内容占比

# 内容隔离实验：切换页面渲染内容判定白屏触发条件
node scripts/isolate-white.mjs full       # blank|dom|none|placeholder|load|full
node scripts/isolate-white.mjs full --nogpu

# GPU 探针：延迟查询（等 GPU 进程初始化完成）打印合成/WebGL/GL 实现状态
npx electron scripts/gpu-probe.cjs        # 可用 GPU_PROBE_SWITCH="use-angle=d3d11;..." 注入开关

# 图像分析
node scripts/inspect-png.mjs <png>        # ASCII 缩略图 + 内容统计
node scripts/probe-region.mjs <png> x y w h [采样点]
node scripts/gdi-shot.ps1 <out.png>       # 外部 GDI 屏幕实拍（独立于 Chromium）
```

渲染侧运行时参数（URL 查询，排障用）：

| 参数                             | 作用                                       |
| -------------------------------- | ------------------------------------------ |
| `?premul=1`                      | 复现白屏（恢复预乘 alpha，即问题配置）     |
| `?freeze=3500`                   | 3.5s 时冻结画面，便于页面/屏幕逐像素对比   |
| `?stage=none\|placeholder\|load` | 不加载形象 / 占位形象 / 仅加载模型不入舞台 |
| `?diag=1`                        | 渲染侧诊断日志（DOM/WebGL/帧率）           |

主进程环境变量：`PET_DIAG=1`（诊断模式）、`PET_SWITCH=<a;b>`（注入 Chromium 开关）、
`PET_DIAG_PAGE=<模式>`（内容隔离）、`PET_NOGPU=1`（关闭硬件加速）。

## 环境备注

- 本机 `WebGL` 走 SwiftShader 软件后端（`glImplementationParts=(gl=none,angle=none)`），
  真机 GPU（AMD Radeon 890M）在 Electron 下不被选用，但共用同一套 Chromium 合成管线。
  白屏根因在预乘 alpha 的合成路径，与后端是软件还是硬件无关。
- 本机装有 VR 串流软件（PICO Connect / SteamVR / Virtual Desktop），会注册虚拟显示器驱动；
  排查时注意屏幕截图的窗口归属（用 `WindowFromPoint` 可确认像素属于哪个窗口）。
- 若将来遇到类似的透明窗问题，先跑 `npm run smoke`（含透明区白点检测）快速判定。
