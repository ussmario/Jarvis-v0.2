import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const workspaceRoot = path.resolve(process.env.JARVIS_WORKSPACE_ROOT || path.resolve(process.cwd(), '..'))
const stateRoot = path.resolve(process.env.JARVIS_DISPLAY_STATE_ROOT || path.join(process.cwd(), '.jarvis'))
const auditPath = path.join(stateRoot, 'audit.jsonl')
const maxOutput = 20000

export const codexTools = [
  {
    type: 'function',
    name: 'list_directory',
    description: 'List files and directories at a workspace-relative path. Read-only.',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Relative path inside the workspace root.' } }, required: ['path'], additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'read_file',
    description: 'Read a UTF-8 text file at a workspace-relative path. Read-only.',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Relative file path inside the workspace root.' } }, required: ['path'], additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'search_workspace',
    description: 'Search filenames and text in the workspace. Read-only.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Text or filename fragment to search for.' } }, required: ['query'], additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'git_status',
    description: 'Inspect git status and recent commits in the workspace. Read-only.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'write_file',
    description: 'Write UTF-8 text to a workspace-relative file. Requires user approval.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false },
    strict: true,
  },
  {
    type: 'function',
    name: 'run_command',
    description: 'Run a shell command from the workspace root. Requires user approval. Commands are not restricted by an allowlist.',
    parameters: { type: 'object', properties: { command: { type: 'string' }, timeoutMs: { type: 'number' } }, required: ['command', 'timeoutMs'], additionalProperties: false },
    strict: true,
  },
]

const approvalTools = new Set(['write_file', 'run_command'])

function workspacePath(relativePath) {
  const target = path.resolve(workspaceRoot, relativePath || '.')
  if (target !== workspaceRoot && !target.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error('Path must remain inside the NewVisualStudioProjects workspace root.')
  return target
}

export async function recordAudit(entry) {
  await mkdir(stateRoot, { recursive: true })
  await appendFile(auditPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8')
}

async function listDirectory(relativePath) {
  const entries = await readdir(workspacePath(relativePath), { withFileTypes: true })
  return entries.map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' }))
}

async function readWorkspaceFile(relativePath) {
  const content = await readFile(workspacePath(relativePath), 'utf8')
  return { path: relativePath, content: content.slice(0, maxOutput), truncated: content.length > maxOutput }
}

async function searchWorkspace(query) {
  const results = []
  async function visit(directory, depth = 0) {
    if (depth > 8 || results.length >= 200) return
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['node_modules', '.git', 'Ivy', '.jarvis', 'dist'].includes(entry.name)) continue
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(target, depth + 1)
      } else if (entry.name.toLowerCase().includes(query.toLowerCase())) {
        results.push(path.relative(workspaceRoot, target))
      } else {
        try {
          const content = await readFile(target, 'utf8')
          if (content.toLowerCase().includes(query.toLowerCase())) results.push(path.relative(workspaceRoot, target))
        } catch {
          // Ignore binary and unreadable files during a read-only search.
        }
      }
      if (results.length >= 200) return
    }
  }
  await visit(workspaceRoot)
  return { query, results }
}

function runCommand(command, timeoutMs = 120000) {
  const timeout = Math.min(Math.max(Number(timeoutMs) || 120000, 1000), 120000)
  return new Promise((resolve, reject) => {
    const sandboxArgs = [
      '--die-with-parent',
      '--ro-bind', '/usr', '/usr',
      '--ro-bind', '/bin', '/bin',
      '--ro-bind', '/lib', '/lib',
      '--ro-bind', '/lib64', '/lib64',
      '--ro-bind', '/etc', '/etc',
      '--proc', '/proc',
      '--dev', '/dev',
      '--tmpfs', '/tmp',
      '--bind', workspaceRoot, workspaceRoot,
      '--chdir', workspaceRoot,
      '/bin/bash', '-lc', command,
    ]
    const home = process.env.HOME
    if (home && existsSync(path.join(home, '.nvm'))) sandboxArgs.splice(16, 0, '--ro-bind', path.join(home, '.nvm'), path.join(home, '.nvm'))
    const child = spawn(process.env.JARVIS_BWRAP_PATH || 'bwrap', sandboxArgs)
    let output = ''
    const collect = (chunk) => { output = `${output}${chunk}`.slice(-maxOutput) }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`Command timed out after ${timeout}ms.`)) }, timeout)
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ command, exitCode: code, signal, output }) })
  })
}

export function requiresApproval(name) {
  return approvalTools.has(name)
}

export async function executeTool(name, args) {
  let result
  if (name === 'list_directory') result = await listDirectory(args.path)
  else if (name === 'read_file') result = await readWorkspaceFile(args.path)
  else if (name === 'search_workspace') result = await searchWorkspace(args.query)
  else if (name === 'git_status') result = await runCommand('git status --short --branch && git log --oneline --decorate -5')
  else if (name === 'write_file') {
    const target = workspacePath(args.path)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, args.content, 'utf8')
    result = { path: args.path, written: true }
  } else if (name === 'run_command') result = await runCommand(args.command, args.timeoutMs)
  else throw new Error(`Unknown Sam tool: ${name}`)
  await recordAudit({ event: 'tool_completed', tool: name, arguments: args, result: typeof result === 'string' ? result.slice(0, 1000) : result })
  return result
}

export function agentWorkspaceRoot() {
  return workspaceRoot
}
