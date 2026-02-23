const fetch = require('node-fetch') || global.fetch;
fetch('https://proxy.cors.sh/https://engine.lingo.dev/i18n', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer api_f3s4yqoek7qgpczxl6mxk0ew',
        'x-cors-api-key': 'temp_b7bd5e0edda7be'
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
