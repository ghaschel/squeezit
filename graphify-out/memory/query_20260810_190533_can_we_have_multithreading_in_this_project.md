---
type: "query"
date: "2026-08-10T19:05:33.998516+00:00"
question: "Can we have multithreading in this project?"
contributor: "graphify"
source_nodes:
  ["optimizeImages()", "runWithConcurrency", "resolveCompressOptions"]
---

# Q: Can we have multithreading in this project?

## Answer

Expanded from original query via graph vocab: [concurrency, optimize, image]. Yes: the project already has asynchronous parallel processing, not OS worker-thread multithreading. runWithConcurrency starts up to the configured number of promise workers; default concurrency is CPU count, capped at 2 in max mode. Image optimization invokes external tools, so concurrent processes provide real parallel CPU use. Worker threads are optional only for future CPU-heavy in-process JavaScript or WASM work; they would add complexity and should use resource limits. Keep per-file output synchronized because completion order is nondeterministic.

## Source Nodes

- optimizeImages()
- runWithConcurrency
- resolveCompressOptions
