#!/bin/bash
# WaveWarz Base Quick Start Script for @Lil_Lob_bot
# Run this to get the platform up and running

set -e

echo "🦞 Lil Lob's WaveWarz Base Quick Start"
echo "======================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${BLUE}Project root: $PROJECT_ROOT${NC}"

# Step 1: Check Node.js
echo ""
echo -e "${GREEN}Step 1: Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Please install Node.js 20+"
    exit 1
fi
echo "Node.js version: $(node -v)"

# Step 2: Check Foundry
echo ""
echo -e "${GREEN}Step 2: Checking Foundry...${NC}"
if ! command -v forge &> /dev/null; then
    echo "Foundry not found. Installing..."
    curl -L https://foundry.paradigm.xyz | bash
    source ~/.bashrc
    foundryup
fi
echo "Forge version: $(forge --version)"

# Step 3: Install contract dependencies
echo ""
echo -e "${GREEN}Step 3: Installing contract dependencies...${NC}"
cd "$PROJECT_ROOT/contracts"
if [ ! -d "lib" ]; then
    forge install
fi
echo "Contract dependencies installed"

# Step 4: Run contract tests
echo ""
echo -e "${GREEN}Step 4: Running contract tests...${NC}"
forge test --summary

# Step 5: Install backend dependencies
echo ""
echo -e "${GREEN}Step 5: Installing backend dependencies...${NC}"
cd "$PROJECT_ROOT/backend"
npm install
echo "Backend dependencies installed"

# Step 6: Install frontend dependencies
echo ""
echo -e "${GREEN}Step 6: Installing frontend dependencies...${NC}"
cd "$PROJECT_ROOT/frontend"
npm install
echo "Frontend dependencies installed"

# Step 7: Check environment files
echo ""
echo -e "${GREEN}Step 7: Checking environment files...${NC}"
if [ ! -f "$PROJECT_ROOT/backend/.env" ]; then
    echo "⚠️  Backend .env not found. Creating from example..."
    cp "$PROJECT_ROOT/backend/.env.example" "$PROJECT_ROOT/backend/.env"
fi

if [ ! -f "$PROJECT_ROOT/frontend/.env.local" ]; then
    echo "⚠️  Frontend .env.local not found. Creating from example..."
    cp "$PROJECT_ROOT/frontend/.env.example" "$PROJECT_ROOT/frontend/.env.local"
fi

echo ""
echo "======================================"
echo -e "${GREEN}✅ WaveWarz Base is ready!${NC}"
echo ""
echo "Next steps:"
echo "1. Update contract addresses in .env files after deployment"
echo "2. Register on MoltCloud to get your artist API key"
echo "3. Get your Moltbook App Key from developers dashboard"
echo ""
echo "To start the servers:"
echo "  Backend:  cd $PROJECT_ROOT/backend && npm run dev"
echo "  Frontend: cd $PROJECT_ROOT/frontend && npm run dev"
echo ""
echo "To deploy contracts:"
echo "  cd $PROJECT_ROOT/contracts"
echo "  forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --broadcast"
echo ""
echo -e "${BLUE}🦞 Let's make waves, Lil Lob!${NC}"
