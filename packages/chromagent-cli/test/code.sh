#!/usr/bin/env bash
export ANTHROPIC_AUTH_TOKEN=test
export ANTHROPIC_BASE_URL="http://localhost:8080/api/anthropic/"
export DISABLE_NON_ESSENTIAL_MODEL_CALLS=1
export DISABLE_TELEMETRY=1
npx -y @anthropic-ai/claude-code "$@"