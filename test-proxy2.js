const fetch = require('node-fetch') || global.fetch;
fetch('https://corsproxy.io/?https://engine.lingo.dev/i18n', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer api_f3s4yqoek7qgpczxl6mxk0ew',
        'User-Agent': 'Mozilla/5.0'
    },
    body: JSON.stringify({
        data: { greeting: "hi" },
        locale: { source: "en", target: "de" },
        params: {}
    })
}).then(async r => {
    console.log(r.status);
    console.log(await r.text());
}).catch(console.error);
