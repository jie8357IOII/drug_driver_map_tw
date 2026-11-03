#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: bash scripts/bootstrap_news_rejections.sh --output FILE

Recover rejected source URLs before the first news-data snapshot. Requires git,
gh (authenticated with contents/pull-requests read permission), and Node.js.
Fetches complete main history and only merged codex/ltn-news-data-* PR heads;
open or closed-but-unmerged PRs are excluded. HEAD must belong to main history.
Does not switch branches, merge PRs, crawl, commit, push, or deploy.

Then generate the initial snapshot with:
  npm run news:update -- --output DIR --base public/data/incidents.json --rejections FILE
Subsequent runs use the rejectedUrls already persisted in news-data/state.json.
HELP
}

if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then usage; exit 0; fi
if [[ "$#" != 2 || "${1:-}" != --output || -z "${2:-}" || "${2:-}" == --* ]]; then
  usage >&2
  exit 2
fi
output=$2
if [[ "$output" != /* ]]; then output="$PWD/$output"; fi
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for tool in git gh node; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done

news_repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
if [[ ! "$news_repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo 'Cannot identify the GitHub repository for rejection history.' >&2
  exit 1
fi
fetch_args=(--no-tags)
if [[ "$(git rev-parse --is-shallow-repository)" == true ]]; then fetch_args+=(--unshallow); fi
git fetch "${fetch_args[@]}" origin main
main_sha=$(git rev-parse FETCH_HEAD)
if ! git merge-base --is-ancestor HEAD "$main_sha"; then
  echo 'Use a checkout whose HEAD belongs to main history; unmerged local history must not become rejection decisions.' >&2
  exit 1
fi

run_dir=$(mktemp -d "${TMPDIR:-/tmp}/news-rejections.XXXXXX")
trap 'rm -rf "$run_dir"' EXIT
gh api --paginate "repos/$news_repo/pulls?state=closed&base=main&per_page=100" \
  --jq '.[] | select(.merged_at != null and .base.ref == "main") | select((.head.ref // "") | startswith("codex/ltn-news-data-")) | .number' \
  > "$run_dir/merged-news-prs.txt"
refs=("$main_sha")
while IFS= read -r number; do
  [[ -n "$number" ]] || continue
  if [[ ! "$number" =~ ^[1-9][0-9]*$ ]]; then echo 'Invalid merged PR number.' >&2; exit 1; fi
  ref="refs/remotes/news-reviews/$number"
  git fetch --no-tags origin "refs/pull/$number/head:$ref"
  refs+=("$ref")
done < "$run_dir/merged-news-prs.txt"
node scripts/list_rejected_news.mjs "$run_dir/rejected-urls.json" "${refs[@]}"
mkdir -p "$(dirname "$output")"
mv "$run_dir/rejected-urls.json" "$output"
printf 'Recovered merged-review rejection history: %s\n' "$output"
