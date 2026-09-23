import { net, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resourceRoot } from './asset-catalog'

export const PET_SCHEME = 'pet'

/** 必须在 app ready 之前调用 */
export function registerPetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.moc': 'application/octet-stream',
  '.moc3': 'application/octet-stream',
  '.mtn': 'text/plain',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
}

/**
 * pet:// 协议：统一 dev/prod 的静态资源寻址。
 * pet://core/...   → resources/core/...
 * pet://models/... → resources/models/...
 */
export function registerPetProtocol(): void {
  const root = path.normalize(resourceRoot())
  protocol.handle(PET_SCHEME, async (request) => {
    const url = new URL(request.url)
    // standard scheme：host 承载第一段路径，如 pet://models/haru/x.json
    const rel = decodeURIComponent(`${url.host}${url.pathname}`)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
    const target = path.normalize(path.join(root, rel))
    if (target !== root && !target.startsWith(root + path.sep)) {
      return new Response('forbidden', { status: 403 })
    }
    try {
      const stat = await fs.promises.stat(target)
      if (!stat.isFile()) return new Response('not found', { status: 404 })
      const res = await net.fetch(pathToFileURL(target).href)
      const mime = MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream'
      return new Response(res.body, {
        status: 200,
        headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache' }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}
