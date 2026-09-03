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
const initialDrafts = { chatgpt: '', re: '', codex: '' }
const initialTts = { chatgpt: true, re: true, codex: true }
const voicePreferences = {
  chatgpt: { label: 'Bob voice', matches: ['google uk english male', 'microsoft george', 'daniel', 'alex'] },
  re: { label: 'RE voice', matches: ['google uk english female', 'microsoft hazel', 'samantha', 'female'] },
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

function findVoice(threadId) {
  const voices = window.speechSynthesis?.getVoices?.() || []
  const preferred = voicePreferences[threadId].matches
  return voices.find((voice) => preferred.some((match) => voice.name.toLowerCase().includes(match))) || voices.find((voice) => voice.lang.startsWith('en')) || voices[0]
}

function speak(threadId, content) {
  if (!window.speechSynthesis || !content) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(content)
  const voice = findVoice(threadId)
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
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
  const [messages, setMessages] = useState(initialMessages)
  const [drafts, setDrafts] = useState(() => loadStoredObject(DRAFTS_STORAGE_KEY, initialDrafts))
  const [tts, setTts] = useState(() => loadStoredObject(TTS_STORAGE_KEY, initialTts))
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)
  const [voiceThread, setVoiceThread] = useState('re')
  const [busy, setBusy] = useState(null)
  const [clearing, setClearing] = useState(null)
  const [clearVersions, setClearVersions] = useState({ chatgpt: 0, re: 0, codex: 0 })
  const [approvals, setApprovals] = useState({ chatgpt: null, re: null, codex: null })

  useEffect(() => saveStoredObject(DRAFTS_STORAGE_KEY, drafts), [drafts])
  useEffect(() => saveStoredObject(TTS_STORAGE_KEY, tts), [tts])

  useEffect(() => {
    fetch('/api/agent/approvals')
      .then((response) => response.json())
      .then((data) => {
        const approval = data.approvals?.find((item) => item.threadId === 'codex')
        if (approval) setApprovals((current) => ({ ...current, codex: approval }))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/sessions')
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'The Ivy archive could not be loaded.')
        setMessages((current) => Object.fromEntries(THREADS.map((thread) => [thread.id, data.sessions[thread.id]?.length ? data.sessions[thread.id] : current[thread.id]])))
      })
      .catch((error) => setMessages((current) => ({
        ...current,
        re: [...current.re, { role: 'error', content: `Archive unavailable: ${error.message}` }],
      })))
  }, [])

  async function sendMessage(threadId) {
    const content = drafts[threadId].trim()
    if (!content || busy) return

    const nextMessages = [...messages[threadId], { role: 'user', content }]
    setMessages((current) => ({ ...current, [threadId]: nextMessages }))
    setDrafts((current) => ({ ...current, [threadId]: '' }))
    setBusy(threadId)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, content }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The provider did not respond.')
      if (data.pendingApproval) {
        setApprovals((current) => ({ ...current, [threadId]: data.pendingApproval }))
        return
      }
      if (typeof data.message !== 'string') throw new Error('The provider returned an invalid message.')
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'assistant', content: data.message }],
      }))
      if (tts[threadId]) speak(threadId, data.message)
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'error', content: error instanceof Error ? error.message : String(error) }],
      }))
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
        setApprovals((current) => ({ ...current, [threadId]: data.pendingApproval }))
        return
      }
      if (typeof data.message !== 'string') throw new Error('Sam returned an invalid message.')
      setApprovals((current) => ({ ...current, [threadId]: null }))
      setMessages((current) => ({ ...current, [threadId]: [...current[threadId], { role: 'assistant', content: data.message }] }))
      if (tts[threadId]) speak(threadId, data.message)
    } catch (error) {
      setApprovals((current) => ({ ...current, [threadId]: null }))
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'error', content: error instanceof Error ? error.message : String(error) }],
      }))
    } finally {
      setBusy(null)
    }
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
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'error', content: error instanceof Error ? error.message : String(error) }],
      }))
    }
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
    <main className="app-shell">
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
          <button className="speech-button" type="button" aria-label="Open speech settings" onClick={() => setVoiceModalOpen(true)}>◌</button>
        </div>
      </header>

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
            approval={approvals[thread.id]}
            ttsEnabled={tts[thread.id]}
            onSelect={() => setSelected(thread.id)}
            onDraft={(value) => setDrafts((current) => ({ ...current, [thread.id]: value }))}
            onSend={() => sendMessage(thread.id)}
            onClear={() => clearDisplayedChat(thread.id)}
            onApprove={() => approveAction(thread.id)}
            onDeny={() => denyAction(thread.id)}
          />
        ))}
      </section>
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

function ChatThread({ thread, active, messages, draft, busy, clearing, clearVersion, approval, ttsEnabled, onSelect, onDraft, onSend, onClear, onApprove, onDeny }) {
  const bottomRef = useRef(null)
  const messageListRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const [showNewest, setShowNewest] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const listeningRef = useRef(false)
  const baseDraftRef = useRef('')
  const transcriptSegmentsRef = useRef([])

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
    baseDraftRef.current = draft.trim()
    transcriptSegmentsRef.current = []
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-GB'
    recognition.onstart = () => { listeningRef.current = true; setListening(true) }
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcriptSegmentsRef.current[index] = event.results[index][0].transcript.trim()
      }
      const transcript = mergeTranscriptSegments(transcriptSegmentsRef.current)
      const content = [baseDraftRef.current, transcript].filter(Boolean).join(' ')
      onDraft(content)
    }
    recognition.onerror = () => stopListening()
    recognition.onend = () => {
      if (!listeningRef.current) return
      recognitionRef.current = new Recognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-GB'
      recognitionRef.current.onresult = recognition.onresult
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
              {message.role === 'assistant' && <span className="message-label">{thread.name}</span>}
              <p>{message.content}</p>
            </div>
          ))}
          {busy && <div className="typing"><span /><span /><span /></div>}
          {approval && <div className="approval-card"><span className="message-label">Sam requests approval</span><p>{approval.tool}</p><pre>{JSON.stringify(approval.arguments, null, 2)}</pre><div className="approval-actions"><button type="button" onClick={onApprove} disabled={busy}>approve action</button><button type="button" onClick={onDeny} disabled={busy}>deny</button></div></div>}
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
