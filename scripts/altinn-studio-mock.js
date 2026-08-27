const express = require('express');
const app = express();

// Mock Altinn Studio API
app.get('/test-app/:component/:scenario', (req, res) => {
  const { component, scenario } = req.params;

  const html = `
    <!DOCTYPE html>
    <html lang="no">
      <head>
        <title>Test: ${component}</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background: #f9f9f9;
          }
          h1 { color: #003399; margin-bottom: 20px; }
          .component-box {
            background: white;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 4px;
          }
          label { display: block; margin-bottom: 5px; font-weight: bold; }
          input, button {
            padding: 8px 12px;
            font-size: 14px;
            border: 1px solid #ccc;
            border-radius: 3px;
          }
          button { background: #003399; color: white; cursor: pointer; }
          button:hover { background: #002266; }
          .error { color: #d32f2f; margin-top: 5px; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Test: ${component} (${scenario})</h1>
        <div class="component-box">
          ${getComponentHTML(component, scenario)}
        </div>
      </body>
    </html>
  `;

  res.send(html);
});

function getComponentHTML(component, scenario) {
  if (component === 'TextInput') {
    if (scenario === 'basic') {
      return `
        <label for="email">Email Address</label>
        <input id="email" type="email" placeholder="Enter your email">
      `;
    }
    if (scenario === 'with-error') {
      return `
        <label for="username">Username</label>
        <input id="username" type="text" aria-invalid="true" aria-describedby="error">
        <div id="error" role="alert" class="error">Username is required</div>
      `;
    }
  }

  if (component === 'Button') {
    if (scenario === 'basic') {
      return `<button>Click me</button>`;
    }
    if (scenario === 'with-icon') {
      return `<button>📝 Submit Form</button>`;
    }
  }

  return `<p>Test component for ${component} - ${scenario}</p>`;
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Altinn Studio Mock running on port ${PORT}`);
});
