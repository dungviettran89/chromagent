# Scoped Package Renaming Plan

## Date
October 12, 2025

## Summary
This document outlines the plan to rename all packages in the chromagent project to use scoped names under the `@chromagen/` group. This will provide better organization and avoid potential naming conflicts in the npm registry.

## Current Package Structure
- Root package: `chromagent` (workspace root)
- CLI package: `chromagent-cli`
- Core package: `chromagent-core`
- Extension package: `chromagent` (has naming conflict with root!)
- Gateway package: `chromagent-gateway`

## Target Package Structure
- Root package: `chromagent` (remains unchanged, private workspace root)
- CLI package: `@chromagen/cli`
- Core package: `@chromagen/core`
- Extension package: `@chromagen/extension`
- Gateway package: `@chromagen/gateway`

## Implementation Steps

### 1. Update Root package.json
- Keep root package name as `chromagent` (private workspace)
- Verify workspace references still work correctly

### 2. Update Individual Package.json Files

#### 2.1. CLI Package
- Change name from `chromagent-cli` to `@chromagen/cli`
- Update any references to `chromagent-core` dependency to `@chromagen/core`

#### 2.2. Core Package
- Change name from `chromagent-core` to `@chromagen/core`

#### 2.3. Extension Package
- Change name from `chromagent` to `@chromagen/extension`
- Note: This package currently has the same name as the root package, which is likely an error that needs correction

#### 2.4. Gateway Package
- Change name from `chromagent-gateway` to `@chromagen/gateway`
- Update dependency reference to `@chromagen/core`

### 3. Update Documentation
- Update README.md files to reflect new package names
- Update other documentation in docs/ directory that may reference package names
- Update any examples or usage instructions

### 4. Update Source Code Imports
- Check and update any import statements that might reference the old package names

### 5. Verification
- Run `npm install` to ensure dependencies resolve correctly
- Run `npm run build` to verify all packages build properly
- Run tests to ensure functionality remains intact

## Risk Assessment
- Low risk: Only package names are changing, functionality remains the same
- Medium risk: Import statements may need updating if packages reference each other
- Low risk: Documentation updates are straightforward
- Note: Extension package currently has naming conflict with root package, which will be resolved by this change

## Rollback Plan
- If issues occur, revert all package.json files to previous state
- Revert documentation changes