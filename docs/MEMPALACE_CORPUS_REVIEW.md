# MemPalace Corpus Review

Status: awaiting user decisions

The non-destructive inventory is stored outside the Jarvis repository at:

```text
/mnt/c/users/matth/onedrive/documents/newvisualstudioprojects/jarvis_history/Archive-review-manifest.tsv
```

The manifest contains one row per archive item with its path, source kind, byte size, proposed disposition, user decision, and reason. It is a review artifact, not an instruction to delete or index anything.

## Inventory

- 2,558 Markdown files.
- 1 ZIP export.
- 1,075 `conversation.md` records proposed for review.
- 1,430 generated `revisions` records proposed for quarantine.
- 53 other Markdown files proposed for review.

## Proposed Dispositions

- `exclude`: do not index directly; preserve the source.
- `quarantine`: keep outside the first corpus; revisit if a specific historical question needs it.
- `review`: Mario decides whether the item belongs in the evaluation corpus.
- `include`: approved for the derived corpus only.

No canonical archive file is deleted or edited. The sanitized corpus will be rebuilt only after the manifest's pending decisions are reviewed.

## Review Order

Start with the 53 curated Markdown files, then review the 1,075 conversation records in project batches. Generated revisions should remain quarantined by default because they are commonly repeated snapshots and operational noise, but they remain available in the original archive.
