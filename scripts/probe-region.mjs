/**
 * 区域取样分析：在指定截图的指定矩形区域内输出 ASCII 视图与关键坐标的原始像素值。
 *
 * 用法：node scripts/probe-region.mjs <png> <x> <y> <w> <h> [采样列表如 300,400;640,430]
 *   采样坐标相对图片左上角（绝对像素）。
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const [, , file, xs, ys, ws, hs, samples = ''] = process.argv
if (!file) {
  console.error('用法: node scripts/probe-region.mjs <png> <x> <y> <w> <h> [x1,y1;x2,y2]')
  process.exit(1)
}
const X = Number(xs)
const Y = Number(ys)
const W = Number(ws)
const H = Number(hs)

const buf = fs.readFileSync(file)
let off = 8
let w = 0
let h = 0
let bpp = 0
const idat = []
while (off < buf.length) {
  const len = buf.readUInt32BE(off)
  const type = buf.toString('ascii', off + 4, off + 8)
  const data = buf.subarray(off + 8, off + 8 + len)
  if (type === 'IHDR') {
    w = data.readUInt32BE(0)
    h = data.readUInt32BE(4)
    bpp = data[9] === 6 ? 4 : 3
  } else if (type === 'IDAT') idat.push(data)
  else if (type === 'IEND') break
  off += 12 + len
}
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
const at = (x, y) => {
  const i = (y * w + x) * bpp
  return [px[i], px[i + 1], px[i + 2], bpp === 4 ? px[i + 3] : 255]
}

console.log(`file=${file} size=${w}x${h} bpp=${bpp}`)
console.log(`region x[${X},${X + W}) y[${Y},${Y + H})`)

// 区域 ASCII：按亮度
const cols = Math.min(100, W)
const rows = Math.round((cols / W) * H * 0.5)
let art = ''
for (let ry = 0; ry < rows; ry++) {
  for (let rx = 0; rx < cols; rx++) {
    let s = 0
    let n = 0
    for (
      let y = Y + Math.floor((ry / rows) * H);
      y < Y + Math.floor(((ry + 1) / rows) * H);
      y += 2
    ) {
      for (
        let x = X + Math.floor((rx / cols) * W);
        x < X + Math.floor(((rx + 1) / cols) * W);
        x += 2
      ) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const [r, g, b] = at(x, y)
        s += r * 0.299 + g * 0.587 + b * 0.114
        n++
      }
    }
    art += ' .:-=+*#%@'[Math.min(9, Math.floor(((n ? s / n : 0) / 256) * 10))]
  }
  art += '\n'
}
console.log(art)

if (samples) {
  for (const pair of samples.split(';')) {
    const [sx, sy] = pair.split(',').map(Number)
    if (Number.isFinite(sx) && Number.isFinite(sy)) {
      const [r, g, b, a] = at(sx, sy)
      console.log(`sample(${sx},${sy}) = rgba(${r},${g},${b},${a})`)
    }
  }
}
