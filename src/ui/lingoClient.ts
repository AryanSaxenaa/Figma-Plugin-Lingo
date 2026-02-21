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
    // Override global fetch only for Lingo.dev endpoints to bypass iframe CORS
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlString = url.toString();

        // Let normal fetches (if any) pass through
        if (!urlString.includes("lingo.dev")) {
            return originalFetch(url, init);
        }

        return new Promise((resolve, reject) => {
            const fetchId = Math.random().toString(36).substring(2);

            const handleMessage = (event: MessageEvent) => {
                const msg = event.data?.pluginMessage;
                if (!msg || msg.id !== fetchId) return;

                if (msg.type === "PLUGIN_FETCH_RESPONSE") {
                    window.removeEventListener("message", handleMessage);
                    resolve(new Response(msg.text, {
                        status: msg.status,
                        headers: msg.headers,
                    }));
                } else if (msg.type === "PLUGIN_FETCH_ERROR") {
                    window.removeEventListener("message", handleMessage);
                    reject(new Error(msg.error));
                }
            };

            window.addEventListener("message", handleMessage);

            let bodyContent = init?.body;
            if (init?.body instanceof Uint8Array || init?.body instanceof ArrayBuffer) {
                bodyContent = new TextDecoder().decode(init.body);
            }

            parent.postMessage({
                pluginMessage: {
                    type: "PLUGIN_FETCH",
                    id: fetchId,
                    url: urlString,
                    init: {
                        method: init?.method,
                        headers: init?.headers,
                        body: bodyContent,
                    }
                }
            }, "*");
        });
    };
    const content: Record<string, string> = {};
    texts.forEach((text, index) => {
        content[`str_${index}`] = text;
    });

    const lingoDotDev = new LingoDotDevEngine({
        apiKey
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
