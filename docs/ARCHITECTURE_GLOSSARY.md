# Architecture Glossary

Status: canonical terms for Jarvis v0.2

## Mental Model

Jarvis should be understood as a modular system with one user-facing assistant and several back-end services:

```txt
User
↓
RE
↓
Jarvis Core
├── Resolver
├── Router
├── Memory
├── Permissions
├── Audit
├── Tools
└── Specialized agents and providers
```

The user should experience one assistant: RE.
The system behind RE should remain modular so the behavior stays testable, auditable, and replaceable.

## Core Terms

- **RE**: The user-facing assistant and coordinator. RE is the conversational front end the user talks to directly. RE presents options, asks clarifying questions, summarizes outcomes, and carries the conversation voice.
- **Jarvis Core**: The back-end runtime that provides shared services such as memory, permissions, audit, routing support, and tool access. Jarvis Core is the system behind RE, not the conversational persona itself.
- **Resolver**: The interpretation layer that turns a user request into a structured meaning. It decides whether the request is direct, ambiguous, approval-bound, task-bound, or in need of clarification.
- **Router**: The dispatch layer that sends a resolved request to the correct destination, such as RE response logic, Bob, Sam, archive lookup, memory, or a tool workflow.
- **Module**: A specialized capability with a narrow responsibility, such as memory, voice, approvals, archive access, or task execution.
- **Agent**: A role that can reason or act on behalf of the system, such as Bob or Sam. Agents are not the same thing as the runtime.
- **Tool**: A concrete capability the system can invoke, such as reading a file, searching the workspace, or running an approved command.
- **Coordinator adapter**: An isolated integration boundary used by RE to dispatch approved execution packets. Adapter IDs are stable and expandable, such as `re-sam` and the reserved `re-bob`; they never point at direct user-facing sessions.
- **Execution packet**: The provider-facing payload containing only the compiled operational message, explicitly selected context, and constraints. Verification metadata and the original message stay in Jarvis for auditability and are not forwarded to the receiving agent.
- **Context builder**: The post-paraphrase service that determines what evidence is required, queries registered context sources, and produces `selectedContext`. It may resolve a conversational reference, such as “the same file,” by ranking receipt-backed evidence from the current thread and archive. It returns an ambiguity requiring clarification when the evidence remains tied; it does not rewrite the user paraphrase.
- **Context source adapter**: A pluggable read-only source used by the context builder, such as archive receipts, workspace metadata, MemPalace, or an MCP resource server.
- **MCP boundary**: Jarvis's standards-compatible JSON-RPC interface for interoperable tools and resources. It is an external protocol boundary, not a replacement for the internal verification state machine.
- **Compiler Record**: The durable archive entry that stores the original message together with the compiled message, selected context packet, resolved intent, chosen route, and trace metadata so the compiler decision can be reconstructed later.
- **Verification Mode**: The human review tab where the user validates RE's interpretation before the request is committed. RE cannot self-approve in this mode; the user either approves the checkpoint, retries after patching Sam, or discards the packet to reword from scratch.

## Relationship Rules

- RE is the single visible assistant.
- Jarvis Core is the shared runtime behind RE.
- The resolver and router are implementation services, not personalities.
- The user should not need to manage modules directly.
- RE may coordinate through modules, tools, and agents while still appearing as one assistant.
- Permissions, audit, and execution state belong to the runtime, not the chat persona.
- Compiler records belong to the archive as derived artifacts attached to the original message, not as replacements for the source input.
- The paraphraser must preserve unresolved references; the context builder resolves them only from evidence and must stop for clarification when evidence conflicts or is insufficient.
- Conversational-reference resolution is evidence-based and generic: valid receipts, matching operation/content, thread continuity, and recency may resolve a reference, but filenames and special-case test rules must never be hard-coded.
- Verification checkpoints are user-controlled and should remain visible until they are approved or retried.

## Practical Interpretation

If you say something to RE, the system should behave like one assistant, even though several parts may work together behind the scenes:

1. RE receives the request.
2. The resolver interprets it.
3. The router picks the correct path.
4. Jarvis Core checks policy, memory, and permissions.
5. A module, tool, or specialist agent performs the work if needed.
6. RE reports the result back to you in one voice.

## Design Goal

The goal is not a single giant AI that does everything.
The goal is a coordinated assistant front end backed by modular services that can grow without becoming tangled.
