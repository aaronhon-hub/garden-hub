/**
 * sync-push/index.js  — Zoho Catalyst Advanced I/O Function
 *
 * Saves the full garden state to Upstash Redis (platform-agnostic
 * key-value store, accessible via REST — no SDK required).
 *
 * Environment variables (set in Catalyst console → Functions → Config):
 *   SYNC_PASSWORD       — shared secret you choose (e.g. "garden2026")
 *   UPSTASH_REDIS_URL   — your Upstash Redis REST URL
 *                         (from Upstash console → Redis → REST API)
 *   UPSTASH_REDIS_TOKEN — your Upstash Redis REST token
 *
 * Endpoint: POST /server/function/sync-push
 * Body:     { password, slot?, data }
 *   slot  — storage key suffix, default "main"
 *   data  — full garden state JSON object
 */

module.exports = async (context) => {
    const { req, res } = context;

    if (req.method === 'OPTIONS') {
        res.set(corsHeaders()).status(200).send('');
        return context.close();
    }
    if (req.method !== 'POST') {
        res.set(corsHeaders()).status(405).send(JSON.stringify({ error: 'Method not allowed' }));
        return context.close();
    }

    // Check env vars
    const syncPwd   = process.env.SYNC_PASSWORD;
    const redisUrl  = process.env.UPSTASH_REDIS_URL;
    const redisToken= process.env.UPSTASH_REDIS_TOKEN;

    if (!syncPwd || !redisUrl || !redisToken) {
        res.set(corsHeaders()).status(500).send(JSON.stringify({
            error: 'Missing environment variables. Required: SYNC_PASSWORD, ' +
                   'UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN — ' +
                   'set them in Catalyst Console → Functions → Config Variables.'
        }));
        return context.close();
    }

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        res.set(corsHeaders()).status(400).send(JSON.stringify({ error: 'Invalid JSON body' }));
        return context.close();
    }

    const { password, slot = 'main', data } = body;

    if (password !== syncPwd) {
        res.set(corsHeaders()).status(401).send(JSON.stringify({ error: 'Incorrect sync password.' }));
        return context.close();
    }
    if (!data || typeof data !== 'object') {
        res.set(corsHeaders()).status(400).send(JSON.stringify({ error: 'Missing data payload.' }));
        return context.close();
    }

    const serverSavedAt = new Date().toISOString();
    const payload = { ...data, _syncMeta: { savedAt: serverSavedAt, slot } };
    const key     = `garden-hub-${slot}`;

    try {
        // Upstash Redis REST: SET key value
        // Value must be a string — we JSON-stringify the payload
        const redisRes = await fetch(`${redisUrl}/set/${encodeURIComponent(key)}`, {
            method:  'POST',
            headers: {
                'Authorization': `Bearer ${redisToken}`,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify(JSON.stringify(payload)),  // double-stringify: outer for fetch body, inner stored as string
        });

        if (!redisRes.ok) {
            const errText = await redisRes.text();
            throw new Error(`Redis SET failed (${redisRes.status}): ${errText}`);
        }

        res.set({ 'Content-Type': 'application/json', ...corsHeaders() })
           .status(200)
           .send(JSON.stringify({ ok: true, savedAt: serverSavedAt, slot }));

    } catch (err) {
        res.set(corsHeaders()).status(502).send(JSON.stringify({
            error: `Storage write failed: ${err.message}`
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
