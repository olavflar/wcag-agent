const path = require('path');
const net = require('net');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const puppeteer = require('puppeteer');
const { AxePuppeteer } = require('@axe-core/puppeteer');

const apps = require('./apps.json');

const execFileAsync = promisify(execFile);

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

function buildPageResult(label, url, axeResults) {
  const critical = axeResults.violations.filter((v) => v.impact === 'critical').length;
  return {
    page: label,
    url,
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

async function discoverAndScanPages(page, tags) {
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
      results.push(buildPageResult(title, page.url(), axeResults));
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
      results.push(buildPageResult(clickInfo.text, page.url(), axeResults));
    } catch (error) {
      results.push({ page: clickInfo.text, error: error.message });
    }
  }
  return results;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

    const results = await discoverAndScanPages(page, tags);

    const totalViolations = results.reduce((s, r) => s + (r.violations || 0), 0);
    const totalCritical = results.reduce((s, r) => s + (r.critical || 0), 0);
    const totalPassed = results.reduce((s, r) => s + (r.passed || 0), 0);
    const totalIncomplete = results.reduce((s, r) => s + (r.incomplete || 0), 0);

    res.json({
      app: appConfig.id,
      wcagLevel,
      pagesScanned: results.length,
      summary: {
        status: totalViolations === 0 ? 'PASS' : 'FAIL',
        totalViolations,
        totalCritical,
        totalPassed,
        totalIncomplete
      },
      pages: results,
      timestamp: new Date().toISOString()
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
