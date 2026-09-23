/**
 * 渲染侧诊断（主进程 PET_DIAG=1 时以 ?diag=1 注入启用）。
 * 输出 DOM/CSS 状态、canvas 与 WebGL 上下文属性、首帧与帧率、上下文丢失事件；
 * console 由主进程 diagnostics 转发到统一 stdout。
 */
export const RENDER_DIAG = new URLSearchParams(location.search).get('diag') === '1'

const T0 = performance.now()

export function rlog(tag: string, ...args: unknown[]): void {
  if (!RENDER_DIAG) return
  console.log(`[r +${(performance.now() - T0).toFixed(0)}ms] ${tag}`, ...args)
}

export function logStyleSnapshot(): void {
  if (!RENDER_DIAG) return
  const desc = (sel: string): string => {
    const el = document.querySelector(sel)
    if (!el) return `${sel}: missing`
    const s = getComputedStyle(el)
    return `${sel}: bg=${s.backgroundColor} opacity=${s.opacity} display=${s.display}`
  }
  rlog('dom', `href=${location.href}`, `readyState=${document.readyState}`)
  rlog('viewport', `${window.innerWidth}x${window.innerHeight}`, `dpr=${window.devicePixelRatio}`)
  rlog('style', desc('html'))
  rlog('style', desc('body'))
  rlog('style', desc('#stage'))
}

export function watchCanvasContext(canvas: HTMLCanvasElement): void {
  if (!RENDER_DIAG) return
  canvas.addEventListener('webglcontextlost', (e) => {
    rlog('webglcontextlost', (e as WebGLContextEvent).statusMessage)
  })
  canvas.addEventListener('webglcontextrestored', () => rlog('webglcontextrestored'))
}
