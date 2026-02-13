#!/bin/bash

# Start MCP Orchestrator with optimized Node.js settings
# Phase 3: Memory Optimizations
#
# Usage:
#   ./start-optimized.sh

# Node.js Memory and GC Tuning
# --max-old-space-size: Maximum heap size (4GB)
# --expose-gc: Enable manual GC triggering

NODE_OPTIONS="--max-old-space-size=4096 \
              --expose-gc" \
node dist/index.js
