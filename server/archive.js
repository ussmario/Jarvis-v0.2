import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const archiveRoot = path.resolve(process.env.JARVIS_ARCHIVE_ROOT || path.join(process.cwd(), 'Ivy'))
const archiveDirectories = { chatgpt: 'Bob', re: 'RE', codex: 'Sam' }
const archiveFiles = { chatgpt: 'conversation.json', re: 'conversation.json', codex: 'conversation.json' }

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
}

export async function readThread(threadId) {
  const raw = await readFile(archivePath(threadId), 'utf8')
  const messages = JSON.parse(raw)
  if (!Array.isArray(messages)) throw new Error(`Archive ${archivePath(threadId)} must contain a message array.`)
  return messages.filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
}

export async function writeThread(threadId, messages) {
  const filePath = archivePath(threadId)
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(messages, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

export function archiveLocation() {
  return archiveRoot
}
