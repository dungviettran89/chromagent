#!/usr/bin/env bash
ln -sf AGENTS.md QWEN.md
ln -sf .agentsignore .qwenignore
npm i --prefix=.bin -g @qwen-code/qwen-code
if [ -f ".bin/qwen.cmd" ]; then
  .bin/qwen.cmd "$@"
else
  .bin/bin/qwen "$@"
fi