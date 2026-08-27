# WCAG Testing Agent - Complete Package

This is a complete, production-ready agent package for automated WCAG accessibility testing of Altinn Studio components. Use this as a reference for building similar agents or deploying to production.

## What You Get

### 1. **agent-wcag-testing.yaml** - Agent Manifest
The foundational governance document that defines:
- Agent identity and purpose
- Sandbox configuration (strict isolation)
- Network allowlist (only localhost services)
- Filesystem restrictions (read-only instructions, write reports)
- Classification rules (critical, major, minor violations)
- GitHub issue templates
- Audit trail configuration
- Health checks and environment variables

**Key Features:**
- Manifest-based governance (declarative, auditable)
- Strict sandboxing (process isolation, filesystem restrictions)
- Classification confidence thresholds (95% for critical, 90% for major)
- GitHub integration ready (toggle on for cloud deployment)
- Comprehensive audit logging

### 2. **Dockerfile-wcag-testing** - Container Image
The Docker specification for building the agent container with:
- Ubuntu 24.04 base
- Node.js 20.x
- Chromium browser (for headless testing)
- axe-core and accessibility testing tools
- Non-root user (security)
- Health check endpoint
- Proper signal handling

**Runtime Environment:**
- Isolated container process
- Limited capabilities (no-new-privileges, dropped privileges)
- Read-only root filesystem option
- Temporary storage in `/tmp` and `/home/agent/reports`

### 3. **instructions-wcag-testing.md** - Agent Behavior Guide
Comprehensive 300+ line guide that tells the agent:
- How to generate test plans
- How to build test applications
- How to run axe-core + manual accessibility tests
- How to classify violations (critical, major, minor)
- How to generate HTML reports
- How to create GitHub issues
- How to handle edge cases (false positives, dependencies)
- Learning and improvement strategies

**Key Concepts:**
- WCAG 2.1 compliance levels (A, AA, AAA)
- Test methodology (automated + manual)
- Violation classification (impact, severity, WCAG level)
- Report generation (HTML, JSON, Markdown)
- Issue templates with remediation guidance

### 4. **WCAG-TESTING-README.md** - Local Setup Guide
Step-by-step instructions for:
- Prerequisites (Docker, Node.js)
- Creating package.json and source files
- Updating docker-compose.local.yml
- Setting up mock services
- Running health checks
- Testing components
- Troubleshooting
- Docker Compose commands

**Testing Workflow:**
```bash
# Health check
curl http://localhost:3010/health

# Test a component
curl -X POST http://localhost:3010/test \
  -H "Content-Type: application/json" \
  -d '{"component":"TextInput","wcagLevel":"AA","scenarios":["basic","with-error"]}'

# Get report
curl http://localhost:3010/reports/<testId>
```

### 5. **setup-wcag-local.sh** - Automation Script
One-command setup that:
- Validates Docker installation
- Creates necessary directories
- Generates missing source files (package.json, src/index.js, etc)
- Builds Docker image
- Starts Docker Compose services
- Runs health checks
- Provides next steps

**Run it:**
```bash
bash setup-wcag-local.sh
```

### 6. **docker-compose-wcag-section.yml** - Service Configuration
Complete Docker Compose configuration showing:
- WCAG Testing Agent service (port 3010)
- Mock Altinn Studio service (port 3002)
- Redis integration
- Health checks
- Volume mounts for reports
- Network configuration

**Integration:**
Copy the services and volumes sections into your existing `docker-compose.local.yml`

---

## Architecture

### Sandboxing Model

```
Host Machine
    ↓
Docker Container (wcag-testing-agent)
    ├─ Process: node src/index.js
    ├─ Filesystem:
    │  ├─ /home/agent/instructions.md (read-only)
    │  ├─ /home/agent/agent.yaml (read-only)
    │  ├─ /home/agent/reports (read-write)
    │  └─ /tmp/test-apps (read-write)
    ├─ Network:
    │  ├─ redis:6379 (state storage)
    │  ├─ altinn-studio-mock:3002 (test apps)
    │  └─ NO external access
    └─ Security:
       ├─ Non-root user (agent)
       ├─ No new privileges
       ├─ Limited capabilities
       └─ 80% CPU, 512MB memory limit
```

### Request Flow

```
User Request (POST /test)
    ↓
Express Server (port 3000)
    ├─ Parse test parameters
    ├─ Generate test ID
    └─ Call testComponent()
    ↓
Puppeteer + Chromium
    ├─ Launch headless browser
    ├─ Navigate to test app (altinn-studio-mock)
    ├─ Inject axe-core
    ├─ Run accessibility checks
    ├─ Classify violations
    └─ Close browser
    ↓
Results Processing
    ├─ Summary generation
    ├─ Redis storage (24h cache)
    └─ JSON response
    ↓
Response to User
    ├─ Test ID
    ├─ Summary (pass/fail/warnings)
    ├─ Violation count
    └─ Report URL
```

### WCAG Testing Workflow

