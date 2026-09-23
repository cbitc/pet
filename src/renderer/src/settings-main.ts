import type { AppConfig } from '../../shared/config'

const bridge = window.pet

async function main(): Promise<void> {
  const [cfg, assets] = await Promise.all([bridge.getConfig(), bridge.getAssets()])

  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
  const modeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="brain-mode"]'))
  const urlInput = $<HTMLInputElement>('brain-url')
  const personaInput = $<HTMLTextAreaElement>('persona')
  const modelSelect = $<HTMLSelectElement>('model')
  const scaleInput = $<HTMLInputElement>('scale')
  const scaleVal = $<HTMLElement>('scale-val')
  const loginInput = $<HTMLInputElement>('open-at-login')
  const saveBtn = $<HTMLButtonElement>('save')
  const savedTip = $<HTMLElement>('saved-tip')

  // ---- 初始化表单 ----
  const setMode = (mode: string): void => {
    for (const el of modeInputs) el.checked = el.value === mode
    const isRemote = mode === 'remote'
    urlInput.disabled = !isRemote
    personaInput.disabled = !isRemote
  }
  setMode(cfg.brain.mode)
  urlInput.value = cfg.brain.url
  personaInput.value = cfg.brain.persona

  if (assets.models.length === 0) {
    const opt = document.createElement('option')
    opt.value = cfg.modelDir
    opt.textContent = '（未发现模型，运行 npm run fetch:assets）'
    modelSelect.appendChild(opt)
  } else {
    for (const m of assets.models) {
      const opt = document.createElement('option')
      opt.value = m.dir
      opt.textContent = m.displayName
      opt.selected = m.dir === cfg.modelDir
      modelSelect.appendChild(opt)
    }
  }

  scaleInput.value = String(cfg.pose.scale)
  scaleVal.textContent = `${Math.round(cfg.pose.scale * 100)}%`
  loginInput.checked = cfg.openAtLogin

  const flashSaved = (): void => {
    savedTip.hidden = false
    window.setTimeout(() => (savedTip.hidden = true), 1600)
  }

  // ---- 大小滑杆：实时生效 ----
  let scaleTimer: number | null = null
  scaleInput.addEventListener('input', () => {
    scaleVal.textContent = `${Math.round(Number(scaleInput.value) * 100)}%`
    if (scaleTimer) window.clearTimeout(scaleTimer)
    scaleTimer = window.setTimeout(() => {
      scaleTimer = null
      void bridge.setConfig({ pose: { scale: Number(scaleInput.value) } })
    }, 200)
  })

  // ---- 模型切换：实时生效 ----
  modelSelect.addEventListener('change', () => {
    void bridge.setConfig({ modelDir: modelSelect.value })
    flashSaved()
  })

  loginInput.addEventListener('change', () => {
    void bridge.setConfig({ openAtLogin: loginInput.checked })
    flashSaved()
  })

  for (const el of modeInputs) {
    el.addEventListener('change', () => {
      setMode(el.value)
      void bridge.setConfig({ brain: { mode: el.value as AppConfig['brain']['mode'] } })
      flashSaved()
    })
  }

  // ---- 保存（地址/人设） ----
  saveBtn.addEventListener('click', () => {
    void bridge.setConfig({
      brain: {
        url: urlInput.value.trim(),
        persona: personaInput.value
      }
    })
    flashSaved()
  })

  // 地址输入后回车即保存
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click()
  })
}

main().catch((err) => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="color:#c0392b;font-size:13px;padding:0 24px">设置页加载失败：${String(err)}</p>`
  )
})
