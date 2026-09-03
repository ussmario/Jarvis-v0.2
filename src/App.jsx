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
        body: JSON.stringify({ threadId, messages: nextMessages }),
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
        [threadId]: [...current[threadId], { role: 'error', content: error.message }],
      }))
    } finally {
      setBusy(null)
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

      <section className="intro-row">
        <div>
          <p className="eyebrow">Three minds. One workspace.</p>
          <h2>Stay in the room<br /><em>with your intelligence.</em></h2>
        </div>
        <p className="intro-copy">Three independent conversations, held side by side. Focus one when the work gets deep; keep the wider system in view.</p>
      </section>

      <section className="thread-grid" aria-label="AI conversations" style={{ gridTemplateColumns: selected === 'chatgpt' ? '2fr 1fr 1fr' : selected === 're' ? '1fr 2fr 1fr' : '1fr 1fr 2fr' }}>
        {THREADS.map((thread) => (
          <ChatThread
            key={thread.id}
            thread={thread}
            active={selected === thread.id}
            messages={messages[thread.id]}
            draft={drafts[thread.id]}
            busy={busy === thread.id}
            onSelect={() => setSelected(thread.id)}
            onDraft={(value) => setDrafts((current) => ({ ...current, [thread.id]: value }))}
            onSend={() => sendMessage(thread.id)}
          />
        ))}
      </section>
      <footer><span>JARVIS v0.2</span><span>sessions stay isolated by design</span></footer>
    </main>
  )
}

function ChatThread({ thread, active, messages, draft, busy, onSelect, onDraft, onSend }) {
  const bottomRef = useRef(null)
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, busy])

  return (
    <article className={`thread-card ${active ? 'is-active' : ''} accent-${thread.accent}`} onClick={onSelect}>
      <header className="thread-header">
        <div className="avatar">{thread.name === 'RE' ? 'R' : thread.name[0]}</div>
        <div className="thread-title"><h3>{thread.name}</h3><p>{thread.label}</p></div>
        <span className="provider-tag">{thread.provider}</span>
      </header>
      <div className="message-list">
        {messages.map((message, index) => (
          <div className={`message message-${message.role}`} key={`${message.role}-${index}`}>
            {message.role === 'assistant' && <span className="message-label">{thread.name}</span>}
            <p>{message.content}</p>
          </div>
        ))}
        {busy && <div className="typing"><span /><span /><span /></div>}
        <div ref={bottomRef} />
      </div>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); onSend() }} onClick={(event) => event.stopPropagation()}>
        <textarea value={draft} onChange={(event) => onDraft(event.target.value)} placeholder={`Message ${thread.name}...`} rows="1" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend() } }} />
        <button type="submit" aria-label={`Send message to ${thread.name}`} disabled={busy || !draft.trim()}>↑</button>
      </form>
    </article>
  )
}

export default App
