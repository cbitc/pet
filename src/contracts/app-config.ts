/** 应用配置类型与默认值（主进程持久化，渲染进程经 bridge 读写） */

export interface BrainConfig {
  /** mock = 内置模拟大脑；remote = 连接独立后端大脑服务 */
  mode: 'mock' | 'remote'
  /** remote 模式下的 WebSocket 地址 */
  url: string
  /** 人设提示词，由大脑侧使用（前端仅存储与转发） */
  persona: string
}

export interface PetPose {
  /** 归一化坐标 0..1，相对于工作区 */
  x: number
  y: number
  /** 宠物显示高度占屏幕高度的比例 */
  scale: number
}

export interface AppConfig {
  version: number
  brain: BrainConfig
  modelDir: string
  pose: PetPose
  openAtLogin: boolean
  sessionId: string
}

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  brain: {
    mode: 'mock',
    url: 'ws://127.0.0.1:17321/brain',
    persona:
      '你是一只活泼友好的桌面宠物，住在一台电脑屏幕的角落。你喜欢陪主人聊天，' +
      '说话简短可爱，偶尔用颜文字，关心主人的作息和心情。'
  },
  modelDir: 'haru',
  pose: { x: 0.8, y: 0.68, scale: 0.55 },
  openAtLogin: false,
  sessionId: ''
}

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 对配置补丁做归一化与合法性约束 */
export function sanitizeConfig(cfg: AppConfig): AppConfig {
  cfg.pose.x = clamp(Number.isFinite(cfg.pose.x) ? cfg.pose.x : 0.8, 0.05, 0.95)
  cfg.pose.y = clamp(Number.isFinite(cfg.pose.y) ? cfg.pose.y : 0.68, 0.1, 0.95)
  cfg.pose.scale = clamp(Number.isFinite(cfg.pose.scale) ? cfg.pose.scale : 0.55, 0.15, 1.4)
  if (cfg.brain.mode !== 'remote') cfg.brain.mode = 'mock'
  if (typeof cfg.brain.url !== 'string' || !cfg.brain.url.trim()) {
    cfg.brain.url = DEFAULT_CONFIG.brain.url
  }
  if (typeof cfg.modelDir !== 'string' || !cfg.modelDir.trim()) {
    cfg.modelDir = DEFAULT_CONFIG.modelDir
  }
  return cfg
}
