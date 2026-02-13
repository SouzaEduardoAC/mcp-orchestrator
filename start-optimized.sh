#!/bin/bash

# Start MCP Orchestrator with optimized Node.js settings
# Phase 3: Memory Optimizations
#
# Usage:
#   ./start-optimized.sh

# Node.js Memory and GC Tuning
# --max-old-space-size: Maximum heap size (4GB)
# --gc-interval: Run GC every 100 operations
# --expose-gc: Enable manual GC triggering
# --optimize-for-size: Prioritize memory over speed

NODE_OPTIONS="--max-old-space-size=4096 \
              --expose-gc \
              --optimize-for-size" \
node dist/index.js
