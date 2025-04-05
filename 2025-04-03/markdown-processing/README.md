# Archived Markdown Processing Code

This directory contains the original monolithic implementation of callout processing before the refactor to a four-phase pipeline architecture.

## Files

1. `remark-callout.original.ts`
   - Original monolithic implementation
   - Single-pass transformation
   - Direct AST manipulation

2. `remark-callout-handler.original.d.ts`
   - Original type definitions
   - Callout data structures
   - Plugin type declarations

## Refactor Context

These files were archived as part of the transition to a four-phase pipeline architecture:
1. Detection
2. Isolation
3. Transform
4. Embed

The new implementation can be found in `site/src/utils/markdown/callouts/`.

## Rollback Instructions

If rollback is needed:
1. Copy files back to original locations
2. Remove pipeline implementation
3. Update imports in dependent files

## Debug Output Comparison

Original debug points:
- remark-callout-transformations.json
- remark-callout-error.json

New pipeline debug points:
- callouts-detection.json
- callouts-isolation.json
- callouts-transform.json
- callouts-embed.json
- callouts-complete.json
