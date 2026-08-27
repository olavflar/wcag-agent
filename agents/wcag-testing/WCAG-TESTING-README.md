# WCAG Testing Agent - Local Setup Guide

This guide helps you run the WCAG accessibility testing agent locally for testing Altinn Studio components before deploying to production.

## Quick Start

```bash
# 1. Set up local environment
bash setup-wcag-local.sh

# 2. The agent will be running at http://localhost:3010

# 3. Test a component
curl -X POST http://localhost:3010/test \
  -H "Content-Type: application/json" \
  -d '{
    "component": "TextInput",
    "wcagLevel": "AA",
    "scenarios": ["basic", "with-error"]
  }'
```

---

## Prerequisites

- **Docker** (20.10+)
- **Docker Compose** (1.29+)
- **Node.js** 20+ (for local development, optional)
- **Altinn Studio** (or local mock)

## Step-by-Step Setup

### 1. Clone or Set Up Files

```bash
# Copy agent files to your project
mkdir -p agents/wcag-testing
cd agents/wcag-testing

# Copy these files from package:
# - agent-wcag-testing.yaml
# - Dockerfile-wcag-testing
# - instructions-wcag-testing.md
# - package.json (see below)
```

### 2. Create package.json

```json
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
```

### 3. Create src/index.js (Minimal Agent)

```javascript
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
    
    // Store in Redis
    await redisClient.set(
      `test:${testId}`,
      JSON.stringify(results),
      { EX: 86400 } // 24 hour expiry
    );
    
    res.json({
      testId,
      status: 'completed',
      results,
      reportUrl: `/reports/${testId}.html`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get report
app.get('/reports/:testId', async (req, res) => {
  const { testId } = req.params;
  const results = await redisClient.get(`test:${testId}`);
  
  if (!results) {
    return res.status(404).json({ error: 'Report not found' });
  }
  
  const data = JSON.parse(results);
  res.json(data);
});

const PORT = process.env.SERVER_PORT || 3000;
app.listen(PORT, () => {
  console.log(`WCAG Testing Agent running on port ${PORT}`);
});
```

### 4. Create src/wcag-tester.js

```javascript
const puppeteer = require('puppeteer');
const { injectAxe, checkAxe } = require('@axe-core/puppeteer');

async function testComponent(options) {
  const { component, wcagLevel, scenarios, testId } = options;
  
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    testId,
    component,
    wcagLevel,
    timestamp: new Date().toISOString(),
    scenarios: []
  };

  try {
    for (const scenario of scenarios) {
      const page = await browser.newPage();
      
      // Navigate to test app (example)
      await page.goto(`http://localhost:3002/test-app/${component}/${scenario}`, {
        waitUntil: 'networkidle0'
      });

      // Inject and run axe
      await injectAxe(page);
      const axeResults = await checkAxe(page, {
        runOnly: { type: 'wcag', values: [`wcag2${wcagLevel.toLowerCase()}`] }
      });

      // Classify results
      const violations = axeResults.violations.map(v => ({
        id: v.id,
        impact: v.impact, // critical, serious, moderate, minor
        description: v.description,
        nodes: v.nodes.length,
        recommendation: v.nodes[0]?.none?.[0]?.id
      }));

      const passed = axeResults.passes.length;
      const incomplete = axeResults.incomplete.length;

      results.scenarios.push({
        scenario,
        passed,
        violations: violations.length,
        incomplete,
        critical: violations.filter(v => v.impact === 'critical').length,
        details: violations
      });

      await page.close();
    }
  } finally {
    await browser.close();
  }

  // Summary
  const totalViolations = results.scenarios.reduce((sum, s) => sum + s.violations, 0);
  const totalCritical = results.scenarios.reduce((sum, s) => sum + s.critical, 0);

  results.summary = {
    status: totalCritical > 0 ? 'FAIL' : totalViolations > 0 ? 'PASS_WITH_WARNINGS' : 'PASS',
    totalViolations,
    criticalViolations: totalCritical,
    scenariosRun: scenarios.length
  };

  return results;
}

module.exports = { testComponent };
```

### 5. Update docker-compose-local.yml

Add to your docker-compose file:

```yaml
# WCAG Testing Agent Service
wcag-testing-agent:
  build:
    context: .
    dockerfile: agents/wcag-testing/Dockerfile-wcag-testing
  container_name: wcag-testing-agent
  environment:
    AGENT_NAME: wcag-testing-agent
    AGENT_ENV: local
    LOG_LEVEL: info
    WCAG_LEVEL: AA
    REPORT_FORMAT: html
    REDIS_URL: redis://redis:6379
    ALTINN_STUDIO_URL: http://altinn-studio-mock:3002
    CHROMIUM_BIN: /usr/bin/chromium-browser

  ports:
    - "3010:3000"  # WCAG Testing Agent API

  volumes:
    - ./agents/wcag-testing/instructions.md:/home/agent/instructions.md:ro
    - ./agents/wcag-testing/agent.yaml:/home/agent/agent.yaml:ro
    - wcag-testing-reports:/home/agent/reports
    - wcag-testing-temp:/tmp/test-apps

  networks:
    - agent-network

  depends_on:
    - redis
    - altinn-studio-mock

  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 10s

# Mock Altinn Studio (for testing)
altinn-studio-mock:
  image: node:20-alpine
  container_name: altinn-studio-mock
  ports:
    - "3002:3002"
  environment:
    PORT: 3002
  volumes:
    - ./scripts/altinn-studio-mock.js:/app/mock.js
  command: node /app/mock.js
  networks:
    - agent-network

