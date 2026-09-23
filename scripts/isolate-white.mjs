/**
 * 白屏变量隔离实验：固定窗口配置，仅切换页面渲染内容 / 注入渲染开关，
 * 以「启动前基线截图」为参照做逐像素差分，判定白屏的触发条件与可行的规避路径。
 *
 * 内容模式（第一个参数，或 --page=<模式>）：
 *   blank        纯空白透明页
 *   dom          透明页 + DOM 红块
 *   none         Pixi 初始化但不加载形象
 *   placeholder  Pixi + 占位史莱姆（无 Live2D）
 *   load         加载 Live2D 模型但不加入舞台（仅贴图上传/moc 解析）
 *   full         完整 Live2D（默认）
 *
 * 开关（--switch=a,b 或 --nogpu）：
 *   --switch=use-angle=swiftshader,...   注入 Chromium 开关（PET_SWITCH）
 *   --nogpu                              关闭硬件加速（PET_NOGPU=1）
 *
 * 用法：node scripts/isolate-white.mjs full --nogpu
 *       node scripts/isolate-white.mjs full --switch=disable-gpu-compositing
 */
import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const MODES = ['blank', 'dom', 'none', 'placeholder', 'load', 'full']
const argv = process.argv.slice(2)
const pageArg = argv.find((a) => !a.startsWith('--'))
const swArg = argv.find((a) => a.startsWith('--switch='))
const noGpu = argv.includes('--nogpu')
const tag = argv.find((a) => a.startsWith('--tag='))?.slice(6)
const variant = [pageArg ?? 'full', noGpu ? 'nogpu' : '', swArg ? swArg.slice(9) : '', tag ?? '']
  .filter(Boolean)
  .join('_')
const OUT = path.join('.diag', 'isolate')
fs.mkdirSync(OUT, { recursive: true })
const SHOT_PS = path.join('scripts', 'gdi-shot.ps1')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (name) =>
  spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', SHOT_PS, path.resolve(OUT, name)], {
    stdio: 'ignore'
  })

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

/** 差分：相对基线，统计「变化成白 / 变化成内容 / 无变化」，只看工作区 */
function diff(base, curFile) {
  const b = decode(base)
  const c = decode(curFile)
  const yLimit = Math.min(b.h, 1392)
  let toWhite = 0
  let toContent = 0
  let same = 0
  let wMinX = 1e9
  let wMinY = 1e9
  let wMaxX = -1
  let wMaxY = -1
  let tot = 0
  for (let y = 0; y < yLimit; y += 2) {
    for (let x = 0; x < b.w; x += 2) {
      tot++
      const o = (y * b.w + x) * b.bpp
      const dr = Math.abs(c.px[o] - b.px[o])
      const dg = Math.abs(c.px[o + 1] - b.px[o + 1])
      const db = Math.abs(c.px[o + 2] - b.px[o + 2])
      if (dr < 14 && dg < 14 && db < 14) {
        same++
        continue
      }
      const r = c.px[o]
      const g = c.px[o + 1]
      const bl = c.px[o + 2]
      if (r > 246 && g > 246 && bl > 246) {
        toWhite++
        if (x < wMinX) wMinX = x
        if (x > wMaxX) wMaxX = x
        if (y < wMinY) wMinY = y
        if (y > wMaxY) wMaxY = y
      } else toContent++
    }
  }
  const p = (n) => ((n / tot) * 100).toFixed(2) + '%'
  return {
    toWhite: p(toWhite),
    toContent: p(toContent),
    same: p(same),
    whiteBBox: wMaxX >= 0 ? `x[${wMinX},${wMaxX}] y[${wMinY},${wMaxY}]` : '(无)'
  }
}

const baseline = path.join(OUT, `${variant}-baseline.png`)
await sleep(300)
shot(path.basename(baseline))
console.log(`\n[isolate] ===== ${variant} =====（基线已拍）`)

const env = { ...process.env, PET_DIAG_PAGE: pageArg ?? 'full' }
if (swArg) env.PET_SWITCH = swArg.slice(9)
if (noGpu) env.PET_NOGPU = '1'

const child = spawn('npx', ['electron', '.'], {
  env,
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe']
})
const logStream = fs.createWriteStream(path.join(OUT, `${variant}.log`))
child.stdout.pipe(logStream)
child.stderr.pipe(logStream)

await sleep(5000)
const s5 = path.join(OUT, `${variant}-5s.png`)
shot(path.basename(s5))
await sleep(4000)
const s9 = path.join(OUT, `${variant}-9s.png`)
shot(path.basename(s9))

child.kill('SIGKILL')
spawnSync('taskkill', ['/F', '/IM', 'electron.exe'], { stdio: 'ignore' })
await sleep(1200)

for (const f of [s5, s9]) {
  if (!fs.existsSync(f)) {
    console.log(`[isolate] ${path.basename(f)}: (无截图)`)
    continue
  }
  const d = diff(baseline, f)
  console.log(
    `[isolate] ${path.basename(f).padEnd(30)} 变化成白=${d.toWhite} 变化成内容=${d.toContent} 无变化=${d.same} 白区=${d.whiteBBox}`
  )
}
