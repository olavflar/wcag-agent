# WCAG Testing Agent - Ready to Deploy

✅ All files in place. Structure:

```
agents/wcag-testing/
├── agent-wcag-testing.yaml      # Manifest (governance + rules)
├── Dockerfile-wcag-testing       # Container specification
├── instructions-wcag-testing.md  # Agent behavior guide
├── src/                          # (created by setup script)
│   ├── index.js                  # Express server
│   ├── package.json              # Dependencies
│   └── wcag-tester.js            # Test runner
├── WCAG-TESTING-README.md        # Local setup guide
├── QUICK-START.md                # Checklist
├── WCAG-AGENT-SUMMARY.md         # Architecture
├── INTEGRATION-GUIDE.md          # Multi-agent setup
└── docker-compose-wcag-section.yml # Service config
```

## Next: Run Setup

```bash
# From project root
chmod +x setup-wcag-local.sh
bash setup-wcag-local.sh
```

This will:
1. ✅ Validate Docker installation
2. ✅ Create src/ files (package.json, index.js, wcag-tester.js)
3. ✅ Build Docker image (wcag-testing-agent:local)
4. ✅ Start services (WCAG agent, Redis, mock Altinn Studio)
5. ✅ Run health checks

## Then: Test

```bash
# Health check
curl http://localhost:3010/health

# Test a component
curl -X POST http://localhost:3010/test \
  -H "Content-Type: application/json" \
  -d '{
    "component": "TextInput",
    "wcagLevel": "AA",
    "scenarios": ["basic", "with-error"]
  }'
```

## Files Saved to Claude Code Project

- ✅ manifest.yaml — Agent governance
- ✅ instructions.md — Behavior guide
- ✅ ARCHITECTURE.md — Complete overview
- ✅ SETUP-GUIDE.md — Getting started
