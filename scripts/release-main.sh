#!/usr/bin/env bash
set -euo pipefail

# Optional maintainer-specific release procedure; never shipped with server details.
repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
private_release="$repo_dir/.local/release-main.sh"
if ! test -f "$private_release"; then
  printf '%s\n' 'No local maintainer release procedure is configured.' 'See DEPLOYMENT.md for portable deployment instructions.' >&2
  exit 1
fi
exec bash "$private_release" "$@"
