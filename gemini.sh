#!/usr/bin/env bash
ln -sf AGENTS.md GEMINI.md
ln -sf .agentsignore .geminiignore
npm i --prefix=.bin -g @google/gemini-cli
if [ -f ".bin/gemini.cmd" ]; then
  .bin/gemini.cmd "$@"
else
  .bin/bin/gemini "$@"
fi