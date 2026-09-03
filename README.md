# Jarvis v0.2

Jarvis is a local-first AI operating system interface. v0.2 provides three intentionally isolated conversations:

- **ChatGPT**: OpenAI general-purpose API session
- **RE** (pronounced Ari): local Ollama session and future coordinator
- **Codex**: OpenAI coding-focused API session

ChatGPT uses the OpenAI Chat Completions API, Codex uses the OpenAI Responses API, and RE uses Ollama's local chat API. Each provider receives only its own thread history.

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

The backend owns three separate histories and sends only the selected history to its provider. The backend applies a provider-specific model and prompt per thread. Bob and Sam remain isolated from each other and from RE; RE is the deliberate exception and receives Bob's and Sam's archived histories as read-only, labeled coordinator reference context for each RE request.

## Sam workspace tools

Sam uses the OpenAI Responses API with Jarvis-hosted tools. The workspace root defaults to the parent `NewVisualStudioProjects` directory and can be set with `JARVIS_WORKSPACE_ROOT`. Read-only inspection tools can run immediately. File writes and shell commands create an approval request in the UI; Jarvis executes them only after approval. The gateway enforces the workspace boundary, a 120-second command timeout, a 20,000-character output cap, and writes JSONL audit records to `.jarvis/audit.jsonl`. It does not use Ivy and does not apply a command allowlist.

## Browser Voice

Voice is currently browser-only. Each chat has a compact push-to-talk microphone control using browser speech recognition; the transcript is placed into that chat's composer for review before sending. Result-indexed transcript segments replace revised interim results instead of appending them, preventing repeated phrases such as `hi hi how hi how are` on mobile browsers.

The shared speech gear in the header opens one small modal for all three agents. Select Bob, RE, or Sam to enable or disable browser text-to-speech for that agent and test the assigned static voice. Bob and Sam use distinct male voice preferences; RE prioritizes a browser voice containing `Local (Tpf)` when available, then Windows `Zira`, followed by other female voice matches. These preferences and all three unsent drafts persist in browser local storage.

This version makes no OpenAI transcription or audio-upload requests. A future local Whisper adapter can replace browser speech recognition without changing the chat flow. Voice availability varies by device and browser.

Clicking an assistant's name tag replays that specific assistant message through its assigned browser voice. Recognition sessions use a generation guard so results already queued by the browser after Stop or Send cannot repopulate a submitted draft.

On narrow screens, Jarvis displays one selected chat at a time through the `Chat` dropdown beside the speech gear. Mobile browser recognition uses one non-interim result per bounded session and does not auto-restart after the browser ends listening; this avoids the repeated-word behavior that can occur when phones repeatedly terminate and reconnect continuous recognition. Desktop retains continuous recognition with the same result reconciliation.
