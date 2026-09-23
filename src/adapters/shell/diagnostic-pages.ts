/**
 * 诊断用的最小页面——白屏排查需要「只改变内容类型」的对照 HTML。
 *
 * 这些页面同时在主进程的窗口内容分支（pet-window）与受控场景实验
 * （diagnostics/runScenario、runMinimalProbe）里使用，集中在此避免两份漂移。
 */

const page = (style: string, body: string): string =>
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`

const TRANSPARENT = 'html,body{margin:0;height:100%;background:transparent;overflow:hidden}'

const BOX = 'position:absolute;left:200px;top:200px;width:420px;height:280px;border-radius:30px'

export const DIAGNOSTIC_PAGES = {
  /** 纯透明空页：验证窗口级透明合成 */
  blank: page(TRANSPARENT, ''),

  /** 透明窗 + 纯 DOM 内容：验证 DOM 是否触发白屏 */
  dom: page(`${TRANSPARENT}.box{${BOX};background:rgba(224,64,64,.95)}`, '<div class="box"></div>'),

  /** 透明窗 + 预乘 alpha 的 WebGL：复现/定位白屏变量 */
  webgl: page(
    `${TRANSPARENT}#gl{position:absolute;inset:0;width:100%;height:100%}`,
    `<canvas id="gl"></canvas><script>
      const c = document.getElementById('gl')
      const gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true })
      c.width = innerWidth; c.height = innerHeight
      function draw(){ gl.viewport(0,0,c.width,c.height); gl.clearColor(0,0.8,0.35,0.95); gl.clear(gl.COLOR_BUFFER_BIT); requestAnimationFrame(draw) }
      draw()
    </script>`
  ),

  /** 不透明对照：内容相同但窗口不透明 */
  opaque: page(
    `html,body{margin:0;height:100%;background:#102040;overflow:hidden}.box{${BOX};background:rgba(224,64,64,.95)}`,
    '<div class="box"></div>'
  ),

  /** 最小透明探测页（PET_DIAG_MINIMAL=1） */
  minimal: page(
    `${TRANSPARENT}.box{position:absolute;left:60px;top:60px;width:320px;height:200px;border-radius:28px;` +
      `background:rgba(224,64,64,.95);box-shadow:0 8px 30px rgba(0,0,0,.35)}` +
      `.txt{position:absolute;left:60px;top:290px;color:#123;font:16px/1.4 sans-serif;` +
      `background:rgba(255,255,255,.9);padding:6px 10px;border-radius:8px}`,
    '<div class="box"></div><div class="txt">minimal transparent probe</div>'
  )
} as const

export type DiagnosticPage = keyof typeof DIAGNOSTIC_PAGES
