# Integration Guide - WCAG Agent + Customer Service Agent

This guide shows how to integrate the WCAG Testing Agent with your existing local setup (Customer Service Agent + Redis + Slack Simulator).

## Current Setup

You have:
- Customer Service Agent (port 3000)
- Redis (port 6379)
- Slack Simulator (port 3001)

## Adding WCAG Testing Agent

### Step 1: Copy Files

```bash
# Copy WCAG agent files to your repository
mkdir -p agents/wcag-testing

cp agent-wcag-testing.yaml agents/wcag-testing/
cp Dockerfile-wcag-testing agents/wcag-testing/
cp instructions-wcag-testing.md agents/wcag-testing/

# The setup script will create source files
cp setup-wcag-local.sh .
```

### Step 2: Update docker-compose.local.yml

Add the WCAG services to your existing docker-compose file:

```yaml
version: '3.8'

services:
  # Your existing services...
  customer-service-agent:
    # ... existing config ...

  redis:
    # ... existing config ...

  slack-simulator:
    # ... existing config ...

  # ===== ADD WCAG AGENT SERVICES BELOW =====

  # WCAG Testing Agent
  wcag-testing-agent:
    build:
      context: .
      dockerfile: agents/wcag-testing/Dockerfile-wcag-testing
    container_name: wcag-testing-agent
    environment:
      AGENT_NAME: wcag-testing-agent
      AGENT_ENV: local
      SERVER_PORT: 3000
      SERVER_HOST: 0.0.0.0
      WCAG_LEVEL: AA
      REPORT_FORMAT: html
      LOG_LEVEL: info
      REDIS_URL: redis://redis:6379
      ALTINN_STUDIO_URL: http://altinn-studio-mock:3002
      CHROMIUM_BIN: /usr/bin/chromium-browser

    ports:
      - "3010:3000"  # WCAG Testing Agent

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

    stdin_open: true
    tty: true

  # Mock Altinn Studio
  altinn-studio-mock:
    image: node:20-alpine
    container_name: altinn-studio-mock
    working_dir: /app
    volumes:
      - ./scripts/altinn-studio-mock.js:/app/mock.js
    ports:
      - "3002:3002"
    networks:
      - agent-network
    environment:
      PORT: 3002
    command: node /app/mock.js
    depends_on:
      - wcag-testing-agent

# Add volumes
volumes:
  customer-service-logs:
  redis-data:
  wcag-testing-reports:      # ← NEW
  wcag-testing-temp:         # ← NEW

# Verify networks section
networks:
  agent-network:
    driver: bridge
```

### Step 3: Create Mock Altinn Studio

Create `scripts/altinn-studio-mock.js`:

```javascript
const express = require('express');
const app = express();

// Mock Altinn Studio API
app.get('/test-app/:component/:scenario', (req, res) => {
  const { component, scenario } = req.params;

  const html = `
    <!DOCTYPE html>
    <html lang="no">
      <head>
        <title>Test: ${component}</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px;
            background: #f9f9f9;
          }
          h1 { color: #003399; margin-bottom: 20px; }
          .component-box { 
            background: white; 
            padding: 20px; 
            border: 1px solid #ddd;
            border-radius: 4px;
          }
          label { display: block; margin-bottom: 5px; font-weight: bold; }
          input, button { 
            padding: 8px 12px; 
            font-size: 14px;
            border: 1px solid #ccc;
            border-radius: 3px;
          }
          button { background: #003399; color: white; cursor: pointer; }
          button:hover { background: #002266; }
          .error { color: #d32f2f; margin-top: 5px; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Test: ${component} (${scenario})</h1>
        <div class="component-box">
          ${getComponentHTML(component, scenario)}
        </div>
      </body>
    </html>
  `;

  res.send(html);
});

function getComponentHTML(component, scenario) {
  if (component === 'TextInput') {
    if (scenario === 'basic') {
      return `
        <label for="email">Email Address</label>
        <input id="email" type="email" placeholder="Enter your email">
      `;
    }
    if (scenario === 'with-error') {
      return `
        <label for="username">Username</label>
        <input id="username" type="text" aria-invalid="true" aria-describedby="error">
        <div id="error" role="alert" class="error">Username is required</div>
      `;
    }
  }

  if (component === 'Button') {
    if (scenario === 'basic') {
      return `<button>Click me</button>`;
    }
    if (scenario === 'with-icon') {
      return `<button>📝 Submit Form</button>`;
    }
  }

  return `<p>Test component for ${component} - ${scenario}</p>`;
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Altinn Studio Mock running on port ${PORT}`);
});
```

### Step 4: Run Setup

```bash
# Make setup script executable
chmod +x setup-wcag-local.sh

# Run setup (creates package.json, src files, builds image)
bash setup-wcag-local.sh

# Start all services
docker-compose -f docker-compose.local.yml up -d
```

### Step 5: Verify All Services

```bash
# Check all services are running
docker-compose -f docker-compose.local.yml ps

# Expected output:
# NAME                      STATUS
# customer-service-agent    Up (healthy)
# wcag-testing-agent        Up (healthy)
# redis                     Up (healthy)
# slack-simulator           Up
# altinn-studio-mock        Up
```

### Step 6: Test Both Agents

**Customer Service Agent:**
```bash
curl http://localhost:3000/health
```

**WCAG Testing Agent:**
```bash
curl http://localhost:3010/health
```

---

## Usage Examples

### Test with Customer Service Agent

```bash
# Send a test Slack event (simulates customer inquiry)
curl -X POST http://localhost:3000/slack/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "event_callback",
    "event": {
      "type": "message",
      "text": "How do I reset my password?",
      "user": "U12345678",
      "channel": "C87654321"
    }
  }'
