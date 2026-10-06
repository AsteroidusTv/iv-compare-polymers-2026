# IV Compare deployment runbook

This runbook deploys the `main` branch to the existing Hestia/Nginx origin. It does not use Cloudflare or OpenAI Sites.

For the standard, already-committed release path, run `./scripts/release-main.sh`. It executes the validation, pushes `main`, builds a unique staging release, performs the automatic-rollback switch below, and verifies the private and public origins with concise logs. It refuses a dirty worktree or a branch other than `main`. The detailed commands below remain the source of truth and the manual recovery reference.

## Production topology

| Purpose | Location |
| --- | --- |
| Local source (Windows) | `C:\Users\Achille\Documents\TM\iv-comparator-site` |
| Local source (Linux) | `/home/achille/Documents/Projects/iv-compare-polymers-2026` |
| Git remote | `https://github.com/AsteroidusTv/iv-compare-polymers-2026` |
| SSH host alias | `codex-server` (`achille@serv.theserver.life`) |
| Active application | `/home/achille/apps/iv-compare` |
| Operational files | `/home/achille/apps/iv-compare-ops` |
| Staging | `/home/achille/apps/iv-compare-ops/staging` |
| Ready rollbacks | `/home/achille/apps/iv-compare-ops/backups` |
| Failed releases | `/home/achille/apps/iv-compare-ops/failed` |
| Historical backups | `/home/achille/apps/iv-compare-ops/archive` |
| Configuration snapshots | `/home/achille/apps/iv-compare-ops/config` |
| systemd service | `iv-compare.service` |
| Local application origin | `http://127.0.0.1:4310` |
| Public origin | `https://iv-compare.proxy.theserver.life` |

The live systemd unit is `/etc/systemd/system/iv-compare.service`. The live Hestia templates are `/usr/local/hestia/data/templates/web/nginx/iv_compare.tpl` and `iv_compare.stpl`. Files under `iv-compare-ops/config` are reference snapshots, not live configuration.

## 1. Validate and push the release

Do not discard unrelated local changes. Start by checking the repository and its instruction files.

```bash
cd /home/achille/Documents/Projects/iv-compare-polymers-2026
git status --short --branch
git fetch origin --prune
git diff --check
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
```

Stop if any validation fails. Commit only the intended files, then push without bypassing Git LFS hooks:

```bash
git add <intended-files>
git commit -m "Describe the release"
PATH=/home/achille/.local/bin:$PATH git push origin main
git status --short --branch
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
```

If there is no new change to commit, still confirm that local `main` and `origin/main` resolve to the same commit.

## 2. Create an isolated staging release

Use a unique timestamp so an abandoned staging directory is never overwritten accidentally.

```bash
DEPLOY_SHA=$(git rev-parse HEAD)
DEPLOY_SHORT=$(git rev-parse --short HEAD)
DEPLOY_TIME=$(date -u +%Y%m%dT%H%M%SZ)
DEPLOY_STAGE="/home/achille/apps/iv-compare-ops/staging/${DEPLOY_SHORT}-${DEPLOY_TIME}"

ssh -o BatchMode=yes -o ConnectTimeout=10 codex-server \
  "test ! -e '$DEPLOY_STAGE' && mkdir -p '$DEPLOY_STAGE'"
```

Copy the application sources. The large repository `.git` directory and raw scientific `data` tree are intentionally excluded. The required browser package under `public/data` remains included.

```bash
rsync -az --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='.next/' \
  --exclude='.vinext/' \
  --exclude='.wrangler/' \
  --exclude='/data/' \
  --exclude='outputs/' \
  --exclude='tests/' \
  ./ "codex-server:$DEPLOY_STAGE/"
```

Install and build inside staging while production remains online:

```bash
ssh -o BatchMode=yes codex-server "
  set -eu
  cd '$DEPLOY_STAGE'
  test -f public/data/iv-compare-dowsil.ivpack
  pnpm install --frozen-lockfile
  pnpm build
  printf '%s\n' '$DEPLOY_SHA' > DEPLOYED_GIT_SHA
"
```

Stop here if the build fails. Do not alter the active application.

## 3. Switch production with automatic rollback

Read the currently deployed commit and create explicit, unique backup paths:

```bash
PREVIOUS_SHA=$(ssh -o BatchMode=yes codex-server \
  'cat /home/achille/apps/iv-compare/DEPLOYED_GIT_SHA')
PREVIOUS_SHORT=${PREVIOUS_SHA:0:7}
DEPLOY_BACKUP="/home/achille/apps/iv-compare-ops/backups/rollback-${PREVIOUS_SHORT}-${DEPLOY_TIME}"
DEPLOY_FAILED="/home/achille/apps/iv-compare-ops/failed/${DEPLOY_SHORT}-${DEPLOY_TIME}"
```

