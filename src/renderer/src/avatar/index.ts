import type { AssetInfo } from '../../../preload/index'
import type { PetAvatar } from './types'
import { Live2DAvatar } from './live2d-avatar'
import { PlaceholderAvatar } from './placeholder-avatar'

export interface AvatarLoadResult {
  avatar: PetAvatar
  kind: 'live2d' | 'placeholder'
  /** 降级原因（用于气泡提示） */
  warning?: string
}

/**
 * 形象工厂：优先加载配置指定的 Live2D 模型；
 * Core/模型缺失或加载失败时降级为占位史莱姆，保证应用始终可用。
 */
export async function createAvatar(assets: AssetInfo, modelDir: string): Promise<AvatarLoadResult> {
  const meta = assets.models.find((m) => m.dir === modelDir) ?? assets.models[0]
  if (!assets.core) {
    return {
      avatar: new PlaceholderAvatar(),
      kind: 'placeholder',
      warning: '缺少 Cubism Core（运行 npm run fetch:assets），当前为占位形象'
    }
  }
  if (!meta) {
    return {
      avatar: new PlaceholderAvatar(),
      kind: 'placeholder',
      warning: '未找到 Live2D 模型（运行 npm run fetch:assets），当前为占位形象'
    }
  }
  try {
    const avatar = await Live2DAvatar.load(meta)
    return { avatar, kind: 'live2d' }
  } catch (err) {
    console.warn('[pet] Live2D 模型加载失败，降级为占位形象:', err)
    return {
      avatar: new PlaceholderAvatar(),
      kind: 'placeholder',
      warning: `模型「${meta.displayName}」加载失败，当前为占位形象`
    }
  }
}
