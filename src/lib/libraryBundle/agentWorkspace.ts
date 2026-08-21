import { encodeBundleText, type BundleFileMap } from './fileMap'

export const BUNDLE_AGENT_INSTRUCTIONS = `# Beta Bot library workspace

This repository contains a canonical Beta Bot library bundle. Treat stable IDs and the immutable export inventory as the source of identity; paths and display names may change.

1. Read the [canonical bundle specification](https://github.com/gennitdev/ai-beta-reader-frontend/blob/main/docs/book-folder-format.md) before editing managed files.
2. Never change an existing entity ID or edit \`_beta-bot/inventory.json\`.
3. Give every new entity a globally unique, correctly namespaced ID.
4. Search both \`page_name\` and every alias when reconciling a wiki page.
5. Preserve explicit \`wiki_mentions\`; absence of a text match is not permission to delete a relationship.
6. Record wiki review state using the exact semantic chapter content hash.
7. Run \`npm run validate:bundle -- /absolute/path/to/this/workspace\` from a checkout of the Beta Bot application before opening a pull request.
8. Open a pull request; do not commit directly to the protected branch.

The validator performs no database access. Resolve every error before review. Warnings should be inspected and explained when intentionally retained.
`

export const BUNDLE_GITATTRIBUTES = `# Canonical Beta Bot text uses LF on every platform.
*.md text eol=lf
*.yaml text eol=lf
*.json text eol=lf
*.jsonl text eol=lf
*.svg text eol=lf

# Generated inventories and histories should never be auto-merged. Regenerate
# them from a validated bundle after resolving authored-file conflicts.
_beta-bot/inventory.json -merge
_beta-bot/history/*.jsonl -merge
_beta-bot/review-state.jsonl -merge

# Image assets are binary. Their sibling asset.yaml files remain normal text.
*.avif binary
*.bmp binary
*.gif binary
*.jpeg binary
*.jpg binary
*.png binary
*.webp binary
`

/** Files created once beside the managed bundle tree for Git/agent workflows. */
export function createAgentWorkspaceScaffold(): BundleFileMap {
  return new Map([
    ['AGENTS.md', encodeBundleText(BUNDLE_AGENT_INSTRUCTIONS)],
    ['.gitattributes', encodeBundleText(BUNDLE_GITATTRIBUTES)],
  ])
}
