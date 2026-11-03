#!/usr/bin/env bash
set -euo pipefail

echo 'Deprecated: per-batch news PRs were replaced by automatic publication (ADR-0002).' >&2
echo 'Generate a snapshot: npm run news:update -- --output DIR' >&2
echo 'Inspect it offline: npm run news:publish -- --snapshot DIR --dry-run' >&2
echo 'Publish that snapshot: npm run news:publish -- --snapshot DIR' >&2
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then exit 0; fi
exit 1
