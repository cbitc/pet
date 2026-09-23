/**
 * 宠物偏好——主人对宠物的设定，跨会话保留。
 *
 * 只有与「宠物本身」有关的设定在这里（穿什么形象、栖在哪里、什么性格、这段关系的身份）；
 * 大脑地址、开机自启之类的技术设定不属于宠物，由各自的适配器直接管理。
 */

import { DEFAULT_POSE, type Pose } from './pose'

export interface Preferences {
  /** 穿哪套形象（形象 id） */
  readonly appearanceId: string
  /** 栖在哪里 */
  readonly pose: Pose
  /** 性格设定（人设），由心智使用 */
  readonly persona: string
  /** 这段关系的身份标识（会话 id） */
  readonly sessionId: string
}

export const DEFAULT_PERSONA =
  '你是一只活泼友好的桌面宠物，住在一台电脑屏幕的角落。你喜欢陪主人聊天，' +
  '说话简短可爱，偶尔用颜文字，关心主人的作息和心情。'

export const DEFAULT_PREFERENCES: Preferences = {
  appearanceId: 'haru',
  pose: DEFAULT_POSE,
  persona: DEFAULT_PERSONA,
  sessionId: ''
}
