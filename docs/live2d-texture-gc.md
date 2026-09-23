# Live2D 模型静置后消失（纹理被 GC 回收）排查记录

## 结论（TL;DR）

**PixiJS 8.15+ 新增的 `GCSystem` 会把 Live2D 的模型纹理当作「长期未使用」在约 60 秒后
删除。** `@jannchie/pixi-live2d-display` 缓存原始 `WebGLTexture` 并直接 `gl.bindTexture`
绘制，绕过了 Pixi 的 `GlTextureSystem`，因此纹理的 `_gcLastUsed` 永不刷新；库内用来防
GC 的 `texture.source.touched = ...` 只对旧的 `TextureGCSystem` 有效，在 8.15+ 是死代码。

修复：`PixiStage.create()` 里把 `app.init` 的 GC 关闭（`gcActive: false`），并在
`Live2DBody.destroy()` 显式销毁模型纹理以补偿关闭 GC 带来的释放缺口。

## 症状

- 宠物正常出现、可交互；**静置约 1 分钟后画面里的模型消失**（画布恢复全透明）。
- 消失后**仍然可以点中**：弹出输入条、能拖动（命中/坐标都在 CPU 侧，不依赖 GPU）。
- 宿主进程、DOM、IPC、心智连接全部正常；`webglcontextlost` 也没有触发。
- 不是白屏（那是另一条问题路径，见 [white-screen-investigation.md](white-screen-investigation.md)）。

## 根因链（`文件:行号` 级）

| # | 事实 | 位置 |
|---|---|---|
| 1 | Pixi GC 默认：启用、未使用阈值 60s、扫描周期 30s | `pixi.js/.../shared/GCSystem.js` `defaultOptions`（`gcActive: true` / `gcMaxUnusedTime: 6e4` / `gcFrequency: 3e4`） |
| 2 | 只有 Pixi 自己绑纹理时才刷新 `_gcLastUsed` | `pixi.js/.../gl/texture/GlTextureSystem.js` 的 `bindSource()` / `getGlSource()`：`source._gcLastUsed = renderer.gc.now` |
| 3 | GC 判定：`now - _gcLastUsed >= maxUnusedTime && autoGarbageCollect` → `resource.unload()` | `pixi.js/.../shared/GCSystem.js` 的 `runOnHash()` |
| 4 | `unload` 最终删除 GL 纹理 | `GlTextureSystem` 的 `onSourceUnload()` → `gl.deleteTexture(...)`；注册方 `GCManagedHash` 监听 `unload` |
| 5 | 模型贴图是 `ImageSource`，`autoGarbageCollect = true` | `pixi.js/.../sources/ImageSource.js` |
| 6 | Live2D 分支**只在首次**取纹理，之后走缓存 + 直接绑定 | `cubism4.es.js` `_onRenderCallback()`：`cachedGlTextures[i] ?? extractWebGLTexture(...)`，随后 `internalModel.bindTexture(i, glTexture)` |
| 7 | 库的“保活”写的是已废弃字段 | `cubism4.es.js`：`texture.source.touched = renderer.textureGC.count`；`TextureSource` 已无 `touched`，GC 只读 `_gcLastUsed` |

时间线（模型加载时刻记 0）：

```
t≈0s    首次渲染：getGlSource() 设置 _gcLastUsed = now，缓存 WebGLTexture
t≈30s   GC 第一次扫描：距上次使用 30s < 60s，跳过
t≈60s   GC 第二次扫描：距上次使用 60s，不再 < 60s → source.unload() → gl.deleteTexture()
        模型仍每帧 bind 这个已删除的纹理 → 画不出；CPU 包围盒不变 → 仍可点击
```

## 为什么是「长时间停止交互后」而不是立刻

阈值是时间（约 60~90s），与是否交互无关；只是静置时用户才会注意到画面变化。
把网络/交互排除掉后，唯一的“定时器”就是 Pixi 的 GC 扫描。

## 修复

`src/adapters/presentation/stage/pixi-stage.ts` 的 `app.init`：

```ts
gcActive: false   // 关闭 Pixi GPU 资源 GC（详见本节文档）
```

关闭 GC 后，凡是本应由 GC 兜底的资源都需要显式释放。本应用只有 Live2D 纹理会跨形象
切换累积，因此配套修改 `src/adapters/presentation/stage/live2d-body.ts`：

```ts
this.view.destroy({ texture: true, textureSource: true })
```

这样换形象时旧模型的纹理会被立即销毁，不会因为关闭 GC 而泄漏。

### 备选方案（未采用）

- **只把 Live2D 纹理标记为不回收**：遍历 `model.textures`，逐个 `source.autoGarbageCollect = false`。
  更外科，但依赖库内部字段名，且同样需要在 `destroy` 时显式释放；可维护性不如关闭 GC。
- **调大 `gcMaxUnusedTime`**：治标不治本——`_gcLastUsed` 仍不会刷新，只是把消失时间推迟。
- **升级/回退 `pixi.js` 或等待 Live2D 分支适配新 GC**：根治方向，但要等上游。

## 复现与验证

```bash
# 复现（把 GC 未使用阈值压到 3s，几秒内即可看到模型消失）：
#   临时在 pixi-stage 的 app.init 里改回 gcActive: true 并加 gcMaxUnusedTime: 3000
# 验证修复：保持 gcActive: false，模型持续渲染、不再消失；换形象后 GPU 纹理被释放
```

回归观察点（无需长跑）：修复后静置 ≥2 分钟，模型仍在；`?premul=1` 的白屏行为不受影响。

## 相关文件

- `src/adapters/presentation/stage/pixi-stage.ts`：`gcActive: false` 与说明注释
- `src/adapters/presentation/stage/live2d-body.ts`：切换形象时显式销毁纹理
- 依赖版本：`pixi.js@8.21.0`、`@jannchie/pixi-live2d-display@1.4.0`

## 环境备注

该现象与 [white-screen-investigation.md](white-screen-investigation.md) 的预乘 alpha 白屏是
**两条独立路径**：白屏发生在「原生合成」环节，本问题发生在「GPU 资源生命周期」。
两者都只在引入 Live2D 内容后暴露，但复现时间与画面特征完全不同。
