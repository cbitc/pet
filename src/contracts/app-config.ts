/**
 * 应用配置类型与默认值（主进程持久化，渲染进程经 bridge 读写）。
 *
 * 默认值、合法性与回退规则全部由 zod schema 声明：
 * `DEFAULT_CONFIG` 就是「空对象喂给 schema」的结果，
 * 因此不再需要手写 sanitizeConfig 里的逐个 clamp / 回退。
 */

import { z } from 'zod'
import { DEFAULT_PERSONA } from '../domain/preferences'
import { PoseSchema } from './schemas'

/** 应用配置 schema：每个字段自带默认值，非法值就地回退 */
export const AppConfigSchema = z.object({
  version: z.number().int().catch(1),
  brain: z
    .object({
      /** mock = 内置模拟大脑；remote = 连接独立后端大脑服务 */
      mode: z.enum(['mock', 'remote']).catch('mock'),
      /** remote 模式下的 WebSocket 地址 */
      url: z.string().trim().min(1).catch('ws://127.0.0.1:17321/brain'),
      /** 人设提示词，由大脑侧使用（前端仅存储与转发） */
      persona: z.string().catch(DEFAULT_PERSONA)
    })
    .catch({ mode: 'mock', url: 'ws://127.0.0.1:17321/brain', persona: DEFAULT_PERSONA }),
  modelDir: z.string().trim().min(1).catch('haru'),
  pose: PoseSchema,
  openAtLogin: z.boolean().catch(false),
  sessionId: z.string().catch('')
})

export type AppConfig = z.infer<typeof AppConfigSchema>
export type BrainConfig = AppConfig['brain']
export type PetPose = AppConfig['pose']

export const DEFAULT_CONFIG: AppConfig = AppConfigSchema.parse({})

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T

/** 把（可能来自磁盘/IPC 的）配置对象收拢成合法配置 */
export const sanitizeConfig = (raw: unknown): AppConfig => AppConfigSchema.parse(raw)
