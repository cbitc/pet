/**
 * 冒烟自检（构建产物）：验证
 *   1) 应用可启动、窗口可显示
 *   2) 聊天链路：自动经真实输入框发一条消息，Mock 大脑流式回包（截图存 .smoke/）
 *   3) 透明窗白屏回归：运行中从外部 GDI 实拍屏幕，检查透明区是否被填白
 *
 * 用法：npm run smoke
 *       npm run smoke -- --switch=disable-gpu     # 附加 Chromium 开关
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const OUT = '.smoke'
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const swArg = process.argv.find((a) => a.startsWith('--switch='))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (name) =>
  spawnSync(
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts', 'gdi-shot.ps1'), path.resolve(OUT, name)],
    { stdio: 'ignore' }
  )

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

/** 透明区白化检测：取窗口内远离宠物的若干点，统计纯白占比 */
function whiteRatio(file) {
  const { w, bpp, px } = decode(file)
  const pts = []
  for (let x = 40; x < 2400; x += 160) for (let y = 40; y < 1300; y += 160) pts.push([x, y])
  let white = 0
  for (const [x, y] of pts) {
    const i = (y * w + x) * bpp
    if (px[i] > 246 && px[i + 1] > 246 && px[i + 2] > 246) white++
  }
  return white / pts.length
}

console.log('[smoke] 1/3 拍桌面基线…')
shot('desktop-baseline.png')
const baseWhite = whiteRatio(path.join(OUT, 'desktop-baseline.png'))
console.log(`[smoke] 基线白点比例 = ${(baseWhite * 100).toFixed(1)}%`)

console.log('[smoke] 2/3 启动应用（PET_SMOKE=1：自动点击/拖动/对话 + 截图）…')
const env = {
  ...process.env,
  PET_SMOKE: '1',
  // 用独立数据目录：自检会真的拖动宠物，绝不能改到主人正在用的配置与位置
  PET_USER_DATA: path.resolve(OUT, 'user-data')
}
if (swArg) env.PET_SWITCH = swArg.slice(9)
const child = spawn('npx', ['electron', '.'], {
  env,
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe']
})
const log = fs.createWriteStream(path.join(OUT, 'run.log'))
child.stdout.pipe(log)
child.stderr.pipe(log)

await sleep(4800)
shot('during-run.png')
console.log('[smoke] 运行中屏幕实拍已保存')

await new Promise((resolve) => {
  const timer = setTimeout(() => {
    child.kill('SIGKILL')
    resolve()
  }, 20000)
  child.on('exit', () => {
    clearTimeout(timer)
    resolve()
  })
})
spawnSync('taskkill', ['/F', '/IM', 'electron.exe'], { stdio: 'ignore' })
await sleep(500)

console.log('[smoke] 3/3 结果')
let ok = true
const pet = path.join(OUT, 'pet.png')
if (fs.existsSync(pet)) {
  const d = decode(pet)
  let content = 0
  for (let i = 0; i < d.w * d.h; i++) {
    if (d.bpp === 4 ? d.px[i * 4 + 3] > 32 : true) content++
  }
  const pct = (content / (d.w * d.h)) * 100
  const pass = pct > 0.2
  if (!pass) ok = false
  console.log(`  页面内容占比 = ${pct.toFixed(2)}%（含宠物/气泡，>0.2% 视为通过）→ ${pass ? 'PASS' : 'FAIL'}`)
} else {
  ok = false
  console.log('  ✗ 未生成 .smoke/pet.png（应用未完成冒烟流程）')
}

const runWhite = whiteRatio(path.join(OUT, 'during-run.png'))
const whiteOk = runWhite < 0.35
if (!whiteOk) ok = false
console.log(
  `  运行中屏幕白点 = ${(runWhite * 100).toFixed(1)}%（基线 ${(baseWhite * 100).toFixed(1)}%，<35% 视为透明正常）→ ${whiteOk ? 'PASS' : 'FAIL'}`
)

console.log(`[smoke] ${ok ? '全部通过 ✓' : '存在失败项 ✗'}（截图见 ${OUT}/）`)
process.exit(ok ? 0 : 1)
