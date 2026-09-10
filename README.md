# Jarvis v0.2

Jarvis is a local-first AI operating system interface. v0.2 provides three intentionally isolated conversations:

- **ChatGPT**: OpenAI general-purpose API session
- **RE** (pronounced Ari): the user-facing local coordinator, backed by Ollama
- **Codex**: OpenAI coding-focused API session

ChatGPT uses the OpenAI Chat Completions API, Codex uses the OpenAI Responses API, and RE uses Ollama's local chat API. Each provider receives only its own thread history.

## Architecture Glossary

See [docs/ARCHITECTURE_GLOSSARY.md](docs/ARCHITECTURE_GLOSSARY.md) for the canonical RE/Jarvis modularity model.

## AI Compiler Records

See [docs/AI_COMPILER_RECORDS.md](docs/AI_COMPILER_RECORDS.md) for the archive shape that stores each original message alongside its compiled transport form.

## Verification Workflow

RE uses a human-controlled verification tab before an RE request is committed. The server-backed verification packet shows the original message, the compiled message (what RE thinks you meant), constraints, target agent, proposed context to gather, and the canonical pre-AAAK context packet. The active checkpoint is shared across browser sessions, including Tailscale/mobile sessions. If Ollama is unavailable, RE fails closed and does not stage a misleading checkpoint.

The verification gate exposes three actions: `approve`, `retry`, and `discard`. Each compiler packet includes a disposition: `clarify`, `respond`, or `dispatch`. Approval routes to Sam only when the disposition is `dispatch` and the target is explicitly Sam / Codex. `clarify` and `respond` remain RE-only and cannot claim delegation. `approve` commits the staged packet; `retry` resubmits the preserved original message to the compiler as the next interpretation attempt without reloading the page; `discard` clears the staged packet so you can reword the message from scratch.

The backend watcher restarts server-side code when files change, and the managed service must be restarted after switching branches or changing the runtime configuration. Browser bootstrap retries incomplete or temporarily unavailable API responses while the watcher brings the server back up, rather than requiring a second manual reload. Browser refresh focuses the verification tab only when a pending checkpoint exists; otherwise it returns to Conversation. The server-backed checkpoint preserves pending attempts across devices.

Ollama is managed on demand. `POST /api/ollama/wake` preloads the configured model, normal requests wake it automatically, and `POST /api/ollama/sleep` unloads it. Successful activity resets the inactivity timer; the default is 15 minutes and can be changed with `OLLAMA_INACTIVITY_SLEEP_MS`. The timer unloads the model with Ollama's `keep_alive: 0` behavior, so the model is not left resident indefinitely.

You can control this from the RE chat without invoking verification: send exactly `/wake` to preload Qwen or `/sleep` to unload it. The leading slash is the system-control signal; ordinary text such as `wake` remains a normal RE request. RE records each lifecycle command and its status response in the RE conversation.

## Setup

1. Install Node.js 18+ and Ollama.
2. Copy `.env.example` to `.env`.
3. Add your `OPENAI_API_KEY` and choose installed model names for OpenAI and Ollama.
4. Install packages and start Jarvis:

```bash
npm install
npm run dev
```

The normal `npm run dev` command is local-only. The Vite interface runs on port `43117`; the server-side provider proxy runs on `43118`.

For the WSL/Tailscale runtime used by the previous Jarvis versions, run:

```bash
npm run dev:tailscale
```

This keeps Jarvis in WSL, enables the remote runtime mode, and uses the existing `43117/43118` service ports.
In Tailscale mode, Vite binds to IPv4 loopback so the existing Windows Tailscale Serve route to `127.0.0.1:43117` can reach the WSL service without port forwarding.

## Tailscale

With Tailscale Serve configured, open `https://<your-tailnet-hostname>/` from another device on the same tailnet. The existing Serve routes should point `/` to `127.0.0.1:43117` and `/api` to `127.0.0.1:43118/api`. Do not expose either port to the public internet. Tailscale access controls are the only access control included in this boilerplate.

To install the WSL user service used for persistent remote access:

```bash
npm run service:install
npm run service:status
```

The service runs `dev:tailscale`, restarts after failures, and does not modify Tailscale Serve configuration. It can be managed with `npm run service:start`, `npm run service:stop`, `npm run service:restart`, and `npm run service:logs`.

