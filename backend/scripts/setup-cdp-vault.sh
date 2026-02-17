#!/bin/bash
# Setup CDP Credentials in Supabase Vault
# Usage: ./scripts/setup-cdp-vault.sh

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   WaveWarz - Configure CDP Credentials in Supabase Vault     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if PassFX vault exists
VAULT_PATH="$HOME/.passfx/vault.enc"
if [ ! -f "$VAULT_PATH" ]; then
    echo "⚠️  PassFX vault not found. Using manual input mode."
    echo ""
    echo "Enter your Coinbase CDP credentials:"
    echo ""

    read -p "COINBASE_API_KEY_ID: " API_KEY_ID
    read -sp "COINBASE_API_SECRET (paste and press enter): " API_SECRET
    echo ""
    read -sp "COINBASE_WALLET_SECRET (paste and press enter): " WALLET_SECRET
    echo ""
else
    echo "✅ PassFX vault found"
    echo ""

    # Source the OpenClaw environment
    PASSFX_VENV="$HOME/passfx/.venv/bin/activate"
    if [ -f "$PASSFX_VENV" ]; then
        source "$PASSFX_VENV"
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

        # Try to load from .env.openclaw
        if [ -f "$SCRIPT_DIR/../.env.openclaw" ]; then
            source "$SCRIPT_DIR/../.env.openclaw"
            API_KEY_ID="$COINBASE_API_KEY_ID"
            API_SECRET="$COINBASE_API_SECRET"
            WALLET_SECRET="${COINBASE_WALLET_SECRET:-}"
            echo "✅ Loaded credentials from .env.openclaw"
        fi
    fi
fi

# Validate inputs
if [ -z "$API_KEY_ID" ] || [ -z "$API_SECRET" ]; then
    echo "❌ Missing required credentials"
    exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║            Manual Supabase Vault Setup Required              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "The Supabase Vault cannot be updated via CLI in this version."
echo "Follow these manual steps to store the CDP credentials:"
echo ""
echo "1. Go to: https://app.supabase.com/project/mkpmnlcyvolsbotposch/settings/vault/secrets"
echo ""
echo "2. Click 'New Secret' and add these three secrets:"
echo ""
echo "   Secret Name: COINBASE_API_KEY_ID"
echo "   Secret Value:"
echo "   $API_KEY_ID"
echo ""
echo "   Secret Name: COINBASE_API_SECRET"
echo "   Secret Value:"
echo "   $API_SECRET"
echo ""
if [ -n "$WALLET_SECRET" ]; then
    echo "   Secret Name: COINBASE_WALLET_SECRET"
    echo "   Secret Value:"
    echo "   $WALLET_SECRET"
    echo ""
fi
echo ""
echo "3. After adding secrets, Railway will automatically load them"
echo "   (Secrets are loaded via loadSecretsFromVault() in vault.ts)"
echo ""
echo "4. Verify the setup by checking the Railway deployment logs"
echo ""
echo "✅ Setup complete!"
echo ""
