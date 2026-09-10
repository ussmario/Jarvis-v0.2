let awake = false
let wakePromise = null
let sleepTimer = null

function modelName() {
  return process.env.OLLAMA_MODEL || 'qwen3:8b'
}

function inactivityMs() {
  return Number(process.env.OLLAMA_INACTIVITY_SLEEP_MS || 15 * 60 * 1000)
}

function armSleepTimer(url) {
  clearTimeout(sleepTimer)
  sleepTimer = setTimeout(() => { sleepOllama({ url }).catch(() => {}) }, inactivityMs())
}

export async function wakeOllama({ url, model = modelName() }) {
  const startedAt = Date.now()
  if (awake) {
    armSleepTimer(url)
    return { awake: true, model, reused: true, durationMs: Date.now() - startedAt }
  }
  if (!wakePromise) {
    wakePromise = fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'Respond with READY.', stream: false, think: false, keep_alive: -1, options: { num_predict: 1 } }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Ollama wake returned ${response.status}.`)
      await response.json()
      awake = true
      armSleepTimer(url)
      return { awake: true, model, reused: false, durationMs: Date.now() - startedAt }
    }).finally(() => { wakePromise = null })
  }
  return wakePromise
}

export function touchOllamaActivity({ url }) {
  awake = true
  armSleepTimer(url)
}

export async function sleepOllama({ url, model = modelName() }) {
  clearTimeout(sleepTimer)
  sleepTimer = null
  if (!awake) return { asleep: true, model, reused: true }
  const response = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: 0 }),
  })
  if (!response.ok) throw new Error(`Ollama sleep returned ${response.status}.`)
  awake = false
  return { asleep: true, model, reused: false }
}

export async function ollamaChat({ url, model = modelName(), body, signal }) {
  const startedAt = Date.now()
  const wake = await wakeOllama({ url, model })
  const requestStartedAt = Date.now()
  const response = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, model, keep_alive: -1 }),
    signal,
  })
  response.jarvisTiming = {
    wakeMs: wake.durationMs,
    chatMs: Date.now() - requestStartedAt,
    totalMs: Date.now() - startedAt,
  }
  if (response.ok) touchOllamaActivity({ url })
  else awake = false
  return response
}
