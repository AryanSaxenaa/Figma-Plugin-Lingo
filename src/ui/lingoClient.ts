// Lingo.dev API wrapper. Lives in the UI iframe — fetch is available here.

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

    const response = await fetch("https://api.lingo.dev/v1/translate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            content,
            sourceLocale: source,
            targetLocale: target,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Lingo.dev API error ${response.status}: ${errorText}`
        );
    }

    const data = (await response.json()) as { content: Record<string, string> };

    return texts.map((_, index) => {
        const key = `str_${index}`;
        return data.content[key] ?? texts[index];
    });
}
