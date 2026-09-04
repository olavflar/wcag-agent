const path = require('path');
const net = require('net');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const puppeteer = require('puppeteer');
const { AxePuppeteer } = require('@axe-core/puppeteer');

const apps = require('./apps.json');

const execFileAsync = promisify(execFile);
const REPORTS_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORTS_DIR, { recursive: true });

const BASE_URL = 'http://local.altinn.cloud:8000';
const ORG = 'ttd';
const VITE_PORT = 8080;
const VITE_DIR = path.join(process.env.HOME, 'Altinn-studio/altinn-studio/src/App/frontend');
const APPS_ROOT = path.join(process.env.HOME, 'Altinn-studio/altinn-studio/src/test/apps');
// DDG Fitness AS, acting via Sophie Salt: has DAGL (general manager) role, which
// covers the broadest set of test-app authorization policies (some apps, like
// signing-test, require an org role and reject a bare person like Sophie Salt).
const TEST_USER = process.env.WCAG_GUI_TEST_USER || '1337.500000';

const WCAG_TAGS = {
  A: ['wcag2a', 'wcag21a'],
  AA: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  AAA: ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa']
};

let currentAppId = null;

function findApp(id) {
  const app = apps.find((a) => a.id === id);
  if (!app) throw new Error(`Unknown app: ${id}`);
  return { ...app, org: ORG, appName: id, path: path.join(APPS_ROOT, id) };
}

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function ensureViteRunning() {
  if (await isPortOpen(VITE_PORT)) return;
  const child = spawn('yarn', ['start', '--host', '0.0.0.0'], {
    cwd: VITE_DIR,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await isPortOpen(VITE_PORT)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Vite dev server did not start within 60s');
}

async function stopAllApps() {
  await execFileAsync('studioctl', ['app', 'stop', '--all', '--json']).catch(() => {});
}

async function startApp(appConfig) {
  await ensureViteRunning();
  // Always start from a clean slate: relying on in-memory "current app" state is
  // fragile (this process can restart independently of the studioctl-managed app
  // processes), which previously left multiple duplicate instances running.
  await stopAllApps();
  const { stdout } = await execFileAsync(
    'studioctl',
    ['run', '-p', appConfig.path, '-d', '--dev-frontend', '--json'],
    { timeout: 180000 }
  );
  currentAppId = appConfig.id;
  return JSON.parse(stdout);
}

async function loginAndReachInstance(page, appConfig) {
  await page.goto(`${BASE_URL}/${appConfig.org}/${appConfig.appName}`, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  const loginForm = await page.$('#UserSelect');
  if (loginForm) {
    await page.select('#UserSelect', TEST_USER);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('button[value="start"]')
    ]);
  }

  // Best-effort fallback for apps that show an intermediate confirm/party-selection
  // screen before reaching the instance (behavior varies per app config).
  for (let attempt = 0; attempt < 5; attempt++) {
    if (page.url().includes('/instance/')) break;
    const clicked = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a'));
      const match = candidates.find((el) => /fortsett|neste|next|start|velg/i.test(el.textContent || ''));
      if (match) {
        match.click();
        return true;
      }
      return false;
    });
    if (!clicked) break;
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 }).catch(() => {});
  }

  await page.waitForFunction(() => location.pathname.includes('/instance/'), { timeout: 30000 });
  return page.url();
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildPageResult(label, url, axeResults, screenshot) {
  const critical = axeResults.violations.filter((v) => v.impact === 'critical').length;
  return {
    page: label,
    url,
    screenshot,
    passed: axeResults.passes.length,
    violations: axeResults.violations.length,
    incomplete: axeResults.incomplete.length,
    critical,
    details: axeResults.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((n) => (Array.isArray(n.target) ? n.target.join(' ') : String(n.target)))
    }))
  };
}

// Outlines every violating element in red directly in the page (so the
// screenshot shows *where* the problem is, not just a generic page shot),
// and scrolls the first one into view in case it's below the fold.
async function highlightViolations(page, axeResults) {
  await page.evaluate((targets) => {
    let first = null;
    for (const target of targets) {
      try {
        const el = document.querySelector(target);
        if (!el) continue;
        el.style.outline = '3px solid #e00000';
        el.style.outlineOffset = '2px';
        el.style.boxShadow = '0 0 0 6px rgba(224,0,0,0.25)';
        if (!first) first = el;
      } catch (e) {
        // invalid/unsupported selector (e.g. crosses into an iframe) — skip it
      }
    }
    if (first) first.scrollIntoView({ block: 'center' });
  }, axeResults.violations.map((v) => (Array.isArray(v.nodes[0]?.target) ? v.nodes[0].target[0] : v.nodes[0]?.target)).filter(Boolean));
}

async function screenshotPage(page, screenshotDir, index, label, axeResults) {
  if (axeResults.violations.length > 0) {
    await highlightViolations(page, axeResults);
  }
  const filename = `${String(index).padStart(2, '0')}-${slugify(label) || 'side'}.jpg`;
  await page.screenshot({ path: path.join(screenshotDir, filename), type: 'jpeg', quality: 70 });
  return filename;
}

