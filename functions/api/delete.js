import { jsonResponse, validateKey, verifyPassword } from '../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.FILE_BUCKET) {
    return jsonResponse({ success: false, error: 'Storage is not configured' }, 500);
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return jsonResponse({ success: false, error: 'Invalid request format' }, 400);
    }

    const body = await request.json();
    const key = validateKey(body.key);
    if (!key) {
      return jsonResponse({ success: false, error: 'Invalid file key' }, 400);
    }

    const passwordOk = await verifyPassword(env, typeof body.password === 'string' ? body.password : '');
    if (!passwordOk) {
      return jsonResponse({ success: false, error: 'Incorrect password' }, 401);
    }

    const existing = await env.FILE_BUCKET.head(key);
    if (!existing) {
      return jsonResponse({ success: false, error: 'File not found' }, 404);
    }

    await env.FILE_BUCKET.delete(key);

    return jsonResponse({ success: true, message: 'File deleted' });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Delete failed' }, 500);
  }
