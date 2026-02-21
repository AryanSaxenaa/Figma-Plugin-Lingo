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
    target: string
): Promise<string[]> {
    const content: Record<string, string> = {};
    texts.forEach((text, index) => {
        content[`str_${index}`] = text;
    });

    const lingoDotDev = new LingoDotDevEngine({
        apiKey,
        apiUrl: "https://api.lingo.dev"
    });

    try {
        const translatedContent = await lingoDotDev.localizeObject(content, {
            sourceLocale: source,
            targetLocale: target,
        });

        return texts.map((_, index) => {
            const key = `str_${index}`;
            return (translatedContent as Record<string, string>)[key] ?? texts[index];
        });
    } catch (err: any) {
        throw new Error(`Lingo.dev SDK error: ${err.message || err}`);
    }
}
