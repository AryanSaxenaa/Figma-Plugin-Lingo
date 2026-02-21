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

figma.ui.onmessage = (msg: { type: string;[key: string]: unknown }) => {
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
    }
};
