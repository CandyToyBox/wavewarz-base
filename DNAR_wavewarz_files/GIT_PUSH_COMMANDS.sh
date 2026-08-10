# =================================================================
#  WAVEWARZ DNAR — Manual Push Commands
#  Target: https://github.com/XTincT-io/wavewarz-DNAR
#  Copy and paste the entire block into your terminal.
# =================================================================

# ── STEP 1: Navigate to the package ─────────────────────────────
# Replace this path with wherever you downloaded/extracted the files
cd /path/to/wavewarz_dynamic_nft

# ── STEP 2: Choose your auth method ─────────────────────────────

# Option A — GitHub CLI (recommended)
#   Install: brew install gh        (macOS)
#            winget install gh      (Windows)
#            sudo apt install gh    (Linux)
#   Then: gh auth login
#   (opens browser, pick GitHub.com → HTTPS → paste token)

# Option B — Personal Access Token
#   Create at: https://github.com/settings/tokens/new
#   Scopes needed: repo (full), workflow
#   Then set:
#   export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# ── STEP 3: Init and push ────────────────────────────────────────
git init
git remote add origin https://github.com/XTincT-io/wavewarz-DNAR.git

# Pull existing content if repo already has a main branch
git fetch origin 2>/dev/null && \
  git checkout -B feat/nft-dynamic-editions origin/main 2>/dev/null || \
  git checkout -B feat/nft-dynamic-editions

# Stage everything
git add -A

# Commit with full message
git commit -m "feat: WaveWarz DNAR — Dynamic NFT Adaptive Rarity System

SVM-native NFT edition system for live WaveWarz music battles.
Anchor 0.29 | Metaplex | Bubblegum | Supabase Realtime

Contract (30 instructions):
  - editions.rs: 5 rarity tiers, cNFT via Bubblegum, trait bonuses
  - print_series.rs: 4 run kinds (1/1, limited, open, bundle)

Backend:
  - nft-price-adapter.service.ts: pool-ratio bridge to SVM
  - print-series.service.ts: live price adaptation all run kinds
  - editions.routes.ts + print-series.routes.ts: 16 API routes
  - 007_nft_editions.sql + 008_print_series.sql: DB migrations

Frontend:
  - EditionCard, CollectionCreator, PrintRunCard, PrintSeriesCreator
  - /editions/[battleId], /editions/series/[battleId]
  - /editions/create, /editions/create-series

Tests: 40 Anchor integration tests (wavewarz-editions + print-series)
CI: .github/workflows/ci.yml (Anchor build + test + TypeScript)

See INTEGRATION.md for exact installation steps."

# Push branch
git push --set-upstream origin feat/nft-dynamic-editions --force

# ── STEP 4: Open a Pull Request ──────────────────────────────────
# With gh CLI:
gh pr create \
  --title "feat: WaveWarz DNAR — Dynamic NFT Adaptive Rarity System" \
  --body-file INTEGRATION.md \
  --base main \
  --head feat/nft-dynamic-editions \
  --repo XTincT-io/wavewarz-DNAR

# ── STEP 5: Watch CI ─────────────────────────────────────────────
gh run watch --repo XTincT-io/wavewarz-DNAR

# =================================================================
#  OR — use the automated script instead of the above:
#  chmod +x push-to-wavewarz-dnar.sh && ./push-to-wavewarz-dnar.sh
# =================================================================
