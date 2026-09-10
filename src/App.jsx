import { useEffect, useRef, useState } from 'react'

const THREADS = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    label: 'General intelligence',
    provider: 'OpenAI',
    accent: 'gold',
    intro: 'A clear-headed partner for thinking, planning, and exploring ideas.',
  },
  {
    id: 're',
    name: 'RE',
    label: 'Local coordinator',
    provider: 'Ollama',
    accent: 'coral',
    intro: 'Your local Jarvis intelligence. Private, present, and ready to coordinate.',
  },
  {
    id: 'codex',
    name: 'Codex',
    label: 'Code intelligence',
    provider: 'OpenAI',
    accent: 'mint',
    intro: 'A focused coding partner for building, debugging, and shipping.',
  },
]

const initialMessages = Object.fromEntries(
  THREADS.map((thread) => [thread.id, [{ role: 'assistant', content: thread.intro }]]),
)

const DRAFTS_STORAGE_KEY = 'jarvis.drafts'
const TTS_STORAGE_KEY = 'jarvis.tts'
const VIEW_STORAGE_KEY = 'jarvis.view'
const initialDrafts = { chatgpt: '', re: '', codex: '' }
const initialTts = { chatgpt: true, re: true, codex: true }
const initialVerification = null
const voicePreferences = {
  chatgpt: { label: 'Bob voice', matches: ['google uk english male', 'microsoft george', 'daniel', 'alex'] },
  re: { label: 'RE voice', matches: ['local (tpf)', 'local(tpf)', 'tpf', 'zira', 'google uk english female', 'microsoft hazel', 'samantha', 'female'] },
  codex: { label: 'Sam voice', matches: ['google us english', 'microsoft david', 'microsoft mark', 'male'] },
}

function loadStoredObject(key, fallback) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null')
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback
  } catch {
    return fallback
  }
}

function saveStoredObject(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage may be blocked. */ }
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function fetchJsonWithRetry(url, options = {}, attempts = 10) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options)
      const text = await response.text()
      let data
      try { data = text ? JSON.parse(text) : null } catch { throw new Error(`The server returned incomplete JSON for ${url}.`) }
      if (response.ok) return { ok: true, data }
      if (response.status < 500) return { ok: false, data: data || { error: `Request failed with status ${response.status}.` } }
      lastError = new Error(data?.error || `Server returned ${response.status}.`)
    } catch (error) {
      lastError = error
    }
    await delay(Math.min(500 * (attempt + 1), 2000))
  }
  throw lastError || new Error('The Jarvis server did not become ready.')
}

function createId(prefix) {
  return window.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function trimPreview(text, limit = 180) {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > limit ? `${compact.slice(0, limit).trimEnd()}…` : compact
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.replace(/\s+/g, ' ').trim().length / 4))
}

