const express = require('express');
const redis = require('redis');
const { testComponent } = require('./wcag-tester');

const app = express();
app.use(express.json());

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'wcag-testing-agent',
    timestamp: new Date().toISOString()
  });
});

// Test component endpoint
app.post('/test', async (req, res) => {
  const { component, wcagLevel = 'AA', scenarios = [] } = req.body;

  try {
    const testId = `wcag-${Date.now()}`;
    const results = await testComponent({
      component,
      wcagLevel,
      scenarios,
      testId
    });

    res.json({
      testId,
      status: 'completed',
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

const PORT = process.env.SERVER_PORT || 3000;
app.listen(PORT, () => {
  console.log(`WCAG Testing Agent running on port ${PORT}`);
});
