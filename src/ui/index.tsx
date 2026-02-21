import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { translateBatch, RTL_LOCALES, SUPPORTED_LOCALES } from "./lingoClient";
import { estimateOverflow, getOverflowSeverity } from "./overflowDetector";

// ---------------------------------------------------------------------------
// Shared types (intentionally NOT imported from Figma typings)
// ---------------------------------------------------------------------------

interface TextNodeInfo {
    id: string;
    name: string;
    originalText: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    parentName: string;
    textAutoResize: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE";
}

interface AuditResult {
    nodeId: string;
    nodeName: string;
    originalText: string;
    locale: string;
    translatedText: string;
    isOverflow: boolean;
    overflowAmount: number;
    overflowPercent: number;
    isRTL: boolean;
    parentName: string;
    severity: "none" | "warning" | "critical";
}

type Step = "setup" | "scanning" | "results";
type SeverityFilter = "all" | "warning" | "critical";

// ---------------------------------------------------------------------------
// Helper: send a message to the Figma plugin sandbox
// ---------------------------------------------------------------------------

function sendToPlugin(message: Record<string, unknown>): void {
    parent.postMessage({ pluginMessage: message }, "*");
}

// ---------------------------------------------------------------------------
// Main application component
// ---------------------------------------------------------------------------

