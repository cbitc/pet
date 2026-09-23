import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { AppConfig, DEFAULT_CONFIG, sanitizeConfig } from '../../contracts/app-config'

type Listener = (cfg: AppConfig) => void

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k]
    out[k] = isPlainObject(cur) && isPlainObject(v) ? deepMerge(cur, v) : v
  }
  return out as T
}

/** 应用配置：JSON 文件持久化（userData/pet-config.json），原子写入 */
class ConfigStoreImpl {
  private file = ''
  private cache: AppConfig = structuredClone(DEFAULT_CONFIG)
  private listeners = new Set<Listener>()

  init(): void {
    this.file = path.join(app.getPath('userData'), 'pet-config.json')
    this.cache = this.load()
    this.ensureSessionId()
  }

  private load(): AppConfig {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown
      return sanitizeConfig(deepMerge(structuredClone(DEFAULT_CONFIG), raw))
    } catch {
      return structuredClone(DEFAULT_CONFIG)
    }
  }

  private persist(): void {
    const tmp = `${this.file}.tmp`
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf8')
    fs.renameSync(tmp, this.file)
  }

  get(): AppConfig {
    return this.cache
  }

  set(patch: unknown): AppConfig {
    const next = sanitizeConfig(deepMerge(structuredClone(this.cache), patch))
    this.cache = next
    this.persist()
    for (const l of this.listeners) l(this.cache)
    return this.cache
  }

  ensureSessionId(): void {
    if (!this.cache.sessionId) {
      this.cache.sessionId = randomUUID()
      this.persist()
    }
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
}

export const store = new ConfigStoreImpl()
