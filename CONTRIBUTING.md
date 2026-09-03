# Contributing To Jarvis

Jarvis uses `master` as its primary branch.

## Standard Flow

1. Start a new aspect from an up-to-date `master` branch.
2. Create a focused branch such as `feat/chat-persistence` or `fix/tailscale-runtime`.
3. Make one coherent update at a time.
4. Verify each update and commit it with a purpose-specific message.
5. Verify the complete aspect branch.
6. Merge it into `master`.
7. Recheck `master`, then remove the merged branch.

Commits are checkpoints. A merge into `master` means the complete aspect is verified and suitable for the stable branch.

## Local Checks

Run the relevant checks before committing. For the current web interface, the baseline check is:

```bash
npm run build
git diff --check
```

For remote runtime work, also verify the service and both local endpoints:

```bash
npm run service:status
curl http://127.0.0.1:43117/
curl http://127.0.0.1:43118/api/health
```

Do not run `npm run dev:tailscale` while the `jarvis-v02.service` is active; both use the same ports.
