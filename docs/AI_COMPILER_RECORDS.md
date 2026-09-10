# AI Compiler Records

Status: canonical archive shape for compiler transparency

The AI Compiler should keep a durable derived record next to each original user message so Jarvis can reconstruct how a request was interpreted, routed, and prepared for a model call.

## Purpose

- preserve the original user message unchanged;
- store the compiled transport form that was actually sent;
- keep the staged verification packet when RE is waiting for human approval, so retry and audit can reconstruct the exact pre-commit state;
- keep the selected context packet that accompanied it;
- retain enough metadata for deterministic diagnostics and replay;
- avoid turning the compiled record into a second source of truth.

## Recommended Record Shape

```json
{
  "eventId": "uuid",
  "createdAt": "2026-09-05T00:00:00.000Z",
  "threadId": "re",
  "originalMessage": {
    "messageId": "uuid",
    "role": "user",
    "content": "original user text"
  },
  "compiler": {
    "version": "0.1",
    "resolver": "deterministic-router-v1",
    "policy": "balanced"
  },
  "resolvedIntent": {
    "disposition": "dispatch",
    "targetAgent": "RE-Sam",
    "proposedContext": "Search prior discussion for the exact file.",
    "constraints": []
  },
  "contextPacket": {
    "compiledMessage": "compiled transport form sent to the provider",
    "selectedContext": [],
    "constraints": []
  },
  "compiledPackage": {
    "algorithm": "AAAK",
    "status": "pending",
    "content": null,
    "tokenEstimate": null
  },
  "route": {
    "recipient": "sam",
    "provider": "openai",
    "model": "gpt-5.3-codex"
  },
  "validation": {
    "status": "pass",
    "notes": []
  },
  "hashes": {
    "original": "sha256:...",
    "compiled": "sha256:..."
  }
}
```

## Rules

- The original message is authoritative.
- The compiled message is a derived artifact.
- `proposedContext` describes what the resolver should look for; `selectedContext` contains only what it actually selected.
- `contextPacket` is the canonical pre-AAAK provider packet. `compiledPackage` is its later compressed representation.
- An ambiguous target must remain unresolved and request clarification rather than inventing a file or path.
- Any later diagnostics should be able to compare the original, the compiled form, and the route result.
- If the compiler logic changes, the schema version should change too.
- A compiler record should never silently overwrite the original message.

## Practical Use

This record makes it possible to answer questions like:

- What did the user actually say?
- What did the compiler think they meant?
- What context was kept or discarded?
- Which agent or provider received it?
- Was the compiler behavior consistent across retries?

That is the basis for replay, audit, and debugging without losing the original transcript.
