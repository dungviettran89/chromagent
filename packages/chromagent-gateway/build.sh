#!/bin/bash
# Simple build script for the Chromagent Gateway

echo "Building Chromagent Gateway package..."

# Install dependencies
npm install

# Build the TypeScript code
npx tsc

echo "Build completed!"
echo "The Chromagent Gateway package is ready for use."