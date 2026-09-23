/**
 * 渲染进程组装根——把领域、运行时、适配器接成一个活的桌宠。
 *
 * 这是唯一允许「什么都知道」的地方：它认识 preload 桥、Pixi、DOM，
 * 也认识领域与运行时。想知道本项目实际用了哪些技术，从这里往下看。
 */

import { createPetRuntime, type PetRuntime } from '../app/pet-runtime'
import { IPC } from '../contracts/ipc'
import { DEFAULT_POSE } from '../domain'
import type { PetBridge } from './preload'
import { appearancesFromAssets } from '../adapters/bridge/appearance-catalog'
import { ElectronDesk } from '../adapters/bridge/electron-desk'
import { IpcBrainChannel } from '../adapters/bridge/ipc-brain-channel'
import { IpcPreferencesStore } from '../adapters/bridge/ipc-preferences'
import { DomChatSurface } from '../adapters/presentation/chat/dom-chat-surface'
import { logStyleSnapshot, rlog, watchCanvasContext } from '../adapters/presentation/diagnostics'
import { PixiStage } from '../adapters/presentation/stage/pixi-stage'

const bridge = window.pet as PetBridge

/** 模型入口的寻址方式：pet:// 协议指向磁盘上的模型目录（详见 docs/architecture.md） */
const modelEntryUrl = (dir: string, entry: string): string => `pet://models/${dir}/${entry}`

const params = new URLSearchParams(location.search)

async function main(): Promise<void> {
  rlog('boot', `readyState=${document.readyState}`)

  const assets = await bridge.getAssets()
  const catalog = appearancesFromAssets(assets)
  const urlById = new Map(assets.models.map((m) => [m.dir, modelEntryUrl(m.dir, m.entry)]))
  rlog('assets', `core=${assets.core}`, `models=${assets.models.length}`)

  const canvas = document.getElementById('stage') as HTMLCanvasElement
  const stage = await PixiStage.create({
    canvas,
    modelUrl: (id) => urlById.get(id) ?? null,
    // 排障开关：?premul=1 可复现透明窗白屏（详见 docs/issues/0001-white-screen.md）
    premultipliedAlpha: params.get('premul') === '1'
  })
  stage.setCatalog(catalog)
  watchCanvasContext(canvas)
  logStyleSnapshot()

  // 诊断旁路：?stage=... 的内容隔离实验（仅用于白屏排查）
  const diagnosticStage = params.get('stage')
  if (diagnosticStage === 'none' || diagnosticStage === 'placeholder' || diagnosticStage === 'load') {
    await stage.prepareForDiagnostics(diagnosticStage, catalog[0] ?? null)
    rlog(`stage=${diagnosticStage}：仅初始化舞台，不启动宠物运行时`)
    return
  }

  const desk = new ElectronDesk({ setIgnoreMouse: (ignore) => bridge.setIgnoreMouse(ignore) })
  const chat = new DomChatSurface()
  const brain = new IpcBrainChannel(bridge)
  const preferences = new IpcPreferencesStore(bridge)

  const runtime: PetRuntime = createPetRuntime({ stage, desk, brain, chat, preferences })

  // 托盘动作：唤起输入框 / 位置归位（归位 = 把偏好写回默认位置，宠物会自己挪过去）
  bridge.on(IPC.toggleInput, () => chat.toggleInput())
  bridge.on(IPC.resetPose, () => {
    void preferences.save({ pose: DEFAULT_POSE })
  })

  await runtime.start()
  rlog('pet runtime started')

  freezeIfRequested(stage)
  rlog('pixi renderer', stage.rendererInfo())
}

/** 排障：到点冻结画面，便于页面/屏幕逐像素对比（?freeze=3500） */
function freezeIfRequested(stage: PixiStage): void {
  const freezeAt = Number(params.get('freeze') ?? '0')
  if (freezeAt > 0) {
    window.setTimeout(() => {
      rlog(`freeze @${freezeAt}ms`)
      stage.freeze()
    }, freezeAt)
  }
}

main().catch((err) => {
  console.error('[pet] 启动失败:', err)
  const bubble = document.createElement('div')
  bubble.className = 'bubble assistant'
  bubble.textContent = `启动失败：${String(err)}`
  document.getElementById('bubbles')?.appendChild(bubble)
})


