#!/usr/bin/env bash
#
# Publishes origin/main to the Chrome Web Store: triggers the publish workflow,
# which tests, packages, uploads, submits for review and tags v<version>.
#
# Usage: bin/publish.sh [--yes]

set -euo pipefail

WORKFLOW_FILE="publish-chrome-extension.yml"
SHIPPED_PATHS=(manifest.json background.js consolidate.js deduplicate.js icons scripts/build-bundle.mjs)

assume_yes=false
case "${1:-}" in
  -y | --yes) assume_yes=true ;;
  "") ;;
  *) echo "Usage: $0 [--yes]" >&2; exit 2 ;;
esac

cd "$(git rev-parse --show-toplevel)"

# gh can't infer the repo from an SSH host alias like "github-private", so pin it.
GH_REPO=$(git remote get-url origin | sed -E 's#^.*[:/]([^/:]+/[^/]+)$#\1#; s#\.git$##')
export GH_REPO

can_dispatch() {
  [[ "$(gh api "repos/$GH_REPO" --jq .permissions.push 2>/dev/null)" == "true" ]]
}

# Prefer the active gh account; fall back to the repo owner's logged-in account.
if ! can_dispatch; then
  if token=$(gh auth token --user "${GH_REPO%%/*}" 2>/dev/null) && GH_TOKEN="$token" can_dispatch; then
    export GH_TOKEN="$token"
  else
    echo "No logged-in gh account can run workflows on $GH_REPO. Run: gh auth login" >&2
    exit 1
  fi
fi

git fetch --quiet --tags origin main
last_tag=$(git describe --tags --abbrev=0 --match 'v*' origin/main 2>/dev/null || true)

echo "Publishing $GH_REPO @ origin/main: $(git log -1 --format='%h %s' origin/main)"
if [[ -n "$last_tag" ]]; then
  changes=$(git log --oneline "$last_tag..origin/main" -- "${SHIPPED_PATHS[@]}")
  if [[ -n "$changes" ]]; then
    echo "Shipped changes since $last_tag:"
    sed 's/^/  /' <<<"$changes"
  else
    echo "⚠ Nothing shipped in the extension changed since $last_tag."
  fi
else
  echo "No release tag yet: this will be the first tagged release."
fi

unpushed=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [[ "$unpushed" -gt 0 ]]; then
  echo "⚠ $unpushed local commit(s) aren't on origin/main and won't be published."
fi
echo "Note: if a version is still pending review, the store may reject this upload;"
echo "      wait for the review or cancel it in the Developer Dashboard first."

if ! $assume_yes; then
  read -r -p "Publish now? [y/N] " reply
  [[ "$reply" =~ ^[Yy] ]] || { echo "Cancelled."; exit 1; }
fi

started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
output=$(gh workflow run "$WORKFLOW_FILE" --ref main 2>&1)
run_id=$(grep -oE '/actions/runs/[0-9]+' <<<"$output" | grep -oE '[0-9]+$' || true)

# Older gh doesn't print the run URL, so find the run we just started.
for _ in {1..10}; do
  [[ -n "$run_id" ]] && break
  sleep 3
  run_id=$(gh run list --workflow "$WORKFLOW_FILE" --event workflow_dispatch -L 1 \
    --json databaseId,createdAt --jq ".[] | select(.createdAt >= \"$started\") | .databaseId")
done
if [[ -z "$run_id" ]]; then
  echo "Triggered, but couldn't find the run: https://github.com/$GH_REPO/actions/workflows/$WORKFLOW_FILE" >&2
  exit 1
fi

echo "Run: https://github.com/$GH_REPO/actions/runs/$run_id"
gh run watch "$run_id" --exit-status --compact

git fetch --quiet --tags origin
echo "✓ Submitted $(git describe --tags --abbrev=0 --match 'v*' origin/main) for Chrome Web Store review."
echo "  Status: https://chrome.google.com/webstore/devconsole/"
