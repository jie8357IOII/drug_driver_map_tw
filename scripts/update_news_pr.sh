#!/usr/bin/env bash
set -euo pipefail

write_report() {
  node --input-type=module <<'JS'
  import fs from 'node:fs';
  import path from 'node:path';
  const file = path.join(process.env.NEWS_RUN_DIR, 'news-report.json');
  if (!fs.existsSync(file)) process.exit(0);
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const safe = value => String(value ?? '未知').replace(/[\r\n|<>]/g, ' ').replace(/`/g, "'");
  const lines = [
    '# 毒駕新聞資料複核', '',
    `檢查日期：${report.start}–${report.end}（Asia/Taipei）`,
    `執行結果：${report.status}；本次新增候選：${report.added ?? 0}`, '',
    '收錄具體毒駕事故與危險交通事件，包括零死傷案件。候選已讀原文，但仍須核對，不代表官方完整事故統計。', '',
    '- [ ] 核對原文、事故身分、城市、發布日期與死傷；同一事故的報導保留在 relatedReports，不重複計數。',
    '- [ ] 排除政策、統計、評論、舊案司法後續與沒有危險交通情境的一般毒品案件。',
    '- [ ] 確認後才把 needsHumanReview 設為 false；城市與死傷已確認的事故才將 includeInStats 設為 true。未知值不可改成零。',
    '- [ ] 檢查完整 Files changed；這個 PR 會持續累積，後續批次清單見 Update LTN news 的執行摘要與 artifact。', '',
    '合併到 main 才會觸發既有 Pages 部署。沒有自動合併。', '',
    '| 狀態 | 新聞 | 原因 | 死亡 | 受傷 |', '|---|---|---|---:|---:|',
    ...report.articles.map(row => `| ${row.status} | [${safe(row.title).replace(/[\[\]]/g, '')}](${row.url}) | ${safe(row.reason)} | ${safe(row.deaths)} | ${safe(row.injuries)} |`),
    '', ...report.articles.map(row => `搜尋來源：${row.searchUrl}`),
  ];
  if (report.error) lines.push('', `失敗原因：${safe(report.error)}`);
  const markdown = lines.join('\n') + '\n';
  fs.writeFileSync(path.join(process.env.NEWS_RUN_DIR, 'news-report.md'), markdown);
  fs.appendFileSync(process.env.NEWS_SUMMARY_PATH, markdown);
JS

  report_written=true
}

finish() {
  local status=$?
  trap - EXIT
  if [ "$report_written" != true ]; then
    if ! write_report; then status=1; fi
  fi
  if [ "$status" -eq 0 ]; then
    if [ -n "$original_branch" ]; then
      git switch --quiet "$original_branch" || status=1
    else
      git switch --quiet --detach "$original_commit" || status=1
    fi
  else
    echo "Stopped. Inspect the retained working branch before retrying." >&2
  fi
  printf 'Run reports: %s\n' "$NEWS_RUN_DIR"
  exit "$status"
}

main() {
  local args=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --help|-h)
        echo 'Usage: npm run news:pr -- [--date YYYY-MM-DD | --start YYYY-MM-DD --end YYYY-MM-DD] [--max-pages N]'
        echo 'Uses a clean checkout, fetches news, validates, builds, and creates/updates a data PR.'
        echo 'No dates: the last three completed Asia/Taipei calendar days.'
        return 0 ;;
      --date|--start|--end|--max-pages)
        if [ "$#" -lt 2 ]; then echo "$1 requires a value" >&2; return 2; fi
        args+=("$1" "$2"); shift 2 ;;
      *) echo "Unknown argument: $1" >&2; return 2 ;;
    esac
  done
  cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  for tool in node npm git gh jq; do
    command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; return 1; }
  done
  if [ -n "$(git status --porcelain)" ]; then
    echo 'Use a clean, separate checkout: uncommitted changes will not be staged, stashed, or discarded.' >&2
    return 1
  fi
  gh auth status >/dev/null 2>&1 || { echo 'Run gh auth login and gh auth setup-git first.' >&2; return 1; }
  local news_repo
  news_repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
  original_branch=$(git symbolic-ref --quiet --short HEAD || true)
  original_commit=$(git rev-parse HEAD)
  if [ "${GITHUB_ACTIONS:-false}" = true ]; then
    git config user.name 'github-actions[bot]'
    git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  fi
  git var GIT_AUTHOR_IDENT >/dev/null
  export NEWS_RUN_DIR="${NEWS_RUN_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/ltn-news-run.XXXXXX")}"
  mkdir -p "$NEWS_RUN_DIR"
  export NEWS_SUMMARY_PATH="${GITHUB_STEP_SUMMARY:-$NEWS_RUN_DIR/summary.md}"
  report_written=false
  trap finish EXIT
  local news_run_id="${GITHUB_RUN_ID:-local-$(date -u +%Y%m%d%H%M%S)-$$}"
  local work_branch="codex/news-run-$news_run_id"
  git fetch origin main
  prs=$(gh pr list --state open --base main --limit 100 --json number,headRefName,isCrossRepository \
    --jq '[.[] | select(.isCrossRepository == false) | select(.headRefName | startswith("codex/ltn-news-data-"))]')
  count=$(jq 'length' <<< "$prs")
  if [ "$count" -gt 1 ]; then
    echo 'More than one open news data PR; resolve them before updating.' >&2
    exit 1
  fi
  if [ "$count" -eq 1 ]; then
    branch=$(jq -r '.[0].headRefName' <<< "$prs")
    pr=$(jq -r '.[0].number' <<< "$prs")
    git fetch origin "$branch"
    git switch -c "$work_branch" FETCH_HEAD
    # Fail on conflicts; never reset or force-push a reviewer's work.
    git merge --no-edit origin/main
  else
    branch="codex/ltn-news-data-${news_run_id}"
    pr=''
    git switch -c "$work_branch" origin/main
  fi
  NEWS_BRANCH="$branch"
  NEWS_PR="$pr"

  npm ci
  npm test
  npm run data:validate

  refs=()
  gh api --paginate "repos/$news_repo/pulls?state=closed&base=main&per_page=100" \
    --jq '.[] | select(.merged_at != null) | select(.head.ref | startswith("codex/ltn-news-data-")) | .number' \
    > "$NEWS_RUN_DIR/merged-news-prs.txt"
  while read -r number; do
    [ -n "$number" ] || continue
    ref="refs/remotes/news-reviews/$number"
    git fetch origin "refs/pull/$number/head:$ref"
    refs+=("$ref")
  done < "$NEWS_RUN_DIR/merged-news-prs.txt"
  node scripts/list_rejected_news.mjs "$NEWS_RUN_DIR/rejected-urls.json" ${refs[@]+"${refs[@]}"}

  npm run data:news -- ${args[@]+"${args[@]}"} --report "$NEWS_RUN_DIR/news-report.json" --rejections "$NEWS_RUN_DIR/rejected-urls.json"
  npm run data:validate
  GITHUB_PAGES=true npm run build
  write_report

  git add -- public/data/incidents.json
  if ! git diff --cached --quiet; then
    git commit -m 'Update LTN incident review candidates'
  fi
  if git diff --quiet origin/main -- public/data/incidents.json; then
    echo 'No data changes; no new PR.' >> "$NEWS_SUMMARY_PATH"
    return 0
  fi
  if [ -n "$NEWS_PR" ] && [ "$(gh pr view "$NEWS_PR" --json state --jq .state)" != OPEN ]; then
    echo 'The data PR was merged or closed during collection; rerun against main.' >&2
    exit 1
  fi
  git push origin "HEAD:$NEWS_BRANCH"
  if [ -z "$NEWS_PR" ]; then
    gh pr create --base main --head "$NEWS_BRANCH" \
      --title 'Review new LTN drug-driving incidents' \
      --body-file "$NEWS_RUN_DIR/news-report.md"
  else
    if [ "$(gh pr view "$NEWS_PR" --json state --jq .state)" != OPEN ]; then
      echo 'The data PR changed state during publication; verify the retained report before rerunning.' >&2
      exit 1
    fi
    gh pr view "$NEWS_PR" --json url --jq .url | tee -a "$NEWS_SUMMARY_PATH"
  fi
}

main "$@"
