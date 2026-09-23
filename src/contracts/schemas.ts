/**
 * 边界数据契约（zod）——所有「外部世界 → 领域类型」的解析集中在此：
 * 配置文件、IPC 载荷、模型清单、大脑回话。
 *
 * 声明式 schema 同时承担三件事：形状校验、默认值与坏数据回退。
 * 它取代了此前散落在 domain/adapters 里的手写 typeof / clamp / Object.entries，
 * 让「一份数据长什么样、坏值怎么办」只写一次、一眼可读。
 */

import { z } from 'zod'
import type { Appearance, Performance } from '../domain/appearance'
import { isEmotion, type Emotion } from '../domain/emotion'
import { clamp } from '../shared/geometry'
import { DEFAULT_POSE, POSE_BOUNDS, type Pose } from '../domain/pose'
import { DEFAULT_PREFERENCES, type Preferences } from '../domain/preferences'

/* ---------- 姿态：坏值/越界逐字段夹回边界，整体缺失回退默认 ---------- */

/** 有限数值 → 夹进 [min,max]；非数值（含 NaN/Infinity）→ 回退 fallback */
const bounded = (min: number, max: number, fallback: number) =>
  z
    .number()
    .transform((value) => clamp(value, min, max))
    .catch(fallback)

export const PoseSchema = z
  .object({
    x: bounded(POSE_BOUNDS.x[0], POSE_BOUNDS.x[1], DEFAULT_POSE.x),
    y: bounded(POSE_BOUNDS.y[0], POSE_BOUNDS.y[1], DEFAULT_POSE.y),
    scale: bounded(POSE_BOUNDS.scale[0], POSE_BOUNDS.scale[1], DEFAULT_POSE.scale)
  })
  .catch(DEFAULT_POSE)

export const parsePose = (raw: unknown): Pose => PoseSchema.parse(raw)

/* ---------- 形象清单（pet.model.json）：丢弃未知情绪与空绑定 ---------- */

const PerformanceBindingSchema = z.object({
  expression: z
    .union([z.string(), z.null()])
    .transform((value) => (value === null ? null : value.trim()))
    .optional(),
  motion: z
    .string()
    .transform((value) => value.trim())
    .optional()
})

export const AppearanceSpecSchema = z.object({
  id: z.string().trim().min(1).catch('unknown'),
  displayName: z.string().trim().min(1).optional().catch(undefined),
  performances: z.record(z.string(), PerformanceBindingSchema.optional()).optional(),
  tapMotion: z.string().trim().min(1).optional().catch(undefined)
})

export const AppearanceSchema = AppearanceSpecSchema.transform((spec): Appearance => {
  const performances: Partial<Record<Emotion, Performance>> = {}
  for (const [key, binding] of Object.entries(spec.performances ?? {})) {
    if (!isEmotion(key) || !binding) continue
    const expression = binding.expression === '' ? undefined : binding.expression
    const cue = binding.motion || undefined
    if (expression === undefined && cue === undefined) continue
    performances[key] = {
      ...(expression !== undefined ? { expression } : {}),
      ...(cue !== undefined ? { cue } : {})
    }
  }
  return {
    id: spec.id,
    displayName: spec.displayName ?? spec.id,
    performances,
    tapCue: spec.tapMotion
  }
})

export const parseAppearanceSpec = (raw: unknown): Appearance => AppearanceSchema.parse(raw ?? {})

/** 磁盘上 pet.model.json 的声明形态（dir 由扫描器补上） */
export const ModelManifestSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  entry: z.string().trim().min(1).optional(),
  idleGroup: z.string().trim().min(1).optional(),
  tapMotion: z.string().trim().min(1).optional(),
  emotions: z.record(z.string(), PerformanceBindingSchema.optional()).optional()
})

/* ---------- 偏好 ---------- */

export const PreferencesSchema = z
  .object({
    appearanceId: z.string().trim().min(1).catch(DEFAULT_PREFERENCES.appearanceId),
    pose: PoseSchema,
    persona: z.string().catch(DEFAULT_PREFERENCES.persona),
    sessionId: z.string().catch('')
  })
  .catch(DEFAULT_PREFERENCES)

export const parsePreferences = (raw: unknown): Preferences => PreferencesSchema.parse(raw)

/** 应用配置（主进程形状）→ 领域偏好；非对象输入整体回退默认 */
const PreferencesConfigSchema = z.object({
  modelDir: z.string().trim().min(1).catch(DEFAULT_PREFERENCES.appearanceId),
  pose: PoseSchema,
  brain: z.object({ persona: z.string().optional() }).optional(),
  sessionId: z.string().catch('')
})

export function preferencesFromConfig(raw: unknown): Preferences {
  const parsed = PreferencesConfigSchema.safeParse(raw)
  if (!parsed.success) return parsePreferences({})
  const config = parsed.data
  return {
    appearanceId: config.modelDir,
    pose: config.pose,
    persona: config.brain?.persona ?? DEFAULT_PREFERENCES.persona,
    sessionId: config.sessionId
  }
}

/* ---------- 大脑回话（主进程转来的原始消息） ---------- */

export const BrainInboundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chat.delta'), delta: z.string() }),
  z.object({
    type: z.literal('chat.directive'),
    emotion: z.unknown().optional(),
    motion: z.string().optional()
  }),
  z.object({ type: z.literal('chat.done') }),
  z.object({ type: z.literal('chat.error'), message: z.string().optional() })
])

export type BrainInbound = z.infer<typeof BrainInboundSchema>
