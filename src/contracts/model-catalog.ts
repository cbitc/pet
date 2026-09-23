/**
 * 模型清单（pet.model.json）：每个模型目录一份，声明入口文件与情绪映射，
 * 使「换模型」不需要改前端代码。
 */

export interface EmotionBinding {
  /** Live2D expression 名称；null 表示恢复默认 */
  expression?: string | null
  /** motion 组名（如 "Tap"） */
  motion?: string
}

export interface ModelMeta {
  /** 资源目录名（resources/models/<dir>） */
  dir: string
  displayName: string
  /** 模型入口文件名（model3.json / model.json） */
  entry: string
  /** 待机动作组名，缺省 "Idle" */
  idleGroup: string
  /** 被点击时播放的动作组，缺省取模型第一个 Tap 组 */
  tapMotion?: string
  /** 情绪 → 表情/动作映射 */
  emotions: Partial<Record<string, EmotionBinding>>
}

export const DEFAULT_MODEL_META = {
  idleGroup: 'Idle',
  tapMotion: 'Tap'
} as const

/** 形象资产清单：可穿的形象 + Cubism Core 是否就位（IPC 载荷） */
export interface ModelCatalog {
  /** Cubism Core 是否已就位（缺失时舞台会降级为占位形象） */
  core: boolean
  models: ModelMeta[]
}

/** 模型资源的 pet:// URL 前缀 */
export function modelBaseUrl(dir: string): string {
  return `pet://models/${dir}`
}

export function modelEntryUrl(meta: { dir: string; entry: string }): string {
  return `${modelBaseUrl(meta.dir)}/${meta.entry}`
}
