/**
 * 诊断截图分析：对比「屏幕实拍」（原生合成结果）与「页面截图」（页面自身 alpha），
 * 逐时间点给出内容占比、区域均值与被判定为白/黑/透明的面积。
 *
 * 用法：node scripts/analyze-diag.mjs [目录=\.diag]
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const DIR = process.argv[2] ?? '.diag'

function decode(file) {
  const buf = fs.readFileSync(file)
  let off = 8
  let w = 0
  let h = 0
  let bitDepth = 8
  let colorType = 6
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') break
    off += 12 + len
  }
  if (bitDepth !== 8) throw new Error(`${file}: unsupported bitDepth ${bitDepth}`)
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : null
  if (!bpp) throw new Error(`${file}: unsupported colorType ${colorType}`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const px = Buffer.alloc(w * h * bpp)
  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const rs = y * (stride + 1) + 1
    const cur = y * stride
    const prev = cur - stride
    for (let x = 0; x < stride; x++) {
      const v = raw[rs + x]
      const a = x >= bpp ? px[cur + x - bpp] : 0
      const b = y > 0 ? px[prev + x] : 0
      const c = y > 0 && x >= bpp ? px[prev + x - bpp] : 0
      let val = v
      if (f === 1) val = v + a
      else if (f === 2) val = v + b
      else if (f === 3) val = v + ((a + b) >> 1)
      else if (f === 4) val = v + paeth(a, b, c)
      px[cur + x] = val & 0xff
    }
  }
  return { w, h, bpp, px }
}

/** kind: 'screen'（无 alpha，判定白/黑）| 'page'（有 alpha，判定透明） */
function analyze(file, kind) {
  const { w, h, bpp, px } = decode(file)
  const hasAlpha = bpp === 4
  let white = 0
  let black = 0
  let opaqueOther = 0
  let transparent = 0
  let minX = 1e9
  let minY = 1e9
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * bpp
      const r = px[i]
      const g = px[i + 1]
      const b = px[i + 2]
      const a = hasAlpha ? px[i + 3] : 255
      const lum = r * 0.299 + g * 0.587 + b * 0.114
      if (a < 32) transparent++
      else if (lum > 240) white++
      else if (lum < 24) black++
      else opaqueOther++
      if (a >= 32) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const total = w * h
  const pct = (n) => `${((n / total) * 100).toFixed(1)}%`
  return {
    file: path.basename(file),
    kind,
    size: `${w}x${h}`,
    white: pct(white),
    black: pct(black),
    other: pct(opaqueOther),
    transparent: hasAlpha ? pct(transparent) : '-',
    contentBBox: maxX >= 0 ? `x[${minX},${maxX}] y[${minY},${maxY}]` : '(empty)'
  }
}

if (!fs.existsSync(DIR)) {
  console.error(`目录不存在: ${DIR}`)
  process.exit(1)
}
const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.png'))
  .sort()

const rows = []
for (const f of files) {
  const kind = f.startsWith('screen') ? 'screen' : 'page'
  try {
    rows.push(analyze(path.join(DIR, f), kind))
  } catch (err) {
    rows.push({ file: f, kind, error: String(err.message ?? err) })
  }
}
for (const r of rows) {
  if (r.error) {
    console.log(`${r.file.padEnd(22)} ERROR ${r.error}`)
    continue
  }
  console.log(
    `${r.file.padEnd(22)} ${r.kind.padEnd(7)} ${r.size.padEnd(10)} white=${r.white.padEnd(6)} black=${r.black.padEnd(6)} other=${r.other.padEnd(6)} alpha0=${r.transparent.padEnd(6)} bbox=${r.contentBBox}`
  )
}
