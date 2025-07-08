#!/usr/bin/env bash
npm i --prefix=.bin -g @google/gemini-cli
if [ -f ".bin/gemini.cmd" ]; then
  .bin/gemini.cmd "$@"
else
  .bin/bin/gemini "$@"
fi