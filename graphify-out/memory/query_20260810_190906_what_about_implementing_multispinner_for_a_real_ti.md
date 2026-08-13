---
type: "query"
date: "2026-08-10T19:09:06.848165+00:00"
question: "What about implementing multispinner for a real-time report of files being processed?"
contributor: "graphify"
source_nodes:
  ["optimizeImages()", "runCompressCommand", "logOptimizationResult()"]
---

# Q: What about implementing multispinner for a real-time report of files being processed?

## Answer

Expanded from original query via graph vocab: [concurrency, optimize, image]. This can work as a human TTY-only renderer. The current optimizeImages callback receives only completed results, so a live spinner design must add explicit start and finish events around each image rather than infer state from completions. It must be disabled for non-TTY, JSON, CI, and redirected output; current static completion lines remain the fallback.

## Source Nodes

- optimizeImages()
- runCompressCommand
- logOptimizationResult()