### Clean Start And Stop

Closing VS Code is safe; the managed WSL service runs independently. Use these commands from the Jarvis project directory in WSL:

Start Jarvis:

```bash
npm run service:start
npm run service:status
npm run verify:runtime
```

Stop Jarvis cleanly:

```bash
npm run service:stop
npm run service:status
```

The expected stopped state is `inactive (dead)`. Tailscale Serve remains configured, but the URL will be unavailable until Jarvis starts again. Do not use `kill -9` on the service processes and do not start a second `npm run dev` while the managed service is active.

For a full WSL shutdown after stopping Jarvis, run this from Windows PowerShell:

```powershell
wsl --shutdown
```

To bring it back after a full WSL shutdown, open WSL, return to this project directory, and run the start sequence above. If the Windows startup task is installed, it starts the WSL service automatically when you sign in; `npm run service:status` remains the authoritative check.

### Codex Remote Control

Codex remote control is an independent WSL user service. It does not depend on Jarvis and can be started, stopped, restarted, or inspected separately:

```bash
npm run codex:service:install
npm run codex:service:status
```

The installer enables `codex-remote-control.service` under the WSL user systemd target, using the real WSL Codex binary and `CODEX_HOME` (normally `/home/mario/.codex`). It starts automatically when the WSL user systemd session starts, including after `wsl --shutdown`; Jarvis does not need to be running first. Codex starts a detached app-server daemon, so a healthy systemd status may report `active (exited)` for the launcher while the remote-control daemon continues running.

Manage it independently with:

```bash
npm run codex:service:start
npm run codex:service:stop
npm run codex:service:restart
npm run codex:service:logs
```

Pairing is preserved in `CODEX_HOME`. Only generate a new pairing code if the mobile client loses its pairing:

```bash
CODEX_HOME=/home/mario/.codex codex remote-control pair
```

The former standalone `misc projects/remoteConnect.md` note was removed after its contents were consolidated here.

Restart Jarvis after code or `.env` changes:

```bash
npm run service:restart
npm run verify:runtime
```

After you approve and merge a feature branch, publish the updated trunk so the remote does not fall behind:

```bash
git status --short --branch
git push origin master
git status --short --branch
```

The final status should show `master...origin/master` with no ahead/behind count and no working-tree changes. Do not push an unreviewed feature branch as `master`.

The installer records the active WSL Node/npm installation in the user service PATH. This matters when systemd's default `/usr/bin/node` is older than the Node version used by the interactive shell.

For a production deployment, serve the built frontend through the backend or a reverse proxy and put both services behind a Tailscale Serve configuration.

## Ivy Archive

Successful conversations are stored on the WSL host under `Ivy/Bob/conversation.json`, `Ivy/RE/conversation.json`, and `Ivy/Sam/conversation.json`. The archive is server-owned, append-only, survives browser refreshes and service restarts, is shared by Tailscale clients, and is ignored by Git because it contains conversation data.

The displayed-history cursor is stored separately under `.jarvis/display-cursors.json`. Clearing a chat advances only that cursor; it never edits or deletes Ivy. Refreshing loads only messages after the cursor, while providers continue to receive the complete archived history.

## Session isolation and coordination

The backend owns three separate histories and sends only the selected history to its provider. The backend applies a provider-specific model and prompt per thread. Bob and Sam remain isolated from each other and from RE; RE is the deliberate exception and receives Bob's and Sam's archived histories as read-only, labeled coordinator reference context for each RE request. RE remains the user-facing coordinator, while the back end provides the history, policy, and tool plumbing it needs to coordinate.

## Coordinator adapters and MCP

Coordinator dispatch uses registered adapter IDs rather than direct agent sessions. `re-sam` is the active isolated coding adapter; `re-bob` is registered as a reserved boundary for future implementation. Direct Sam and direct Bob are never valid coordinator destinations.

Jarvis exposes an MCP-compatible JSON-RPC endpoint at `POST /mcp`. It supports lifecycle negotiation, `tools/list`, `tools/call`, `resources/list`, and `resources/read`. The dispatch tool accepts only a human-approved packet and sends only its `compiledMessage`, explicitly selected context, and constraints to the selected RE-* adapter. The original request, intent interpretation, approvals, and receipts remain Jarvis-owned audit data. This follows MCP's host/client/server model and JSON-RPC 2.0 message requirements; transport and authentication remain deployment responsibilities.

