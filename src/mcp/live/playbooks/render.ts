import type { Playbook } from "./index.js";

// DATA only. Used when no RENDER API token resolves (browser-fallback). The
// snippet navigates to the billing page and reads the rendered dollar total —
// read-only navigation, no clicks/typing/forms, no cookies/storage/screenshots.
export const renderPlaybook: Playbook = {
  billingUrl: "https://dashboard.render.com/billing",
  readOnlySnippet: [
    "await page.goto('https://dashboard.render.com/billing', { waitUntil: 'networkidle' });",
    "const monthlyTotal = await page.getByText(/\\$[0-9,.]+/).first().innerText();",
    "return { monthlyTotal };",
  ].join("\n"),
  parseSpec: {
    fields: [
      {
        name: "monthlyTotal",
        selectorHint: "current month-to-date charges shown on the billing page",
        kind: "currency",
      },
    ],
    monthlyUsdField: "monthlyTotal",
  },
};