Perform the short switch. This command restores the previous directory if startup or the local HTTP smoke test fails.

```bash
ssh -o BatchMode=yes codex-server "
  set -eu
  current=/home/achille/apps/iv-compare
  stage='$DEPLOY_STAGE'
  backup='$DEPLOY_BACKUP'
  failed='$DEPLOY_FAILED'

  test -d \"\$current\"
  test -d \"\$stage\"
  test ! -e \"\$backup\"
  test ! -e \"\$failed\"
  test \"\$(cat \"\$stage/DEPLOYED_GIT_SHA\")\" = '$DEPLOY_SHA'

  sudo systemctl stop iv-compare.service
  mv \"\$current\" \"\$backup\"

  if mv \"\$stage\" \"\$current\" \
    && sudo systemctl start iv-compare.service \
    && sleep 2 \
    && systemctl is-active --quiet iv-compare.service \
    && curl -fsS --max-time 10 http://127.0.0.1:4310/ >/dev/null \
  && curl -fsS --max-time 10 http://127.0.0.1:4310/data/iv-compare-dowsil.ivpack >/dev/null \
  && curl -fsS --max-time 10 http://127.0.0.1:4310/data/outdoor-sensitivity-v1.ivpack >/dev/null
  then
    echo deploy-ok
  else
    sudo systemctl stop iv-compare.service || true
    if test -e \"\$current\"; then mv \"\$current\" \"\$failed\"; fi
    mv \"\$backup\" \"\$current\"
    sudo systemctl start iv-compare.service
    echo deploy-rolled-back >&2
    exit 1
  fi
"
```

## 4. Verify the deployed release

Verify the service, exact commit, public page, and packaged dataset:

```bash
ssh -o BatchMode=yes codex-server "
  systemctl is-active --quiet iv-compare.service
  test \"\$(cat /home/achille/apps/iv-compare/DEPLOYED_GIT_SHA)\" = '$DEPLOY_SHA'
  curl -fsS --max-time 10 http://127.0.0.1:4310/ >/dev/null
  journalctl -u iv-compare.service --since '10 minutes ago' --no-pager -p warning -q
"

curl -fsS -o /dev/null -w 'page=%{http_code}\n' --max-time 20 \
  https://iv-compare.proxy.theserver.life/
curl -fsS -o /dev/null -w 'dataset=%{http_code} bytes=%{size_download}\n' --max-time 20 \
  https://iv-compare.proxy.theserver.life/data/iv-compare-dowsil.ivpack
```

Both public requests must return HTTP 200. Finally, exercise the user-visible behavior changed by the release in the browser.

Also require HTTP 200 for `/data/outdoor-sensitivity-v1.ivpack`, then exercise
Outdoor sensitivity in the public browser. This supplemental asset contains gzip
bytes but deliberately uses `.ivpack`: vinext's production static-file cache
reserves `.gz` filenames for compression sidecars and does not serve them directly.
The automated switch includes this asset in the automatic-rollback health check.

## 5. Manual rollback

List exact candidates before moving anything:

```bash
ssh -o BatchMode=yes codex-server \
  'find /home/achille/apps/iv-compare-ops/backups -maxdepth 1 -mindepth 1 -type d -printf "%TY-%Tm-%Td %TH:%TM %p\n" | sort'
```

Set `ROLLBACK_SOURCE` to one exact directory returned above and use a unique failed-release destination:

```bash
ROLLBACK_SOURCE=/home/achille/apps/iv-compare-ops/backups/rollback-EXACT-NAME
ROLLBACK_TIME=$(date -u +%Y%m%dT%H%M%SZ)
ROLLBACK_FAILED="/home/achille/apps/iv-compare-ops/failed/manual-${ROLLBACK_TIME}"

ssh -o BatchMode=yes codex-server "
  set -eu
  current=/home/achille/apps/iv-compare
  source='$ROLLBACK_SOURCE'
  failed='$ROLLBACK_FAILED'
  test -d \"\$current\"
  test -d \"\$source\"
  test ! -e \"\$failed\"
  sudo systemctl stop iv-compare.service
  mv \"\$current\" \"\$failed\"
  mv \"\$source\" \"\$current\"
  sudo systemctl start iv-compare.service
  sleep 2
  systemctl is-active --quiet iv-compare.service
  curl -fsS --max-time 10 http://127.0.0.1:4310/ >/dev/null
  curl -fsS --max-time 10 http://127.0.0.1:4310/data/iv-compare-dowsil.ivpack >/dev/null
"
```

Do not delete backups automatically. Move old validated backups to `iv-compare-ops/archive` only after identifying them explicitly; keep at least the current release and one known-good rollback immediately available.
