// Figma sandbox runtime — NO fetch, NO DOM, NO React.
// All network calls happen in the UI iframe (src/ui/).
// Communication with the UI goes through figma.ui.postMessage / figma.ui.onmessage.

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

figma.showUI(__html__, {
    width: 480,
    height: 600,
    title: "LingoAudit \u2014 i18n Design Auditor",
});

figma.clientStorage.getAsync("apiKey").then((apiKey) => {
    if (apiKey) {
        figma.ui.postMessage({ type: "API_KEY_LOADED", apiKey });
    }
});

let lastScannedRootIds: string[] = [];

function walkTextNodes(node: SceneNode, collector: TextNode[]): void {
    if (node.type === "TEXT") {
        collector.push(node);
        return;
    }
    if ("children" in node) {
        for (const child of node.children) {
            walkTextNodes(child, collector);
        }
    }
}

// --- Font & Text Formatting Helpers ---

const fallbackFont: FontName = { family: "Inter", style: "Regular" };
const loadedFonts = new Map<string, boolean>();

async function ensureFontLoaded(font: FontName): Promise<boolean> {
    const key = JSON.stringify(font);
    if (loadedFonts.has(key)) return loadedFonts.get(key) as boolean;
    try {
        await figma.loadFontAsync(font);
        loadedFonts.set(key, true);
        return true;
    } catch (e) {
        loadedFonts.set(key, false);
        return false;
    }
}

async function prepareFontsForNodes(nodes: TextNode[]): Promise<void> {
    const fontsSet = new Set<string>();
    for (const node of nodes) {
        if (node.hasMissingFont) {
            fontsSet.add(JSON.stringify(fallbackFont));
        }
        if (node.fontName === figma.mixed) {
            const len = node.characters.length;
            for (let i = 0; i < len; i++) {
                const f = node.getRangeFontName(i, i + 1);
                if (f !== figma.mixed) fontsSet.add(JSON.stringify(f));
            }
        } else {
            fontsSet.add(JSON.stringify(node.fontName));
        }
    }

    fontsSet.add(JSON.stringify(fallbackFont));

    const promises = Array.from(fontsSet).map(async (fStr) => {
        const font = JSON.parse(fStr) as FontName;
        await ensureFontLoaded(font);
    });

    await Promise.all(promises);
}

function applyTextWithMixedStyles(node: TextNode, newText: string): void {
    const originalLen = node.characters.length;
    const newLen = newText.length;

    if (originalLen === 0 || newLen === 0) {
        if (node.hasMissingFont) node.fontName = fallbackFont;
        node.characters = newText;
        return;
    }

    const isMixedFont = node.fontName === figma.mixed;
    const isMixedSize = node.fontSize === figma.mixed;
    const isMixedFills = node.fills === figma.mixed;

    if (!isMixedFont && !isMixedSize && !isMixedFills) {
        if (node.hasMissingFont) node.fontName = fallbackFont;
        node.characters = newText;
        return;
    }

    const styles: any[] = [];
    for (let i = 0; i < originalLen; i++) {
        let fName = isMixedFont ? node.getRangeFontName(i, i + 1) : node.fontName;
        if (fName === figma.mixed) fName = fallbackFont;

        if (fName && typeof fName === 'object' && !loadedFonts.get(JSON.stringify(fName))) {
            fName = fallbackFont;
        }

        styles.push({
            fontName: fName,
            fontSize: isMixedSize ? node.getRangeFontSize(i, i + 1) : undefined,
            fills: isMixedFills ? node.getRangeFills(i, i + 1) : undefined,
        });
    }

    node.fontName = fallbackFont;
    node.characters = newText;

    let currentStyleIndex = 0;
    let rangeStart = 0;

    for (let i = 0; i <= newLen; i++) {
        const originalIndex = Math.min(Math.floor((i / newLen) * originalLen), originalLen - 1);
        const styleStr = i < newLen ? JSON.stringify(styles[originalIndex]) : null;
        const currentStyleStr = JSON.stringify(styles[currentStyleIndex]);

        if (styleStr !== currentStyleStr || i === newLen) {
            const oldStyle = styles[currentStyleIndex];
            if (isMixedFont && oldStyle.fontName) try { node.setRangeFontName(rangeStart, i, oldStyle.fontName); } catch (e) { }
            if (isMixedSize && oldStyle.fontSize !== undefined) try { node.setRangeFontSize(rangeStart, i, oldStyle.fontSize); } catch (e) { }
            if (isMixedFills && oldStyle.fills) try { node.setRangeFills(rangeStart, i, oldStyle.fills); } catch (e) { }

            if (i < newLen) currentStyleIndex = originalIndex;
            rangeStart = i;
        }
    }
}

// Recursively collect all TEXT nodes from the given node tree.
function walk(node: SceneNode, collector: TextNodeInfo[]): void {
    if (node.type === "TEXT") {
        collector.push({
            id: node.id,
            name: node.name,
            originalText: node.characters,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            fontSize: typeof node.fontSize === "number" ? node.fontSize : 14,
            parentName:
                node.parent && "name" in node.parent ? node.parent.name : "Page",
            textAutoResize: node.textAutoResize,
        });
        return;
    }

    if ("children" in node) {
        for (const child of node.children) {
            walk(child, collector);
        }
    }
}

