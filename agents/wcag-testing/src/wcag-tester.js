const puppeteer = require('puppeteer');
const { AxePuppeteer } = require('@axe-core/puppeteer');

const WCAG_TAGS = {
  A: ['wcag2a', 'wcag21a'],
  AA: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  AAA: ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa']
};

async function testComponent(options) {
  const { component, wcagLevel, scenarios, testId } = options;
  const baseUrl = process.env.ALTINN_STUDIO_URL || 'http://localhost:3002';
  const tags = WCAG_TAGS[wcagLevel] || WCAG_TAGS.AA;

  const results = {
    testId,
    component,
    wcagLevel,
    timestamp: new Date().toISOString(),
    scenarios: []
  };

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_BIN,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    for (const scenario of scenarios) {
      const url = `${baseUrl}/test-app/${encodeURIComponent(component)}/${encodeURIComponent(scenario)}`;
      const page = await browser.newPage();

      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });

        const axeResults = await new AxePuppeteer(page).withTags(tags).analyze();
        const critical = axeResults.violations.filter((v) => v.impact === 'critical').length;

        results.scenarios.push({
          scenario,
          passed: axeResults.passes.length,
          violations: axeResults.violations.length,
          incomplete: axeResults.incomplete.length,
          critical,
          details: axeResults.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: v.nodes.length
          }))
        });
      } catch (error) {
        results.scenarios.push({
          scenario,
          error: error.message,
          passed: 0,
          violations: 0,
          incomplete: 0,
          critical: 0,
          details: []
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  const totalViolations = results.scenarios.reduce((sum, s) => sum + s.violations, 0);
  const criticalViolations = results.scenarios.reduce((sum, s) => sum + s.critical, 0);

  results.summary = {
    status: totalViolations === 0 ? 'PASS' : 'FAIL',
    totalViolations,
    criticalViolations,
    scenariosRun: scenarios.length
  };

  return results;
}

module.exports = { testComponent };
