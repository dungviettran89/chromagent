#!/usr/bin/env bash
ln -sf AGENTS.md QWEN.md
ln -sf .agentsignore .qwenignore
npx  @qwen-code/qwen-code "$@"