// Clear every previously applied audit highlight on the current page.
function resetHighlights(): void {
    const queue: SceneNode[] = [...figma.currentPage.children];

    while (queue.length > 0) {
        const node = queue.shift() as SceneNode;

        if (
            "getPluginData" in node &&
            node.getPluginData("lingoAuditHighlighted") === "true"
        ) {
            const strokeable = node as GeometryMixin & BaseNode & SceneNode;
            const rawStrokes = node.getPluginData("originalStrokes");
            const rawWeight = node.getPluginData("originalStrokeWeight");
            const rawAlign = node.getPluginData("originalStrokeAlign");

            try {
                strokeable.strokes = rawStrokes ? JSON.parse(rawStrokes) : [];
            } catch {
                strokeable.strokes = [];
            }

            if (rawWeight) {
                (strokeable as unknown as IndividualStrokesMixin & { strokeWeight: number }).strokeWeight = parseFloat(rawWeight);
            }
            if (rawAlign) {
                (strokeable as unknown as IndividualStrokesMixin & { strokeAlign: string }).strokeAlign = rawAlign;
            }

            node.setPluginData("lingoAuditHighlighted", "");
            node.setPluginData("originalStrokes", "");
            node.setPluginData("originalStrokeWeight", "");
            node.setPluginData("originalStrokeAlign", "");
        }

        if ("children" in node) {
            queue.push(...(node as ChildrenMixin).children);
        }
    }
}