The provider-facing pre-AAAK packet is:

```json
{
  "compiledMessage": "what RE thinks the user meant",
  "selectedContext": [],
  "constraints": []
}
```

`proposedContext` is planning metadata for the resolver and is never sent as selected context. Ambiguous file or path references must become clarification requests instead of being guessed.

Context resolution runs after paraphrasing. Registered context sources search for evidence without changing the paraphrase. An explicit path in the original message takes precedence and constrains discovery to that path; the workspace is checked directly even when the path has no archive record or does not exist yet. Unrelated archive candidates cannot turn an explicit target into path ambiguity. The current sources are archive receipts/messages and workspace metadata for archive-identified candidate paths. Conversational references such as “the same file” are resolved by ranking receipt-backed candidates using matching operation/content and recency; genuinely tied references remain clarification requests. Relative dates are evaluated in the configured local timezone. Source adapters can be added later for MemPalace, MCP resources, databases, or other knowledge systems.

## Sam workspace tools

Sam uses the OpenAI Responses API with Jarvis-hosted tools. Direct Sam uses the `Sam` archive/session; RE orchestration uses a separate `RE-Sam` archive/session and cannot write to the direct Sam transcript. RE-Sam approval cards are surfaced through RE, while direct Sam approvals remain in direct Sam. The workspace root defaults to the parent `NewVisualStudioProjects` directory and can be set with `JARVIS_WORKSPACE_ROOT`. Read-only inspection tools can run immediately. File writes and shell commands create an approval request in the UI; Jarvis executes them only after approval. The gateway enforces the workspace boundary, a 120-second command timeout, a 20,000-character output cap, and writes JSONL audit records to `.jarvis/audit.jsonl`. It does not use Ivy and does not apply a command allowlist.

RE-Sam approval requests are also recorded in the RE timeline with their tool arguments and lifecycle status (`pending`, `approved`, `denied`, `failed`, or `completed`). The UI renders them as collapsible historical cards, while the active request remains actionable. Conservative `pwd`/`ls` inspection chains joined with `&&` are treated as harmless read-only workspace inspection and do not create approval cards; other shell commands remain approval-bound.

Ollama wake uses a minimal real generation with the configured model before a compiler request proceeds. Compilation timing records distinguish model wake time from chat time in `.jarvis/audit.jsonl` without forwarding that diagnostic metadata to agents.

Failed orchestration jobs are rendered in RE as failure messages with their tool receipt, then the stale verification checkpoint is cleared so the request can be corrected and resubmitted without implying completion.

Archive writes are serialized per thread and use unique temporary files with bounded retries for transient `EACCES`, `EBUSY`, or `EPERM` rename locks from synchronized folders such as OneDrive.

## Browser Voice

Voice is currently browser-only. Each chat has a compact push-to-talk microphone control using browser speech recognition; the transcript is placed into that chat's composer for review before sending. Result-indexed transcript segments replace revised interim results instead of appending them, preventing repeated phrases such as `hi hi how hi how are` on mobile browsers.

The shared speech gear in the header opens one small modal for all three agents. Select Bob, RE, or Sam to enable or disable browser text-to-speech for that agent and test the assigned static voice. Bob and Sam use distinct male voice preferences; RE prioritizes a browser voice containing `Local (Tpf)` when available, then Windows `Zira`, followed by other female voice matches. These preferences and all three unsent drafts persist in browser local storage.

This version makes no OpenAI transcription or audio-upload requests. A future local Whisper adapter can replace browser speech recognition without changing the chat flow. Voice availability varies by device and browser.

Clicking an assistant's name tag replays that specific assistant message through its assigned browser voice. Recognition sessions use a generation guard so results already queued by the browser after Stop or Send cannot repopulate a submitted draft.

On narrow screens, Jarvis displays one selected chat at a time through the `Chat` dropdown beside the speech gear. Mobile browser recognition uses one non-interim result per bounded session and does not auto-restart after the browser ends listening; this avoids the repeated-word behavior that can occur when phones repeatedly terminate and reconnect continuous recognition. Desktop retains continuous recognition with the same result reconciliation.
