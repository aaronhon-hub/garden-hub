/**
 * sync-push.js — Netlify serverless function
 *
 * Saves the full garden state to Upstash Redis via REST API.
 * No npm dependencies — uses native fetch() only.
 *
 * Environment variables (Netlify → Site Settings → Environment Variables):
 *   SYNC_PASSWORD       — shared secret you choose
 *   UPSTASH_REDIS_URL   — from Upstash console → Redis → REST API tab
 *   UPSTASH_REDIS_TOKEN — from Upstash console → Redis → REST API tab
 *
 * Get a free Upstash Redis database at: https://console.upstash.com
 *
 * POST /.netlify/functions/sync-push
 * Body: { password, slot?, data }
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
      error: 'Missing environment variables. Required: SYNC_PASSWORD, ' +
             'UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN — ' +
             'set them in Netlify → Site Settings → Environment Variables.'
    })};
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: corsHeaders(),
    body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { password, slot = 'main', data } = body;

  if (password !== syncPwd) {
    return { statusCode: 401, headers: corsHeaders(),
      body: JSON.stringify({ error: 'Incorrect sync password.' }) };
  }
  if (!data || typeof data !== 'object') {
    return { statusCode: 400, headers: corsHeaders(),
      body: JSON.stringify({ error: 'Missing data payload.' }) };
  }

  const serverSavedAt = new Date().toISOString();
  const payload = { ...data, _syncMeta: { savedAt: serverSavedAt, slot } };
  const key     = `garden-hub-${slot}`;

  try {
    // Upstash Redis REST: SET key value
    // The value must be a JSON string — we stringify the payload
    const redisRes = await fetch(`${redisUrl}/set/${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${redisToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!redisRes.ok) {
      const errText = await redisRes.text();
      throw new Error(`Redis SET failed (${redisRes.status}): ${errText}`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      body: JSON.stringify({ ok: true, savedAt: serverSavedAt, slot }),
    };
  } catch (err) {
    return { statusCode: 502, headers: corsHeaders(),
      body: JSON.stringify({ error: `Storage write failed: ${err.message}` }) };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