figma.ui.onmessage = async (msg: { type: string;[key: string]: unknown }) => {
    if (msg.type === "SAVE_API_KEY") {
        figma.clientStorage.setAsync("apiKey", msg.apiKey as string);
        return;
    }

    if (msg.type === "MEASURE_NODES") {
        const locale = msg.locale as string;
        const payload = msg.payload as any[];
        const results = [];

        const nodesToMeasure = payload.map(item => figma.getNodeById(item.id) as TextNode).filter(n => n && n.type === "TEXT");
        await prepareFontsForNodes(nodesToMeasure);

        for (const item of payload) {
            const node = figma.getNodeById(item.id) as TextNode;
            if (!node || node.type !== "TEXT") {
                results.push({ isOverflow: false, overflowAmount: 0, overflowPercent: 0 });
                continue;
            }

            const clone = node.clone();
            clone.visible = false; // Hide clone to prevent flashing

            try {
                applyTextWithMixedStyles(clone, item.translatedText);

                let overflowAmount = 0;
                let overflowPercent = 0;
                let isOverflow = false;

                if (item.textAutoResize === "WIDTH_AND_HEIGHT") {
                    clone.textAutoResize = "WIDTH_AND_HEIGHT";
                    let parentLimit = Infinity;

                    if (node.parent && "width" in node.parent) {
                        const parent = node.parent as any;
                        let paddingX = 0;
                        if (typeof parent.paddingLeft === "number") paddingX += parent.paddingLeft;
                        if (typeof parent.paddingRight === "number") paddingX += parent.paddingRight;

                        parentLimit = parent.width - paddingX;
                    }

                    if (parentLimit !== Infinity && clone.width > parentLimit) {
                        overflowAmount = clone.width - parentLimit;
                        overflowPercent = (overflowAmount / Math.max(parentLimit, 1)) * 100;
                        isOverflow = overflowAmount > 4;
                    } else {
                        isOverflow = false;
                    }
                } else if (item.textAutoResize === "HEIGHT") {
                    clone.textAutoResize = "HEIGHT";
                    // For height-auto, check if vertical growth exceeds original box
                    overflowAmount = clone.height - item.height;
                    overflowPercent = (overflowAmount / Math.max(item.height, 1)) * 100;
                    isOverflow = overflowAmount > 4;
                } else {
                    clone.resize(item.width, item.height);
                    clone.textAutoResize = "HEIGHT";
                    // For fixed boxes, keep width locked, let height grow, and see if it exceeds original fixed height
                    overflowAmount = clone.height - item.height;
                    overflowPercent = (overflowAmount / Math.max(item.height, 1)) * 100;
                    isOverflow = overflowAmount > 4;
                }

                results.push({ isOverflow, overflowAmount, overflowPercent });
            } catch (e) {
                // Fallback to "safe" if font missing
                results.push({ isOverflow: false, overflowAmount: 0, overflowPercent: 0 });
            } finally {
                clone.remove();
            }
        }

        figma.ui.postMessage({ type: "MEASURE_RESULT", locale, results });
        return;
    }

    if (msg.type === "SCAN_FRAME") {
        const roots: readonly SceneNode[] =
            figma.currentPage.selection.length > 0
                ? figma.currentPage.selection
                : figma.currentPage.children;

        lastScannedRootIds = roots.map((r) => r.id);

        const nodes: TextNodeInfo[] = [];
        for (const root of roots) {
            walk(root, nodes);
        }

        figma.ui.postMessage({ type: "SCAN_RESULT", nodes });
        return;
    }

    if (msg.type === "APPLY_TRANSLATIONS") {
        const results = msg.results as AuditResult[];

        resetHighlights();

        let overflowCount = 0;
        const localeSet = new Set<string>();

        const byLocale: Record<string, AuditResult[]> = {};
        for (const res of results) {
            if (!byLocale[res.locale]) byLocale[res.locale] = [];
            byLocale[res.locale].push(res);
        }

        const rootNodes = lastScannedRootIds
            .map((id) => figma.getNodeById(id))
            .filter((n) => n) as SceneNode[];

        const allTextNodesInRoots: TextNode[] = [];
        for (const root of rootNodes) {
            walkTextNodes(root, allTextNodesInRoots);
        }
        await prepareFontsForNodes(allTextNodesInRoots);

        let totalRootWidth = 0;
        for (const r of rootNodes) {
            if ("width" in r) totalRootWidth += r.width + 100;
            else totalRootWidth += 1000;
        }
        if (totalRootWidth === 0) totalRootWidth = 1000;

        let xOffset = 0;
        const newClones: SceneNode[] = [];

        for (const locale of Object.keys(byLocale)) {
            const localeResults = byLocale[locale];
            xOffset += totalRootWidth;
            localeSet.add(locale);

            const resultMap = new Map<string, AuditResult>();
            for (const r of localeResults) resultMap.set(r.nodeId, r);

            for (const root of rootNodes) {
                const clone = root.clone();
                newClones.push(clone);

                if ("x" in clone) {
                    clone.x += xOffset;
                }

                clone.name = `${root.name} - ${locale.toUpperCase()}`;

                const origTexts: TextNode[] = [];
                walkTextNodes(root, origTexts);

                const cloneTexts: TextNode[] = [];
                walkTextNodes(clone, cloneTexts);

                for (let i = 0; i < origTexts.length; i++) {
                    const origId = origTexts[i].id;
                    const res = resultMap.get(origId);

                    if (res) {
                        const cloneText = cloneTexts[i];

                        try {
                            applyTextWithMixedStyles(cloneText, res.translatedText);
                        } catch (e) {
                            console.error("Failed to apply text styles", e);
                        }

                        if (res.isOverflow) {
                            overflowCount++;
                            cloneText.setPluginData("lingoAuditHighlighted", "true");
                            const strokeable = cloneText as GeometryMixin & BaseNode & SceneNode;
                            cloneText.setPluginData("originalStrokes", JSON.stringify(strokeable.strokes));

                            const extendedStrokeable = strokeable as unknown as IndividualStrokesMixin & {
                                strokeWeight: number;
                                strokeAlign: string;
                            };

                            cloneText.setPluginData("originalStrokeWeight", extendedStrokeable.strokeWeight?.toString() ?? "");
                            cloneText.setPluginData("originalStrokeAlign", extendedStrokeable.strokeAlign ?? "");

                            strokeable.strokes = [
                                {
                                    type: "SOLID",
                                    color: { r: 1, g: 0.2, b: 0.2 },
                                    opacity: 1,
                                },
                            ];
                            extendedStrokeable.strokeWeight = 2;
                            extendedStrokeable.strokeAlign = "OUTSIDE";
                        }
                    }
                }
            }
        }

        figma.notify(
            `${overflowCount} overflow(s) highlighted across ${localeSet.size} copied screen(s)!`
        );

        if (newClones.length > 0) {
            figma.currentPage.selection = newClones;
            figma.viewport.scrollAndZoomIntoView(newClones);
        }

        return;
    }

    if (msg.type === "FOCUS_NODE") {
        const node = figma.getNodeById(msg.nodeId as string);
        if (!node) return;

        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        figma.currentPage.selection = [node as SceneNode];
        return;
    }

    if (msg.type === "RESET_HIGHLIGHTS") {
        resetHighlights();
        return;
    }

    if (msg.type === "CANCEL") {
        figma.closePlugin();
        return;
    }

    if (msg.type === "PLUGIN_FETCH") {
        const { id, url, init } = msg as any;
        try {
            const fetchOptions: FetchOptions = {
                method: init?.method || "GET",
                headers: init?.headers || {},
                body: init?.body,
            };

            console.log("SANDBOX FETCH INIT:", url, init?.method, "body is Uint8Array?", init?.body instanceof Uint8Array);

            const resp = await fetch(url, fetchOptions);
            const text = await resp.text();

            figma.ui.postMessage({
                type: "PLUGIN_FETCH_RESPONSE",
                id,
                status: resp.status,
                text,
            });
        } catch (e: any) {
            console.error("SANDBOX FETCH CRASH:", e);
            figma.ui.postMessage({
                type: "PLUGIN_FETCH_ERROR",
                id,
                error: typeof e === "string" ? e : (e.message || String(e)),
            });
        }
        return;
    }
};
