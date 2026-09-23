/**
 * IPC 契约——渲染进程与主进程之间的全部通道，集中在此。
 *
 * 目的：通道名与载荷类型只有一个真相源。
 * 以前这些字符串散落在 12+ 处（main、preload、渲染进程各写一遍），
 * 改一个名字要全局搜索；现在编译器会替我们检查。
 */

import type { AppConfig, DeepPartial } from './app-config'
import type { ModelCatalog } from './model-catalog'
import type { ServerMessage } from './wire-protocol'

/** 通道名（invoke 为请求-响应，send 为单向下行，on 为事件订阅） */
export const IPC = {
  /** 读应用配置 */
  getConfig: 'config:get',
  /** 写应用配置（补丁，深合并） */
  setConfig: 'config:set',
  /** 取形象资产清单（含 Cubism Core 是否就位） */
  listAssets: 'models:list',
  /** 把主人的话交给心智 */
  sendChat: 'brain:send',
  /** 接住/放行鼠标（不打扰的实现） */
  setIgnoreMouse: 'window:set-ignore-mouse',
  /** 退出应用 */
  quit: 'app:quit',
  /** 打开设置窗口 */
  openSettings: 'app:open-settings',
  /** 心智连接状态（主 → 渲染） */
  brainStatus: 'brain:status',
  /** 心智回话（主 → 渲染） */
  brainMessage: 'brain:message',
  /** 配置被任何入口改动（主 → 渲染） */
  configChanged: 'config:changed',
  /** 托盘：显示/隐藏聊天 */
  toggleInput: 'ui:toggle-input',
  /** 托盘：宠物归位 */
  resetPose: 'ui:reset-pose'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** 事件通道（主 → 渲染）与其载荷 */
export interface IpcEventPayloads {
  [IPC.brainStatus]: string
  [IPC.brainMessage]: ServerMessage
  [IPC.configChanged]: AppConfig
  [IPC.toggleInput]: null
  [IPC.resetPose]: null
}

export type IpcEvent = keyof IpcEventPayloads

/** invoke 通道（渲染 → 主，请求-响应） */
export interface IpcInvokes {
  [IPC.getConfig]: { request: void; response: AppConfig }
  [IPC.setConfig]: { request: DeepPartial<AppConfig>; response: AppConfig }
  [IPC.listAssets]: { request: void; response: ModelCatalog }
}
