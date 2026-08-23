#!/usr/bin/env bash
# One-shot: turn this folder into a git repo and publish it to GitHub.
# Run it from a normal macOS Terminal, in this folder. Safe to re-run.
set -euo pipefail

OWNER="Astro-wen"
REPO="better-myucla-planner"
DESC="Unofficial Chrome extension that makes reordering the MyUCLA Class Planner bearable. Drag, move-to-top, move-to-position. Never enrolls, never polls, never touches credentials."

cd "$(dirname "$0")"

if ! command -v gh >/dev/null 2>&1; then
  echo "The GitHub CLI is not installed. Either:"
  echo "  brew install gh && gh auth login"
  echo "or create the repo at https://github.com/new (name: $REPO, Public, no README),"
  echo "then run the git commands printed at the bottom of this script."
  exit 1
fi

gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first."; exit 1; }

if [ ! -d .git ]; then
  git init -b main
fi

# Commit as you, crediting Claude as co-author.
GH_ID="$(gh api user --jq .id)"
GH_LOGIN="$(gh api user --jq .login)"
git config user.name  "$GH_LOGIN"
git config user.email "${GH_ID}+${GH_LOGIN}@users.noreply.github.com"

git add -A
if git diff --cached --quiet; then
  echo "Nothing new to commit."
else
  git commit -q -F - <<'MSG'
Better MyUCLA 0.10.1: Class Planner reordering for MyUCLA

An unofficial Chrome extension for one page,
https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx.

MyUCLA moves a class one place per click and each click is a full postback,
so a class at #13 needs eleven clicks and eleven page loads to reach #2. This
adds drag-to-reorder with edge auto-scroll, one-click move to top, and
move-to-position. Rearranging is local and free; nothing reaches MyUCLA until
Save, which then replays the change through MyUCLA's own up and down buttons,
one validated click at a time, in an offscreen same-origin frame so the visible
page reloads once instead of once per step.

It never enrolls, drops, waitlists, polls for seats, or touches credentials,
and it fails closed the moment the page stops matching docs/MYUCLA_CONTRACT.md.

Restyling MyUCLA's own markup is opt-in and off by default: students already
know this page. See CHANGELOG.md 0.10.1 for why.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
fi

if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  echo "Repo already exists, pushing to it."
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
else
  gh repo create "$OWNER/$REPO" --public --source=. --remote=origin --description "$DESC" --push
fi

# Require your approval before CI runs on a stranger's pull request.
gh api -X PUT "repos/$OWNER/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false >/dev/null 2>&1 || true

echo
echo "Done: https://github.com/$OWNER/$REPO"
