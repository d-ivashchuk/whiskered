#!/usr/bin/env bash
# Local production build + submit wrapper.
#
# Why this exists:
#   `eas build --local` bypasses EAS's cloud env injection. The app needs
#   several env vars at bundle/build time:
#
#     EXPO_PUBLIC_POSTHOG_API_KEY        — inlined by Metro; analytics silently
#     EXPO_PUBLIC_POSTHOG_HOST             no-ops if missing
#     EXPO_PUBLIC_REVENUECAT_API_KEY_APPLE — inlined by Metro; IAP silently
#                                            broken if missing
#
#   These all live in EAS → Environment variables → Production. This script
#   pulls them with `eas env:pull production` into a gitignored `.env.local`,
#   sources it, validates the critical ones, then runs build + submit.
#
# Usage:
#   ./scripts/ship-local.sh ios
#   ./scripts/ship-local.sh android

set -euo pipefail

PLATFORM="${1:-}"
if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
  echo "Usage: $0 [ios|android]" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Pull the latest production env vars from EAS into .env.local — but only
# when .env.local is missing. Force a re-pull with PULL_ENV=1.
if [[ ! -f .env.local || "${PULL_ENV:-0}" == "1" ]]; then
  echo "→ Pulling production env vars from EAS into .env.local…"
  npx eas-cli env:pull production --non-interactive --path .env.local
fi

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

missing=()
for var in \
  EXPO_PUBLIC_POSTHOG_API_KEY
do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "ERROR: The following required env vars are not set:" >&2
  for v in "${missing[@]}"; do echo "  - $v" >&2; done
  echo "" >&2
  echo "Add them to .env.local (gitignored) or set in EAS → Environment variables." >&2
  exit 1
fi

BUILDS_DIR="$REPO_ROOT/builds"
mkdir -p "$BUILDS_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

if [[ "$PLATFORM" == "ios" ]]; then
  EXT="ipa"
else
  EXT="aab"
fi

OUTPUT="$BUILDS_DIR/build-${TIMESTAMP}.${EXT}"

eas build \
  --platform "$PLATFORM" \
  --profile production \
  --local \
  --non-interactive \
  --output="$OUTPUT"

echo "→ Build saved to $OUTPUT"

# Keep only the latest 3 builds per platform, delete older ones.
cd "$BUILDS_DIR"
ls -1t ./*.${EXT} 2>/dev/null | tail -n +4 | xargs -r rm -f
cd "$REPO_ROOT"

eas submit \
  --platform "$PLATFORM" \
  --profile production \
  --path "$OUTPUT" \
  --non-interactive
