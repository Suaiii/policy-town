# Dual-provider LLM design

## Goal

Run OpenCode Go `deepseek-v4-flash` for cognitive chat and SiliconFlow
`BAAI/bge-m3` for associative-memory embeddings.

## Design

`convex/util/llm.ts` keeps the existing `LLM_API_*` variables as the chat
provider configuration. A new, small embedding configuration is read from
`EMBEDDING_API_URL`, `EMBEDDING_API_KEY`, and `EMBEDDING_MODEL`. Only
`fetchEmbeddingBatch` uses that configuration; chat, planning, and dialogue
continue to use the existing provider.

The two adapters meet at the existing `LLMService` interface, so cognitive
modules, memory storage, and the 1024-dimensional Convex vector indexes do
not change. `BAAI/bge-m3` uses 1024 dimensions, matching the existing index.

## Verification

Unit tests prove that chat and embedding configuration resolve independently.
An integration run creates the three imported agents, enables cognition, and
checks that `cognitiveMemories` receives stored event memories.
