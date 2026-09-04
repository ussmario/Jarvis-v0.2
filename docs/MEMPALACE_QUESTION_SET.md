# MemPalace Jarvis Question Set

Status: evaluation fixture

Use the same questions against every evaluation palace. Score each result as `direct`, `related`, or `irrelevant`, and record the returned source path. A result is not considered a success merely because it contains Jarvis-related words.

## Questions

1. What did we decide about Ivy's append-only archive?
2. What is the relationship between Jarvis, RE, Bob, and Sam?
3. What is the AI Compiler responsible for?
4. How should Jarvis validate remembered facts?
5. Why should retrieval happen before reasoning?
6. What should RE be allowed to access from Bob and Sam?
7. What are Jarvis's principles for agent communication?
8. What did we decide about local Ollama models?
9. What is the difference between a durable memory and a conversation summary?
10. What should happen before a sensitive agent action executes?

## Scoring

- `direct`: the top result contains the requested decision or explanation and points to the expected historical source.
- `related`: the top result is on-topic but requires another result or manual source reading to answer confidently.
- `irrelevant`: the top result does not support the question.

Also record:

- palace name and configuration;
- query duration;
- top-five result sources;
- whether the result has usable source provenance;
- whether the index completed its health check.

Retrieval recall is useful, but this fixture is intentionally Jarvis-specific and measures evidence usefulness rather than only whether a benchmark session ID appears in a top-k list.

## Comparison Result

The bounded no-LLM control and bounded Ollama/Qwen palace returned identical top results and scores for the first repeated questions. Qwen refinement changed entity classification and metadata during initialization, but it did not change retrieval ranking because both palaces use the same embedding and search path. A future comparison must test different retrieval modes or embeddings if we want to measure search-quality improvement from model assistance.
