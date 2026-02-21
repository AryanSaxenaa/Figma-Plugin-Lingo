# LingoAudit — i18n Design Auditor

A Figma plugin that catches i18n text overflow problems before any code is written.

Designers mock up UIs in English. When developers translate them to German, Japanese, or Arabic,
text overflows buttons, breaks layouts, and RTL languages flip the entire UI. LingoAudit
catches those issues inside Figma in real-time using the Lingo.dev translation API.

## Prerequisites

- Node.js 18+
- npm 9+
- A [Lingo.dev](https://app.lingo.dev) account with an API key

## Project Structure

```
lingo-audit-figma/
├── manifest.json          Figma plugin manifest
├── package.json
├── tsconfig.json
├── webpack.config.js
└── src/
    ├── plugin/
    │   └── code.ts        Figma sandbox side — no fetch, no DOM
    └── ui/
        ├── index.html     HTML shell (Webpack inlines JS + CSS into this)
        ├── index.tsx      React 18 application entry
        ├── styles.css     Dark theme, vanilla CSS
        ├── lingoClient.ts Lingo.dev REST API wrapper
        └── overflowDetector.ts  Pure-math overflow engine
```

## Setup

```bash
npm install
npm run build
```

## Loading in Figma

1. Open Figma Desktop.
2. Go to **Plugins > Development > Import plugin from manifest...**.
3. Select the `manifest.json` file from this directory.
4. Run via **Plugins > Development > LingoAudit**.

## Usage

1. Enter your Lingo.dev API key (get one at https://app.lingo.dev/settings/api).
2. Select the target locales you want to audit.
3. Optionally select a frame — otherwise the entire page is scanned.
4. Click **Scan for Overflows**.
5. Overflow nodes are highlighted red on the canvas.
6. Use the filter dropdowns to narrow results by locale or severity.
7. Click any result card to jump to that node in Figma.
8. Click **Reset and Rescan** to clear highlights and start again.

## Development Watch Mode

```bash
npm run dev
```

Webpack will watch for changes. Reload the plugin in Figma to pick them up.

## Architecture Notes

- `src/plugin/code.ts` runs in Figma's sandboxed JS runtime. It has access to the Figma
  API but has **no fetch, no DOM, no browser APIs**. All network calls happen in the UI iframe.
- `src/ui/` runs inside an iframe. It uses `postMessage` to communicate with the plugin sandbox.
- The build produces a **single self-contained `dist/ui.html`** with all JS and CSS inlined.
  Figma loads plugin UIs from disk and cannot resolve relative file references.
- No API keys are ever stored or hardcoded. The user supplies the key at runtime via the UI,
  and it exists only in React component state for the lifetime of the plugin session.

## Supported Locales

German, French, Japanese, Arabic (RTL), Spanish, Portuguese, Hindi, Russian, Korean, Chinese.

RTL locales (Arabic, Hebrew, Farsi, Urdu, Yiddish) automatically receive an RTL badge and
the translated text is rendered with `dir="rtl"` in the result cards.