async function discoverAndScanPages(page, tags, screenshotDir) {
  // The numbered pill/tab navigation ("1. Kort svar", "2. Langt svar", ...) is
  // the standard app-frontend multi-page task navigation and shows up the same
  // way across apps (component-library, payment-test, ...), unlike the grouped
  // "Skjemasider" sidebar, which only renders when an app groups its pages.
  await page.evaluate(() => {
    window.__wcagFindNavButtons = function () {
      return Array.from(document.querySelectorAll('button')).filter((b) => /^\d+\.\s/.test(b.textContent.trim()));
    };
  });

  const total = await page.evaluate(() => window.__wcagFindNavButtons().length);

  const results = [];

  if (total === 0) {
    // Single-page task: no pill navigation, just scan whatever is on screen.
    const title = await page.title();
    try {
      const axeResults = await new AxePuppeteer(page).withTags(tags).analyze();
      const screenshot = await screenshotPage(page, screenshotDir, 1, title, axeResults);
      results.push(buildPageResult(title, page.url(), axeResults, screenshot));
    } catch (error) {
      results.push({ page: title, error: error.message });
    }
    return results;
  }

  for (let i = 0; i < total; i++) {
    const clickInfo = await page.evaluate((idx) => {
      const buttons = window.__wcagFindNavButtons();
      const btn = buttons[idx];
      if (!btn) return null;
      btn.click();
      return { text: btn.textContent.trim() };
    }, i);

    if (!clickInfo) continue;

    await new Promise((r) => setTimeout(r, 700));

    try {
      const axeResults = await new AxePuppeteer(page).withTags(tags).analyze();
      const screenshot = await screenshotPage(page, screenshotDir, i + 1, clickInfo.text, axeResults);
      results.push(buildPageResult(clickInfo.text, page.url(), axeResults, screenshot));
    } catch (error) {
      results.push({ page: clickInfo.text, error: error.message });
    }
  }
  return results;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReportHtml({ appId, wcagLevel, timestamp, summary, pages }) {
  const statusText = summary.status === 'PASS' ? 'BESTÅTT' : 'IKKE BESTÅTT';
  const pageCards = pages
    .map((p) => {
      if (p.error) {
        return `<section class="ds-card" style="margin-bottom:16px;">
          <h2 style="margin:0 0 8px;font-size:16px;">${escapeHtml(p.page)}</h2>
          <p style="color:var(--ds-color-danger-text-default);">Feil: ${escapeHtml(p.error)}</p>
        </section>`;
      }
      const details = p.details
        .map(
          (d) => `<div style="margin-bottom:10px;">
            <strong>${escapeHtml(d.id)}</strong> (${escapeHtml(d.impact)}) — ${escapeHtml(d.help)}, ${d.nodes} element(er)
            ${d.targets.map((t) => `<code style="display:block;background:var(--ds-color-neutral-surface-tinted);padding:3px 6px;border-radius:4px;margin-top:3px;font-size:12px;word-break:break-all;">${escapeHtml(t)}</code>`).join('')}
          </div>`
        )
        .join('');
      return `<section class="ds-card" style="margin-bottom:16px;">
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          ${p.screenshot ? `<a href="${encodeURIComponent(p.screenshot)}" target="_blank" rel="noopener"><img src="${encodeURIComponent(p.screenshot)}" alt="Skjermbilde av ${escapeHtml(p.page)}" style="width:220px;border:1px solid var(--ds-color-neutral-border-default);border-radius:6px;"></a>` : ''}
          <div style="flex:1;min-width:240px;">
            <h2 style="margin:0 0 8px;font-size:16px;">
              ${escapeHtml(p.page)}
              ${p.url ? ` <a class="ds-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">Åpne i appen ↗</a>` : ''}
            </h2>
            <p style="font-size:13px;color:var(--ds-color-neutral-text-subtle);margin:0 0 10px;">
              Bestått: ${p.passed} · Brudd: <strong style="color:${p.violations ? 'var(--ds-color-danger-text-default)' : 'inherit'}">${p.violations}</strong> · Kritisk: ${p.critical} · Ufullstendig: ${p.incomplete}
            </p>
            ${p.violations > 0 ? `<details><summary style="cursor:pointer;color:var(--ds-color-danger-text-default);font-weight:600;">Vis brudd</summary><div style="margin-top:10px;">${details}</div></details>` : ''}
          </div>
        </div>
      </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8" />
<title>WCAG-rapport — ${escapeHtml(appId)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="../../public/vendor/designsystemet/theme.css">
<link rel="stylesheet" href="../../public/vendor/designsystemet/components.css">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, var(--ds-font-family), sans-serif; background: var(--ds-color-neutral-background-default); color: var(--ds-color-neutral-text-default); }
  header { background: #003399; color: white; padding: 20px 28px; }
  header h1 { margin: 0; font-size: 20px; }
  header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
  main { max-width: 900px; margin: 24px auto; padding: 0 20px 60px; }
  .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
  .stat { flex: 1; min-width: 110px; background: var(--ds-color-neutral-surface-tinted); border-radius: var(--ds-border-radius-md); padding: 12px 16px; text-align: center; }
  .stat .n { font-size: 22px; font-weight: 700; }
  .stat .l { font-size: 12px; color: var(--ds-color-neutral-text-subtle); }
  .stat.fail .n { color: var(--ds-color-danger-text-default); }
  .stat.pass .n { color: var(--ds-color-success-text-default); }
  .stat.warn .n { color: var(--ds-color-warning-text-default); }
</style>
</head>
<body>
<header>
  <h1>WCAG-rapport: ${escapeHtml(appId)}</h1>
  <p>WCAG-nivå ${escapeHtml(wcagLevel)} · ${escapeHtml(new Date(timestamp).toLocaleString('no-NO'))}</p>
</header>
<main>
  <div class="summary">
    <div class="stat ${summary.status === 'PASS' ? 'pass' : 'fail'}"><div class="n">${statusText}</div><div class="l">Samlet resultat</div></div>
    <div class="stat"><div class="n">${pages.length}</div><div class="l">Sider skannet</div></div>
    <div class="stat pass"><div class="n">${summary.totalPassed}</div><div class="l">Beståtte sjekker</div></div>
    <div class="stat ${summary.totalViolations ? 'fail' : 'pass'}"><div class="n">${summary.totalViolations}</div><div class="l">Brudd</div></div>
    <div class="stat ${summary.totalCritical ? 'fail' : 'pass'}"><div class="n">${summary.totalCritical}</div><div class="l">Kritisk</div></div>
    <div class="stat warn"><div class="n">${summary.totalIncomplete}</div><div class="l">Trenger gjennomgang</div></div>
  </div>
  ${pageCards}
</main>
</body>
</html>`;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/reports', express.static(REPORTS_DIR));

app.get('/api/apps', (req, res) => {
  res.json({ apps: apps.map((a) => ({ id: a.id, label: a.label })), current: currentAppId });
});

app.post('/api/apps/:id/start', async (req, res) => {
  try {
    const appConfig = findApp(req.params.id);
    const result = await startApp(appConfig);
    res.json({
      status: 'started',
      app: appConfig.id,
      url: `${BASE_URL}/${appConfig.org}/${appConfig.appName}`,
      studioctl: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/apps/:id/scan', async (req, res) => {
  const wcagLevel = req.body?.wcagLevel || 'AA';
  const tags = WCAG_TAGS[wcagLevel] || WCAG_TAGS.AA;
  let browser;
  try {
    const appConfig = findApp(req.params.id);
    await startApp(appConfig);

    const timestamp = new Date().toISOString();
    const reportId = `${appConfig.id}-${timestamp.replace(/[:.]/g, '-')}`;
    const reportDir = path.join(REPORTS_DIR, reportId);
    fs.mkdirSync(reportDir, { recursive: true });

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    await loginAndReachInstance(page, appConfig);

    // The dev-frontend SPA loads as a large graph of unbundled ES module requests
    // on first hit (up to ~1000 for some apps); network-idle alone doesn't
    // guarantee React has mounted the page content yet. The document starts out
    // titled "<org> - <app>" (the server-rendered shell) and app-frontend always
    // retitles it once real content renders, so that's a reliable signal here.
    const loadingTitle = `${appConfig.org} - ${appConfig.appName}`;
    await page.waitForFunction((defaultTitle) => document.title !== defaultTitle, { timeout: 90000 }, loadingTitle);

    // Pill buttons for multi-page tasks can mount an instant after the title
    // change; give them a short grace window before deciding there are none.
    await page
      .waitForFunction(
        () => Array.from(document.querySelectorAll('button')).some((b) => /^\d+\.\s/.test(b.textContent.trim())),
        { timeout: 5000 }
      )
      .catch(() => {});

    const results = await discoverAndScanPages(page, tags, reportDir);

    const totalViolations = results.reduce((s, r) => s + (r.violations || 0), 0);
    const totalCritical = results.reduce((s, r) => s + (r.critical || 0), 0);
    const totalPassed = results.reduce((s, r) => s + (r.passed || 0), 0);
    const totalIncomplete = results.reduce((s, r) => s + (r.incomplete || 0), 0);
    const summary = {
      status: totalViolations === 0 ? 'PASS' : 'FAIL',
      totalViolations,
      totalCritical,
      totalPassed,
      totalIncomplete
    };

    const reportHtml = buildReportHtml({ appId: appConfig.id, wcagLevel, timestamp, summary, pages: results });
    fs.writeFileSync(path.join(reportDir, 'index.html'), reportHtml);
    fs.writeFileSync(
      path.join(reportDir, 'report.json'),
      JSON.stringify({ app: appConfig.id, wcagLevel, timestamp, summary, pages: results }, null, 2)
    );

    res.json({
      app: appConfig.id,
      wcagLevel,
      pagesScanned: results.length,
      summary,
      pages: results,
      report: { id: reportId, url: `/reports/${reportId}/index.html` },
      timestamp
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 4100;
const server = app.listen(PORT, () => {
  console.log(`WCAG Studio GUI running at http://localhost:${PORT}`);
});
server.timeout = 0;
