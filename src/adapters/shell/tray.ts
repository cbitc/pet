import { app, Menu, Tray, nativeImage } from 'electron'
import { store } from './config-store'
import { listModels, iconPath } from './asset-catalog'

/**
 * 托盘：桌宠常驻入口。菜单随配置变化重建。
 */
export class PetTray {
  private tray: Tray | null = null
  private unsubscribe: () => void

  constructor(
    private actions: {
      onToggleInput: () => void
      onResetPose: () => void
      onOpenSettings: () => void
    }
  ) {
    const img = nativeImage.createFromPath(iconPath())
    this.tray = new Tray(
      img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 })
    )
    this.tray.setToolTip('Live2D Pet')
    this.tray.on('double-click', () => this.actions.onToggleInput())
    this.rebuild()
    this.unsubscribe = store.onChange(() => this.rebuild())
  }

  private rebuild(): void {
    if (!this.tray) return
    const cfg = store.get()
    const models = listModels()
    const modelItems = models.length
      ? models.map((m) => ({
          label: m.displayName,
          type: 'radio' as const,
          checked: m.dir === cfg.modelDir,
          click: () => store.set({ modelDir: m.dir })
        }))
      : [{ label: '（未发现模型，运行 npm run fetch:assets）', enabled: false }]

    const template: Electron.MenuItemConstructorOptions[] = [
      { label: '显示/隐藏聊天', click: () => this.actions.onToggleInput() },
      { label: '重置宠物位置', click: () => this.actions.onResetPose() },
      { type: 'separator' },
      {
        label: '模型',
        submenu: modelItems
      },
      {
        label: '大脑',
        submenu: [
          {
            label: '内置模拟（Mock）',
            type: 'radio',
            checked: cfg.brain.mode === 'mock',
            click: () => store.set({ brain: { mode: 'mock' } })
          },
          {
            label: '远程服务',
            type: 'radio',
            checked: cfg.brain.mode === 'remote',
            click: () => store.set({ brain: { mode: 'remote' } })
          }
        ]
      },
      { label: '设置…', click: () => this.actions.onOpenSettings() },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: cfg.openAtLogin,
        click: (item) => store.set({ openAtLogin: item.checked })
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]
    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }

  destroy(): void {
    this.unsubscribe()
    this.tray?.destroy()
    this.tray = null
  }
}
