/**
 * 场景实验分析：对每个场景，比较「show 前背景基线」与「show 后各时间点」，
 * 统计窗口区域内发生了白化/黑化/内容出现的像素比例，从而判定白屏触发条件。
 *
 * 用法：node scripts/analyze-scenario.mjs [目录=.diag/scene-xxx]
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const DIR = process.argv[2] ?? '.'

function decode(file) {
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
  return { w, h, bpp, px }
}

const scenes = fs.existsSync(DIR)
  ? [
      ...new Set(
        fs
          .readdirSync(DIR)
          .map((f) => /^(.*?)-(bg1|bg2|after-\d+ms)\.png$/.exec(f)?.[1])
          .filter(Boolean)
      )
    ]
  : []

if (!scenes.length) {
  console.error(`未在 ${DIR} 找到场景截图`)
  process.exit(1)
}

for (const scene of scenes) {
  const bgFile = path.join(DIR, `${scene}-bg1.png`)
  const bg2File = path.join(DIR, `${scene}-bg2.png`)
  const afterFiles = fs
    .readdirSync(DIR)
    .filter((f) => f.startsWith(`${scene}-after-`) && f.endsWith('.png'))
    .sort()
  if (!fs.existsSync(bgFile)) continue

  const bg = decode(bgFile)
  const bg2 = decode(bg2File).px
  const N = bg.w * bg.h
  // 背景噪声水平（bg1 vs bg2 的变动像素比例）
  let noise = 0
  for (let i = 0; i < N; i++) {
    const o = i * bg.bpp
    if (
      Math.abs(bg.px[o] - bg2[o]) > 12 ||
      Math.abs(bg.px[o + 1] - bg2[o + 1]) > 12 ||
      Math.abs(bg.px[o + 2] - bg2[o + 2]) > 12
    ) {
      noise++
    }
  }
  console.log(`\n=== 场景 ${scene} ===  基线噪声(背景自身变动)=${((noise / N) * 100).toFixed(2)}%`)

  for (const f of afterFiles) {
    const px2 = decode(path.join(DIR, f)).px
    let toWhite = 0
    let toBlack = 0
    let toColor = 0
    for (let i = 0; i < N; i++) {
      const o = i * bg.bpp
      const dr = Math.abs(px2[o] - bg.px[o])
      const dg = Math.abs(px2[o + 1] - bg.px[o + 1])
      const db = Math.abs(px2[o + 2] - bg.px[o + 2])
      if (dr < 14 && dg < 14 && db < 14) continue
      const lum = px2[o] * 0.299 + px2[o + 1] * 0.587 + px2[o + 2] * 0.114
      if (lum > 242 && px2[o] > 245 && px2[o + 1] > 245 && px2[o + 2] > 245) toWhite++
      else if (lum < 16) toBlack++
      else toColor++
    }
    const p = (n) => ((n / N) * 100).toFixed(2) + '%'
    console.log(
      `  ${f.replace(`${scene}-`, '').padEnd(18)} 白化=${p(toWhite)}  黑化=${p(toBlack)}  其他变化=${p(toColor)}`
    )
  }

  // 页面自身内容占比（对照：页面是否有内容、是否透明）
  const pageFiles = fs
    .readdirSync(DIR)
    .filter((f) => f.startsWith(`${scene}-page-`) && f.endsWith('.png'))
    .sort()
  if (pageFiles.length) {
    const last = decode(path.join(DIR, pageFiles[pageFiles.length - 1]))
    let opaque = 0
    for (let i = 0; i < last.w * last.h; i++) {
      const o = i * last.bpp
      if (last.bpp === 3 || last.px[o + 3] > 32) opaque++
    }
    console.log(`  页面内容占比（自身）=${((opaque / (last.w * last.h)) * 100).toFixed(2)}%`)
  }
}
