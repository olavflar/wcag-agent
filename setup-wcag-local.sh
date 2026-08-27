#!/bin/bash
set -e

echo "🚀 Setting up WCAG Testing Agent (Local)"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment if it exists
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '#' | xargs)
fi

echo -e "${BLUE}✓${NC} Checking prerequisites..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}✗ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Docker is running"

# Create necessary directories
echo -e "${BLUE}✓${NC} Creating directories..."
mkdir -p agents/wcag-testing/src
mkdir -p reports
mkdir -p scripts

# Check if package.json exists
if [ ! -f agents/wcag-testing/package.json ]; then
    echo -e "${YELLOW}➜${NC} Creating package.json..."
    cat > agents/wcag-testing/package.json << 'EOF'
{
  "name": "wcag-testing-agent",
  "version": "1.0.0",
  "description": "WCAG Accessibility Testing Agent for Altinn Studio",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "jest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@axe-core/puppeteer": "^4.8.0",
    "axe-core": "^4.8.0",
    "express": "^4.18.0",
    "puppeteer": "^21.0.0",
    "redis": "^4.6.0",
    "winston": "^3.11.0"
  }
}
EOF
fi

# Check if src/index.js exists
if [ ! -f agents/wcag-testing/src/index.js ]; then
    echo -e "${YELLOW}➜${NC} Creating src/index.js..."
    cat > agents/wcag-testing/src/index.js << 'EOF'
const express = require('express');
const redis = require('redis');
const { testComponent } = require('./wcag-tester');

const app = express();
app.use(express.json());

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'wcag-testing-agent',
    timestamp: new Date().toISOString()
  });
});

// Test component endpoint
app.post('/test', async (req, res) => {
  const { component, wcagLevel = 'AA', scenarios = [] } = req.body;

  try {
    const testId = `wcag-${Date.now()}`;
    const results = await testComponent({
      component,
      wcagLevel,
      scenarios,
      testId
    });

    res.json({
      testId,
      status: 'completed',
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

const PORT = process.env.SERVER_PORT || 3000;
app.listen(PORT, () => {
  console.log(`WCAG Testing Agent running on port ${PORT}`);
});
EOF
fi

# Check if src/wcag-tester.js exists
if [ ! -f agents/wcag-testing/src/wcag-tester.js ]; then
    echo -e "${YELLOW}➜${NC} Creating src/wcag-tester.js..."
    cat > agents/wcag-testing/src/wcag-tester.js << 'EOF'
async function testComponent(options) {
  const { component, wcagLevel, scenarios, testId } = options;

  const results = {
    testId,
    component,
    wcagLevel,
    timestamp: new Date().toISOString(),
    scenarios: []
  };

  // Mock results for testing
  for (const scenario of scenarios) {
    results.scenarios.push({
      scenario,
      passed: 5,
      violations: 0,
      incomplete: 0,
      critical: 0,
      details: []
    });
  }

  results.summary = {
    status: 'PASS',
    totalViolations: 0,
    criticalViolations: 0,
    scenariosRun: scenarios.length
  };

  return results;
}

module.exports = { testComponent };
EOF
fi

# Check if Dockerfile exists
if [ ! -f agents/wcag-testing/Dockerfile-wcag-testing ]; then
    echo -e "${YELLOW}➜${NC} Dockerfile not found. Make sure Dockerfile-wcag-testing is in agents/wcag-testing/${NC}"
fi

echo -e "${BLUE}✓${NC} Building Docker image..."
docker build -f agents/wcag-testing/Dockerfile-wcag-testing \
    -t wcag-testing-agent:local \
    .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Docker image built successfully"
else
    echo -e "${YELLOW}✗ Failed to build Docker image${NC}"
    exit 1
fi

echo -e "${BLUE}✓${NC} Starting services..."
docker-compose -f docker-compose.local.yml up -d wcag-testing-agent redis altinn-studio-mock

# Wait for services to start
echo -e "${BLUE}✓${NC} Waiting for services to start..."
sleep 5

# Check if services are running
if docker-compose -f docker-compose.local.yml ps | grep -q "wcag-testing-agent"; then
    echo -e "${GREEN}✓${NC} WCAG Testing Agent is running"
else
    echo -e "${YELLOW}✗ Failed to start WCAG Testing Agent${NC}"
    docker-compose -f docker-compose.local.yml logs wcag-testing-agent
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Check health:    curl http://localhost:3010/health"
echo "  2. Test component:  curl -X POST http://localhost:3010/test -H 'Content-Type: application/json' -d '{\"component\":\"TextInput\",\"wcagLevel\":\"AA\",\"scenarios\":[\"basic\"]}'"
echo "  3. View logs:       docker-compose -f docker-compose.local.yml logs -f wcag-testing-agent"
echo "  4. Stop services:   docker-compose -f docker-compose.local.yml down"
echo ""
