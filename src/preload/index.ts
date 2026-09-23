import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { AppConfig, DeepPartial } from '../shared/config'
import type { ModelMeta } from '../shared/model'
import type { ServerMessage } from '../shared/protocol'

export interface AssetInfo {
  /** Cubism Core 是否已就位（缺失时渲染层降级为占位形象） */
  core: boolean
  models: ModelMeta[]
}

export type BridgeEvent =
  | 'brain:status'
  | 'brain:message'
  | 'config:changed'
  | 'ui:toggle-input'
  | 'ui:reset-pose'

type PayloadOf<E extends BridgeEvent> = E extends 'brain:status'
  ? string
  : E extends 'brain:message'
    ? ServerMessage
    : E extends 'config:changed'
      ? AppConfig
      : null

const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setConfig: (patch: DeepPartial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke('config:set', patch),
  getAssets: (): Promise<AssetInfo> => ipcRenderer.invoke('models:list'),
  sendChat: (text: string): void => {
    ipcRenderer.send('brain:send', text)
  },
  setIgnoreMouse: (ignore: boolean): void => {
    ipcRenderer.send('window:set-ignore-mouse', ignore)
  },
  quit: (): void => {
    ipcRenderer.send('app:quit')
  },
  openSettings: (): void => {
    ipcRenderer.send('app:open-settings')
  },
  on: <E extends BridgeEvent>(event: E, cb: (payload: PayloadOf<E>) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown): void => {
      cb(payload as PayloadOf<E>)
    }
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  }
}

contextBridge.exposeInMainWorld('pet', api)

export type PetBridge = typeof api
