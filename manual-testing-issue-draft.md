# Manuell tilgjengelighetstesting utover lovkrav (v9 testapper)

## Bakgrunn

I forbindelse med v9-testplanen (20 skjema-apper på tvers av 6 kategorier) er det besluttet å ikke
manuelt gjennomgå samtlige 20 produksjonsapper enkeltvis. I stedet:

- **Component Library** (alle komponenter) skannes automatisk med axe-core via wcag-agent — dekker
  komponenttypene som går igjen på tvers av v9-appene.
- De tre app-typene komponentbiblioteket ikke fanger opp alene — betaling, signering og
  flerstegs/underskjema — testes representativt via wcag-agents testapper: `payment-test`,
  `signing-test` og `subform-test`.

Automatisk testing (axe-core) dekker kun det som er maskinelt verifiserbart, altså WCAG-
suksesskriteriene (lovkravet). Dette issuet dekker testing **utover** lovkravet — dimensjoner som
krever menneskelig vurdering og ikke fanges opp av verktøyet.

## Omfang

Manuell testing av tre representative apper:

- [ ] **Payment Test** (`payment-test`) — representerer PAYMENT-kategorien (APP-011, 012, 013)
- [ ] **Signing Test** (`signing-test`) — representerer SIGNING-kategorien (APP-008, 009, 010)
- [ ] **Subform Test** (`subform-test`) — representerer MULTI-STEP/underskjema-kategorien (APP-014–017)

## Testdimensjoner (utover lovkrav)

For hver av de tre appene over:

- [ ] **Tastaturnavigasjon** — tab-rekkefølge, synlig fokus, alle interaktive elementer nåbare uten mus
- [ ] **Skjermleser** — NVDA/VoiceOver: meningsfulle annonseringer, skjema-labels, feilmeldinger, live-regioner
- [ ] **Zoom og mobil** — 200%/400% zoom uten tap av innhold/funksjonalitet, mobilvisning, touch-mål
- [ ] **Visuelle tester** — kontrast i kontekst, informasjon som ikke kun formidles med farge, responsiv layout

## Automatiske tester (referanse, allerede kjørt)

Kjørt via wcag-agent (axe-core, WCAG AA), én app om gangen — se detaljer i wcag-agent-GUIen:

| App | Sider skannet | Funn |
|---|---|---|
| Component Library | 43/43 | `svg-img-alt` (TimePickerPage) |
| Payment Test | 7/7 | `listitem` (Varer og tjenester) |
| Signing Test | 1/1* | ingen |
| Subform Test | 1/1* | ingen |

*Kun første prosesssteg dekkes automatisk — flerstegs-flyt (f.eks. selve signerings- eller
betalingssteget) følges ikke automatisk og bør inngå i den manuelle gjennomgangen over.

## Verktøy

- wcag-agent (lokalt verktøy: axe-core + Puppeteer, med enkel GUI for appvalg og skanning)
- Skjermleser: NVDA / VoiceOver
- v9 testplan (se referanse)

## Relatert

- #18854 — tilsvarende WCAG-gjennomgang av app-komponenter
