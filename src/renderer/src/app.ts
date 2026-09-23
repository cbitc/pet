// CSP 禁止 unsafe-eval 时，用 Pixi 官方的无 eval 着色器系统（需在创建 Application 前引入）
import 'pixi.js/unsafe-eval'
import { Application } from 'pixi.js'
import { AppConfig, DEFAULT_CONFIG } from '../../shared/config'
import type { AssetInfo } from '../../preload/index'
import { createAvatar } from './avatar'
import type { PetAvatar } from './avatar/types'
import { BubbleLayer } from './chat/bubble'
import { ChatInput } from './chat/input'
import { ChatController } from './chat/controller'
import { setupInteraction } from './interaction'
import { logStyleSnapshot, rlog, watchCanvasContext } from './diagnostics'

const bridge = window.pet

class PetApp {
  private app = new Application()
  private avatar: PetAvatar | null = null
  private cfg!: AppConfig
  private bubbles = new BubbleLayer()
  private input!: ChatInput
  private controller!: ChatController
  private persistTimer: number | null = null
  private loadWarning: string | undefined

  async start(): Promise<void> {
    rlog('boot', `readyState=${document.readyState}`)
    this.cfg = await bridge.getConfig()
    const assets = await bridge.getAssets()
    rlog('bridge', `model=${this.cfg.modelDir}`, `core=${assets.core}`, `models=${assets.models.length}`)

    const stage = new URLSearchParams(location.search).get('stage')
    const canvas = document.getElementById('stage') as HTMLCanvasElement
    watchCanvasContext(canvas)
    logStyleSnapshot()

    // 透明窗白屏规避（重要）：本机显卡驱动栈下，premultipliedAlpha=true 时
    // WebGL 画布合成到透明窗会整窗变成不透明白色（Live2D 出现内容后触发，
    // Pixi 空场景/纯 DOM 不受影响）。改为不预乘 alpha 后透明正常，
    // 且模型像素与页面渲染结果完全一致。排查时可用 ?premul=1 复现。
    const q = new URLSearchParams(location.search)
    const usePremul = q.get('premul') === '1'
    const freezeAt = Number(q.get('freeze') ?? '0')
    rlog('gl options', `premultipliedAlpha=${usePremul}`, `freezeAt=${freezeAt}`)

    await this.app.init({
      canvas,
      resizeTo: window,
      antialias: true,
      background: 0x000000,
      backgroundAlpha: 0,
      preference: 'webgl',
      premultipliedAlpha: usePremul,
      resolution: 1,
      autoDensity: true
    })

    this.logRendererInfo(canvas)

    const frameMarks = new Set([1, 5, 30, 90, 240])
    let frame = 0
    this.app.ticker.add(() => {
      frame += 1
      if (frameMarks.has(frame)) rlog('frame', `#${frame}`, `fps=${this.app.ticker.FPS.toFixed(1)}`)
    })

    if (freezeAt > 0) {
      // 排查用：到点冻结画面（停止更新，保留最后一帧），便于页面/屏幕逐像素对比
      window.setTimeout(() => {
        rlog(`freeze @${freezeAt}ms`)
        this.app.ticker.stop()
      }, freezeAt)
    }

    // 形象加载分支（stage 查询参数，仅用于排查：none 不加载形象，placeholder 用占位形象）
    if (stage === 'none' || stage === 'placeholder') {
      const { PlaceholderAvatar } = await import('./avatar/placeholder-avatar')
      this.avatar = new PlaceholderAvatar()
      if (stage === 'placeholder') {
        this.app.stage.addChild(this.avatar.view)
      }
      this.layout()
      rlog(`stage=${stage}：Pixi 已初始化，形象加载=${stage === 'placeholder'}`)
    } else if (stage === 'load') {
      const meta = assets.models.find((m) => m.dir === this.cfg.modelDir) ?? assets.models[0]
      const { Live2DAvatar } = await import('./avatar/live2d-avatar')
      this.avatar = await Live2DAvatar.load(meta)
      this.layout()
      rlog('stage=load：Live2D 模型已加载但未加入舞台')
    } else {
      await this.switchAvatar(assets, this.cfg.modelDir)
    }
    rlog('start complete')

    this.input = new ChatInput((text) => this.controller?.send(text))
    this.controller = new ChatController(() => this.avatar!, this.bubbles)

    setupInteraction({
      getAvatar: () => this.avatar,
      onPosePersist: () => this.schedulePersistPose(),
      onTap: () => this.input.toggle(true),
      onDragMove: () => this.repositionChat()
    })

    window.addEventListener('resize', () => {
      this.layout()
      this.repositionChat()
    })

    bridge.on('brain:message', (m) => this.controller.handleServerMessage(m))
    bridge.on('brain:status', (s) => this.controller.handleStatus(s))
    bridge.on('ui:toggle-input', () => this.input.toggle())
    bridge.on('ui:reset-pose', () => {
      this.cfg.pose = { ...DEFAULT_CONFIG.pose }
      this.layout()
      this.repositionChat()
      this.schedulePersistPose()
    })
    bridge.on('config:changed', (cfg) => void this.onConfigChanged(cfg))

    this.repositionChat()
    this.greet()
  }

