# MemPalace Baseline Health

Status: remediation in progress

The first no-LLM project-mode palace is healthy according to MemPalace's consistency check, but it is not a practical control for Jarvis evaluation.

## Finding

- Palace data size: approximately `2.9 GB`.
- SQLite drawer count: `367,774`.
- HNSW drawer count: `367,748`.
- Reported divergence: `26`, within MemPalace's flush-lag tolerance.
- Search duration: greater than 20 seconds in a timed smoke test.

The index is internally consistent, but the drawer count is disproportionate to the source corpus and makes repeated evaluation slow. The existing palace is preserved for diagnosis and is not deleted or repaired in place.

## Remediation

Create fresh control and Ollama comparison palaces using the same sanitized source and an explicit per-file chunk cap. Keep the existing palaces as historical evaluation artifacts until the replacement results are verified.

The fresh bounded control completed with 29 files and 4,322 drawers in approximately 16 MB. Its matching Ollama/Qwen palace completed with the same 29 files and 4,322 drawers in approximately 23 MB. Both consistency checks reported status `OK`; the HNSW difference was identified as MemPalace flush lag rather than corruption.
