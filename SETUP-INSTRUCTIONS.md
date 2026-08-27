# WCAG Testing Agent - Setup Instructions for Mac

## What You Have

Complete WCAG Testing Agent package with everything needed to run locally:
- ✅ Agent manifest + Dockerfile + behavior guide
- ✅ Docker Compose configuration
- ✅ Setup automation script
- ✅ Mock Altinn Studio service

## Setup on Your Mac (5 minutes)

### 1. Extract ZIP
```bash
unzip wcag-agent-complete.zip -d ~/your-altinn-repo
cd ~/your-altinn-repo
```

Your structure should now be:
```
~/your-altinn-repo/
├── agents/wcag-testing/        ← Agent files
├── scripts/altinn-studio-mock.js
├── docker-compose.local.yml
└── setup-wcag-local.sh
```

### 2. Make Setup Script Executable
```bash
chmod +x setup-wcag-local.sh
```

### 3. Prerequisites Check
Make sure you have:
- ✅ Docker Desktop running (download from docker.com if needed)
- ✅ Docker Compose (comes with Docker Desktop v20+)

### 4. Run Setup
```bash
bash setup-wcag-local.sh
```

This will:
- ✅ Validate Docker installation
- ✅ Create src/ files (package.json, index.js, wcag-tester.js)
- ✅ Build Docker image (wcag-testing-agent:local)
- ✅ Start services (WCAG agent, Redis, mock Altinn Studio)
- ✅ Run health checks

**Takes ~3-5 minutes first time**

### 5. Verify It Works
```bash
# Health check
curl http://localhost:3010/health

# Expected response:
# {"status":"ok","agent":"wcag-testing-agent","timestamp":"..."}
```

### 6. Test a Component
```bash
curl -X POST http://localhost:3010/test \
  -H "Content-Type: application/json" \
  -d '{
    "component": "TextInput",
    "wcagLevel": "AA",
    "scenarios": ["basic", "with-error"]
  }'
```

## Useful Commands

```bash
# View running services
docker-compose ps

# View logs
docker-compose logs -f wcag-testing-agent

# Stop all services
docker-compose down

# Stop and clean up volumes
docker-compose down -v

# Restart agent
docker-compose restart wcag-testing-agent
```

## Service Ports

| Service | Port | URL |
|---------|------|-----|
| WCAG Testing Agent | 3010 | http://localhost:3010 |
| Altinn Studio Mock | 3002 | http://localhost:3002 |
| Redis | 6379 | localhost:6379 |

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3010
lsof -i :3010

# Kill it
kill -9 <PID>
```

### Docker Not Running
- Open Docker Desktop from Applications
- Wait for Docker to fully start
- Try again

### Chromium Not Found Error
```bash
docker-compose down
docker system prune -a
bash setup-wcag-local.sh
```

### WCAG Agent Won't Start
```bash
# Check logs
docker-compose logs wcag-testing-agent

# Restart
docker-compose restart wcag-testing-agent
```

## Next Steps

1. ✅ Setup complete
2. ✅ Agent running locally
3. 📖 Read `agents/wcag-testing/QUICK-START.md` for full workflow
4. 🧪 Test with your own components
5. 🏗️ Use as template for other agents

## Files Inside

- `agent-wcag-testing.yaml` — Agent manifest (governance rules)
- `Dockerfile-wcag-testing` — Container specification
- `instructions-wcag-testing.md` — Agent behavior guide (300+ lines)
- `WCAG-TESTING-README.md` — Detailed local setup guide
- `QUICK-START.md` — Quick checklist
- `WCAG-AGENT-SUMMARY.md` — Complete architecture overview
- `INTEGRATION-GUIDE.md` — Multi-agent setup instructions

## Questions?

Check:
1. `QUICK-START.md` → Checklist & FAQ
2. `WCAG-AGENT-SUMMARY.md` → Architecture & design
3. `instructions-wcag-testing.md` → Agent behavior

---

**Ready? Run this:**
```bash
bash setup-wcag-local.sh
```

Happy testing! 🚀
