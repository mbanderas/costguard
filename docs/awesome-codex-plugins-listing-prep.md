# Prep a repo for an `awesome-codex-plugins` listing

A portable checklist for getting any Codex plugin repo (e.g. Maestro) listed in
[`internet-dot`/`hashgraph-online` **awesome-codex-plugins**](https://github.com/hashgraph-online/awesome-codex-plugins).
Listing is **gated**: a maintainer-run CI validates every PR and the repo must
pass the HOL AI Plugin Scanner. A bare README line will be bounced.

Replace every `<owner>`, `<repo>`, `<Plugin Name>`, `<brand-hex>` placeholder.

---

## The gate (hard requirements)

| Requirement | Threshold |
|-------------|-----------|
| HOL scanner score | **≥ 80 / 130** |
| Findings | **No critical or high severity** |
| Scanner in CI | Workflow must run in the plugin repo's GitHub Actions (main/master) |
| PR description | Must cite the score or link the passing CI run |

Source of truth: the target repo's `CONTRIBUTING.md` and `SCANNER_GUIDE.md`.
Re-read them before submitting — thresholds and required files drift.

---

## Part A — Make the plugin repo gate-ready

### 1. Required files at repo root

- [ ] `.codex-plugin/plugin.json` — valid manifest (see §2)
- [ ] `SECURITY.md` — vulnerability disclosure policy (template §3)
- [ ] `LICENSE` — MIT or Apache-2.0 recommended
- [ ] `README.md` — clear description of what the plugin does
- [ ] Dependency lockfile (`pnpm-lock.yaml` / `package-lock.json` / equivalent)
- [ ] `assets/icon.png` (or `.svg`) — 512×512, distinctive, < 50KB (§4)

### 2. `plugin.json` required fields

```json
{
  "name": "<repo>",
  "version": "1.0.0",
  "description": "What this plugin does",
  "repository": "https://github.com/<owner>/<repo>",
  "license": "MIT",
  "interface": {
    "displayName": "<Plugin Name>",
    "shortDescription": "Brief one-liner",
    "composerIcon": "./assets/icon.png"
  }
}
```

`composerIcon` is **required** and must resolve to a file that exists. `name`
must be kebab-case; `version` must be valid semver.

### 3. `SECURITY.md` template

```markdown
# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately. Do not open a public issue.

- Preferred: open a private security advisory at
  https://github.com/<owner>/<repo>/security/advisories/new
- Alternative: email <contact-email> with the details.

Include a description + impact, reproduction steps, and affected versions.
Expect an acknowledgement within 5 business days.

## Supported Versions

The latest published release receives security updates.
```

### 4. The 512×512 icon

The scanner / PR checks require an icon the `composerIcon` path points at. SVG is
preferred, PNG accepted. Must read clearly at 32×32, no text-heavy designs,
< 50KB. Generate one with an image model, then drop it at `assets/icon.png`.

**Image-gen prompt template** (tune to your brand):

> A 512×512 app icon for "<Plugin Name>". Style: glossy 3D render / soft
> claymation, studio lighting — matching the project's existing banner art.
> Subject: <single recognizable mascot or motif>. Palette: <brand-hex> as the
> dominant color, plus <secondary colors>. Centered composition with generous
> padding, rounded-square icon silhouette, solid or transparent background, NO
> text. Simple and distinctive — must stay legible shrunk to 32×32 pixels.

### 5. SHA-pin every GitHub Action

The scanner's Operational Security score rewards commit-pinned actions. Replace
`@vN` tags with the tag's commit SHA (keep the version in a trailing comment).
Resolve a SHA with:

```bash
git ls-remote --tags https://github.com/<org>/<action> <tag>
```

```yaml
# before
- uses: actions/checkout@v4
# after
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

Do this in **all** workflow files (CI, publish/release, etc.).

### 6. Add the scanner workflow

Create `.github/workflows/hol-plugin-scanner.yml`:

```yaml
name: HOL Plugin Scanner

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

permissions:
  contents: read
  security-events: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - name: HOL Plugin Scanner
        uses: hashgraph-online/ai-plugin-scanner-action@v1
        with:
          plugin_dir: "."
          mode: scan
          min_score: 80
          fail_on_severity: high
          format: sarif
          upload_sarif: true
```

Push to `main`/`master`, let it run, and copy the run URL + score for the PR.

### 7. Get the score

Easiest path: read it from the scanner CI run above. Local run:

```bash
pipx install plugin-scanner
plugin-scanner scan . --format text
```

> **Windows gotcha:** `pip install plugin-scanner` can fail on the bundled
> `litellm` dependency (path exceeds `MAX_PATH`). Either enable Win32 long
> paths, run it under WSL/Linux, or just rely on the GitHub Actions run for the
> score.

If under 80, the rubric below shows where points live.

---

## Part B — The submission PR to `awesome-codex-plugins`

Their CI auto-checks all of this:

1. **README line** — one sentence, alphabetical within its category section
   (**Development & Workflow** or **Tools & Integrations**). Match the file's
   existing bullet style:

   ```markdown
   - [<Plugin Name>](https://github.com/<owner>/<repo>) - One sentence.
   ```

2. **Plugin bundle** under `plugins/<owner>/<repo>/`:

   ```
   plugins/<owner>/<repo>/
     .codex-plugin/plugin.json
     assets/icon.svg          # or icon.png
     ...                      # skills/commands etc.
   ```

3. **Manifest sync** — add the entry to both `plugins.json` and
   `.agents/plugins/marketplace.json` (maintainers can help if unsure).

4. **PR description** — include the scanner score or link the passing CI run.

5. **One plugin per PR.**

Flow: fork → branch → add the four items above → open PR. The maintainer's CI
checks alphabetical order, manifest fields, icon presence, marketplace sync,
link reachability, and the scanner evidence.

---

## Scanner score rubric (130 pts; aim ≥ 80)

| Category | Max | What it checks |
|----------|-----|----------------|
| Manifest Validation | 31 | valid `plugin.json`, required fields, semver, kebab-case |
| Security | 36 | `SECURITY.md`, `LICENSE`, no secrets, hardened MCP remotes |
| Operational Security | 20 | SHA-pinned Actions, no `write-all`, Dependabot, lockfiles |
| Best Practices | 15 | `README.md`, skills dir, `SKILL.md` frontmatter, `.codexignore` |
| Marketplace | 15 | valid `marketplace.json`, safe source paths |
| Skill Security | 15 | clean scan, no elevated findings, analyzable |
| Code Quality | 10 | no `eval`/`new Function`, no shell injection |

Cheap point gains if short: add `.github/dependabot.yml`, SHA-pin all actions,
ensure `SECURITY.md` + `LICENSE` present, add a lockfile.

---

## Quick checklist

**Plugin repo:**
- [ ] `SECURITY.md`, `LICENSE`, `README.md`, lockfile present
- [ ] `.codex-plugin/plugin.json` valid + `interface.composerIcon` set
- [ ] `assets/icon.png` (512²) exists at the `composerIcon` path
- [ ] all GitHub Actions SHA-pinned
- [ ] `hol-plugin-scanner.yml` added, CI green on main/master, score ≥ 80
- [ ] no critical/high findings

**Submission PR:**
- [ ] README entry, alphabetical, single sentence
- [ ] bundle under `plugins/<owner>/<repo>/` with manifest + icon
- [ ] entries added to `plugins.json` + `.agents/plugins/marketplace.json`
- [ ] PR body cites the scanner score / CI run
