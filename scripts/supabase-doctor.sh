#!/usr/bin/env bash

set -euo pipefail

REQUIRED_VERSION="2.72.7"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found on PATH"
  exit 1
fi

SUPABASE_PATHS_RAW="$(which -a supabase 2>/dev/null || true)"
SUPABASE_PATHS_UNIQ="$(printf '%s\n' "$SUPABASE_PATHS_RAW" | awk 'NF {seen[$0]++} END {for (p in seen) print p}' | sort)"
SUPABASE_PATH_COUNT="$(printf '%s\n' "$SUPABASE_PATHS_UNIQ" | awk 'NF{c++} END{print c+0}')"

echo "supabase: $(command -v supabase)"
echo "supabase --version: $(supabase --version)"

if [[ "$SUPABASE_PATH_COUNT" -gt 1 ]]; then
  echo "Multiple supabase binaries found on PATH:" >&2
  printf '%s\n' "$SUPABASE_PATHS_UNIQ" >&2
  echo "Fix PATH so only one supabase is used." >&2
  exit 1
fi

INSTALLED_VERSION="$(supabase --version | awk '{print $1}')"
if [[ "$INSTALLED_VERSION" != "$REQUIRED_VERSION" ]]; then
  echo "Expected supabase CLI $REQUIRED_VERSION, found $INSTALLED_VERSION" >&2
  echo "Run: npm install" >&2
  exit 1
fi

echo "OK"
