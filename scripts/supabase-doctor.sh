#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

if [[ ! -x "$REPO_ROOT/node_modules/.bin/supabase" ]]; then
  echo "Lockfile-installed supabase CLI not found. Run: npm ci" >&2
  exit 1
fi

SUPABASE_PATH="$REPO_ROOT/node_modules/.bin/supabase"
SUPABASE_VERSION="$(npx --no-install supabase --version | awk '{print $1}')"
LOCKFILE_VERSION="$(node -p "require('./node_modules/supabase/package.json').version")"

echo "supabase: $SUPABASE_PATH"
echo "supabase --version: $SUPABASE_VERSION"

if [[ "$SUPABASE_VERSION" != "$LOCKFILE_VERSION" ]]; then
  echo "Lockfile CLI version is $LOCKFILE_VERSION, but the binary reported $SUPABASE_VERSION" >&2
  echo "Run: npm ci" >&2
  exit 1
fi

echo "OK ($LOCKFILE_VERSION)"
