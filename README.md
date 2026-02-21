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
├── tsconfig.json          Root configs referencing isolated UI/Plugin configs
├── webpack.config.js      Webpack config building UI + Plugin separately
└── src/
    ├── plugin/
    │   └── code.ts        Figma sandbox side — executes API, layout checks, ghost rendering
    └── ui/
        ├── index.html     HTML shell (Webpack inlines JS + CSS into this)
        ├── index.tsx      React 18 application entry
        ├── styles.css     Dark theme, vanilla CSS
        ├── lingoClient.ts Lingo.dev REST API wrapper
        └── overflowDetector.ts  Mathematical bounding utility
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

1. Enter your Lingo.dev API key (get one at https://app.lingo.dev/settings/api). Once entered, it will be securely saved across sessions using local client storage.
2. Select the target locales you want to audit.
3. Optionally select a frame — otherwise the entire page is scanned.
4. Click **Scan for Overflows**.
5. Overflow nodes are highlighted red on the canvas.
6. Use the filter dropdowns to narrow results by locale or severity.
7. Click any result card to jump to that node in Figma.
8. Click **Reset and Rescan** to clear highlights and safely restore original layer strokes/styles.

## Development Watch Mode

```bash
npm run dev
```

Webpack will watch for changes. Reload the plugin in Figma to pick them up.

## Architecture & Technical Notes

- **Figma Sandbox Boundaries**: `src/plugin/code.ts` runs in Figma's sandboxed JS runtime. It has access to the Figma API but has no fetch, no DOM, no browser APIs. All external network calls via Lingo.dev happen asynchronously in the UI iframe.
- **Inlined Assets**: The build produces a **single self-contained `dist/ui.html`** using a custom Webpack hook that automatically rips and embeds scripts. Figma loads plugin UIs from disk and cannot resolve relative file references.
- **Ghost Rendering & Pixel-Perfect Overflows**: Instead of guessing text bounding boxes heavily using math characteristics, the sandbox physically clones text nodes via Ghost Rendering, swaps translations into them utilizing Figma's native multi-threading fonts loader, and checks exact dimension overflows to provide 100% pixel-perfect accuracy.
- **Parent Layout Constraints**: Detects constraint limitations of text nodes bound inside Auto Layout frames alongside respecting `textAutoResize` scaling restrictions, so infinite-width expansions without layout breaks aren't wrongly flagged.
- **Client Storage**: The user API key is securely encrypted inside Figma's local `clientStorage` ensuring seamless reuse without needing manual keystroke rebinding every session.
- **Safe State Reversions**: LingoAudit caches original layout properties including `strokes`, `strokeWeight`, and `strokeAlign` via `PluginData` payloads globally, to avoid data loss on text layers when highlights are cleared.

## Supported Locales

German, French, Japanese, Arabic (RTL), Spanish, Portuguese, Hindi, Russian, Korean, Chinese.

RTL locales (Arabic, Hebrew, Farsi, Urdu, Yiddish) automatically receive an RTL badge and the translated text is rendered right-to-left dynamically inside the interface result cards.