# Add to volumes section:
volumes:
  wcag-testing-reports:
  wcag-testing-temp:

# networks section already exists
```

### 6. Create Altinn Studio Mock (scripts/altinn-studio-mock.js)

```javascript
const express = require('express');
const app = express();

// Mock Altinn Studio API
app.get('/test-app/:component/:scenario', (req, res) => {
  const { component, scenario } = req.params;

  // Return simple HTML for testing
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test: ${component}</title>
        <style>
          body { font-family: Arial; margin: 20px; }
          .test-component { border: 1px solid #ccc; padding: 20px; }
          input { padding: 8px; }
        </style>
      </head>
      <body>
        <h1>${component} - ${scenario}</h1>
        <div class="test-component">
          <!-- Test component will be injected here -->
          ${getTestHTML(component, scenario)}
        </div>
      </body>
    </html>
  `;

  res.send(html);
});

function getTestHTML(component, scenario) {
  if (component === 'TextInput' && scenario === 'basic') {
    return `
      <label for="email">Email Address</label>
      <input id="email" type="email" placeholder="Enter email">
    `;
  }
  if (component === 'TextInput' && scenario === 'with-error') {
    return `
      <label for="username">Username</label>
      <input id="username" type="text" aria-invalid="true" aria-describedby="error">
      <span id="error" role="alert">Username is required</span>
    `;
  }
  return `<p>Test component for ${component} - ${scenario}</p>`;
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Altinn Studio Mock running on port ${PORT}`);
});
```

### 7. Run Setup Script

```bash
bash setup-wcag-local.sh
```

This will:
- ✅ Validate configuration
- ✅ Build Docker image
- ✅ Start Docker Compose services
- ✅ Run health checks
- ✅ Display next steps

---

## Testing the Agent

### Health Check

```bash
curl http://localhost:3010/health
```

Expected response:
```json
{
  "status": "ok",
  "agent": "wcag-testing-agent",
  "timestamp": "2026-08-26T10:00:00Z"
}
```

### View Logs

```bash
docker-compose -f docker-compose.local.yml logs -f wcag-testing-agent
```

### Test TextInput Component

```bash
curl -X POST http://localhost:3010/test \
  -H "Content-Type: application/json" \
  -d '{
    "component": "TextInput",
    "wcagLevel": "AA",
    "scenarios": ["basic", "with-error"]
  }'
```

Response:
```json
{
  "testId": "wcag-1693043400000",
  "status": "completed",
  "results": {
    "summary": {
      "status": "PASS",
      "totalViolations": 0,
      "criticalViolations": 0,
      "scenariosRun": 2
    },
    "scenarios": [...]
  },
  "reportUrl": "/reports/wcag-1693043400000.html"
}
```

### Get Test Report

```bash
curl http://localhost:3010/reports/wcag-1693043400000
```

---

## Docker Compose Commands

### Service Management

```bash
# View running services
docker-compose -f docker-compose.local.yml ps

# View logs
docker-compose -f docker-compose.local.yml logs -f wcag-testing-agent

# Stop all services
docker-compose -f docker-compose.local.yml down

# Stop and remove volumes (careful!)
docker-compose -f docker-compose.local.yml down -v

# Restart WCAG agent
docker-compose -f docker-compose.local.yml restart wcag-testing-agent
```

---

## Troubleshooting

### Docker Build Fails

```bash
# Clean and rebuild
docker-compose -f docker-compose.local.yml down
docker system prune -a
bash setup-wcag-local.sh
```

### Agent Won't Start

```bash
# Check logs
docker-compose -f docker-compose.local.yml logs wcag-testing-agent

# Common issues:
# - Port 3010 already in use: lsof -i :3010
# - Chromium not installed: verify Dockerfile
# - Redis not running: docker-compose ps redis
```

### Chromium Launch Issues

```bash
# Check if Chromium is installed
docker exec wcag-testing-agent which chromium-browser

# If not found, rebuild:
docker-compose -f docker-compose.local.yml down
docker system prune -a
bash setup-wcag-local.sh
```

### Tests Fail with "No Page Found"

- Ensure `altinn-studio-mock` is running: `docker-compose ps altinn-studio-mock`
- Check mock returns HTML: `curl http://localhost:3002/test-app/TextInput/basic`
- Verify network connectivity: tests use `http://localhost:3002` (inside container)

---

## How the Agent Works

```
Test Request
    ↓
Test Plan Generation
  (determine test scenarios)
    ↓
Launch Browser (Puppeteer + Chromium)
  (navigate to test component)
    ↓
Inject axe-core
  (run accessibility checks)
    ↓
Classify Results
  (violations, passes, incomplete)
    ↓
Generate Report
  (HTML with findings)
    ↓
Store in Redis
  (24-hour cache)
    ↓
Return Results to User
```

---

## Next Steps

1. **Test a component** (see Testing section above)
2. **Review reports** in `/agents/wcag-testing/reports/`
3. **Create GitHub issues** for violations (integrate GitHub token)
4. **Iterate** on component based on findings
5. **Move to cloud** when testing is complete (phase 2)

---

## Resources

- [WCAG 2.1 Spec](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [Puppeteer Docs](https://pptr.dev/)
- [Altinn Studio Docs](https://docs.altinn.no)

---

## Questions?

If something doesn't work:

1. Check logs: `docker-compose -f docker-compose.local.yml logs`
2. Verify services: `docker-compose ps`
3. Test connectivity: `curl http://localhost:3010/health`
4. Check Docker: `docker info`

Happy testing! 🚀
