import {
  jsonResponse, validateKey, verifyPassword, getExtension, guessContentType,
  sanitizeBaseName, sanitizeCategory, sanitizeText, ALLOWED_EXTENSIONS, MAX_FILE_SIZE
} from './utils.js';

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp']);
const TEXT_EXT = new Set(['txt', 'json', 'csv']);
const MAX_TEXT_PREVIEW = 200 * 1024; // 200 KB

async function handleFiles(request, env) {
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

async function handleFile(request, env) {
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

async function handlePreview(request, env) {
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

async function handleDownload(request, env) {
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

async function handleUpload(request, env) {
  if (!env.FILE_BUCKET) {
    return jsonResponse({ success: false, error: 'Storage is not configured' }, 500);
  }
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonResponse({ success: false, error: 'Invalid request format' }, 400);
    }

    const formData = await request.formData();

    // --- Password check happens first, before touching R2 ---
    const password = formData.get('password');
    const passwordOk = await verifyPassword(env, typeof password === 'string' ? password : '');
    if (!passwordOk) {
      return jsonResponse({ success: false, error: 'Incorrect password' }, 401);
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return jsonResponse({ success: false, error: 'No file provided' }, 400);
    }

    if (file.size === 0) {
      return jsonResponse({ success: false, error: 'File is empty' }, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonResponse({ success: false, error: 'File exceeds the 100 MB limit' }, 400);
    }

    const safeName = sanitizeBaseName(file.name);
    if (!safeName) {
      return jsonResponse({ success: false, error: 'Invalid file name' }, 400);
    }

    const ext = getExtension(safeName);
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return jsonResponse({ success: false, error: `File type ".${ext}" is not allowed` }, 400);
    }

    const title = sanitizeText(formData.get('title') || safeName, 200) || safeName;
    const description = sanitizeText(formData.get('description') || '', 1000);
    const category = sanitizeCategory(formData.get('category') || 'other');

    const key = `${Date.now()}-${safeName}`;

    await env.FILE_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type || guessContentType(ext)
      },
      customMetadata: {
        title,
        description,
        category,
        originalName: safeName
      }
    });

    return jsonResponse({
      success: true,
      file: { key, title, description, category, size: file.size }
    });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Upload failed' }, 500);
  }
}

async function handleDelete(request, env) {
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
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === '/api/files' && method === 'GET') return handleFiles(request, env);
    if (pathname === '/api/file' && method === 'GET') return handleFile(request, env);
    if (pathname === '/api/preview' && method === 'GET') return handlePreview(request, env);
    if (pathname === '/api/download' && method === 'GET') return handleDownload(request, env);
    if (pathname === '/api/upload' && method === 'POST') return handleUpload(request, env);
    if (pathname === '/api/delete' && method === 'POST') return handleDelete(request, env);

    // Static files (public/) are served automatically before this Worker runs,
    // so anything reaching here is a genuinely unknown route.
    return new Response('Not found', { status: 404 });
  }
};
