# Jarvis v0.2

Jarvis is a local-first AI operating system interface. v0.2 provides three intentionally isolated conversations:

- **ChatGPT**: OpenAI general-purpose API session
- **RE** (pronounced Ari): local Ollama session and future coordinator
- **Codex**: OpenAI coding-focused API session

## Setup

1. Install Node.js 18+ and Ollama.
2. Copy `.env.example` to `.env`.
3. Add your `OPENAI_API_KEY` and choose installed model names for OpenAI and Ollama.
4. Install packages and start Jarvis:

```bash
npm install
npm run dev
```

The Vite interface runs on port `5173`; the server-side provider proxy runs on `8787`.

## Tailscale

Both services listen on all interfaces. With Tailscale running on the host, open `http://<tailscale-ip>:5173` from another device on the same tailnet. Do not expose either port to the public internet. Tailscale access controls are the only access control included in this boilerplate.

For a production deployment, serve the built frontend through the backend or a reverse proxy and put both services behind a Tailscale Serve configuration.

## Session isolation

The browser owns three separate in-memory histories and sends only the selected history to its provider. The backend applies a provider-specific model and prompt per thread; no thread shares messages with another.
