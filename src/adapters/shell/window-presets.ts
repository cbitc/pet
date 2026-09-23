/**
 * 窗口参数预设——Electron 窗口的「安全三件套」与整屏透明层参数只在这里写一次。
 *
 * 以前同样的 webPreferences / overlay flags 在 pet-window、settings-window、
 * diagnostics 里各写一遍，新增一项安全开关要靠全局搜索。
 */

import type { BrowserWindowConstructorOptions, Rectangle, WebPreferences } from 'electron'

/** 渲染进程安全三件套；可附加各窗口自己的 preload 与行为开关 */
export const secureWebPreferences = (extra: WebPreferences = {}): WebPreferences => ({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  ...extra
})

/** 覆盖整个工作区的透明层窗口：无边框、不可拖动/缩放、不进任务栏 */
export const overlayWindowOptions = (
  area: Rectangle,
  webPreferences: WebPreferences
): BrowserWindowConstructorOptions => ({
  x: area.x,
  y: area.y,
  width: area.width,
  height: area.height,
  frame: false,
  transparent: true,
  hasShadow: false,
  resizable: false,
  movable: false,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  show: false,
  backgroundColor: '#00000000',
  webPreferences
})
