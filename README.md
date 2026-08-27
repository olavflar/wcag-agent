# WCAG Testing Agent

A local, Docker-based agent for automated WCAG (Web Content Accessibility Guidelines) testing of
Altinn Studio app-frontend components. It drives headless Chromium via
[Puppeteer](https://pptr.dev/) and scans rendered pages with
[axe-core](https://github.com/dequelabs/axe-core), returning pass/violation/incomplete counts per
scenario.

## Architecture

Three services, started together via Docker Compose:

| Service | Purpose | Port |
| --- | --- | --- |
| `wcag-testing-agent` | Node/Express API that launches Chromium + axe-core against a target page | `3010` |
| `altinn-studio-mock` | Minimal Express server serving fixture HTML per `component`/`scenario` | `3002` |
| `redis` | State storage for the agent | `6380` (host) → `6379` (container) |

The agent's Chromium image is built on `debian:bookworm-slim` rather than Ubuntu, because Ubuntu's
`chromium-browser` apt package is a snap stub that doesn't run in containers, and Google Chrome has
no native Linux/arm64 build (relevant on Apple Silicon).

## Quick start

```bash
chmod +x setup-wcag-local.sh
bash setup-wcag-local.sh
```

This builds the agent image, starts all three services, and runs a health check. See
[`SETUP-INSTRUCTIONS.md`](SETUP-INSTRUCTIONS.md) for the full walkthrough and troubleshooting.

## Usage

Health check:

```bash
curl http://localhost:3010/health
```

Run a WCAG scan against a component/scenario:

```bash
curl -X POST http://localhost:3010/test \
  -H "Content-Type: application/json" \
  -d '{"component":"TextInput","wcagLevel":"AA","scenarios":["basic","with-error"]}'
```

`wcagLevel` (`A` / `AA` / `AAA`) selects which WCAG success-criteria tags axe-core checks against.
Each scenario is fetched from the mock at `/test-app/<component>/<scenario>` and scanned; the
response includes per-scenario violation/pass/incomplete counts plus a rule-level breakdown for any
violations found.

Useful lifecycle commands:

```bash
docker-compose -f docker-compose.local.yml logs -f wcag-testing-agent
docker-compose -f docker-compose.local.yml restart wcag-testing-agent
docker-compose -f docker-compose.local.yml down        # stop
docker-compose -f docker-compose.local.yml down -v     # stop + wipe volumes
```

## Repository layout

```
setup-wcag-local.sh              One-command local setup
docker-compose.local.yml         Service definitions (agent, mock, redis)
scripts/altinn-studio-mock.js    Fixture HTML server for component/scenario pages
agents/wcag-testing/
  Dockerfile-wcag-testing        Agent container image
  src/index.js                   Express API (/health, /test)
  src/wcag-tester.js             Puppeteer + axe-core scan logic
  agent-wcag-testing.yaml        Agent manifest / governance config
  *.md                           Design docs, integration guide, architecture summary
```

## Known limitations

- The mock server (`scripts/altinn-studio-mock.js`) serves small, hand-written HTML fixtures — it
  does not render real Altinn app-frontend components. For higher-fidelity testing, point
  `ALTINN_STUDIO_URL` at a real running Altinn app instance instead (e.g. one served locally via
  [`studioctl`](https://github.com/Altinn/altinn-studio/tree/main/src/cli)) and adjust the URL
  pattern in `wcag-tester.js` accordingly.
- `reports/` is currently unused by the agent itself; it's reserved for persisting scan output.

## Contributing

This is a personal/local tool — open an issue or PR with proposed changes.