```
Test Request
    ↓
1. Test Plan Generation
   - Identify components to test
   - Select WCAG criteria (A, AA, AAA)
   - Define test scenarios
    ↓
2. Test Application Building
   - Create realistic test app
   - Include component with variations
   - Deploy to mock Altinn Studio
    ↓
3. Accessibility Scanning
   - Run axe-core (automated)
   - Manual verification (keyboard, screen reader)
   - Classify findings
    ↓
4. Report Generation
   - HTML report with findings
   - JSON for programmatic access
   - Markdown for documentation
    ↓
5. Issue Creation (Optional)
   - Critical violations → GitHub issues (CRITICAL)
   - Major violations → GitHub issues (MAJOR)
   - Minor issues → Documentation
    ↓
6. Reporting to Team
   - Slack notification
   - Report storage in Redis
   - Audit logging
```

---

## Violation Classification

The agent classifies findings into four categories:

| Category | Confidence | Action | Severity | Example |
|----------|------------|--------|----------|---------|
| **Critical WCAG Error** | 95% | Create issue | CRITICAL | Missing form label, keyboard trap |
| **Major WCAG Error** | 90% | Create issue | MAJOR | Low contrast, broken focus indicator |
| **Minor WCAG Issue** | 80% | Flag for review | MINOR | AAA-level requirement, best practice |
| **Pass** | 99% | Report success | NONE | Meets WCAG criteria |

---

## Integration with Altinn Infrastructure

### Phase 1 (Local)
- Runs in Docker containers
- Uses mock services (altinn-studio-mock, redis)
- No real credentials needed
- Focus on testing the pattern

### Phase 2 (Cloud)
- Deploy to Kubernetes via agentctl
- Connect to real Altinn Studio API
- Enable GitHub integration
- Scheduled testing jobs

### Phase 3 (Standardization)
- Integrate with KITT (agent registry)
- Share with other teams
- Standardized WCAG compliance baseline
- Audit trail for all testing

---

## How to Use This Package

### 1. **For Local Development**
```bash
# Copy files to your project
cp -r agents/wcag-testing /path/to/your/repo/

# Run setup
bash setup-wcag-local.sh

# Test it
curl -X POST http://localhost:3010/test \
  -H "Content-Type: application/json" \
  -d '{"component":"TextInput","wcagLevel":"AA","scenarios":["basic"]}'
```

### 2. **For Reference in Claude Code**
- Share the manifest (`agent-wcag-testing.yaml`) with teammates
- Reference the instructions (`instructions-wcag-testing.md`) in Claude Code
- Use the README as documentation
- Show the Dockerfile as an example container setup

### 3. **For Cloud Deployment**
1. Update manifest with real Altinn Studio API credentials
2. Enable GitHub integration in manifest
3. Build and push Docker image to container registry
4. Deploy with `agentctl apply -f agent-wcag-testing.yaml`
5. Attach session: `agentctl attach session/wcag-testing`

---

## Key Design Principles

### 1. **Manifest-Based Governance**
- All rules defined in YAML
- Auditable and version-controlled
- Easy to update without code changes
- Clear decision boundaries

### 2. **Strict Sandboxing**
- Network allowlist (no external internet)
- Filesystem restrictions (read-only instructions)
- Process isolation (resource limits)
- Security by default

### 3. **Clear Feedback**
- Classification with confidence scores
- Actionable remediation guidance
- Evidence-based findings
- Structured reporting

### 4. **Scalable Pattern**
- Same structure as Customer Service Agent
- Works for other agents (Data Ingestion, UX Worker, etc)
- Consistent governance model
- Easy to replicate

---

## Files Checklist

You have:
- ✅ `agent-wcag-testing.yaml` - Manifest (governance)
- ✅ `Dockerfile-wcag-testing` - Container image
- ✅ `instructions-wcag-testing.md` - Agent behavior guide
- ✅ `WCAG-TESTING-README.md` - Local setup guide
- ✅ `setup-wcag-local.sh` - Automation script
- ✅ `docker-compose-wcag-section.yml` - Service config
- ✅ `WCAG-AGENT-SUMMARY.md` - This file

You still need (generated by setup script):
- `agents/wcag-testing/package.json`
- `agents/wcag-testing/src/index.js`
- `agents/wcag-testing/src/wcag-tester.js`
- `scripts/altinn-studio-mock.js`

---

## Next Steps

1. **Copy files to your repository:**
   ```bash
   mkdir -p agents/wcag-testing
   cp agent-wcag-testing.yaml agents/wcag-testing/
   cp Dockerfile-wcag-testing agents/wcag-testing/
   cp instructions-wcag-testing.md agents/wcag-testing/
   ```

2. **Run setup:**
   ```bash
   bash setup-wcag-local.sh
   ```

3. **Test it:**
   ```bash
   curl http://localhost:3010/health
   ```

4. **Create a test component:**
   ```bash
   curl -X POST http://localhost:3010/test \
     -H "Content-Type: application/json" \
     -d '{"component":"TextInput","wcagLevel":"AA","scenarios":["basic","with-error"]}'
   ```

5. **Show your team:**
   - Share the manifest
   - Share the instructions
   - Demo the test workflow

---

## Questions?

This agent demonstrates phase 1 (Infrastructure) of the Altinn agent strategy:
- **Sandboxing** ✅ Strict Docker isolation
- **Governance** ✅ Manifest-based rules
- **Scalability** ✅ Pattern for other agents

Ready for phase 2 (Automation in SDLC) and phase 3 (Cloud/Kubernetes) when you are.

Happy testing! 🚀
