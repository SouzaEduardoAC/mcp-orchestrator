#!/bin/bash

# Start MCP Worker with optimized Node.js settings
# Phase 3: Dedicated worker process
#
# Usage:
#   ./start-worker.sh

# Node.js Memory and GC Tuning for Worker
# Workers typically use less memory than orchestrator

NODE_OPTIONS="--max-old-space-size=2048 \
              --expose-gc" \
node dist/worker.js
