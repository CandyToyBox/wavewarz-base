#!/usr/bin/env bash
# =================================================================
#  push-to-wavewarz-dnar.sh
#  Pushes the complete WaveWarz Dynamic NFT component to:
#  https://github.com/XTincT-io/wavewarz-DNAR
#
#  PREREQUISITES:
#    git installed
#    gh CLI installed (brew install gh) and authenticated (gh auth login)
#    OR: GITHUB_TOKEN env var set with repo write access
#
#  RUN:
#    chmod +x push-to-wavewarz-dnar.sh
#    ./push-to-wavewarz-dnar.sh
# =================================================================

set -e  # exit on any error

REMOTE="https://github.com/XTincT-io/wavewarz-DNAR.git"
BRANCH="feat/nft-dynamic-editions"
SOURCE_DIR="$(dirname "$0")"

echo ""
echo "🎵 WaveWarz DNAR — Git Push"
echo "   Remote: $REMOTE"
echo "   Branch: $BRANCH"
echo ""

# ── Check git installed ──────────────────────────────────────────
if ! command -v git &> /dev/null; then
  echo "❌ git not found. Install: https://git-scm.com"
  exit 1
fi

# ── Check gh CLI or GITHUB_TOKEN ─────────────────────────────────
if command -v gh &> /dev/null; then
  AUTH_METHOD="gh"
  echo "✅ Using GitHub CLI (gh) for auth"
elif [ -n "$GITHUB_TOKEN" ]; then
  AUTH_METHOD="token"
  echo "✅ Using GITHUB_TOKEN for auth"
else
  echo "❌ No auth found."
  echo "   Option A: brew install gh && gh auth login"
  echo "   Option B: export GITHUB_TOKEN=ghp_your_token"
  exit 1
fi

# ── Navigate to source dir ───────────────────────────────────────
cd "$SOURCE_DIR"

# ── Init git if needed ───────────────────────────────────────────
if [ ! -d ".git" ]; then
  echo "📁 Initializing git repo..."
  git init
  git remote add origin "$REMOTE"
else
  # Make sure remote is correct
  if git remote get-url origin &>/dev/null; then
    git remote set-url origin "$REMOTE"
  else
    git remote add origin "$REMOTE"
  fi
  echo "📁 Git repo exists — remote set to $REMOTE"
fi

# ── Fetch to check if repo exists and has content ────────────────
echo "🔄 Fetching remote..."
git fetch origin 2>/dev/null || echo "   (new repo — nothing to fetch)"

# ── Checkout or create branch ────────────────────────────────────
if git show-ref --quiet refs/remotes/origin/main; then
  echo "🌿 Branching from origin/main..."
  git checkout -B "$BRANCH" origin/main 2>/dev/null || git checkout -B "$BRANCH"
else
  echo "🌿 Creating fresh branch: $BRANCH"
  git checkout -B "$BRANCH"
fi

# ── Stage all files ───────────────────────────────────────────────
echo "📦 Staging all files..."
git add -A

# ── Verify something changed ─────────────────────────────────────
if git diff --cached --quiet; then
  echo "ℹ️  Nothing to commit — all files already up to date."
  exit 0
fi

# ── Commit ───────────────────────────────────────────────────────
echo "✍️  Committing..."
git commit -m "feat: add WaveWarz Dynamic NFT edition system

DNAR — Dynamic NFT Adaptive Rarity system for WaveWarz live music battles.
SVM-native | Anchor 0.29 | Metaplex | Bubblegum | Supabase Realtime

## Smart Contract (Anchor/SVM)
- lib.rs: 30 instructions across battle lifecycle + edition + print series
- editions.rs: 5 rarity tiers (1/1 immune, Legendary/Epic/Rare/Common cNFT)
  with per-NFT trait rarity bonus and battle-adaptive pricing
- print_series.rs: 4 run kinds per series
  - one_of_one: artist-fixed price, completely battle-immune
  - limited: numbered N-print run, size-aware multiplier (≤5=2.5x, ≤25=1.8x...)
  - open: unlimited until artist closes window
  - bundle: collector reward, requires owning prints from component runs

## Backend (Fastify + Supabase)
- nft-price-adapter.service.ts: pool-ratio bridge (Option B — no Audius dep)
- print-series.service.ts: price adaptation for all 4 run kinds
- editions.routes.ts + print-series.routes.ts: 16 total API routes
- 007_nft_editions.sql + 008_print_series.sql: migrations, views, RLS, Realtime

## Frontend (Next.js)
- EditionCard.tsx: live-updating rarity tier card with price flash animations
- CollectionCreator.tsx: 4-step artist collection creator
- PrintRunCard.tsx: unified card for all 4 print run kinds
- PrintSeriesCreator.tsx: multi-run series creator with per-run trait config
- /editions/[battleId]: edition marketplace with Supabase Realtime
- /editions/series/[battleId]: print series marketplace
- /editions/create + /editions/create-series: artist-facing creator pages

## Tests
- wavewarz-editions.ts: 16 Anchor integration tests
- print-series.ts: 24 Anchor integration tests (all 4 run kinds + guards)

## Scripts
- devnet-deploy-and-mint.ts: full edition system devnet smoke test
- devnet-test-print-series.ts: print series devnet smoke test

## CI
- .github/workflows/ci.yml: Anchor build + test + TypeScript check

Royalty enforcement: 1-10% per token, on-chain in trade_edition/trade_print.
Price formula: base × pool_share × vote_mult × kind_mult × trait_bonus.
Winner bonus: +20% for non-immune tokens on winning side after battle ends.

INTEGRATION.md contains exact installation steps for wavewarz-base team."

# ── Push ─────────────────────────────────────────────────────────
echo "🚀 Pushing to $REMOTE ($BRANCH)..."
if [ "$AUTH_METHOD" = "gh" ]; then
  git push --set-upstream origin "$BRANCH" --force
else
  # Inject token into remote URL
  AUTHED_REMOTE=$(echo "$REMOTE" | sed "s|https://|https://$GITHUB_TOKEN@|")
  git push "$AUTHED_REMOTE" "$BRANCH" --force
fi

echo ""
echo "✅ Push complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Branch: $BRANCH"
echo "  Repo:   https://github.com/XTincT-io/wavewarz-DNAR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Open a PR:  gh pr create --title 'feat: WaveWarz DNAR NFT Edition System' --body-file INTEGRATION.md"
echo "  2. Review CI:  https://github.com/XTincT-io/wavewarz-DNAR/actions"
echo "  3. Merge to main when CI passes"
echo ""
