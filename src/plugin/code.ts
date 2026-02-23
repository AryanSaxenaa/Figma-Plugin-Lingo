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

        for (const item of payload) {
            const node = figma.getNodeById(item.id) as TextNode;
            if (!node || node.type !== "TEXT") {
                results.push({ isOverflow: false, overflowAmount: 0, overflowPercent: 0 });
                continue;
            }

            const clone = node.clone();
            clone.visible = false; // Hide clone to prevent flashing

            try {
                // Ensure we have a font loaded before changing characters
                let fontToLoad = clone.fontName;
                if (fontToLoad === figma.mixed) {
                    fontToLoad = { family: "Inter", style: "Regular" };
                }

                await figma.loadFontAsync(fontToLoad as FontName);
                if (clone.fontName === figma.mixed) {
                    clone.fontName = fontToLoad;
                }

                clone.characters = item.translatedText;

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
                    clone.textAutoResize = "WIDTH_AND_HEIGHT";
                    // For fixed/truncated boxes, check if natural text width exceeds box width
                    overflowAmount = clone.width - item.width;
                    overflowPercent = (overflowAmount / Math.max(item.width, 1)) * 100;
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

        for (const result of results) {
            if (!result.isOverflow) continue;

            const node = figma.getNodeById(result.nodeId);
            if (!node || !("strokes" in node)) continue;

            const strokeable = node as GeometryMixin & SceneNode & BaseNode;
            node.setPluginData(
                "originalStrokes",
                JSON.stringify(strokeable.strokes)
            );

            const extendedStrokeable = strokeable as unknown as IndividualStrokesMixin & {
                strokeWeight: number;
                strokeAlign: string;
            };

            node.setPluginData("originalStrokeWeight", extendedStrokeable.strokeWeight?.toString() ?? "");
            node.setPluginData("originalStrokeAlign", extendedStrokeable.strokeAlign ?? "");
            node.setPluginData("lingoAuditHighlighted", "true");

            strokeable.strokes = [
                {
                    type: "SOLID",
                    color: { r: 1, g: 0.2, b: 0.2 },
                    opacity: 1,
                },
            ];

            (strokeable as unknown as IndividualStrokesMixin & {
                strokeWeight: number;
                strokeAlign: string;
            }).strokeWeight = 2;

            (strokeable as unknown as IndividualStrokesMixin & {
                strokeAlign: string;
            }).strokeAlign = "OUTSIDE";

            overflowCount++;
            localeSet.add(result.locale);
        }

        figma.notify(
            `${overflowCount} overflow(s) found across ${localeSet.size} locale(s)`
        );
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
