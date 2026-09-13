import {
  jsonResponse, sanitizeBaseName, sanitizeCategory, sanitizeText,
  getExtension, guessContentType, ALLOWED_EXTENSIONS, MAX_FILE_SIZE,
  verifyPassword
} from '../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

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
