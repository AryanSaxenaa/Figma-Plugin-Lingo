// Pure-math overflow estimator. No DOM, no canvas measurement — works in the plugin iframe
// and would also work in a Node environment. Uses expansion ratios derived from linguistic
// character-width research to approximate whether translated text will overflow the original node.

const CHAR_WIDTH_MULTIPLIER: Record<string, number> = {
    de: 1.35,
    fr: 1.20,
    es: 1.15,
    pt: 1.18,
    ru: 1.25,
    ar: 0.90,
    he: 0.85,
    fa: 0.88,
    ja: 1.10,
    ko: 1.05,
    zh: 0.95,
    hi: 1.15,
};

const CJK_LOCALES = new Set(["ja", "zh", "ko"]);

export function estimateOverflow(
    originalText: string,
    translatedText: string,
    nodeWidth: number,
    _nodeHeight: number,
    fontSize: number,
    locale: string
): {
    isOverflow: boolean;
    estimatedNewWidth: number;
    originalWidth: number;
    overflowAmount: number;
    overflowPercent: number;
} {
    const isCJK = CJK_LOCALES.has(locale);
    const charWidth = isCJK ? fontSize * 0.95 : fontSize * 0.6;

    const multiplier = CHAR_WIDTH_MULTIPLIER[locale] ?? 1.0;

    const originalEstimatedWidth = originalText.length * charWidth;
    const translatedEstimatedWidth = translatedText.length * charWidth * multiplier;

    // Scale both estimates relative to the actual available node width.
    const scaleFactor = nodeWidth / Math.max(originalEstimatedWidth, 1);
    const estimatedNewWidth = translatedEstimatedWidth * scaleFactor;

    const overflowAmount = estimatedNewWidth - nodeWidth;
    const overflowPercent = (overflowAmount / nodeWidth) * 100;

    // 4 px tolerance absorbs sub-pixel rounding and minor font metric differences.
    const isOverflow = overflowAmount > 4;

    return {
        isOverflow,
        estimatedNewWidth,
        originalWidth: nodeWidth,
        overflowAmount,
        overflowPercent,
    };
}

export function getOverflowSeverity(
    overflowPercent: number
): "none" | "warning" | "critical" {
    if (overflowPercent <= 0) return "none";
    if (overflowPercent <= 20) return "warning";
    return "critical";
}
