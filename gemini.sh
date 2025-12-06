#!/usr/bin/env bash
ln -sf AGENTS.md GEMINI.md
ln -sf .agentsignore .geminiignore
npx @google/gemini-cli "$@"
