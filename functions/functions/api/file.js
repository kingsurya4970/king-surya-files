import { jsonResponse } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.FILE_BUCKET) {
    return jsonResponse({ success: false, error: 'Storage is not configured' }, 500);
  }

  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get('search') || '').toLowerCase().trim();
    const category = (url.searchParams.get('category') || '').toLowerCase().trim();

    let cursor;
    let truncated = true;
    const objects = [];

    while (truncated) {
      const listing = await env.FILE_BUCKET.list({
        cursor,
        include: ['customMetadata', 'httpMetadata'],
        limit: 1000
      });
      objects.push(...listing.objects);
      truncated = listing.truncated;
      cursor = listing.cursor;
    }

    let files = objects.map(o => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
      contentType: o.httpMetadata?.contentType || 'application/octet-stream',
      title: o.customMetadata?.title || o.customMetadata?.originalName || o.key,
      description: o.customMetadata?.description || '',
      category: o.customMetadata?.category || 'other',
      originalName: o.customMetadata?.originalName || o.key
    }));

    if (search) {
      files = files.filter(f =>
        f.title.toLowerCase().includes(search) ||
        f.description.toLowerCase().includes(search) ||
        f.originalName.toLowerCase().includes(search)
      );
    }

    if (category && category !== 'all') {
      files = files.filter(f => f.category.toLowerCase() === category);
    }

    files.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

    return jsonResponse({ success: true, count: files.length, files });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Failed to list files' }, 500);
  }
}
