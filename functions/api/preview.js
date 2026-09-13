import { validateKey, getExtension, jsonResponse } from '../_utils.js';

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp']);
const TEXT_EXT = new Set(['txt', 'json', 'csv']);
const MAX_TEXT_PREVIEW = 200 * 1024; // 200 KB

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const key = validateKey(url.searchParams.get('key'));
    if (!key) return jsonResponse({ success: false, error: 'Invalid file key' }, 400);

    const obj = await env.FILE_BUCKET.get(key);
    if (!obj) return jsonResponse({ success: false, error: 'File not found' }, 404);

    const originalName = obj.customMetadata?.originalName || key;
    const ext = getExtension(originalName);

    if (IMAGE_EXT.has(ext) || ext === 'pdf') {
      return new Response(obj.body, {
        headers: {
          'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
          'Content-Disposition': 'inline',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    if (TEXT_EXT.has(ext)) {
      if (obj.size > MAX_TEXT_PREVIEW) {
        return jsonResponse({
          success: false,
          error: 'File too large to preview. Please download it instead.'
        }, 200);
      }
      const text = await obj.text();
      return jsonResponse({ success: true, type: 'text', extension: ext, content: text });
    }

    return jsonResponse({ success: false, error: 'Preview not available for this file type' }, 200);
  } catch (err) {
    return jsonResponse({ success: false, error: 'Failed to load preview' }, 500);
  }
}
