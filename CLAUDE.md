# CLAUDE.md

Before making any changes in this repository:

1. **Always read the package-specific `CLAUDE.md`** before working on any package. For example, before working on `packages/protocol`, read `packages/protocol/CLAUDE.md` first.

2. Review `AGENTS.md` files when available for additional context on tooling, environment variables, and deployment expectations.

Follow the instructions inside those guides when working on tasks.

## Package Dependencies

When adding dependencies to package.json files, always use exact versions without caret (^) or tilde (~) prefixes.

```json
// Correct
"some-package": "1.2.3"

// Incorrect
"some-package": "^1.2.3"
"some-package": "~1.2.3"
```
