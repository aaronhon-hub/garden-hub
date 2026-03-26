/**
 * claude-proxy/index.js  — Zoho Catalyst Advanced I/O Function
 *
 * Proxies requests from the Garden Hub app to the Anthropic API.
 * The API key lives here as a Catalyst environment variable, never
 * in the browser.
 *
 * Environment variables (set in Catalyst console → Functions → Config):
 *   ANTHROPIC_API_KEY   — your key from console.anthropic.com
 *
 * Endpoint (after deploy):
 *   POST /server/function/claude-proxy
 *
 * The app sends: { model, max_tokens, system, messages }
 * This function forwards to Anthropic and returns the response.
 */

module.exports = async (context) => {
    const { req, res } = context;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders()).status(200).send('');
        return context.close();
    }

    if (req.method !== 'POST') {
        res.set(corsHeaders()).status(405).send(JSON.stringify({ error: 'Method not allowed' }));
        return context.close();
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        res.set(corsHeaders()).status(500).send(JSON.stringify({
            error: 'ANTHROPIC_API_KEY is not configured. ' +
                   'Add it in Catalyst Console → Functions → Config Variables.'
        }));
        return context.close();
    }

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        res.set(corsHeaders()).status(400).send(JSON.stringify({ error: 'Invalid JSON body' }));
        return context.close();
    }

    try {
        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type':       'application/json',
                'x-api-key':          apiKey,
                'anthropic-version':  '2023-06-01',
            },
            body: JSON.stringify(body),
        });

        const data = await anthropicRes.json();
        res.set({ 'Content-Type': 'application/json', ...corsHeaders() })
           .status(anthropicRes.status)
           .send(JSON.stringify(data));

    } catch (err) {
        res.set(corsHeaders()).status(502).send(JSON.stringify({
            error: `Proxy error: ${err.message}`
        }));
    }

    return context.close();
};

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}