  private logRendererInfo(canvas: HTMLCanvasElement): void {
    const r = this.app.renderer as unknown as {
      name?: string
      type?: number
      resolution?: number
      gl?: WebGL2RenderingContext
    }
    rlog('pixi renderer', `name=${r.name}`, `type=${r.type}`, `res=${r.resolution}`)
    rlog('canvas', `buffer=${canvas.width}x${canvas.height}`, `css=${canvas.clientWidth}x${canvas.clientHeight}`)
    if (r.gl) {
      rlog('gl attrs', JSON.stringify(r.gl.getContextAttributes()))
      rlog(
        'gl info',
        `vendor=${r.gl.getParameter(0x1f00)}`,
        `renderer=${r.gl.getParameter(0x1f01)}`,
        `version=${r.gl.getParameter(r.gl.VERSION)}`
      )
    }
    logStyleSnapshot()
  }

  private async switchAvatar(assets: AssetInfo, modelDir: string): Promise<void> {
    const result = await createAvatar(assets, modelDir)
    this.avatar?.dispose()
    this.avatar = result.avatar
    this.loadWarning = result.warning
    this.app.stage.addChild(result.avatar.view)
    this.layout()
    rlog('avatar', `kind=${result.kind}`, result.warning ?? '')
  }

  private async onConfigChanged(cfg: AppConfig): Promise<void> {
    const prevModel = this.cfg.modelDir
    this.cfg = cfg
    if (cfg.modelDir !== prevModel) {
      const assets = await bridge.getAssets()
      await this.switchAvatar(assets, cfg.modelDir)
      this.repositionChat()
    } else {
      this.layout()
      this.repositionChat()
    }
  }

  private layout(): void {
    const av = this.avatar
    if (!av) return
    // 基于画布（渲染面）尺寸换算，兼容整屏画布与实验用的小画布
    const w = this.app.screen.width
    const h = this.app.screen.height
    const scale = (h * this.cfg.pose.scale) / av.naturalHeight
    av.view.scale.set(scale)
    av.view.position.set(w * this.cfg.pose.x, h * this.cfg.pose.y)
  }

  private schedulePersistPose(): void {
    if (this.persistTimer) window.clearTimeout(this.persistTimer)
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null
      const av = this.avatar
      if (!av) return
      this.cfg.pose = {
        x: av.view.position.x / window.innerWidth,
        y: av.view.position.y / window.innerHeight,
        scale: (av.view.scale.y * av.naturalHeight) / window.innerHeight
      }
      void bridge.setConfig({ pose: this.cfg.pose })
    }, 400)
  }

  private repositionChat(): void {
    const av = this.avatar
    if (!av) return
    const b = av.hitBounds()
    this.bubbles.positionAt(b.x + b.width / 2, b.y - 16)
    this.input.positionAt(b.x + b.width / 2, b.y + b.height + 22)
  }

  private greet(): void {
    if (this.loadWarning) {
      const h = this.bubbles.beginAssistant()
      h.append(this.loadWarning)
      h.finish()
      window.setTimeout(() => this.greet(), 5000)
      return
    }
    const h = this.bubbles.beginAssistant()
    h.append('嗨～我在这里！点我一下就能聊天，拖动可以帮我挪窝哦 (≧▽≦)')
    h.finish()
  }
}

new PetApp().start().catch((err) => {
  console.error('[pet] 启动失败:', err)
  const el = document.createElement('div')
  el.className = 'bubble assistant'
  el.textContent = `启动失败：${String(err)}`
  document.getElementById('bubbles')?.appendChild(el)
})
