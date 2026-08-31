# Bruksanvisning — WCAG Testing Agent

Praktisk guide til å starte og bruke agenten slik den faktisk fungerer i dag. Se
[README.md](README.md) for arkitektur, og [`agents/wcag-testing/`](agents/wcag-testing/) for
kildekode. Kjente hull (rapport-lagring, GitHub-issues) er dokumentert nederst.

## 1. Start stacken

```bash
chmod +x setup-wcag-local.sh
bash setup-wcag-local.sh
```

Dette bygger Docker-imaget, starter `wcag-testing-agent` (port 3010), `altinn-studio-mock`
(port 3002) og `redis` (port 6380), og kjører en helsesjekk. Alternativt, hvis imaget allerede
er bygget:

```bash
docker-compose -f docker-compose.local.yml up -d
```

## 2. Helsesjekk

```bash
curl http://localhost:3010/health
# {"status":"ok","agent":"wcag-testing-agent","timestamp":"..."}
```

## 3. Kjør en scan

```bash
curl -X POST http://localhost:3010/test \
  -H "Content-Type: application/json" \
  -d '{
    "component": "TextInput",
    "wcagLevel": "AA",
    "scenarios": ["basic", "with-error"]
  }'
```

**Request body:**

| Felt | Type | Standard | Beskrivelse |
| --- | --- | --- | --- |
| `component` | string | — | Komponentnavn, matcher `/test-app/<component>/<scenario>` på target-serveren |
| `wcagLevel` | `"A"` \| `"AA"` \| `"AAA"` | `"AA"` | Hvilke axe-core WCAG-tags som sjekkes |
| `scenarios` | string[] | `[]` | Én scan per scenario, kjøres i samme browser-instans |

**Response:**

```jsonc
{
  "testId": "wcag-<timestamp>",
  "status": "completed",
  "results": {
    "component": "TextInput",
    "wcagLevel": "AA",
    "scenarios": [
      {
        "scenario": "basic",
        "passed": 9,
        "violations": 0,
        "incomplete": 0,
        "critical": 0,
        "details": [
          // ett objekt per axe-core-regel som feiler:
          // { id, impact, description, help, helpUrl, nodes: <antall> }
        ]
      }
    ],
    "summary": {
      "status": "PASS" | "FAIL",
      "totalViolations": 0,
      "criticalViolations": 0,
      "scenariosRun": 2
    }
  },
  "timestamp": "..."
}
```

Merk: `details[].nodes` er i dag bare et **antall**, ikke de faktiske DOM-selektorene/HTML-en —
se "Kjente hull" nederst.

## 4. Peke mot mock vs. ekte Altinn-app

Standard er den håndskrevne mock-serveren (`scripts/altinn-studio-mock.js`, fixtures under
`/test-app/<component>/<scenario>`). For å teste mot en ekte kjørende Altinn-app i stedet, sett
`ALTINN_STUDIO_URL` i `docker-compose.local.yml` (eller som env-var til containeren) til appens
faktiske URL, f.eks.:

```yaml
environment:
  ALTINN_STUDIO_URL: http://host.docker.internal:8000/ttd/component-library
```

(bruk `host.docker.internal` fra containeren for å nå en app som kjører på verten, f.eks. via
`studioctl run`). URL-mønsteret i `wcag-tester.js` er fortsatt
`${ALTINN_STUDIO_URL}/test-app/<component>/<scenario>` — for en ekte Altinn-app må du enten
justere det mønsteret i koden, eller lage layout-sider under samme sti-struktur som mocken
bruker.

## 5. Livssyklus-kommandoer

```bash
docker-compose -f docker-compose.local.yml logs -f wcag-testing-agent   # se logger
docker-compose -f docker-compose.local.yml restart wcag-testing-agent   # restart agent
docker-compose -f docker-compose.local.yml down                         # stopp alt
docker-compose -f docker-compose.local.yml down -v                      # stopp + slett volumer
```

## Kjente hull (per 2026-08-28)

Disse er dokumentert/deklarert i `agent-wcag-testing.yaml` og de andre `.md`-filene i
`agents/wcag-testing/`, men **ikke implementert** i faktisk kode ennå:

- **Ingen rapport-lagring** — `reports/`-mappa brukes ikke; ingen JSON/HTML/Markdown skrives noe
  sted, selv om YAML-en sin `reporting:`-blokk sier den skal.
- **Ingen GitHub-issue-oppretting** — `governance.classifications` i YAML-en peker på
  `create-github-issue` for kritiske/major-brudd, men det finnes null kode for det (`github.enabled: false`).
- **axe-core-data kastes bort** — WCAG-tags (`v.tags`) og faktiske DOM-selektorer/HTML
  (`v.nodes[].target/html/failureSummary`) leses aldri, bare telles.
- Disse hullene er ført opp som feature request-issues på GitHub (se separat oppfølging).
