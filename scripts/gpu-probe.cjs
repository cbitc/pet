/** GPU 探针（延迟查询版）：等待 GPU 进程完成初始化后再取状态，避免早期默认值误导。 */
const { app } = require('electron')

const extra = (process.env['GPU_PROBE_SWITCH'] ?? '').split(';').map(s=>s.trim()).filter(Boolean)
for (const s of extra) {
  const i = s.indexOf('=')
  if (i < 0) app.commandLine.appendSwitch(s); else app.commandLine.appendSwitch(s.slice(0,i), s.slice(i+1))
}
setTimeout(() => { console.log('[p2] watchdog'); app.exit(0) }, 15000)

app.whenReady().then(async () => {
  const report = async (tag) => {
    try {
      const st = app.getGPUFeatureStatus()
      const info = await Promise.race([app.getGPUInfo('basic'), new Promise((_,rj)=>setTimeout(()=>rj(new Error('timeout')),4000))])
      const aux = info.auxAttributes ?? {}
      const dev = (info.gpuDevice ?? []).map(d=>`${d.deviceString}:${d.active}`).join(' | ')
      console.log(`[p2] ${tag} compositing=${st.gpu_compositing} webgl=${st.webgl} gl=${aux.glImplementationParts} initTime=${aux.initializationTime} skia=${aux.skiaBackendType} inProcess=${aux.inProcessGpu}`)
      console.log(`[p2] ${tag} devices: ${dev}`)
    } catch (e) { console.log(`[p2] ${tag} probe failed: ${e.message}`) }
  }
  await report('t=0.2s')
  await new Promise(r=>setTimeout(r,3000))
  await report('t=3.2s')
  await new Promise(r=>setTimeout(r,4000))
  await report('t=7.2s')
  app.exit(0)
})
