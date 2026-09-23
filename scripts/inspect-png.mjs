/**
 * 冒烟截图自检：完整解码 PNG（含行过滤器），输出 ASCII 缩略图与内容统计。
 * 用法：node scripts/inspect-png.mjs [.smoke/pet.png]
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const file = process.argv[2] ?? '.smoke/pet.png'
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

if (bitDepth !== 8 || colorType !== 6) {
  console.error(`仅支持 8bit RGBA（got depth=${bitDepth} color=${colorType}）`)
  process.exit(1)
}

const raw = zlib.inflateSync(Buffer.concat(idat))
const stride = w * 4
const px = Buffer.alloc(w * h * 4)

const paeth = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

for (let y = 0; y < h; y++) {
  const f = raw[y * (stride + 1)]
  const rowStart = y * (stride + 1) + 1
  const cur = y * stride
  const prev = cur - stride
  for (let x = 0; x < stride; x++) {
    const v = raw[rowStart + x]
    const a = x >= 4 ? px[cur + x - 4] : 0
    const b = y > 0 ? px[prev + x] : 0
    const c = y > 0 && x >= 4 ? px[prev + x - 4] : 0
    let val = v
    if (f === 1) val = v + a
    else if (f === 2) val = v + b
    else if (f === 3) val = v + ((a + b) >> 1)
    else if (f === 4) val = v + paeth(a, b, c)
    px[cur + x] = val & 0xff
  }
}

// 统计
let count = 0
let minX = 1e9
let minY = 1e9
let maxX = -1
let maxY = -1
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (px[i + 3] > 16) {
      count++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
console.log(`size: ${w}x${h}`)
console.log(`non-transparent px: ${count} (${((count / (w * h)) * 100).toFixed(2)}%)`)
if (count > 0) console.log(`bbox: x[${minX},${maxX}] y[${minY},${maxY}]`)

// ASCII 缩略图（字符纵横比补偿 2:1）
const cols = Math.min(110, w)
const rows = Math.round((cols / w) * h * 0.5)
const chars = ' .:-=+*#%@'
let art = ''
for (let ry = 0; ry < rows; ry++) {
  for (let rx = 0; rx < cols; rx++) {
    const x0 = Math.floor((rx / cols) * w)
    const x1 = Math.floor(((rx + 1) / cols) * w)
    const y0 = Math.floor((ry / rows) * h)
    const y1 = Math.floor(((ry + 1) / rows) * h)
    let sum = 0
    let n = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4
        const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) * (px[i + 3] / 255)
        sum += lum
        n++
      }
    }
    const v = n ? sum / n : 0
    art += chars[Math.min(chars.length - 1, Math.floor((v / 256) * chars.length))]
  }
  art += '\n'
}
console.log(art)
