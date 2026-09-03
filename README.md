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

The installer records the active WSL Node/npm installation in the user service PATH. This matters when systemd's default `/usr/bin/node` is older than the Node version used by the interactive shell.

For a production deployment, serve the built frontend through the backend or a reverse proxy and put both services behind a Tailscale Serve configuration.

## Session isolation

The browser owns three separate in-memory histories and sends only the selected history to its provider. The backend applies a provider-specific model and prompt per thread; no thread shares messages with another.
