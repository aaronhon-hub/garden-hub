/**
 * sync-pull.js — read garden state from Netlify Blobs
 *
 * POST /.netlify/functions/sync-pull
 * Body: { password, slot? }
 *
 * Returns: { ok, data, savedAt, meta }
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

  const { password, slot = 'main' } = body;

  if (!process.env.SYNC_PASSWORD) {
    return { statusCode: 500, headers: corsHeaders(),
      body: JSON.stringify({ error: 'SYNC_PASSWORD env var not set.' }) };
  }
  if (password !== process.env.SYNC_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Incorrect sync password.' }) };
  }

  try {
    const store = getStore('garden-hub');
    const data = await store.get(`state-${slot}`, { type: 'json' });

    if (!data) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        body: JSON.stringify({ ok: false, error: 'No saved state found on server for slot "' + slot + '". Push first.' }),
      };
    }

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
          taskCount:   Array.isArray(gardenData.tasks)   ? gardenData.tasks.length   : 0,
          seedCount:   Array.isArray(gardenData.seeds)   ? gardenData.seeds.length   : 0,
          harvestCount:Array.isArray(gardenData.harvests)? gardenData.harvests.length: 0,
        },
      }),
    };
  } catch (err) {
    return { statusCode: 502, headers: corsHeaders(),
      body: JSON.stringify({ error: `Blob read failed: ${err.message}` }) };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
