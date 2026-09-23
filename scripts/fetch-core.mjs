/**
 * 下载 Live2D Cubism Core 到 resources/core/。
 *
 * ⚠️ Core 脚本遵循 Live2D 独立许可，禁止再分发：
 *   - 不得提交进仓库（.gitignore 已排除）
 *   - 分发应用时需自行确认符合 Live2D SDK 发行许可
 *   （https://www.live2d.com/eula/ ）
 *
 * 直链来自官方文档；若失效，请手动下载 Cubism SDK for Web：
 *   https://www.live2d.com/sdk/download/web/  → 解压后复制
 *   Core/framework/live2dcubismcore.min.js 到 resources/core/
 */
import fs from 'node:fs'
import path from 'node:path'

const CORE_URL = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js'
const DEST = path.resolve('resources/core/live2dcubismcore.min.js')

async function main() {
  fs.mkdirSync(path.dirname(DEST), { recursive: true })

  const existing = fs.existsSync(DEST) && fs.statSync(DEST).size
  if (existing && existing > 100_000) {
    console.log(`[fetch-core] 已存在（${existing} bytes），跳过`)
    return
  }

  console.log(`[fetch-core] 下载 ${CORE_URL}`)
  const res = await fetch(CORE_URL, { redirect: 'follow' })
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const head = buf.subarray(0, 200).toString('utf8')
  if (!head.includes('Live2D Cubism Core')) {
    throw new Error('下载内容不像 Cubism Core，请手动放置（见脚本头部说明）')
  }
  fs.writeFileSync(DEST, buf)
  console.log(`[fetch-core] 完成 → ${DEST}（${buf.length} bytes）`)
}

main().catch((err) => {
  console.error(`[fetch-core] ${err.message}`)
  console.error('[fetch-core] 请按脚本头部说明手动下载 Cubism SDK for Web 并放置 core 文件')
  process.exit(1)
})
