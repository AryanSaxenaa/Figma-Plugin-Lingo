import { LingoDotDevEngine } from "lingo.dev/sdk";

// Lingo.dev API wrapper. Lives in the UI iframe.

export const RTL_LOCALES = new Set(["ar", "he", "fa", "ur", "yi"]);

export const SUPPORTED_LOCALES = [
    { code: "de", label: "German", flag: "DE" },
    { code: "fr", label: "French", flag: "FR" },
    { code: "ja", label: "Japanese", flag: "JA" },
    { code: "ar", label: "Arabic (RTL)", flag: "AR" },
    { code: "es", label: "Spanish", flag: "ES" },
    { code: "pt", label: "Portuguese", flag: "PT" },
    { code: "hi", label: "Hindi", flag: "HI" },
    { code: "ru", label: "Russian", flag: "RU" },
    { code: "ko", label: "Korean", flag: "KO" },
    { code: "zh", label: "Chinese", flag: "ZH" },
];

export async function translateBatch(
    apiKey: string,
    texts: string[],
    source: string = "en",
    target: string,
    onProgress?: (progress: number) => void
): Promise<string[]> {
    const lingoDotDev = new LingoDotDevEngine({
        apiKey,
        apiUrl: "https://cors.eu.org/https://engine.lingo.dev"
    });

    const CHUNK_SIZE = 50;
    const finalTranslations: string[] = new Array(texts.length).fill("");

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
        const chunk = texts.slice(i, i + CHUNK_SIZE);
        const content: Record<string, string> = {};
        chunk.forEach((text, index) => {
            content[`str_${index}`] = text;
        });

        try {
            const translatedContent = await lingoDotDev.localizeObject(content, {
                sourceLocale: source,
                targetLocale: target,
            });

            chunk.forEach((text, index) => {
                const key = `str_${index}`;
                finalTranslations[i + index] = (translatedContent as Record<string, string>)[key] ?? text;
            });
        } catch (err: any) {
            throw new Error(`DEBUG SDK: ${err.message || err} | STACK: ${err.stack || "No Stack"}`);
        }

        if (onProgress) {
            onProgress(Math.min(((i + chunk.length) / texts.length) * 100, 100));
        }
    }

    return finalTranslations;
}
