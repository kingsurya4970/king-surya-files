// Shared helpers used by every Pages Function. No secrets live here.

export const ALLOWED_EXTENSIONS = new Set([
  'zip', 'rar', '7z', 'tar', 'gz',
  'txt', 'json', 'csv', 'pdf',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp',
  'mp3', 'wav', 'mp4', 'mov', 'avi', 'mkv'
]);

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

const CONTENT_TYPES = {
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar', gz: 'application/gzip',
  txt: 'text/plain', json: 'application/json', csv: 'text/csv', pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp',
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska'
};

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export function getExtension(name) {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}

export function guessContentType(ext) {
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

// Strips path components and disallowed characters. Never trust a client filename.
export function sanitizeBaseName(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  let base = name.split(/[/\\]/).pop().trim();
  base = base.replace(/[^a-zA-Z0-9._\- ]/g, '');
  base = base.replace(/\.{2,}/g, '.');
  base = base.replace(/^\.+/, '');
  base = base.slice(0, 180);
  if (!base) return null;
  return base;
}

export function sanitizeCategory(cat) {
  if (typeof cat !== 'string') return 'other';
  const clean = cat.toLowerCase().trim().replace(/[^a-z0-9\- ]/g, '');
  return clean || 'other';
}

export function sanitizeText(text, max = 500) {
  if (typeof text !== 'string') return '';
  return text.trim().slice(0, max);
}

// R2 keys we generate always look like: <timestamp>-<safeName>
// Anything not matching this shape is rejected outright — blocks path traversal
// and any attempt to reference arbitrary/internal keys.
const KEY_PATTERN = /^[0-9]{10,15}-[a-zA-Z0-9._\- ]{1,180}$/;

export function validateKey(key) {
  if (typeof key !== 'string') return null;
  if (key.length > 250) return null;
  if (key.includes('..') || key.includes('/') || key.includes('\\')) return null;
  if (!KEY_PATTERN.test(key)) return null;
  return key;
}

export async function verifyPassword(env, suppliedPassword) {
  const expected = env.ADMIN_PASSWORD;
  if (!expected) return false; // secret not configured — fail closed
  if (typeof suppliedPassword !== 'string') return false;
  return timingSafeEqual(suppliedPassword, expected);
}

// Basic constant-time-ish string compare to reduce timing side-channels.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
