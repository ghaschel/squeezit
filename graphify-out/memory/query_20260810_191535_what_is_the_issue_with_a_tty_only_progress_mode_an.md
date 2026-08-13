---
type: "query"
date: "2026-08-10T19:15:35.154392+00:00"
question: "What is the issue with a TTY-only progress mode and how does it differ from current default output?"
contributor: "graphify"
source_nodes:
  ["runCompressCommand", "optimizeImages()", "logOptimizationResult()"]
---

# Q: What is the issue with a TTY-only progress mode and how does it differ from current default output?

## Answer

Expanded from original query via graph vocab: [concurrency, optimize, image]. There is no inherent issue with TTY-only progress; it is the correct compatibility boundary. Current output emits durable per-file result lines and a final summary, so it remains readable when piped, captured, or parsed. A TTY renderer reuses cursor rows to show active files and must fall back to static lines when stdout or stderr is not interactive, in CI, or when JSON output is selected. The confirmed UX is to convert each completed spinner row into a permanent result line and reuse the slot for the next queued file.

## Source Nodes

- runCompressCommand
- optimizeImages()
- logOptimizationResult()
