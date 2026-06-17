import type { Playbook } from "./index.js";

// DATA only. Used when no VERCEL API token resolves (browser-fallback). The
// snippet navigates to the billing page and reads the rendered dollar total —
// read-only navigation, no clicks/typing/forms, no cookies/storage/screenshots.
export const vercelPlaybook: Playbook = {
  billingUrl: "https://vercel.com/account/billing",
  readOnlySnippet: [
    "await page.goto('https://vercel.com/account/billing', { waitUntil: 'networkidle' });",
    "const monthlyTotal = await page.getByText(/\\$[0-9,.]+/).first().innerText();",
    "return { monthlyTotal };",
  ].join("\n"),
  parseSpec: {
    fields: [
      {
        name: "monthlyTotal",
        selectorHint: "current billing-period total amount shown on the billing page",
        kind: "currency",
      },
    ],
    monthlyUsdField: "monthlyTotal",
  },
};
