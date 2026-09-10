import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const archiveRoot = path.resolve(process.env.JARVIS_ARCHIVE_ROOT || path.join(process.cwd(), 'Ivy'))
const displayStateRoot = path.resolve(process.env.JARVIS_DISPLAY_STATE_ROOT || path.join(process.cwd(), '.jarvis'))
const displayStatePath = path.join(displayStateRoot, 'display-cursors.json')
const archiveDirectories = { chatgpt: 'Bob', re: 'RE', codex: 'Sam', reSam: 'RE-Sam' }
const archiveFiles = { chatgpt: 'conversation.json', re: 'conversation.json', codex: 'conversation.json', reSam: 'conversation.json' }
const threadWriteLocks = new Map()
let temporaryFileCounter = 0

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${temporaryFileCounter += 1}.tmp`
  try {
    await writeFile(temporaryPath, content, 'utf8')
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temporaryPath, filePath)
        return
      } catch (error) {
        if (!['EACCES', 'EBUSY', 'EPERM'].includes(error.code) || attempt >= 4) throw error
        await wait(50 * (attempt + 1))
      }
    }
  } finally {
    try { await unlink(temporaryPath) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

export const threadIds = Object.keys(archiveDirectories)

function archivePath(threadId) {
  return path.join(archiveRoot, archiveDirectories[threadId], archiveFiles[threadId])
}

export async function ensureArchive() {
  await Promise.all(threadIds.map(async (threadId) => {
    const directory = path.dirname(archivePath(threadId))
    await mkdir(directory, { recursive: true })
    try {
      await readFile(archivePath(threadId), 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await writeFile(archivePath(threadId), '[]\n', 'utf8')
    }
  }))
  await ensureDisplayState()
}

async function ensureDisplayState() {
  await mkdir(displayStateRoot, { recursive: true })
  try {
    await readFile(displayStatePath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await writeFile(displayStatePath, '{}\n', 'utf8')
  }
}

export async function readThread(threadId) {
  const raw = await readFile(archivePath(threadId), 'utf8')
  const messages = JSON.parse(raw)
  if (!Array.isArray(messages)) throw new Error(`Archive ${archivePath(threadId)} must contain a message array.`)
  return messages.filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
}

export async function readCoordinatorThreads() {
  const [bob, sam, reSam] = await Promise.all([readThread('chatgpt'), readThread('codex'), readThread('reSam')])
  return { bob, sam, reSam }
}

async function readDisplayCursors() {
  await ensureDisplayState()
  const raw = await readFile(displayStatePath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Display state ${displayStatePath} must contain an object.`)
  return Object.fromEntries(threadIds
    .filter((threadId) => Number.isInteger(parsed[threadId]) && parsed[threadId] >= 0)
    .map((threadId) => [threadId, parsed[threadId]]))
}

async function writeDisplayCursors(cursors) {
  await atomicWrite(displayStatePath, `${JSON.stringify(cursors, null, 2)}\n`)
}

export async function readVisibleThread(threadId) {
  const [messages, cursors] = await Promise.all([readThread(threadId), readDisplayCursors()])
  return messages.slice(Math.min(cursors[threadId] || 0, messages.length))
}

export async function clearThreadDisplay(threadId) {
  const [messages, cursors] = await Promise.all([readThread(threadId), readDisplayCursors()])
  const nextCursors = { ...cursors, [threadId]: messages.length }
  await writeDisplayCursors(nextCursors)
  return { hiddenMessages: messages.length }
}

export async function writeThread(threadId, messages) {
  const filePath = archivePath(threadId)
  const previous = threadWriteLocks.get(threadId) || Promise.resolve()
  const current = previous.then(() => atomicWrite(filePath, `${JSON.stringify(messages, null, 2)}\n`))
  threadWriteLocks.set(threadId, current.catch(() => {}))
  return current
}

export function archiveLocation() {
  return archiveRoot
}

export function displayStateLocation() {
  return displayStatePath
}
