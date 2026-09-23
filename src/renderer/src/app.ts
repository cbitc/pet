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
    this.cfg = await bridge.getConfig()
    const assets = await bridge.getAssets()

    await this.app.init({
      canvas: document.getElementById('stage') as HTMLCanvasElement,
      resizeTo: window,
      antialias: true,
      background: 0x000000,
      backgroundAlpha: 0,
      preference: 'webgl',
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    })

    await this.switchAvatar(assets, this.cfg.modelDir)

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

  private async switchAvatar(assets: AssetInfo, modelDir: string): Promise<void> {
    const result = await createAvatar(assets, modelDir)
    this.avatar?.dispose()
    this.avatar = result.avatar
    this.loadWarning = result.warning
    this.app.stage.addChild(result.avatar.view)
    this.layout()
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
    const scale = (window.innerHeight * this.cfg.pose.scale) / av.naturalHeight
    av.view.scale.set(scale)
    av.view.position.set(
      window.innerWidth * this.cfg.pose.x,
      window.innerHeight * this.cfg.pose.y
    )
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
