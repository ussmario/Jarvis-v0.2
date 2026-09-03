import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import OpenAI from 'openai'

const app = express()
const port = Number(process.env.PORT || 8787)
const host = process.env.JARVIS_BIND_HOST || (process.env.JARVIS_REMOTE_ACCESS_MODE === 'tailscale' ? '0.0.0.0' : '127.0.0.1')
const ollamaUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')

app.use(cors())
app.use(express.json({ limit: '1mb' }))

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const prompts = {
  chatgpt: 'You are the ChatGPT thread in Jarvis. Be a thoughtful general-purpose assistant. This conversation is independent from RE and Codex.',
  codex: 'You are the Codex thread in Jarvis. Be a precise coding assistant. This conversation is independent from RE and ChatGPT.',
}

app.get('/api/health', (_request, response) => response.json({ ok: true }))

app.post('/api/chat', async (request, response) => {
  const { threadId, messages } = request.body || {}
  if (!['chatgpt', 're', 'codex'].includes(threadId) || !Array.isArray(messages)) {
    return response.status(400).json({ error: 'A valid thread and message history are required.' })
  }

  try {
    const cleanMessages = messages.filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    if (threadId === 're') {
      const ollamaResponse = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3.2', messages: cleanMessages, stream: false }),
      })
      if (!ollamaResponse.ok) throw new Error(`Ollama returned ${ollamaResponse.status}. Is Ollama running?`)
      const data = await ollamaResponse.json()
      return response.json({ message: data.message?.content || 'RE returned an empty response.' })
    }

    if (!openai) throw new Error('OPENAI_API_KEY is not configured in .env.')
    const completion = await openai.chat.completions.create({
      model: threadId === 'codex' ? (process.env.OPENAI_CODEX_MODEL || 'gpt-5.3-codex') : (process.env.OPENAI_CHAT_MODEL || 'gpt-4.1'),
      messages: [{ role: 'system', content: prompts[threadId] }, ...cleanMessages],
    })
    return response.json({ message: completion.choices[0]?.message?.content || 'The model returned an empty response.' })
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : 'Provider request failed.' })
  }
})

app.listen(port, host, () => console.log(`Jarvis API listening on ${host}:${port}`))
