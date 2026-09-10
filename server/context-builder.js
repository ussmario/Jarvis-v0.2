import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { archiveLocation } from './archive.js'
import { agentWorkspaceRoot } from './agent-tools.js'

const contextSources = new Map()

export function registerContextSource(source) {
  if (!source?.id || typeof source.search !== 'function') throw new Error('A context source requires an id and search function.')
  contextSources.set(source.id, source)
}

function localDate(value) {
  if (!value) return null
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: process.env.TZ || 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function relativeDate(reference) {
  const today = new Date()
  if (/\byesterday\b/i.test(reference)) {
    today.setDate(today.getDate() - 1)
    return localDate(today)
  }
  if (/\btoday\b/i.test(reference)) return localDate(today)
  return null
}

function explicitPaths(text) {
  return [...String(text).matchAll(/(?:^|[\s`"'(])((?:\.\/|[\w.-]+\/)*[\w.-]+\.[A-Za-z0-9]{1,12})(?=$|[\s`"'),.!?;:])/g)]
    .map((match) => match[1])
}

function requirementsFor({ originalMessage, compiledMessage }) {
  const text = `${originalMessage}\n${compiledMessage}`
  const queryTerms = [...new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g) || [])]
    .filter((term) => !['please', 'with', 'that', 'this', 'from', 'into', 'file', 'contents', 'created', 'yesterday', 'replace', 'referenced'].includes(term))
  const requirements = []
  const entityHints = []
  const paths = explicitPaths(originalMessage)
  if (/\btest\s+file\b/i.test(text)) entityHints.push('test')
  if (/\b(file|path|document|folder|directory)\b/i.test(text)) requirements.push('Identify the exact referenced filesystem object.')
  const date = relativeDate(text)
  if (date) requirements.push(`Find evidence associated with the relative date (${date}).`)
  if (/\b(contents?|content|replace|overwrite|append|remove|delete|create|write)\b/i.test(text)) requirements.push('Confirm the requested operation and content.')
  return { requirements, date, queryTerms, entityHints, explicitPaths: paths }
}

function candidateFromMessage(message, source) {
  const receipt = message.receipt || {}
  const args = receipt.arguments || {}
  const result = receipt.result || {}
  const filePath = args.path || result.path || message.path || [...String(message.content || '').matchAll(/(?:^|[\s`])([.\w/-]+\.[A-Za-z0-9]{1,12})(?=$|[\s`])/g)][0]?.[1]
  if (!filePath) return null
  const at = receipt.at || message.at || null
  return {
    source,
    path: filePath,
    at,
    verified: Boolean(receipt.at && (receipt.result || receipt.status === 'completed')),
    evidence: String(message.content || '').slice(0, 500),
    receiptText: JSON.stringify({ tool: receipt.tool, arguments: args, result }),
  }
}

function hasConversationalReference(text) {
  return /\b(?:the same file|that file|the file|which one|what file|just (?:updated|changed|created|wrote|overwrote)|look at (?:the )?(?:thread|history)|previous(?:ly)?|earlier)\b/i.test(text)
}

function referenceTerms(text) {
  return [...String(text).matchAll(/["'`]([^"'`]{2,120})["'`]/g)].map((match) => match[1].toLowerCase())
}

function rankReferencedCandidates(candidates, text) {
  if (!hasConversationalReference(text) || candidates.length < 2) return candidates

  const terms = referenceTerms(text)
  const uniqueCandidates = [...new Map(candidates.map((candidate) => {
    const current = candidates.find((item) => item.path === candidate.path && new Date(item.at || 0) > new Date(candidate.at || 0))
    return [candidate.path, current || candidate]
  })).values()]
  if (uniqueCandidates.length < 2) return uniqueCandidates
  const ranked = uniqueCandidates.map((candidate) => {
    const searchable = `${candidate.evidence} ${candidate.receiptText}`.toLowerCase()
    const contentMatch = terms.reduce((score, term) => score + (searchable.includes(term) ? 4 : 0), 0)
    const timestamp = candidate.at ? new Date(candidate.at).getTime() : 0
    return { candidate, score: contentMatch, timestamp }
  }).sort((left, right) => right.score - left.score || right.timestamp - left.timestamp)

  const [best, second] = ranked
  const separatedByEvidence = best.score > second.score
  const separatedByRecency = best.timestamp > second.timestamp && (best.timestamp - second.timestamp) >= 60 * 1000
  if (separatedByEvidence || separatedByRecency) return [best.candidate]
  return candidates
}

async function archiveSearch({ date, queryTerms = [], entityHints = [], explicitPaths: paths = [] }) {
  const candidates = []
  const requestedPaths = new Set(paths.map((requestedPath) => path.normalize(requestedPath)))
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(target)
      else if (entry.name.endsWith('.json')) {
        try {
          const messages = JSON.parse(await readFile(target, 'utf8'))
          if (!Array.isArray(messages)) continue
          for (const message of messages) {
            const candidate = candidateFromMessage(message, path.relative(process.cwd(), target))
            if (candidate?.verified && (!date || localDate(candidate.at) === date)) {
              if (requestedPaths.size && !requestedPaths.has(path.normalize(candidate.path))) continue
              const haystack = `${candidate.path} ${candidate.evidence}`.toLowerCase()
              const relevantEntity = !entityHints.length || entityHints.some((hint) => candidate.path.toLowerCase().includes(hint) || candidate.evidence.toLowerCase().includes(`${hint} file`))
              if (relevantEntity && (!queryTerms.length || queryTerms.some((term) => haystack.includes(term)))) candidates.push(candidate)
            }
          }
        } catch {
          // Ignore malformed or unrelated archive files during context discovery.
        }
      }
    }
  }
  await visit(archiveLocation())
  return candidates
}

async function workspaceSearch({ candidatePaths = [] }) {
  const candidates = []
  const root = agentWorkspaceRoot()
  for (const candidatePath of candidatePaths) {
    const target = path.resolve(root, candidatePath)
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) continue
    try {
      const details = await stat(target)
      if (details.isFile()) candidates.push({ source: 'workspace', path: path.relative(root, target), at: details.mtime.toISOString() })
    } catch {
      // A historical file may no longer exist in the workspace.
    }
  }
  return candidates
}

registerContextSource({ id: 'archive', search: archiveSearch })
registerContextSource({ id: 'workspace', search: workspaceSearch })

export async function buildContext({ originalMessage, compiledMessage, constraints = [] }) {
  const requirements = requirementsFor({ originalMessage, compiledMessage })
  if (!requirements.requirements.length) {
    return {
      proposedContext: [],
      selectedContext: [],
      constraints,
      unresolvedQuestions: [],
    }
  }

  const archiveCandidates = await contextSources.get('archive').search(requirements)
  const referencedCandidates = rankReferencedCandidates(archiveCandidates, `${originalMessage}\n${compiledMessage}`)
  const workspaceCandidates = await contextSources.get('workspace').search({ candidatePaths: referencedCandidates.map((candidate) => candidate.path) })
  const candidates = [...referencedCandidates, ...workspaceCandidates]
  const pathCandidates = [...new Map(candidates.filter((candidate) => candidate.path).map((candidate) => [candidate.path, candidate])).values()]
  const selectedContext = pathCandidates.length === 1 ? pathCandidates : pathCandidates.slice(0, 20)
  const unresolvedQuestions = pathCandidates.length === 1 ? [] : ['Which exact file or path should this request target?']
  return {
    proposedContext: requirements.requirements,
    selectedContext,
    constraints: unresolvedQuestions.length ? [...constraints, 'Do not modify a file until the exact target is identified.'] : constraints,
    unresolvedQuestions,
  }
}