function App(): React.ReactElement {
    const [apiKey, setApiKey] = useState<string>("");
    const [selectedLocales, setSelectedLocales] = useState<string[]>(["de", "ja", "ar"]);
    const [step, setStep] = useState<Step>("setup");
    const [results, setResults] = useState<AuditResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ current: number; total: number; locale: string }>({
        current: 0,
        total: 0,
        locale: "",
    });
    const [filterLocale, setFilterLocale] = useState<string>("all");
    const [filterSeverity, setFilterSeverity] = useState<SeverityFilter>("all");

    // -------------------------------------------------------------------------
    // Receive messages from the plugin sandbox
    // -------------------------------------------------------------------------

    useEffect(() => {
        window.onmessage = (event: MessageEvent) => {
            const msg = event.data?.pluginMessage;
            if (!msg) return;

            if (msg.type === "SCAN_RESULT") {
                runAudit(msg.nodes as TextNodeInfo[]);
            }

            if (msg.type === "API_KEY_LOADED" && msg.apiKey) {
                setApiKey(msg.apiKey as string);
            }
        };

        return () => {
            window.onmessage = null;
        };
    }, [apiKey, selectedLocales]); // re-bind when these change so the closure has fresh values

    // -------------------------------------------------------------------------
    // Scan trigger
    // -------------------------------------------------------------------------

    function handleScan(): void {
        if (!apiKey.trim()) {
            setError("API key is required. Enter your Lingo.dev API key to continue.");
            return;
        }

        if (selectedLocales.length === 0) {
            setError("Select at least one target locale to audit.");
            return;
        }

        setError(null);
        setStep("scanning");
        sendToPlugin({ type: "SAVE_API_KEY", apiKey: apiKey.trim() });
        sendToPlugin({ type: "SCAN_FRAME" });
    }

    // -------------------------------------------------------------------------
    // Core audit logic — translate every text node for every selected locale
    // -------------------------------------------------------------------------

    async function runAudit(nodes: TextNodeInfo[]): Promise<void> {
        if (nodes.length === 0) {
            setError("No text layers found. Select a frame or ensure the page has text.");
            setStep("setup");
            return;
        }

        const texts = nodes.map((n) => n.originalText);
        const allResults: AuditResult[] = [];

        for (let i = 0; i < selectedLocales.length; i++) {
            const locale = selectedLocales[i];
            const localeInfo = SUPPORTED_LOCALES.find((l) => l.code === locale);

            setProgress({
                current: i + 1,
                total: selectedLocales.length,
                locale: localeInfo ? `${localeInfo.flag} ${localeInfo.label}` : locale,
            });

            let translations: string[];

            try {
                translations = await translateBatch(apiKey, texts, "en", locale);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Translation failed.");
                setStep("setup");
                return;
            }

            const isRTL = RTL_LOCALES.has(locale);

            nodes.forEach((node, index) => {
                const translatedText = translations[index] ?? node.originalText;

                const overflow = estimateOverflow(
                    node.originalText,
                    translatedText,
                    node.width,
                    node.height,
                    node.fontSize,
                    locale,
                    node.textAutoResize
                );

                const severity = getOverflowSeverity(overflow.overflowPercent);

                allResults.push({
                    nodeId: node.id,
                    nodeName: node.name,
                    originalText: node.originalText,
                    locale,
                    translatedText,
                    isOverflow: overflow.isOverflow,
                    overflowAmount: overflow.overflowAmount,
                    overflowPercent: overflow.overflowPercent,
                    isRTL,
                    parentName: node.parentName,
                    severity,
                });
            });
        }

        sendToPlugin({ type: "APPLY_TRANSLATIONS", results: allResults });
        setResults(allResults);
        setStep("results");
    }

    // -------------------------------------------------------------------------
    // Misc helpers
    // -------------------------------------------------------------------------

    function toggleLocale(code: string): void {
        setSelectedLocales((prev) =>
            prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
        );
    }

    function focusNode(nodeId: string): void {
        sendToPlugin({ type: "FOCUS_NODE", nodeId });
    }

    function resetAndRescan(): void {
        sendToPlugin({ type: "RESET_HIGHLIGHTS" });
        setResults([]);
        setFilterLocale("all");
        setFilterSeverity("all");
        setStep("setup");
    }

    // -------------------------------------------------------------------------
    // Computed derived values
    // -------------------------------------------------------------------------

    const overflowResults = results.filter((r) => r.isOverflow);

    const filteredResults = overflowResults.filter((r) => {
        const localeMatch = filterLocale === "all" || r.locale === filterLocale;
        const severityMatch =
            filterSeverity === "all" || r.severity === filterSeverity;
        return localeMatch && severityMatch;
    });

    const overflowCount = overflowResults.length;
    const criticalCount = results.filter((r) => r.severity === "critical").length;
    const safeCount = results.filter((r) => !r.isOverflow).length;

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    return (
        <div className="app">
            <header className="header">
                <div className="header-title">LingoAudit</div>
                <div className="header-subtitle">i18n Design Auditor</div>
            </header>

            <main className="main">
                {step === "setup" && (
                    <SetupView
                        apiKey={apiKey}
                        onApiKeyChange={setApiKey}
                        selectedLocales={selectedLocales}
                        onToggleLocale={toggleLocale}
                        onScan={handleScan}
                        error={error}
                    />
                )}

                {step === "scanning" && (
                    <ScanningView
                        current={progress.current}
                        total={progress.total}
                        locale={progress.locale}
                    />
                )}

                {step === "results" && (
                    <ResultsView
                        overflowCount={overflowCount}
                        criticalCount={criticalCount}
                        safeCount={safeCount}
                        selectedLocales={selectedLocales}
                        filterLocale={filterLocale}
                        filterSeverity={filterSeverity}
                        onFilterLocaleChange={setFilterLocale}
                        onFilterSeverityChange={setFilterSeverity}
                        filteredResults={filteredResults}
                        onFocusNode={focusNode}
                        onReset={resetAndRescan}
                    />
                )}
            </main>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Setup view
// ---------------------------------------------------------------------------

interface SetupViewProps {
    apiKey: string;
    onApiKeyChange: (v: string) => void;
    selectedLocales: string[];
    onToggleLocale: (code: string) => void;
    onScan: () => void;
    error: string | null;
}

function SetupView({
    apiKey,
    onApiKeyChange,
    selectedLocales,
    onToggleLocale,
    onScan,
    error,
}: SetupViewProps): React.ReactElement {
    return (
        <div className="setup-view">
            <section className="section">
                <label className="label" htmlFor="api-key-input">
                    Lingo.dev API Key
                </label>
                <input
                    id="api-key-input"
                    type="password"
                    className="input"
                    placeholder="lingo_live_xxxx"
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                />
                <a
                    className="api-link"
                    href="https://app.lingo.dev/settings/api"
                    target="_blank"
                    rel="noreferrer"
                >
                    Get your API key
                </a>
            </section>

            <section className="section">
                <div className="label">Target Locales</div>
                <div className="locale-grid">
                    {SUPPORTED_LOCALES.map((locale) => {
                        const isSelected = selectedLocales.includes(locale.code);
                        const isRTL = RTL_LOCALES.has(locale.code);
                        return (
                            <button
                                key={locale.code}
                                id={`locale-chip-${locale.code}`}
                                className={[
                                    "locale-chip",
                                    isSelected ? "locale-chip--selected" : "",
                                    isSelected && isRTL ? "locale-chip--rtl" : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                onClick={() => onToggleLocale(locale.code)}
                                type="button"
                            >
                                <span className="locale-chip__flag">{locale.flag}</span>
                                <span className="locale-chip__label">{locale.label}</span>
                                {isRTL && <span className="rtl-badge">RTL</span>}
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className="tip-box">
                Select a frame in Figma before scanning, or leave nothing selected to
                scan the entire page.
            </div>

            {error && <div className="error-box">{error}</div>}

            <button
                id="scan-button"
                className="btn btn--primary"
                onClick={onScan}
                type="button"
            >
                Scan for Overflows
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Scanning view
// ---------------------------------------------------------------------------

interface ScanningViewProps {
    current: number;
    total: number;
    locale: string;
}

function ScanningView({ current, total, locale }: ScanningViewProps): React.ReactElement {
    const pct = total > 0 ? (current / total) * 100 : 0;

    return (
        <div className="scanning-view">
            <div className="spinner" />
            <p className="scanning-status">
                Translating locale {current} of {total}
            </p>
            <p className="scanning-locale">{locale}</p>
            <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Results view
// ---------------------------------------------------------------------------

interface ResultsViewProps {
    overflowCount: number;
    criticalCount: number;
    safeCount: number;
    selectedLocales: string[];
    filterLocale: string;
    filterSeverity: SeverityFilter;
    onFilterLocaleChange: (v: string) => void;
    onFilterSeverityChange: (v: SeverityFilter) => void;
    filteredResults: AuditResult[];
    onFocusNode: (id: string) => void;
    onReset: () => void;
}

function ResultsView({
    overflowCount,
    criticalCount,
    safeCount,
    selectedLocales,
    filterLocale,
    filterSeverity,
    onFilterLocaleChange,
    onFilterSeverityChange,
    filteredResults,
    onFocusNode,
    onReset,
}: ResultsViewProps): React.ReactElement {
    return (
        <div className="results-view">
            <div className="summary-row">
                <div className="summary-card summary-card--overflow">
                    <div className="summary-card__count">{overflowCount}</div>
                    <div className="summary-card__label">Overflows</div>
                </div>
                <div className="summary-card summary-card--critical">
                    <div className="summary-card__count">{criticalCount}</div>
                    <div className="summary-card__label">Critical</div>
                </div>
                <div className="summary-card summary-card--safe">
                    <div className="summary-card__count">{safeCount}</div>
                    <div className="summary-card__label">Safe</div>
                </div>
            </div>

            <div className="filter-row">
                <select
                    id="filter-locale"
                    className="select"
                    value={filterLocale}
                    onChange={(e) => onFilterLocaleChange(e.target.value)}
                >
                    <option value="all">All Locales</option>
                    {selectedLocales.map((code) => {
                        const info = SUPPORTED_LOCALES.find((l) => l.code === code);
                        return (
                            <option key={code} value={code}>
                                {info ? `${info.flag} ${info.label}` : code}
                            </option>
                        );
                    })}
                </select>

                <select
                    id="filter-severity"
                    className="select"
                    value={filterSeverity}
                    onChange={(e) =>
                        onFilterSeverityChange(e.target.value as SeverityFilter)
                    }
                >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical only</option>
                    <option value="warning">Warning only</option>
                </select>
            </div>

            <div className="results-list">
                {filteredResults.length === 0 ? (
                    <div className="no-results">No overflows detected for selected filters.</div>
                ) : (
                    filteredResults.map((result, index) => (
                        <ResultCard
                            key={`${result.nodeId}-${result.locale}-${index}`}
                            result={result}
                            onClick={() => onFocusNode(result.nodeId)}
                        />
                    ))
                )}
            </div>

            <button
                id="reset-button"
                className="btn btn--secondary"
                onClick={onReset}
                type="button"
            >
                Reset &amp; Rescan
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Individual result card
// ---------------------------------------------------------------------------

interface ResultCardProps {
    result: AuditResult;
    onClick: () => void;
}

function ResultCard({ result, onClick }: ResultCardProps): React.ReactElement {
    const localeInfo = SUPPORTED_LOCALES.find((l) => l.code === result.locale);
    const displayName = localeInfo ? `${localeInfo.flag} ${localeInfo.label}` : result.locale;

    const severityClass =
        result.severity === "critical"
            ? "result-card--critical"
            : "result-card--warning";

    const badgeClass =
        result.severity === "critical"
            ? "severity-badge--critical"
            : "severity-badge--warning";

    const pct = Math.min(Math.abs(result.overflowPercent), 100);

    return (
        <div
            className={`result-card ${severityClass}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onClick()}
        >
            <div className="result-card__header">
                <span className="result-card__locale">{displayName}</span>
                <span className="result-card__badges">
                    <span className={`severity-badge ${badgeClass}`}>
                        {result.severity === "critical" ? "Critical" : "Warning"}
                    </span>
                    {result.isRTL && <span className="rtl-badge">RTL</span>}
                </span>
            </div>

            <div className="result-card__path">
                {result.parentName} &rarr; {result.nodeName}
            </div>

            <div className="result-card__text">
                <span className="text-original">&ldquo;{result.originalText}&rdquo;</span>
                <span className="text-arrow"> &rarr; </span>
                <span
                    className="text-translated"
                    dir={result.isRTL ? "rtl" : "ltr"}
                >
                    &ldquo;{result.translatedText}&rdquo;
                </span>
            </div>

            <div className="overflow-bar-wrap">
                <div className="overflow-bar">
                    <div
                        className={`overflow-fill ${result.severity === "critical" ? "overflow-fill--critical" : "overflow-fill--warning"}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <span className="overflow-label">+{result.overflowPercent.toFixed(1)}% overflow</span>
            </div>

            <div className="result-card__hint">Click to select in Figma</div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(<App />);
