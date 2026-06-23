#!/bin/bash

# Update all project dependencies
set -e

WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

cd "$WORKSPACE_ROOT"

npm install -g vercel @anthropic-ai/claude-code @google/gemini-cli @github/copilot @openai/codex @biomejs/biome codex-auth
npm update
npm install
