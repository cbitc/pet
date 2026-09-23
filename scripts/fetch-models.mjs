/**
 * 下载 Live2D 官方示例模型（Haru, Cubism 4）并生成 pet.model.json 情绪映射。
 *
 * 素材来自 guansss/pixi-live2d-display 仓库的测试资产，
 * Haru/Shizuku 依 Live2D「免费素材许可协议」再分发：
 *   https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html
 * 模型文件不入库（.gitignore 已排除），本脚本可重复执行（已存在则跳过）。
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets'
const ROOT = path.resolve('resources/models')

/** Haru 的 8 个表情为通用面部变化（f00~f07），此处按语义近似分配，可自行微调 */
const HARU_EMOTIONS = {
  neutral: { expression: null },
  happy: { expression: 'f03', motion: 'Tap' },
  sad: { expression: 'f05' },
  angry: { expression: 'f06' },
  surprised: { expression: 'f04', motion: 'Tap' }
}

const MODELS = [
  {
    dir: 'haru',
    displayName: 'Haru（官方示例）',
    entry: 'haru_greeter_t03.model3.json'
  }
]

async function download(rel, destAbs, optional = false) {
  if (fs.existsSync(destAbs) && fs.statSync(destAbs).size > 0) return
  const url = `${BASE}/${rel}`
  const res = await fetch(url)
  if (!res.ok) {
    if (optional && res.status === 404) {
      console.warn(`[fetch-models] 跳过（可选文件缺失）: ${rel}`)
      return
    }
    throw new Error(`HTTP ${res.status} ${url}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(destAbs), { recursive: true })
  fs.writeFileSync(destAbs, buf)
  console.log(`[fetch-models] + ${rel} (${buf.length} bytes)`)
}

/** 可选引用：缺失不影响渲染（DisplayInfo/Pose/Physics/Sound） */
const OPTIONAL_RE = /\.(cdi3\.json|pose3\.json|physics3\.json|mp3|wav|ogg)$/i

function collectRefs(entryJson) {
  const fr = entryJson.FileReferences ?? {}
  const refs = [
    fr.Moc,
    fr.Physics,
    fr.Pose,
    fr.DisplayInfo,
    ...(fr.Textures ?? []),
    ...(fr.Expressions ?? []).map((e) => e.File),
    ...Object.values(fr.Motions ?? {})
      .flat()
      .flatMap((m) => [m.File, m.Sound])
  ].filter((v) => typeof v === 'string' && v.length > 0)
  return [...new Set(refs)]
}

async function fetchModel(model) {
  const entryRel = `${model.dir}/${model.entry}`
  const entryAbs = path.join(ROOT, model.dir, model.entry)

  if (!fs.existsSync(entryAbs)) {
    await download(entryRel, entryAbs)
  }
  const entryJson = JSON.parse(fs.readFileSync(entryAbs, 'utf8'))

  for (const ref of collectRefs(entryJson)) {
    // 归一化相对路径（如 ../shizuku/sounds/x.mp3 → shizuku/sounds/x.mp3）
    const normalized = path.posix.normalize(path.posix.join(model.dir, ref))
    await download(normalized, path.join(ROOT, normalized), OPTIONAL_RE.test(ref))
  }

  const metaFile = path.join(ROOT, model.dir, 'pet.model.json')
  fs.writeFileSync(
    metaFile,
    JSON.stringify(
      {
        displayName: model.displayName,
        entry: model.entry,
        idleGroup: 'Idle',
        tapMotion: 'Tap',
        emotions: model.dir === 'haru' ? HARU_EMOTIONS : {}
      },
      null,
      2
    )
  )
  console.log(`[fetch-models] 模型「${model.displayName}」就绪`)
}

async function main() {
  fs.mkdirSync(ROOT, { recursive: true })
  for (const m of MODELS) {
    await fetchModel(m)
  }
  console.log('[fetch-models] 全部完成')
}

main().catch((err) => {
  console.error(`[fetch-models] ${err.message}`)
  process.exit(1)
})
