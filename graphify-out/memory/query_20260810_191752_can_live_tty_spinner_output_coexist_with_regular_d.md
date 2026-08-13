---
type: "query"
date: "2026-08-10T19:17:52.381172+00:00"
question: "Can live TTY spinner output coexist with regular durable result output?"
contributor: "graphify"
source_nodes:
  ["optimizeImages()", "logOptimizationResult()", "runWithConcurrency"]
---

# Q: Can live TTY spinner output coexist with regular durable result output?

## Answer

Expanded from original query via graph vocab: [concurrency, optimize, image]. Yes. The appropriate design is a single human renderer that maintains transient active-job rows, clears and redraws them when a job finishes, emits the existing formatted result as a permanent line, then assigns the freed slot to the next queued job. Noninteractive or capability-limited terminals bypass that renderer and retain current durable line output. The core stays presentation-free and exposes start/result events only.

## Source Nodes

- optimizeImages()
- logOptimizationResult()
- runWithConcurrency
