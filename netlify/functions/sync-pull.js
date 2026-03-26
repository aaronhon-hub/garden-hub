/**
 * sync-pull.js — Netlify serverless function
 *
 * Reads the garden state from Upstash Redis via REST API.
 * No npm dependencies — uses native fetch() only.
 *
 * Environment variables (same as sync-push):
 *   SYNC_PASSWORD, UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
 *
 * POST /.netlify/functions/sync-pull
 * Body: { password, slot? }
 */

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const syncPwd    = process.env.SYNC_PASSWORD;
  const redisUrl   = process.env.UPSTASH_REDIS_URL;
  const redisToken = process.env.UPSTASH_REDIS_TOKEN;

  if (!syncPwd || !redisUrl || !redisToken) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({
      error: 'Missing environment variables: SYNC_PASSWORD, UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN'
    })};
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: corsHeaders(),
    body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { password, slot = 'main' } = body;

  if (password !== syncPwd) {
    return { statusCode: 401, headers: corsHeaders(),
      body: JSON.stringify({ error: 'Incorrect sync password.' }) };
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
    const storedStr = redisJson.result;  // Upstash wraps: { result: "..." }

    if (storedStr === null || storedStr === undefined) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        body: JSON.stringify({
          ok: false,
          error: `No saved state found for slot "${slot}". Push from the app first.`
        }),
      };
    }

    const data = JSON.parse(storedStr);
    const { _syncMeta, ...gardenData } = data;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      body: JSON.stringify({
        ok: true,
        data: gardenData,
        savedAt: _syncMeta?.savedAt || null,
        meta: {
          slot,
          taskCount:    Array.isArray(gardenData.tasks)    ? gardenData.tasks.length    : 0,
          seedCount:    Array.isArray(gardenData.seeds)    ? gardenData.seeds.length    : 0,
          harvestCount: Array.isArray(gardenData.harvests) ? gardenData.harvests.length : 0,
        },
      }),
    };
  } catch (err) {
    return { statusCode: 502, headers: corsHeaders(),
      body: JSON.stringify({ error: `Storage read failed: ${err.message}` }) };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