```

### Test with WCAG Testing Agent

```bash
# Test TextInput component for WCAG AA compliance
curl -X POST http://localhost:3010/test \
  -H "Content-Type: application/json" \
  -d '{
    "component": "TextInput",
    "wcagLevel": "AA",
    "scenarios": ["basic", "with-error"]
  }'
```

---

## Service Ports Reference

| Service | Port | Purpose |
|---------|------|---------|
| Customer Service Agent | 3000 | Slack event handling, draft approval |
| Slack Simulator | 3001 | Mock Slack event testing |
| Altinn Studio Mock | 3002 | Mock app hosting for WCAG tests |
| WCAG Testing Agent | 3010 | WCAG test execution, reporting |
| Redis | 6379 | State storage (both agents) |

---

## Sharing Configuration

To share your setup with the team, they need:

1. **docker-compose.local.yml** — Updated with WCAG services
2. **agents/wcag-testing/** — All WCAG agent files
3. **scripts/altinn-studio-mock.js** — Mock service
4. **setup-wcag-local.sh** — One-command setup

Quick share:
```bash
# Create a setup package
tar -czf altinn-agents-local.tar.gz \
  docker-compose.local.yml \
  agents/ \
  scripts/ \
  setup-wcag-local.sh \
  .env.local.example

# Send to team
# Recipients run:
tar -xzf altinn-agents-local.tar.gz
bash setup-wcag-local.sh
```

---

## Troubleshooting

### Port 3010 already in use
```bash
# Find and kill process on port 3010
lsof -i :3010
kill -9 <PID>
```

### WCAG agent won't start
```bash
# Check logs
docker-compose -f docker-compose.local.yml logs wcag-testing-agent

# Restart it
docker-compose -f docker-compose.local.yml restart wcag-testing-agent
```

### Chromium not found
```bash
# Rebuild Docker image
docker-compose -f docker-compose.local.yml down
docker system prune -a
bash setup-wcag-local.sh
```

### Altinn Mock not responding
```bash
# Check if it's running
docker-compose -f docker-compose.local.yml logs altinn-studio-mock

# Test directly
curl http://localhost:3002/test-app/TextInput/basic
```

---

## What's Next?

1. ✅ Both agents running locally
2. ✅ Customer Service Agent handles Slack inquiries
3. ✅ WCAG Testing Agent tests components
4. 🔄 Build UX Worker Agent (similar pattern)
5. 🚀 Phase 2: Automate in SDLC (triggering agents from GitHub)
6. ☁️ Phase 3: Deploy to cloud (Kubernetes via agentctl)

You now have a solid foundation for phase 1 (Infrastructure & Sandboxing). Ready for phase 2 when you are!

---

## Questions?

Check the individual README files:
- **WCAG-TESTING-README.md** — WCAG agent details
- **LOCAL-SETUP-README.md** — Customer Service agent details
- **WCAG-AGENT-SUMMARY.md** — Complete WCAG agent overview
