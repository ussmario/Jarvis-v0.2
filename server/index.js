import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import OpenAI from 'openai'
import { archiveLocation, ensureArchive, readThread, threadIds, writeThread } from './archive.js'

const app = express()
const port = Number(process.env.PORT || 8787)
const host = process.env.JARVIS_BIND_HOST || (process.env.JARVIS_REMOTE_ACCESS_MODE === 'tailscale' ? '0.0.0.0' : '127.0.0.1')
const ollamaUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')

app.use(cors())
app.use(express.json({ limit: '1mb' }))

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const threadLocks = new Map()
const prompts = {
  chatgpt: 'You are the ChatGPT thread in Jarvis. Be a thoughtful general-purpose assistant. This conversation is independent from RE and Codex.',
  codex: 'You are the Codex thread in Jarvis. Be a precise coding assistant. This conversation is independent from RE and ChatGPT.',
}

app.get('/api/health', (_request, response) => response.json({ ok: true }))

app.get('/api/sessions', async (_request, response) => {
  try {
    const sessions = Object.fromEntries(await Promise.all(threadIds.map(async (threadId) => [threadId, await readThread(threadId)])))
    return response.json({ sessions })
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Could not read the Ivy archive.' })
  }
})

app.post('/api/chat', async (request, response) => {
  const { threadId, content } = request.body || {}
  if (!threadIds.includes(threadId) || typeof content !== 'string' || !content.trim()) {
    return response.status(400).json({ error: 'A valid thread and message are required.' })
  }

  const previousLock = threadLocks.get(threadId) || Promise.resolve()
  const currentLock = previousLock.then(async () => {
    try {
      const cleanMessages = await readThread(threadId)
      const userMessage = { role: 'user', content: content.trim() }
      const providerMessages = [...cleanMessages, userMessage]
    if (threadId === 're') {
      const ollamaResponse = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3.2', messages: providerMessages, stream: false }),
      })
      if (!ollamaResponse.ok) throw new Error(`Ollama returned ${ollamaResponse.status}. Is Ollama running?`)
      const data = await ollamaResponse.json()
      const message = data.message?.content || 'RE returned an empty response.'
      await writeThread(threadId, [...cleanMessages, userMessage, { role: 'assistant', content: message }])
      return response.json({ message })
    }

    if (!openai) throw new Error('OPENAI_API_KEY is not configured in .env.')
    const model = threadId === 'codex' ? (process.env.OPENAI_CODEX_MODEL || 'gpt-5.3-codex') : (process.env.OPENAI_CHAT_MODEL || 'gpt-4.1')
    if (threadId === 'codex') {
      const codexResponse = await openai.responses.create({
        model,
        instructions: prompts.codex,
        input: providerMessages,
      })
      const message = codexResponse.output_text || 'Codex returned an empty response.'
      await writeThread(threadId, [...cleanMessages, userMessage, { role: 'assistant', content: message }])
      return response.json({ message })
    }

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'system', content: prompts.chatgpt }, ...providerMessages],
    })
      const message = completion.choices[0]?.message?.content || 'The model returned an empty response.'
      await writeThread(threadId, [...cleanMessages, userMessage, { role: 'assistant', content: message }])
      return response.json({ message })
    } catch (error) {
      return response.status(502).json({ error: error instanceof Error ? error.message : 'Provider request failed.' })
    }
  })
  threadLocks.set(threadId, currentLock.catch(() => {}))
  return currentLock
})

ensureArchive()
  .then(() => app.listen(port, host, () => console.log(`Jarvis API listening on ${host}:${port}; archive ${archiveLocation()}`)))
  .catch((error) => {
    console.error(`Could not initialize Ivy archive: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  })
