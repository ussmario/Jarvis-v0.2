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

function App() {
  const [selected, setSelected] = useState('re')
  const [messages, setMessages] = useState(initialMessages)
  const [drafts, setDrafts] = useState({ chatgpt: '', re: '', codex: '' })
  const [busy, setBusy] = useState(null)
  const [clearing, setClearing] = useState(null)
  const [clearVersions, setClearVersions] = useState({ chatgpt: 0, re: 0, codex: 0 })

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
      if (typeof data.message !== 'string') throw new Error('The provider returned an invalid message.')
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'assistant', content: data.message }],
      }))
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [threadId]: [...current[threadId], { role: 'error', content: error instanceof Error ? error.message : String(error) }],
      }))
    } finally {
      setBusy(null)
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
        <div className="network-status"><i /> local network / tailscale ready</div>
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
            onSelect={() => setSelected(thread.id)}
            onDraft={(value) => setDrafts((current) => ({ ...current, [thread.id]: value }))}
            onSend={() => sendMessage(thread.id)}
            onClear={() => clearDisplayedChat(thread.id)}
          />
        ))}
      </section>
      <footer><span>JARVIS v0.2</span><span>sessions stay isolated by design</span></footer>
    </main>
  )
}

function ChatThread({ thread, active, messages, draft, busy, clearing, clearVersion, onSelect, onDraft, onSend, onClear }) {
  const bottomRef = useRef(null)
  const messageListRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const [showNewest, setShowNewest] = useState(false)

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
          <div ref={bottomRef} />
        </div>
        {showNewest && <button className="newest-button" type="button" aria-label={`Jump to newest message in ${thread.name}`} onClick={scrollToNewest}>↓ newest</button>}
      </div>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); onSend() }} onClick={(event) => event.stopPropagation()}>
        <textarea value={draft} onFocus={onSelect} onChange={(event) => onDraft(event.target.value)} placeholder={`Message ${thread.name}...`} rows="1" />
        <button type="submit" aria-label={`Send message to ${thread.name}`} disabled={busy || !draft.trim()}>↑</button>
      </form>
    </article>
  )
}

export default App
