const MCP_PROTOCOL_VERSION = '2025-06-18'

function result(id, value) {
  return { jsonrpc: '2.0', id, result: value }
}

function error(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } }
}

const dispatchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['checkpointId', 'threadId', 'attempt', 'originalMessage', 'compiledMessage', 'targetAgent', 'selectedContext', 'constraints'],
  properties: {
    checkpointId: { type: 'string' },
    threadId: { type: 'string' },
    attempt: { type: 'integer' },
    originalMessage: { type: 'string' },
    compiledMessage: { type: 'string' },
    targetAgent: { type: 'string' },
    selectedContext: { type: 'array', items: { type: 'object' } },
    constraints: { type: 'array', items: { type: 'string' } },
  },
}

export function createMcpHandler({ listAdapters, dispatchVerified }) {
  return async function handleMcp(request, response) {
    const message = request.body
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return response.status(400).json(error(message?.id ?? null, -32600, 'Invalid JSON-RPC request.'))
    }

    const { id, method, params = {} } = message
    if (method === 'notifications/initialized') return response.status(202).end()
    if (method === 'initialize') {
      return response.json(result(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'jarvis-coordinator', version: '0.2.0' },
      }))
    }
    if (method === 'ping') return response.json(result(id, {}))
    if (method === 'tools/list') {
      return response.json(result(id, {
        tools: [{
          name: 'jarvis_dispatch_verified',
          description: 'Dispatch a human-approved compiled packet through an isolated RE-* coordinator adapter.',
          inputSchema: dispatchSchema,
        }],
      }))
    }
    if (method === 'resources/list') {
      const adapters = await listAdapters()
      return response.json(result(id, {
        resources: adapters.map((adapter) => ({
          uri: `jarvis://coordinator/adapters/${encodeURIComponent(adapter.id)}`,
          name: adapter.label,
          description: adapter.description,
          mimeType: 'application/json',
        })),
      }))
    }
    if (method === 'resources/read') {
      const prefix = 'jarvis://coordinator/adapters/'
      if (typeof params.uri !== 'string' || !params.uri.startsWith(prefix)) return response.json(error(id, -32002, 'Resource not found.'))
      const adapterId = decodeURIComponent(params.uri.slice(prefix.length))
      const adapter = (await listAdapters()).find((item) => item.id === adapterId)
      if (!adapter) return response.json(error(id, -32002, 'Resource not found.', { uri: params.uri }))
      return response.json(result(id, { contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify(adapter) }] }))
    }
    if (method === 'tools/call') {
      if (params.name !== 'jarvis_dispatch_verified') return response.json(error(id, -32601, 'Unknown tool.'))
      try {
        const dispatchResult = await dispatchVerified(params.arguments || {})
        return response.json(result(id, { content: [{ type: 'text', text: JSON.stringify(dispatchResult) }], structuredContent: dispatchResult }))
      } catch (cause) {
        return response.json(error(id, -32000, cause instanceof Error ? cause.message : String(cause)))
      }
    }
    return response.json(error(id, -32601, `Method not found: ${method}`))
  }
}
