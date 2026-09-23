/**
 * preload——渲染进程与主进程之间的唯一桥梁。
 *
 * 这里只做三件事：白名单式暴露少量能力、把 IPC 事件转发给页面、
 * 用契约（contracts/ipc.ts）里的通道名与载荷类型保证两端一致。
 * 渲染进程因此拿不到 Node、拿不到网络，也拿不到任意通道。
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { AppConfig, DeepPartial } from '../contracts/app-config'
import type { ModelCatalog } from '../contracts/model-catalog'
import { IPC, type IpcEvent, type IpcEventPayloads } from '../contracts/ipc'

/** 渲染进程可见的桥：只有这些能力，没有别的 */
const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.getConfig),
  setConfig: (patch: DeepPartial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.setConfig, patch),
  getAssets: (): Promise<ModelCatalog> => ipcRenderer.invoke(IPC.listAssets),
  sendChat: (text: string): void => {
    ipcRenderer.send(IPC.sendChat, text)
  },
  setIgnoreMouse: (ignore: boolean): void => {
    ipcRenderer.send(IPC.setIgnoreMouse, ignore)
  },
  quit: (): void => {
    ipcRenderer.send(IPC.quit)
  },
  openSettings: (): void => {
    ipcRenderer.send(IPC.openSettings)
  },
  on: <E extends IpcEvent>(event: E, cb: (payload: IpcEventPayloads[E]) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown): void => {
      cb(payload as IpcEventPayloads[E])
    }
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  }
}

contextBridge.exposeInMainWorld('pet', api)

export type PetBridge = typeof api
