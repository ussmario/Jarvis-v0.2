# Contributing To Jarvis

Jarvis uses `master` as its primary branch.

## Standard Flow

1. Start a new aspect from an up-to-date `master` branch.
2. Create a focused branch such as `feat/chat-persistence` or `fix/tailscale-runtime`.
3. Make one coherent update at a time.
4. Verify each update and commit it with a purpose-specific message.
5. Verify the complete aspect branch.
6. Notify the maintainer that the branch is ready for review.
7. Merge it into `master` only after explicit maintainer approval.
8. Recheck `master`, then remove the merged branch.

Commits are checkpoints. Verification makes a branch reviewable; only explicit maintainer approval authorizes a merge into `master`.

## Local Checks

Run the relevant checks before committing. For the current web interface, the baseline check is:

```bash
npm run build
git diff --check
```

For remote runtime work, also verify the service and both local endpoints:

```bash
npm run service:status
npm run verify:runtime
```

Do not run `npm run dev:tailscale` while the `jarvis-v02.service` is active; both use the same ports.

## Runtime Updates

The development and Tailscale commands run the backend with a polling watcher because filesystem events are unreliable for this WSL/OneDrive workspace. Backend source changes reload automatically, and Vite handles frontend hot updates. A service restart is still required after changing `.env`, dependencies, the systemd template, or switching branches. The maintainer performs that restart and runs `npm run verify:runtime` as part of branch verification; contributors do not need to remember it manually.
