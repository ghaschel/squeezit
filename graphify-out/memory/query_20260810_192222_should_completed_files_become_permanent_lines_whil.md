---
type: "query"
date: "2026-08-10T19:22:22.199176+00:00"
question: "Should completed files become permanent lines while the multi-spinner is active?"
contributor: "graphify"
source_nodes: ["optimizeImages()", "OptimizationResult", "Summary"]
---

# Q: Should completed files become permanent lines while the multi-spinner is active?

## Answer

Expanded from original query via graph vocab: [concurrency, optimize, image]. No. The approved model keeps all live progress transient for the complete run. Each finished OptimizationResult is accumulated in an in-memory collection; the multi-spinner UI is disposed only after all work finishes; then the regular per-file result report and summary are rendered in one stable final section. This applies identically to dry runs; only result status and wording distinguish planned savings from changes actually applied. Capability-limited terminals use static output.

## Source Nodes

- optimizeImages()
- OptimizationResult
- Summary
