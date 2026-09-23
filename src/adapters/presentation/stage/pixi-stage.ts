/**
 * Pixi 舞台——PetStage 端口的实现：宠物的身体与位置。
 *
 * 技术细节：Pixi 应用初始化、CSP 下的着色器处理、实体摆放与缩放换算、
 * 命中范围上报。两个“坑”的修复参数保持醒目（见 PixiStage.create）：
 *   1) premultipliedAlpha=false —— 透明窗白屏（docs/white-screen-investigation.md）
 *   2) gcActive=false —— Live2D 纹理被 GC 回收后模型消失（docs/live2d-texture-gc.md）
 */

import 'pixi.js/unsafe-eval'
import { Application, type Container } from 'pixi.js'
import type { Appearance, Emotion, PetStage, Pose, Rect, ScreenPoint, WearResult } from '../../../domain'
import { Live2DBody } from './live2d-body'
import { PlaceholderBody } from './placeholder-body'
import type { StageBody } from './stage-body'

export interface StageOptions {
  canvas: HTMLCanvasElement
  /** 形象 → 模型入口 URL（由组装根基于 pet:// 协议注入） */
  modelUrl: (appearanceId: string) => string | null
  /** 是否预乘 alpha；默认 false（本机环境的白屏规避，见 docs/white-screen-investigation.md） */
  premultipliedAlpha?: boolean
  /** 渲染后端固定比例，1 = 与 CSS 像素 1:1（与命中/坐标换算的简化绑定） */
  resolution?: number
}

export class PixiStage implements PetStage {
  private body: StageBody | null = null
  private currentAppearance: Appearance | null = null
  private known: Appearance[] = []

  private constructor(
    private readonly app: Application,
    private readonly options: StageOptions
  ) {}

  static async create(options: StageOptions): Promise<PixiStage> {
    const app = new Application()
    await app.init({
      canvas: options.canvas,
      resizeTo: window,
      antialias: true,
      background: 0x000000,
      backgroundAlpha: 0,
      preference: 'webgl',
      // 重要：本机显卡驱动栈下预乘 alpha 会让透明窗整窗变白；
      // 保持 false，排障时可用 ?premul=1 复现（docs/white-screen-investigation.md）
      premultipliedAlpha: options.premultipliedAlpha ?? false,
      resolution: options.resolution ?? 1,
      autoDensity: true,
      // 重要：Pixi 8.15+ 的 GCSystem 默认 60s 回收「未使用」纹理。
      // Live2D 分支缓存原始 WebGLTexture 并直接 gl.bindTexture，绕过了 Pixi 的
      // GlTextureSystem，其 _gcLastUsed 永不刷新；库里的 source.touched 保护只对
      // 旧的 TextureGCSystem 有效（TextureSource 已无 touched 字段）。
      // 结果：模型纹理会在大约 60s 后被 deleteTexture —— 宠物消失但仍可命中点击。
      // 关闭 GC 规避；形象切换时由 Live2DBody.destroy 显式销毁纹理，避免泄漏。
      // 详见 docs/live2d-texture-gc.md
      gcActive: false
    })
    return new PixiStage(app, options)
  }

  /* ---------- PetStage ---------- */

  setCatalog(appearances: Appearance[]): void {
    this.known = appearances
  }

  async availableAppearances(): Promise<Appearance[]> {
    return this.known
  }

  async wear(appearance: Appearance | null): Promise<WearResult> {
    if (!appearance) {
      return this.degrade('未找到可穿的形象（先运行 npm run fetch:assets 下载模型与 Core）')
    }
    const url = this.options.modelUrl(appearance.id)
    if (!url) {
      return this.degrade(`形象「${appearance.displayName}」缺少模型入口文件，暂用占位形象`)
    }

    let body: StageBody
    try {
      body = await Live2DBody.load(url, appearance.tapCue)
    } catch (err) {
      console.warn('[stage] Live2D 形象加载失败，改用占位躯体:', err)
      return this.degrade(`形象「${appearance.displayName}」加载失败，暂用占位形象`, true)
    }

    this.swapBody(body)
    this.currentAppearance = appearance
    return { wearing: appearance }
  }

  private degrade(reason: string, keepCurrent?: boolean): WearResult {
    if (!keepCurrent || !this.body) {
      this.swapBody(new PlaceholderBody())
      this.currentAppearance = null
    }
    return { wearing: keepCurrent ? this.currentAppearance : null, degraded: reason }
  }

  private swapBody(body: StageBody): void {
    this.body?.destroy()
    this.body = body
    this.app.stage.addChild(body.view as Container)
  }

  express(mood: Emotion, cue?: string): void {
    const performance = cue ? { ...this.currentAppearance?.performances[mood], cue } : undefined
    this.body?.perform(mood, performance ?? this.currentAppearance?.performances[mood])
  }

  setSpeaking(speaking: boolean): void {
    this.body?.setSpeaking(speaking)
  }

  lookAt(at: ScreenPoint): void {
    this.body?.lookAt(at.x, at.y)
  }

  reactToTouch(): void {
    this.body?.reactToTouch(this.currentAppearance?.tapCue)
  }

  place(pose: Pose): void {
    const body = this.body
    if (!body) return
    // 体型 = 宠物显示高度 ÷ 桌面高度
    const scale = (this.app.screen.height * pose.scale) / body.naturalHeight
    body.view.scale.set(scale)
    body.view.position.set(this.app.screen.width * pose.x, this.app.screen.height * pose.y)
  }

  bounds(): Rect {
    const fallback: Rect = { x: 0, y: 0, width: 0, height: 0 }
    if (!this.body) return fallback
    const bounds = this.body.view.getBounds()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  }

  /* ---------- 组装根要用的技术入口 ---------- */

  get pixiApp(): Application {
    return this.app
  }

  /** 仅供白屏排查：冻结画面（停止更新、保留最后一帧），便于页面/屏幕逐像素对比 */
  freeze(): void {
    this.app.ticker.stop()
  }

  /** 仅供白屏排查：报告渲染器与 WebGL 后端细节 */
  rendererInfo(): string {
    const renderer = this.app.renderer as unknown as {
      name?: string
      type?: number
      gl?: WebGL2RenderingContext
    }
    const gl = renderer.gl
    return [
      `name=${renderer.name}`,
      `type=${renderer.type}`,
      gl ? `vendor=${gl.getParameter(0x1f00)}` : '',
      gl ? `renderer=${gl.getParameter(0x1f01)}` : '',
      gl ? `attrs=${JSON.stringify(gl.getContextAttributes())}` : ''
    ]
      .filter(Boolean)
      .join(' ')
  }

  /**
   * 仅供白屏排查使用：按诊断模式准备内容（对应 ?stage=none|placeholder|load，
   * 见 docs/white-screen-investigation.md 的内容隔离实验）。
   */
  async prepareForDiagnostics(
    mode: 'none' | 'placeholder' | 'load',
    appearance: Appearance | null
  ): Promise<void> {
    if (mode === 'none') return
    if (mode === 'placeholder') {
      this.swapBody(new PlaceholderBody())
      return
    }
    const url = appearance ? this.options.modelUrl(appearance.id) : null
    if (!url) return
    // 刻意只加载、不加入舞台：用于判定「内容创建」是否触发合成异常
    this.diagnosticBody = await Live2DBody.load(url, appearance?.tapCue)
  }

  private diagnosticBody: StageBody | null = null

  destroy(): void {
    this.diagnosticBody?.destroy()
    this.diagnosticBody = null
    this.body?.destroy()
    this.body = null
    this.app.destroy(true)
  }
}
