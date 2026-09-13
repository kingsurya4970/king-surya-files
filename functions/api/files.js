import { jsonResponse, validateKey } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const key = validateKey(url.searchParams.get('key'));
    if (!key) return jsonResponse({ success: false, error: 'Invalid file key' }, 400);

    const obj = await env.FILE_BUCKET.head(key);
    if (!obj) return jsonResponse({ success: false, error: 'File not found' }, 404);

    return jsonResponse({
      success: true,
      file: {
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        contentType: obj.httpMetadata?.contentType || 'application/octet-stream',
        title: obj.customMetadata?.title || obj.key,
        description: obj.customMetadata?.description || '',
        category: obj.customMetadata?.category || 'other',
        originalName: obj.customMetadata?.originalName || obj.key
      }
    });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Failed to get file info' }, 500);
  }
}