function displayVerificationValue(value) {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

function isSamTarget(targetAgent) {
  return typeof targetAgent === 'string' && /\b(sam|codex)\b/i.test(targetAgent)
}

function isDispatchPacket(verification) {
  return verification?.disposition === 'dispatch' && isSamTarget(verification.routeTarget)
}

function isOllamaLifecycleCommand(content) {
  const command = content.trim().toLowerCase()
  return command === '/wake' || command === '/sleep'
}

function buildVerificationPacket({ thread, content, messages, drafts, attempt, interpretation }) {
  const originalMessage = {
    messageId: createId('message'),
    role: 'user',
    content: content.trim(),
  }
  const checkpointId = createId('checkpoint')
  const compiledMessage = interpretation.compiledMessage || [
    `disposition=${interpretation.disposition}`,
    `route=${interpretation.targetAgent}`,
    `attempt=${attempt}`,
    `original=${trimPreview(content, 220)}`,
  ].join('\n')

  const contextPacket = {
    compiledMessage,
    selectedContext: Array.isArray(interpretation.contextPacket?.selectedContext) ? interpretation.contextPacket.selectedContext : [],
    constraints: Array.isArray(interpretation.constraints)
      ? interpretation.constraints
      : String(interpretation.constraints || '').split('\n').map((item) => item.trim()).filter(Boolean),
  }

  return {
    checkpointId,
    attempt,
    threadId: thread.id,
    originalMessage,
    compiledMessage,
    estimatedTokens: estimateTokens(JSON.stringify(contextPacket)),
    disposition: interpretation.disposition,
    constraints: contextPacket.constraints,
    routeTarget: interpretation.targetAgent,
    proposedContext: interpretation.proposedContext,
    clarificationQuestions: interpretation.clarificationQuestions || [],
    contextPacket,
    checkpoint: { drafts, selectedThread: thread.id },
  }
}

function findVoice(threadId) {
  const voices = window.speechSynthesis?.getVoices?.() || []
  const preferred = voicePreferences[threadId].matches
  return voices.find((voice) => preferred.some((match) => voice.name.toLowerCase().includes(match))) || voices.find((voice) => voice.lang.startsWith('en')) || voices[0]
}

function speak(threadId, content) {
  if (!window.speechSynthesis || !content) return
  window.speechSynthesis.cancel()
  const speakNow = () => {
    const utterance = new SpeechSynthesisUtterance(content)
    const voice = findVoice(threadId)
    if (voice) utterance.voice = voice
    window.speechSynthesis.speak(utterance)
  }
  if (window.speechSynthesis.getVoices().length) {
    speakNow()
    return
  }
  let resolved = false
  const useFallback = () => {
    if (resolved) return
    resolved = true
    window.speechSynthesis.removeEventListener('voiceschanged', useFallback)
    speakNow()
  }
  window.speechSynthesis.addEventListener('voiceschanged', useFallback, { once: true })
  window.setTimeout(useFallback, 500)
}

function mergeTranscriptSegments(segments) {
  let merged = []
  for (const segment of segments.filter(Boolean)) {
    const words = segment.split(/\s+/).filter(Boolean)
    const normalized = words.map((word) => word.toLowerCase().replace(/[^a-z0-9']/g, ''))
    let overlap = 0
    const limit = Math.min(8, merged.length, words.length)
    for (let size = limit; size > 0; size -= 1) {
      const prior = merged.slice(-size).map((word) => word.toLowerCase().replace(/[^a-z0-9']/g, ''))
      if (prior.every((word, index) => word === normalized[index])) { overlap = size; break }
    }
    merged = [...merged, ...words.slice(overlap)]
  }
  return merged.join(' ')
}

function App() {
  const [selected, setSelected] = useState('re')
  const [viewMode, setViewMode] = useState('conversation')
  const [messages, setMessages] = useState(initialMessages)
  const [drafts, setDrafts] = useState(() => loadStoredObject(DRAFTS_STORAGE_KEY, initialDrafts))
  const [tts, setTts] = useState(() => loadStoredObject(TTS_STORAGE_KEY, initialTts))
  const [verification, setVerification] = useState(initialVerification)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)
  const [voiceThread, setVoiceThread] = useState('re')
  const [busy, setBusy] = useState(null)
  const [clearing, setClearing] = useState(null)
  const [clearVersions, setClearVersions] = useState({ chatgpt: 0, re: 0, codex: 0 })
  const [approvals, setApprovals] = useState({ chatgpt: null, re: null, reSam: null, codex: null })

  useEffect(() => saveStoredObject(DRAFTS_STORAGE_KEY, drafts), [drafts])
  useEffect(() => saveStoredObject(TTS_STORAGE_KEY, tts), [tts])
  useEffect(() => saveStoredObject(VIEW_STORAGE_KEY, viewMode), [viewMode])

  async function loadRuntimeState() {
    const [sessionsResult, approvalsResult, checkpointResult] = await Promise.all([
      fetchJsonWithRetry('/api/sessions'),
      fetchJsonWithRetry('/api/agent/approvals'),
      fetchJsonWithRetry('/api/verification/checkpoint'),
    ])

    if (!sessionsResult.ok) throw new Error(sessionsResult.data.error || 'The Ivy archive could not be loaded.')
    setMessages((current) => Object.fromEntries(THREADS.map((thread) => [thread.id, sessionsResult.data.sessions[thread.id]?.length ? sessionsResult.data.sessions[thread.id] : current[thread.id]])))
    if (checkpointResult.ok && checkpointResult.data.checkpoint) {
      setVerification(checkpointResult.data.checkpoint)
      setViewMode('verification')
      saveStoredObject(VIEW_STORAGE_KEY, 'verification')
    } else {
      setVerification(null)
      setViewMode('conversation')
      saveStoredObject(VIEW_STORAGE_KEY, 'conversation')
    }

    if (approvalsResult.ok) {
      const directApproval = approvalsResult.data.approvals?.find((item) => item.threadId === 'codex')
      const orchestrationApproval = approvalsResult.data.approvals?.find((item) => item.threadId === 're-sam')
      setApprovals((current) => ({ ...current, codex: directApproval || null, reSam: orchestrationApproval || null }))
    }
  }

  useEffect(() => {
    loadRuntimeState()
      .catch((error) => setMessages((current) => ({
        ...current,
        re: [...current.re, { role: 'error', content: `Archive unavailable: ${error.message}` }],
      })))
  }, [])

  async function reportVerificationEvent(event, payload, outcome) {
    try {
      await fetch('/api/verification/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, outcome, ...payload }),
      })
    } catch {
      /* Verification audits should not block the user flow. */
    }
  }

  function updateVerification(nextVerification) {
    setVerification(nextVerification)
  }

  async function saveVerificationCheckpoint(nextVerification) {
    const response = await fetch('/api/verification/checkpoint', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextVerification),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'The verification checkpoint could not be saved.')
  }

  async function clearVerificationCheckpoint() {
    const response = await fetch('/api/verification/checkpoint', { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'The verification checkpoint could not be discarded.')
  }

  function focusVerification(nextVerification) {
    setViewMode('verification')
    saveStoredObject(VIEW_STORAGE_KEY, 'verification')
    updateVerification(nextVerification)
  }

  async function sendMessage(threadId, options = {}) {
    const content = (options.content ?? drafts[threadId]).trim()
    if (!content || busy) return

    const bypassVerification = options.skipVerification || (threadId === 're' && isOllamaLifecycleCommand(content))
    if (threadId === 're' && !bypassVerification) {
      try {
        const interpretationResponse = await fetch('/api/verification/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            messages: messages[threadId].slice(-6).map(({ role, content: messageContent }) => ({ role, content: messageContent.slice(0, 1500) })),
          }),
        })
        const interpretationData = await interpretationResponse.json()
        if (!interpretationResponse.ok) throw new Error(interpretationData.error || 'The verification compiler could not interpret the request.')
        const nextVerification = buildVerificationPacket({
          thread: THREADS.find((thread) => thread.id === threadId),
          content,
          messages: messages[threadId],
          drafts,
          attempt: verification?.threadId === threadId && verification?.originalMessage?.content === content ? verification.attempt + 1 : 1,
          interpretation: interpretationData,
        })
        await saveVerificationCheckpoint(nextVerification)
        updateVerification(nextVerification)
        setDrafts((current) => ({ ...current, [threadId]: '' }))
        focusVerification(nextVerification)
        await reportVerificationEvent('verification_checkpoint_created', nextVerification, 'staged')
      } catch (error) {
        setMessages((current) => ({
          ...current,
          re: [...current.re, { role: 'error', content: error instanceof Error ? error.message : String(error) }],
        }))
      }
      return
    }

    const nextMessages = [...messages[threadId], { role: 'user', content }]
    setMessages((current) => ({ ...current, [threadId]: nextMessages }))
    setDrafts((current) => ({ ...current, [threadId]: '' }))
    setBusy(threadId)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options.verification ? { threadId, content, verification: options.verification } : { threadId, content }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The provider did not respond.')
      if (data.pendingApproval) {
        if (threadId === 're') {
          setMessages((current) => current.re.some((message) => message.approval?.id === data.pendingApproval.id)
            ? current
            : { ...current, re: [...current.re, { role: 'assistant', content: 'RE-Sam approval request', approval: data.pendingApproval }] })
        }
        setApprovals((current) => ({ ...current, [threadId]: data.pendingApproval }))
        return true
      }
      if (typeof data.message !== 'string') throw new Error('The provider returned an invalid message.')
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'assistant', content: data.message }],
      }))
      if (options.verification) {
        await reportVerificationEvent('verification_committed', options.verification, 'approved')
        await clearVerificationCheckpoint()
        updateVerification(null)
      }
      if (tts[threadId]) speak(threadId, data.message)
      return true
    } catch (error) {
      if (threadId === 'reSam') {
        setMessages((current) => ({ ...current, re: [...current.re, { role: 'error', content: error instanceof Error ? error.message : String(error) }] }))
        return
      }
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'error', content: error instanceof Error ? error.message : String(error) }],
      }))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function approveAction(threadId) {
    const approval = approvals[threadId]
    if (!approval || busy) return
    setBusy(threadId)
    try {
      const response = await fetch(`/api/agent/approvals/${approval.id}/approve`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The approved action failed.')
      if (data.pendingApproval) {
        if (threadId === 'reSam') {
          setMessages((current) => ({
            ...current,
            re: [
              ...current.re.map((message) => message.approval?.id === approval.id
                ? { ...message, approval: { ...message.approval, status: 'approved' } }
                : message),
              { role: 'assistant', content: 'RE-Sam approval request', approval: data.pendingApproval },
            ],
          }))
        }
        setApprovals((current) => ({ ...current, [threadId]: data.pendingApproval }))
        return
      }
      if (typeof data.message !== 'string') throw new Error('Sam returned an invalid message.')
      setApprovals((current) => ({ ...current, [threadId]: null }))
      if (threadId === 'reSam') {
        setMessages((current) => ({
          ...current,
          re: current.re.map((message) => message.approval?.id === approval.id
            ? { ...message, approval: { ...message.approval, status: data.receipt?.status === 'completed' ? 'completed' : 'approved', receipt: data.receipt || null } }
            : message),
        }))
      }
      if (threadId !== 'reSam') {
        setMessages((current) => ({ ...current, [threadId]: [...current[threadId], { role: 'assistant', content: data.message }] }))
      }
      if (data.jobId && data.receipt) await completeOrchestration(data)
      if (tts[threadId] && threadId !== 'reSam') speak(threadId, data.message)
    } catch (error) {
      setApprovals((current) => ({ ...current, [threadId]: null }))
      if (threadId === 'reSam') {
        setMessages((current) => ({
          ...current,
          re: current.re.map((message) => message.approval?.id === approval.id
            ? { ...message, approval: { ...message.approval, status: 'denied' } }
            : message),
        }))
      }
      if (threadId === 'reSam') {
        setMessages((current) => ({ ...current, re: [...current.re, { role: 'error', content: error instanceof Error ? error.message : String(error) }] }))
        return
      }
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'error', content: error instanceof Error ? error.message : String(error) }],
      }))
    } finally {
      setBusy(null)
    }
  }

  async function completeOrchestration(data) {
    const completed = data.state === 'completed'
    const resultMessage = typeof data.message === 'string'
      ? data.message
      : typeof data.resultMessage === 'string'
        ? data.resultMessage
        : `RE-Sam orchestration ${data.state || 'failed'} without a result.`
    setMessages((current) => ({
      ...current,
      re: [
        ...current.re,
        ...(current.re.some((item) => item.verification?.checkpointId === verification?.checkpointId) ? [] : [{ role: 'user', content: verification.originalMessage.content, verification }]),
        { role: completed ? 'assistant' : 'error', content: resultMessage, receipt: data.receipt },
      ],
    }))
    await reportVerificationEvent(completed ? 'orchestration_completed' : 'orchestration_failed', verification, completed ? 'completed' : 'failed')
    await clearVerificationCheckpoint()
    updateVerification(null)
    setViewMode('conversation')
    saveStoredObject(VIEW_STORAGE_KEY, 'conversation')
    if (completed && tts.re) speak('re', resultMessage)
  }

  async function denyAction(threadId) {
    const approval = approvals[threadId]
    if (!approval || busy) return
    try {
      const response = await fetch(`/api/agent/approvals/${approval.id}/deny`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The approval request could not be denied.')
      setApprovals((current) => ({ ...current, [threadId]: null }))
    } catch (error) {
      if (threadId === 'reSam') {
        setMessages((current) => ({ ...current, re: [...current.re, { role: 'error', content: error instanceof Error ? error.message : String(error) }] }))
        return
      }
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'error', content: error instanceof Error ? error.message : String(error) }],
      }))
    }
  }

  async function approveVerification() {
    if (!verification || busy) return
    setViewMode('conversation')
    saveStoredObject(VIEW_STORAGE_KEY, 'conversation')
    setMessages((current) => current.re.some((item) => item.verification?.checkpointId === verification.checkpointId)
      ? current
      : { ...current, re: [...current.re, { role: 'user', content: verification.originalMessage.content, verification }] })
    await reportVerificationEvent('verification_approved', verification, 'approved')
    if (isDispatchPacket(verification)) {
      setBusy('re')
      try {
        const response = await fetch('/api/orchestration/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verification }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'The orchestration job could not be started.')
        if (data.pendingApproval) {
          setMessages((current) => current.re.some((message) => message.approval?.id === data.pendingApproval.id)
            ? current
            : { ...current, re: [...current.re, { role: 'assistant', content: 'RE-Sam approval request', approval: data.pendingApproval }] })
          setApprovals((current) => ({ ...current, reSam: data.pendingApproval }))
          return
        }
        if (typeof data.message !== 'string') throw new Error('The orchestration job returned no result.')
        await completeOrchestration(data)
      } catch (error) {
        setMessages((current) => ({ ...current, re: [...current.re, { role: 'error', content: error instanceof Error ? error.message : String(error) }] }))
      } finally {
        setBusy(null)
      }
      return
    }
    const approved = await sendMessage('re', { content: verification.originalMessage.content, verification, skipVerification: true })
    if (approved) {
      setViewMode('conversation')
    }
  }

  async function retryVerification() {
    if (!verification || busy) return
    const content = verification.originalMessage?.content?.trim()
    if (!content) return
    setBusy('re')
    await reportVerificationEvent('verification_retry_requested', verification, 'retry')
    try {
      const interpretationResponse = await fetch('/api/verification/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          messages: messages.re.slice(-6).map(({ role, content: messageContent }) => ({ role, content: messageContent.slice(0, 1500) })),
        }),
      })
      const interpretationData = await interpretationResponse.json()
      if (!interpretationResponse.ok) throw new Error(interpretationData.error || 'The verification compiler could not reinterpret the request.')
      const nextVerification = buildVerificationPacket({
        thread: THREADS.find((thread) => thread.id === 're'),
        content,
        messages: messages.re,
        drafts,
        attempt: verification.attempt + 1,
        interpretation: interpretationData,
      })
      await saveVerificationCheckpoint(nextVerification)
      updateVerification(nextVerification)
      focusVerification(nextVerification)
      await reportVerificationEvent('verification_retry_completed', nextVerification, 'staged')
    } catch (error) {
      setMessages((current) => ({
        ...current,
        re: [...current.re, { role: 'error', content: error instanceof Error ? error.message : String(error) }],
      }))
    } finally {
      setBusy(null)
    }
  }

  async function discardVerification() {
    if (!verification) return
    const original = verification.originalMessage?.content || ''
    await reportVerificationEvent('verification_discarded', verification, 'discarded')
    await clearVerificationCheckpoint()
    setDrafts((current) => ({ ...current, re: original }))
    updateVerification(null)
    setSelected('re')
    setViewMode('conversation')
    saveStoredObject(VIEW_STORAGE_KEY, 'conversation')
  }

  async function clearDisplayedChat(threadId) {
    if (busy || clearing) return
    setClearing(threadId)
    try {
      const response = await fetch(`/api/sessions/${threadId}/clear`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The displayed chat could not be cleared.')
      const thread = THREADS.find((item) => item.id === threadId)
      setMessages((current) => ({ ...current, [threadId]: [{ role: 'assistant', content: thread.intro }] }))
      setClearVersions((current) => ({ ...current, [threadId]: current[threadId] + 1 }))
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'error', content: error instanceof Error ? error.message : String(error) }],
      }))
    } finally {
      setClearing(null)
    }
  }

  return (
    <main className={`app-shell ${viewMode === 'verification' ? 'is-verification' : ''}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /></div>
          <div>
            <p className="eyebrow">AI operating system</p>
            <h1>JARVIS <span>v0.2</span></h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="network-status"><i /> local network / tailscale ready</div>
          <div className="mode-tabs" role="tablist" aria-label="Workspace mode">
            <button
              className={`mode-tab ${viewMode === 'conversation' ? 'is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={viewMode === 'conversation'}
              onClick={() => setViewMode('conversation')}
            >
              conversation
            </button>
            <button
              className={`mode-tab ${viewMode === 'verification' ? 'is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={viewMode === 'verification'}
              onClick={() => setViewMode('verification')}
            >
              verification
            </button>
          </div>
          <label className="mobile-chat-picker">
            <span>Chat</span>
            <select value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="Select mobile chat">
              {THREADS.map((thread) => <option key={thread.id} value={thread.id}>{thread.name}</option>)}
            </select>
          </label>
          <button className="speech-button" type="button" aria-label="Open speech settings" onClick={() => setVoiceModalOpen(true)}>◌</button>
        </div>
      </header>

      {viewMode === 'conversation' ? (
        <section className="thread-grid" aria-label="AI conversations" style={{ gridTemplateColumns: selected === 'chatgpt' ? '2fr 1fr 1fr' : selected === 're' ? '1fr 2fr 1fr' : '1fr 1fr 2fr' }}>
          {THREADS.map((thread) => (
            <ChatThread
              key={thread.id}
              thread={thread}
              active={selected === thread.id}
              messages={messages[thread.id]}
              draft={drafts[thread.id]}
              busy={busy === thread.id}
              clearing={clearing === thread.id}
              clearVersion={clearVersions[thread.id]}
              approval={thread.id === 're' ? approvals.reSam : approvals[thread.id]}
              ttsEnabled={tts[thread.id]}
              onSelect={() => setSelected(thread.id)}
              onDraft={(value) => setDrafts((current) => ({ ...current, [thread.id]: value }))}
              onSend={() => sendMessage(thread.id)}
              onClear={() => clearDisplayedChat(thread.id)}
              onApprove={() => approveAction(thread.id === 're' ? 'reSam' : thread.id)}
              onDeny={() => denyAction(thread.id === 're' ? 'reSam' : thread.id)}
            />
          ))}
        </section>
      ) : (
        <section className="verification-workspace" aria-label="Verification workspace">
          <VerificationPanel
            verification={verification}
            busy={busy === 're'}
            onApprove={approveVerification}
            onRetry={retryVerification}
            onDiscard={discardVerification}
          />
          <div className="verification-chat" aria-label="Sam and Codex chat">
            <ChatThread
              thread={{ ...THREADS.find((thread) => thread.id === 'codex'), name: 'Sam / Codex', label: 'Patch assistant' }}
              active
              messages={messages.codex}
              draft={drafts.codex}
              busy={busy === 'codex'}
              clearing={clearing === 'codex'}
              clearVersion={clearVersions.codex}
              approval={approvals.codex}
              ttsEnabled={tts.codex}
              onSelect={() => setSelected('codex')}
              onDraft={(value) => setDrafts((current) => ({ ...current, codex: value }))}
              onSend={() => sendMessage('codex')}
              onClear={() => clearDisplayedChat('codex')}
              onApprove={() => approveAction('codex')}
              onDeny={() => denyAction('codex')}
            />
          </div>
        </section>
      )}
      {voiceModalOpen && <VoiceModal
        threadId={voiceThread}
        ttsEnabled={tts[voiceThread]}
        onThreadChange={setVoiceThread}
        onTtsChange={(enabled) => setTts((current) => ({ ...current, [voiceThread]: enabled }))}
        onTest={() => speak(voiceThread, `This is the ${THREADS.find((thread) => thread.id === voiceThread).name} voice.`)}
        onClose={() => setVoiceModalOpen(false)}
      />}
      <footer><span>JARVIS v0.2</span><span>sessions stay isolated by design</span></footer>
    </main>
  )
}

function VerificationPanel({ verification, busy, onApprove, onRetry, onDiscard }) {
  if (!verification) {
    return (
      <section className="verification-panel thread-card accent-mint">
        <header className="thread-header">
          <div className="avatar">R</div>
          <div className="thread-title"><h3>Verification</h3><p>Human approval gate</p></div>
          <span className="provider-tag">Compiler</span>
        </header>
        <div className="message-pane verification-pane">
          <div className="message-list verification-list">
            <p className="verification-note">Send a message to RE to stage the compiler packet here. You validate the interpretation, then choose approve, retry, or discard.</p>
            <p className="verification-empty">There is no pending verification packet right now.</p>
          </div>
        </div>
        <div className="composer verification-actions">
          <button type="button" onClick={onApprove} disabled>approve</button>
          <button type="button" onClick={onRetry} disabled>retry</button>
          <button type="button" onClick={onDiscard} disabled>discard</button>
        </div>
      </section>
    )
  }

  return (
    <section className="verification-panel thread-card accent-mint">
      <header className="thread-header">
        <div className="avatar">R</div>
        <div className="thread-title"><h3>Verification</h3><p>Human approval gate</p></div>
        <span className="provider-tag">Compiler</span>
        <div className="verification-pill">
          <span>checkpoint</span>
          <strong>{verification.checkpointId.slice(0, 8)}</strong>
        </div>
      </header>

      <div className="message-pane verification-pane">
        <div className="message-list verification-list">
          <p className="verification-note">RE cannot self-validate. Review the staged packet, patch Sam if needed, then retry with refreshed state.</p>
          <div className="verification-meta">
            <div><span>attempt</span><strong>{verification.attempt}</strong></div>
            <div><span>disposition</span><strong>{verification.disposition}</strong></div>
            <div><span>target agent</span><strong>{verification.routeTarget}</strong></div>
            <div><span>est. tokens</span><strong>{verification.estimatedTokens}</strong></div>
          </div>

          <article className="verification-card">
            <span className="message-label">Original message</span>
            <p>{verification.originalMessage.content}</p>
          </article>
          <article className="verification-card">
            <span className="message-label">Compiled message</span>
            <pre>{verification.compiledMessage}</pre>
          </article>
          <article className="verification-card">
            <span className="message-label">Constraints</span>
            <pre>{verification.constraints?.length ? displayVerificationValue(verification.constraints) : 'None specified.'}</pre>
          </article>
          <article className="verification-card">
            <span className="message-label">Target agent</span>
            <p>{verification.routeTarget}</p>
          </article>
          <article className="verification-card">
            <span className="message-label">Proposed context to gather</span>
            <pre>{displayVerificationValue(verification.proposedContext)}</pre>
          </article>
          <article className="verification-card verification-context">
            <span className="message-label">Context packet</span>
            <pre>{JSON.stringify(verification.contextPacket, null, 2)}</pre>
          </article>
        </div>
      </div>

      <div className="composer verification-actions">
        <button type="button" onClick={onApprove} disabled={busy}>approve</button>
        <button type="button" onClick={onRetry} disabled={busy}>retry</button>
        <button type="button" onClick={onDiscard} disabled={busy}>discard</button>
      </div>
    </section>
  )
}

function ChatThread({ thread, active, messages, draft, busy, clearing, clearVersion, approval, ttsEnabled, onSelect, onDraft, onSend, onClear, onApprove, onDeny }) {
  const bottomRef = useRef(null)
  const messageListRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const [showNewest, setShowNewest] = useState(false)
  const activeApprovalInMessages = messages.some((message) => message.approval?.id === approval?.id)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const listeningRef = useRef(false)
  const baseDraftRef = useRef('')
  const transcriptSegmentsRef = useRef([])
  const recognitionSessionRef = useRef(0)

  useEffect(() => {
    const node = messageListRef.current
    if (node && stickToBottomRef.current) node.scrollTop = node.scrollHeight
  }, [messages, busy])

  useEffect(() => {
    const node = messageListRef.current
    stickToBottomRef.current = true
    setShowNewest(false)
    if (node) node.scrollTop = node.scrollHeight
  }, [clearVersion])

  function handleMessageScroll(event) {
    const node = event.currentTarget
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 40
    stickToBottomRef.current = atBottom
    setShowNewest(!atBottom)
  }

  function scrollToNewest() {
    const node = messageListRef.current
    if (!node) return
    stickToBottomRef.current = true
    setShowNewest(false)
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }

  function stopListening() {
    recognitionSessionRef.current += 1
    listeningRef.current = false
    setListening(false)
    recognitionRef.current?.stop()
    recognitionRef.current = null
    transcriptSegmentsRef.current = []
  }

  useEffect(() => () => stopListening(), [])

  function toggleListening() {
    if (listening) { stopListening(); return }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) return
    const sessionId = ++recognitionSessionRef.current
    const mobile = window.matchMedia('(max-width: 800px)').matches
    baseDraftRef.current = draft.trim()
    transcriptSegmentsRef.current = []
    const recognition = new Recognition()
    recognition.continuous = !mobile
    recognition.interimResults = !mobile
    recognition.lang = 'en-GB'
    recognition.onstart = () => { listeningRef.current = true; setListening(true) }
    recognition.onresult = (event) => {
      if (recognitionSessionRef.current !== sessionId || !listeningRef.current) return
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcriptSegmentsRef.current[index] = event.results[index][0].transcript.trim()
      }
      const transcript = mergeTranscriptSegments(transcriptSegmentsRef.current)
      const content = [baseDraftRef.current, transcript].filter(Boolean).join(' ')
      onDraft(content)
    }
    recognition.onerror = () => stopListening()
    recognition.onend = () => {
      if (!listeningRef.current || recognitionSessionRef.current !== sessionId) return
      if (window.matchMedia('(max-width: 800px)').matches) {
        listeningRef.current = false
        setListening(false)
        recognitionRef.current = null
        return
      }
      recognitionRef.current = new Recognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-GB'
      recognitionRef.current.onresult = (event) => {
        if (recognitionSessionRef.current !== sessionId || !listeningRef.current) return
        recognition.onresult(event)
      }
      recognitionRef.current.onerror = recognition.onerror
      recognitionRef.current.onend = recognition.onend
      recognitionRef.current.start()
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  return (
    <article className={`thread-card ${active ? 'is-active' : ''} accent-${thread.accent}`} onClick={onSelect}>
      <header className="thread-header">
        <div className="avatar">{thread.name === 'RE' ? 'R' : thread.name[0]}</div>
        <div className="thread-title"><h3>{thread.name}</h3><p>{thread.label}</p></div>
        <span className="provider-tag">{thread.provider}</span>
        <button
          className="clear-button"
          type="button"
          aria-label={`Clear displayed messages in ${thread.name}`}
          onClick={(event) => { event.stopPropagation(); onClear() }}
          disabled={busy || clearing}
        >
          {clearing ? 'clearing' : 'clear'}
        </button>
      </header>
      <div className="message-pane">
        <div className="message-list" ref={messageListRef} onScroll={handleMessageScroll}>
          {messages.map((message, index) => (
            <div className={`message message-${message.role}`} key={`${message.role}-${index}`}>
              {message.role === 'assistant' && <button className="message-label replay-button" type="button" title={`Replay ${thread.name}'s message`} aria-label={`Replay ${thread.name}'s message`} onClick={(event) => { event.stopPropagation(); speak(thread.id, message.content) }}>{thread.name}</button>}
              <p>{message.content}</p>
              {message.receipt && <pre className="tool-receipt">{JSON.stringify(message.receipt, null, 2)}</pre>}
              {message.approval && <details className={`approval-card ${message.approval.id === approval?.id ? '' : 'historical-approval'}`} open={message.approval.id === approval?.id || undefined}><summary>Sam approval: {message.approval.status}</summary><p>{message.approval.tool}</p><pre>{JSON.stringify(message.approval.arguments, null, 2)}</pre>{message.approval.receipt && <pre className="tool-receipt">{JSON.stringify(message.approval.receipt, null, 2)}</pre>}{message.approval.id === approval?.id && <div className="approval-actions"><button type="button" onClick={onApprove} disabled={busy}>approve action</button><button type="button" onClick={onDeny} disabled={busy}>deny</button></div>}</details>}
            </div>
          ))}
          {busy && <div className="typing"><span /><span /><span /></div>}
          {approval && !activeApprovalInMessages && <details className="approval-card" open><summary>Sam requests approval</summary><p>{approval.tool}</p><pre>{JSON.stringify(approval.arguments, null, 2)}</pre><div className="approval-actions"><button type="button" onClick={onApprove} disabled={busy}>approve action</button><button type="button" onClick={onDeny} disabled={busy}>deny</button></div></details>}
          <div ref={bottomRef} />
        </div>
        {showNewest && <button className="newest-button" type="button" aria-label={`Jump to newest message in ${thread.name}`} onClick={scrollToNewest}>↓ newest</button>}
      </div>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); stopListening(); onSend() }} onClick={(event) => event.stopPropagation()}>
        <textarea value={draft} onFocus={onSelect} onChange={(event) => onDraft(event.target.value)} placeholder={`Message ${thread.name}...`} rows="1" />
        <button className={`mic-button ${listening ? 'is-listening' : ''}`} type="button" aria-label={listening ? `Stop listening for ${thread.name}` : `Start listening for ${thread.name}`} onClick={toggleListening}>{listening ? '■' : 'mic'}</button>
        <button type="submit" aria-label={`Send message to ${thread.name}`} disabled={busy || !draft.trim()}>↑</button>
      </form>
    </article>
  )
}

function VoiceModal({ threadId, ttsEnabled, onThreadChange, onTtsChange, onTest, onClose }) {
  const thread = THREADS.find((item) => item.id === threadId)
  const preference = voicePreferences[threadId]

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="voice-modal" role="dialog" aria-modal="true" aria-labelledby="voice-modal-title">
        <div className="modal-heading">
          <div><p className="eyebrow">Speech controls</p><h2 id="voice-modal-title">Voice settings</h2></div>
          <button className="modal-close" type="button" aria-label="Close speech settings" onClick={onClose}>×</button>
        </div>
        <label className="voice-field">
          <span>Chat</span>
          <select value={threadId} onChange={(event) => onThreadChange(event.target.value)}>
            {THREADS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="voice-setting">
          <div><strong>{thread.name} voice</strong><p>{preference.label} · browser speech synthesis</p></div>
          <label className="toggle"><input type="checkbox" checked={ttsEnabled} onChange={(event) => onTtsChange(event.target.checked)} /><span /></label>
        </div>
        <button className="test-voice" type="button" onClick={onTest}>test voice</button>
        <p className="voice-note">Voice availability depends on the browser and device. Preferences are saved in this browser.</p>
      </section>
    </div>
  )
}

export default App
