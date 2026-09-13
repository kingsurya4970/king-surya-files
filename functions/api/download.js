import { validateKey } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const key = validateKey(url.searchParams.get('key'));
    if (!key) return new Response('Invalid file key', { status: 400 });

    const obj = await env.FILE_BUCKET.get(key);
    if (!obj) return new Response('File not found', { status: 404 });

    const filename = obj.customMetadata?.originalName || key;
    const safeFilename = filename.replace(/"/g, '');

    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': String(obj.size),
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (err) {
    return new Response('Failed to download file', { status: 500 });
  }
}
