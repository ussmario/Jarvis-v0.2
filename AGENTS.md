# Repository Workflow

These rules apply to all work in this repository.

## Before Changes

- Read this file and the relevant project documentation first.
- Check the current branch and working tree.
- Preserve unrelated user changes.
- For a new aspect, create a branch from `master` using a descriptive prefix such as `feat/`, `fix/`, or `chore/`.
- Present an implementation proposal and wait for approval when the task requires a design decision.

## During Changes

- Keep each commit focused on one coherent update.
- Commit every coherent update after the relevant verification passes.
- Never commit secrets, `.env`, generated output, or runtime data.

## Verification And Merge

- Run the smallest relevant tests first, then the project build or runtime smoke check when applicable.
- Do not merge an aspect branch until its complete patch is verified functional and the user has explicitly approved the merge.
- When the branch is verified and ready, notify the user that it is ready for review and wait for explicit merge approval.
- Never treat approval to implement or approval of a proposal as approval to merge.
- After explicit approval, merge the verified branch into `master` with a descriptive merge or fast-forward commit.
- After merging, confirm `master` is clean and the resulting application still passes its checks.
- Delete the merged aspect branch unless it is intentionally being retained.

## Commit Messages

Use a concise conventional format:

```text
feat: add capability
fix: correct behavior
chore: maintain tooling
docs: update guidance
```

The subject should explain the purpose of the change, not merely list files touched.
