/**
 * 形象目录——把壳（主进程）扫描到的模型资产转成领域认识的形象。
 *
 * 目录的职责边界：告诉宠物「有哪些形象可以穿」。
 * 具体怎么加载模型、模型文件长什么样，属于形象舞台（stage/）。
 */

import { defineAppearance, type Appearance } from '../../domain'

/** 壳扫描出的模型描述（与 shared/model.ts 的 ModelMeta 结构一致） */
export interface ModelAssetLike {
  dir: string
  displayName?: string
  tapMotion?: string
  emotions?: { [emotion: string]: { expression?: string | null; motion?: string } | undefined }
}

export interface AssetCatalogLike {
  models: readonly ModelAssetLike[]
}

export function appearancesFromAssets(assets: AssetCatalogLike | null | undefined): Appearance[] {
  return (assets?.models ?? []).map((model) =>
    defineAppearance({
      id: model.dir,
      displayName: model.displayName,
      tapMotion: model.tapMotion,
      performances: model.emotions
    })
  )
}
