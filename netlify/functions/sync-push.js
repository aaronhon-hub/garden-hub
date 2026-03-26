/**
 * sync-push.js — write garden state to Netlify Blobs
 *
 * POST /.netlify/functions/sync-push
 * Body: { password, slot?, data }
 *   slot  — storage key suffix, default "main"
 *   data  — full garden state JSON object
 *
 * Env vars required:
 *   SYNC_PASSWORD   — shared secret you choose
 */

const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { password, slot = 'main', data } = body;

  if (!process.env.SYNC_PASSWORD) {
    return { statusCode: 500, headers: corsHeaders(),
      body: JSON.stringify({ error: 'SYNC_PASSWORD env var not set. Add it in Netlify → Site Settings → Environment Variables.' }) };
  }
  if (password !== process.env.SYNC_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Incorrect sync password.' }) };
  }
  if (!data || typeof data !== 'object') {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing data payload.' }) };
  }

  // Attach server-side timestamp
  const serverSavedAt = new Date().toISOString();
  const payload = { ...data, _syncMeta: { savedAt: serverSavedAt, slot } };

  try {
    const store = getStore('garden-hub');
    await store.setJSON(`state-${slot}`, payload);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      body: JSON.stringify({ ok: true, savedAt: serverSavedAt, slot }),
    };
  } catch (err) {
    return { statusCode: 502, headers: corsHeaders(),
      body: JSON.stringify({ error: `Blob write failed: ${err.message}` }) };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
