/**
 * IPC 偏好存储——PreferencesStore 端口的渲染侧实现。
 *
 * 主进程的配置文件是唯一真相源；这里负责：
 *   读（含缺省）→ 暴露给领域；写（把偏好字段映射回配置形状）；
 *   以及把其他入口（托盘、设置页）的改动转成偏好变更通知。
 */

import type { Preferences, PreferencesStore, Unsubscribe } from '../../domain'
import { IPC } from '../../contracts/ipc'
import { preferencesFromConfig } from '../../contracts/schemas'

/** 偏好字段在应用配置里的形态（技术层形状，与领域解耦） */
export interface PreferencesConfigLike {
  modelDir?: unknown
  pose?: unknown
  brain?: { persona?: unknown } | undefined
  sessionId?: unknown
}

export interface ConfigBridge {
  getConfig(): Promise<PreferencesConfigLike>
  setConfig(patch: Record<string, unknown>): Promise<unknown>
  on(event: typeof IPC.configChanged, handler: (config: PreferencesConfigLike) => void): Unsubscribe
}

/** 应用配置 → 偏好 */
export function toPreferences(config: PreferencesConfigLike | null | undefined): Preferences {
  return preferencesFromConfig(config)
}

/** 偏好补丁 → 应用配置补丁（只包含本次真正改动的字段） */
export function toConfigPatch(patch: Partial<Preferences>): Record<string, unknown> {
  const configPatch: Record<string, unknown> = {}
  if (patch.appearanceId !== undefined) configPatch.modelDir = patch.appearanceId
  if (patch.pose !== undefined) configPatch.pose = patch.pose
  if (patch.persona !== undefined) configPatch.brain = { persona: patch.persona }
  if (patch.sessionId !== undefined) configPatch.sessionId = patch.sessionId
  return configPatch
}

export class IpcPreferencesStore implements PreferencesStore {
  constructor(private readonly bridge: ConfigBridge) {}

  async load(): Promise<Preferences> {
    return toPreferences(await this.bridge.getConfig())
  }

  async save(patch: Partial<Preferences>): Promise<void> {
    const configPatch = toConfigPatch(patch)
    if (Object.keys(configPatch).length === 0) return
    await this.bridge.setConfig(configPatch)
  }

  onChange(handler: (preferences: Preferences) => void): Unsubscribe {
    return this.bridge.on(IPC.configChanged, (config) => handler(toPreferences(config)))
  }
}
