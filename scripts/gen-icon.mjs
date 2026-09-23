/**
 * 生成应用图标（纯 Node 实现，无原生依赖）：
 *   resources/icon.png  —— 运行时托盘/窗口图标（256x256）
 *   build/icon.ico      —— electron-builder 打包用（PNG 封装的 ICO）
 *
 * 图案：圆滚滚的小史莱姆 + 眼睛 + 微笑，与占位形象一致。
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** 把 256x256 PNG 封装为单图像 ICO */
function wrapIco(pngBuf) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // count
  const entry = Buffer.alloc(16)
  entry[0] = 0 // 0 = 256
  entry[1] = 0
  entry[2] = 0 // palette
  entry[3] = 0
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(pngBuf.length, 8)
  entry.writeUInt32LE(6 + 16, 12)
  return Buffer.concat([header, entry, pngBuf])
}

/* ---------- 绘制（2x 超采样抗锯齿） ---------- */

const SIZE = 256
const SS = 2
const N = SIZE * SS

function lerp(a, b, t) {
  return a + (b - a) * t
}

function inCircle(x, y, cx, cy, r) {
  const d = Math.hypot(x - cx, y - cy)
  // 1px(超采样域)软边
  return Math.max(0, Math.min(1, (r - d) * SS + 0.5))
}

function render() {
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  const C = (SIZE / 2) * SS

  const drawPixel = (sx, sy, dr, dg, db, da) => {
    const x = Math.floor(sx / SS)
    const y = Math.floor(sy / SS)
    const i = (y * SIZE + x) * 4
    const a = da
    const prevA = buf[i + 3] / 255
    const outA = a + prevA * (1 - a)
    if (outA <= 0) return
    buf[i] = Math.round((dr * a + buf[i] * prevA * (1 - a)) / outA)
    buf[i + 1] = Math.round((dg * a + buf[i + 1] * prevA * (1 - a)) / outA)
    buf[i + 2] = Math.round((db * a + buf[i + 2] * prevA * (1 - a)) / outA)
    buf[i + 3] = Math.round(outA * 255)
  }

  for (let sy = 0; sy < N; sy++) {
    for (let sx = 0; sx < N; sx++) {
      // 身体：竖直渐变的圆
      const bodyA = inCircle(sx, sy, C, C * 1.04, 100 * SS)
      if (bodyA > 0) {
        const t = (sy / N - 0.28) / 0.5
        const r = lerp(150, 110, t)
        const g = lerp(186, 142, t)
        const b = lerp(255, 235, t)
        drawPixel(sx, sy, r, g, b, bodyA)
      }

      // 高光
      const hlA = inCircle(sx, sy, C - 60, C - 66, 30 * SS) * 0.35
      if (hlA > 0) drawPixel(sx, sy, 255, 255, 255, hlA)

      // 腮红
      for (const cxx of [C - 62, C + 62]) {
        const a = inCircle(sx, sy, cxx, C + 26, 20 * SS) * 0.5
        if (a > 0) drawPixel(sx, sy, 255, 130, 150, a)
      }

      // 眼睛
      for (const ex of [C - 40, C + 40]) {
        const a = inCircle(sx, sy, ex, C - 12, 15 * SS)
        if (a > 0) drawPixel(sx, sy, 44, 48, 64, a)
        const g = inCircle(sx, sy, ex + 5, C - 18, 5 * SS)
        if (g > 0) drawPixel(sx, sy, 255, 255, 255, g)
      }

      // 微笑（圆环下半段）
      const md = Math.hypot(sx - C, sy - (C + 14))
      const ring = Math.max(0, Math.min(1, (10 * SS - Math.abs(md - 26 * SS)) * SS * 0.5))
      if (ring > 0 && sy > C + 14) drawPixel(sx, sy, 90, 60, 60, ring)
    }
  }
  return encodePNG(SIZE, SIZE, buf)
}

const png = render()
fs.mkdirSync('resources', { recursive: true })
fs.mkdirSync('build', { recursive: true })
fs.writeFileSync('resources/icon.png', png)
fs.writeFileSync('build/icon.ico', wrapIco(png))
console.log(`[gen-icon] resources/icon.png (${png.length} bytes), build/icon.ico 完成`)
