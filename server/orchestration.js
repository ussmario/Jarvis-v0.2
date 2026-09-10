import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const stateRoot = path.resolve(process.env.JARVIS_DISPLAY_STATE_ROOT || path.join(process.cwd(), '.jarvis'))
const jobsPath = path.join(stateRoot, 'orchestration-jobs.json')
let writeLock = Promise.resolve()
const coordinatorAdapters = new Map()

export function registerCoordinatorAdapter(adapter) {
  if (!adapter?.id || !adapter?.label || typeof adapter.dispatch !== 'function') throw new Error('A coordinator adapter requires id, label, and dispatch.')
  coordinatorAdapters.set(adapter.id, adapter)
}

export function listCoordinatorAdapters() {
  return [...coordinatorAdapters.values()].map(({ dispatch, ...descriptor }) => descriptor)
}

export function getCoordinatorAdapter(adapterId) {
  return coordinatorAdapters.get(adapterId) || null
}

async function readJobs() {
  try {
    return JSON.parse(await readFile(jobsPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

async function writeJobs(jobs) {
  await mkdir(stateRoot, { recursive: true })
  const temporaryPath = `${jobsPath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, jobsPath)
}

async function withWriteLock(operation) {
  const next = writeLock.then(operation)
  writeLock = next.catch(() => {})
  return next
}

export async function getOrchestrationJob(jobId) {
  const jobs = await readJobs()
  return jobs[jobId] || null
}

export async function listOrchestrationJobs() {
  return Object.values(await readJobs())
}

export async function findOrchestrationJobByCheckpoint(checkpointId) {
  const jobs = await readJobs()
  return Object.values(jobs).find((job) => job.checkpointId === checkpointId) || null
}

export async function createOrchestrationJob(job) {
  return withWriteLock(async () => {
    const jobs = await readJobs()
    const existing = Object.values(jobs).find((item) => item.checkpointId === job.checkpointId)
    if (existing) return { job: existing, duplicate: true }
    jobs[job.jobId] = job
    await writeJobs(jobs)
    return { job, duplicate: false }
  })
}

export async function updateOrchestrationJob(jobId, patch) {
  return withWriteLock(async () => {
    const jobs = await readJobs()
    if (!jobs[jobId]) throw new Error('Orchestration job not found.')
    jobs[jobId] = { ...jobs[jobId], ...patch, updatedAt: new Date().toISOString() }
    await writeJobs(jobs)
    return jobs[jobId]
  })
}
