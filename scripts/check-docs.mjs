/**
 * 文档链接自检：扫描仓库根与 docs/ 下的相对 Markdown 链接，报告死链。
 *
 * 约定来源见 docs/conventions.md §5：文档之间用相对链接，代码与文档同级维护。
 * 用法：npm run docs:check
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function listMarkdown(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listMarkdown(full)
    return entry.name.endsWith('.md') ? [full] : []
  })
}

const rootMarkdown = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => path.join(root, entry.name))

const files = [...rootMarkdown, ...listMarkdown(path.join(root, 'docs'))]
const broken = []

for (const file of files) {
  const dir = path.dirname(file)
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1]
    // 外链、页内锚点不检查
    if (/^(https?:|mailto:|#)/.test(target)) continue
    const relative = target.split('#')[0]
    if (!relative) continue
    const resolved = path.normalize(path.join(dir, relative))
    if (!fs.existsSync(resolved)) {
      broken.push(`${path.relative(root, file)} → ${target}`)
    }
  }
}

if (broken.length > 0) {
  for (const line of broken) console.error(`[docs:check] 死链：${line}`)
  console.error(`[docs:check] 共 ${broken.length} 条，请修正后重试`)
  process.exit(1)
}
console.log(`[docs:check] ${files.length} 份文档，相对链接全部有效`)
