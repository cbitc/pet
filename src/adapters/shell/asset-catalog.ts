import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { ModelMeta } from '../../contracts/model-catalog'

/** 资源根目录：dev 为项目 resources/；打包后为 electron-builder 的 extraResources 目录 */
export function resourceRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources')
}

export function iconPath(): string {
  return path.join(resourceRoot(), 'icon.png')
}

export function coreExists(): boolean {
  return fs.existsSync(path.join(resourceRoot(), 'core', 'live2dcubismcore.min.js'))
}

/** 扫描 resources/models/ 下的模型清单（pet.model.json），缺失清单时做基础探测 */
export function listModels(): ModelMeta[] {
  const root = path.join(resourceRoot(), 'models')
  let dirs: string[]
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }

  const models: ModelMeta[] = []
  for (const dir of dirs) {
    const full = path.join(root, dir)
    const metaFile = path.join(full, 'pet.model.json')
    try {
      if (fs.existsSync(metaFile)) {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as Partial<ModelMeta>
        models.push({
          dir,
          displayName: meta.displayName ?? dir,
          entry: meta.entry ?? guessEntry(full),
          idleGroup: meta.idleGroup ?? 'Idle',
          tapMotion: meta.tapMotion,
          emotions: meta.emotions ?? {}
        })
      } else {
        const entry = guessEntry(full)
        if (entry) {
          models.push({ dir, displayName: dir, entry, idleGroup: 'Idle', emotions: {} })
        }
      }
    } catch {
      // 单个模型损坏不影响其余模型
    }
  }
  return models
}

function guessEntry(dir: string): string {
  try {
    const files = fs.readdirSync(dir)
    return files.find((f) => f.endsWith('.model3.json')) ?? files.find((f) => f.endsWith('.model.json')) ?? ''
  } catch {
    return ''
  }
}
