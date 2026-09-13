#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
remote_host=codex-server
ops_dir=/home/achille/apps/iv-compare-ops
active_dir=/home/achille/apps/iv-compare
public_url=https://iv-compare.proxy.theserver.life
release_log=$(mktemp)
trap 'rm -f "$release_log"' EXIT

step() { printf '[release] %s\n' "$1"; }
quiet() {
  local label=$1
  shift
  step "$label"
  if ! "$@" >"$release_log" 2>&1; then
    tail -n 120 "$release_log" >&2
    return 1
  fi
}

cd "$repo_dir"
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain)"
quiet "fetch" git fetch origin --prune
quiet "install" pnpm install --frozen-lockfile
quiet "typecheck" pnpm typecheck
quiet "lint" pnpm lint
quiet "tests and local build" pnpm test
quiet "push main" env PATH="/home/achille/.local/bin:$PATH" git push origin main

deploy_sha=$(git rev-parse HEAD)
test "$deploy_sha" = "$(git rev-parse origin/main)"
deploy_short=${deploy_sha:0:7}
deploy_time=$(date -u +%Y%m%dT%H%M%SZ)
deploy_stage="$ops_dir/staging/$deploy_short-$deploy_time"

quiet "create staging $deploy_short" ssh -o BatchMode=yes -o ConnectTimeout=10 "$remote_host" "test ! -e '$deploy_stage' && mkdir -p '$deploy_stage'"
quiet "copy release" rsync -az --delete \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' --exclude='.next/' \
  --exclude='.vinext/' --exclude='.wrangler/' --exclude='/data/' --exclude='outputs/' \
  --exclude='tests/' ./ "$remote_host:$deploy_stage/"
quiet "build staging" ssh -o BatchMode=yes "$remote_host" "set -eu; cd '$deploy_stage'; test -f public/data/iv-compare-dowsil.ivpack; pnpm install --frozen-lockfile; pnpm build; printf '%s\\n' '$deploy_sha' > DEPLOYED_GIT_SHA"

previous_sha=$(ssh -o BatchMode=yes "$remote_host" "cat '$active_dir/DEPLOYED_GIT_SHA'")
previous_short=${previous_sha:0:7}
deploy_backup="$ops_dir/backups/rollback-$previous_short-$deploy_time"
deploy_failed="$ops_dir/failed/$deploy_short-$deploy_time"

step "switch production (rollback $previous_short)"
if ! ssh -o BatchMode=yes "$remote_host" bash -s -- "$active_dir" "$deploy_stage" "$deploy_backup" "$deploy_failed" "$deploy_sha" >"$release_log" 2>&1 <<'REMOTE'
set -eu
current=$1
stage=$2
backup=$3
failed=$4
expected_sha=$5
test -d "$current"
test -d "$stage"
test ! -e "$backup"
test ! -e "$failed"
test "$(cat "$stage/DEPLOYED_GIT_SHA")" = "$expected_sha"
sudo systemctl stop iv-compare.service
mv "$current" "$backup"
if mv "$stage" "$current" \
  && sudo systemctl start iv-compare.service \
  && sleep 2 \
  && systemctl is-active --quiet iv-compare.service \
  && curl -fsS --max-time 10 http://127.0.0.1:4310/ >/dev/null \
  && curl -fsS --max-time 10 http://127.0.0.1:4310/data/iv-compare-dowsil.ivpack >/dev/null
then
  echo deploy-ok
else
  sudo systemctl stop iv-compare.service || true
  if test -e "$current"; then mv "$current" "$failed"; fi
  mv "$backup" "$current"
  sudo systemctl start iv-compare.service
  echo deploy-rolled-back >&2
  exit 1
fi
REMOTE
then
  tail -n 120 "$release_log" >&2
  exit 1
fi

quiet "verify deployed SHA and origin" ssh -o BatchMode=yes "$remote_host" "systemctl is-active --quiet iv-compare.service; test \"\$(cat '$active_dir/DEPLOYED_GIT_SHA')\" = '$deploy_sha'; curl -fsS --max-time 10 http://127.0.0.1:4310/ >/dev/null"
page_status=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 20 "$public_url/")
dataset_status=$(curl -fsS -o /dev/null -w '%{http_code}:%{size_download}' --max-time 20 "$public_url/data/iv-compare-dowsil.ivpack")
test "$page_status" = 200
test "${dataset_status%%:*}" = 200
step "deployed $deploy_short · page $page_status · dataset $dataset_status · rollback $deploy_backup"
