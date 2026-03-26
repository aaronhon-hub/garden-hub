/**
 * sync-pull/index.js  — Zoho Catalyst Advanced I/O Function
 *
 * Reads the garden state from Upstash Redis.
 *
 * Environment variables (same as sync-push):
 *   SYNC_PASSWORD, UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
 *
 * Endpoint: POST /server/function/sync-pull
 * Body:     { password, slot? }
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

    const syncPwd   = process.env.SYNC_PASSWORD;
    const redisUrl  = process.env.UPSTASH_REDIS_URL;
    const redisToken= process.env.UPSTASH_REDIS_TOKEN;

    if (!syncPwd || !redisUrl || !redisToken) {
        res.set(corsHeaders()).status(500).send(JSON.stringify({
            error: 'Missing environment variables: SYNC_PASSWORD, UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN'
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

    const { password, slot = 'main' } = body;

    if (password !== syncPwd) {
        res.set(corsHeaders()).status(401).send(JSON.stringify({ error: 'Incorrect sync password.' }));
        return context.close();
    }

    const key = `garden-hub-${slot}`;

    try {
        // Upstash Redis REST: GET key
        const redisRes = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, {
            headers: { 'Authorization': `Bearer ${redisToken}` },
        });

        if (!redisRes.ok) {
            const errText = await redisRes.text();
            throw new Error(`Redis GET failed (${redisRes.status}): ${errText}`);
        }

        const redisJson = await redisRes.json();
        const storedStr = redisJson.result;  // Upstash wraps result in { result: "..." }

        if (storedStr === null || storedStr === undefined) {
            res.set({ 'Content-Type': 'application/json', ...corsHeaders() })
               .status(404)
               .send(JSON.stringify({
                   ok: false,
                   error: `No saved state found on server for slot "${slot}". Push first.`
               }));
            return context.close();
        }

        const data = JSON.parse(storedStr);    // parse the double-stringified value
        const { _syncMeta, ...gardenData } = data;

        res.set({ 'Content-Type': 'application/json', ...corsHeaders() })
           .status(200)
           .send(JSON.stringify({
               ok: true,
               data: gardenData,
               savedAt: _syncMeta?.savedAt || null,
               meta: {
                   slot,
                   taskCount:    Array.isArray(gardenData.tasks)    ? gardenData.tasks.length    : 0,
                   seedCount:    Array.isArray(gardenData.seeds)    ? gardenData.seeds.length    : 0,
                   harvestCount: Array.isArray(gardenData.harvests) ? gardenData.harvests.length : 0,
               },
           }));

    } catch (err) {
        res.set(corsHeaders()).status(502).send(JSON.stringify({
            error: `Storage read failed: ${err.message}`
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
