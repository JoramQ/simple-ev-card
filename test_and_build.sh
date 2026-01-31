#!/bin/bash
set -e

IMAGE_NAME="ev-card-builder"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Simple EV Card Test & Build ===${NC}"
echo ""

# Step 1: Build Docker image
echo -e "${YELLOW}[1/4] Building Docker image...${NC}"
docker build -t "$IMAGE_NAME" . --quiet
echo -e "${GREEN}✓ Docker image built${NC}"
echo ""

# Step 2: Run linter
echo -e "${YELLOW}[2/4] Running ESLint...${NC}"
if docker run --rm "$IMAGE_NAME" npm run lint; then
    echo -e "${GREEN}✓ Lint passed${NC}"
else
    echo -e "${RED}✗ Lint failed${NC}"
    exit 1
fi
echo ""

# Step 3: Run build
echo -e "${YELLOW}[3/4] Running production build...${NC}"
docker run --rm -v "$PWD/dist":/app/dist "$IMAGE_NAME"
echo -e "${GREEN}✓ Build completed${NC}"
echo ""

# Step 4: Verify output
echo -e "${YELLOW}[4/4] Verifying build output...${NC}"
if [ -f "dist/simple-ev-card.js" ]; then
    SIZE=$(du -h dist/simple-ev-card.js | cut -f1)
    echo -e "${GREEN}✓ Output file exists: dist/simple-ev-card.js ($SIZE)${NC}"
else
    echo -e "${RED}✗ Output file missing: dist/simple-ev-card.js${NC}"
    exit 1
fi
echo ""

echo -e "${GREEN}=== All tests passed ===${NC}"
