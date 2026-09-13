const API = '/api';
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp']);
const TEXT_EXT = new Set(['txt', 'json', 'csv']);

const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const searchBtn = document.getElementById('searchBtn');
const fileGrid = document.getElementById('fileGrid');
const statusEl = document.getElementById('status');
const themeToggle = document.getElementById('themeToggle');

const modal = document.getElementById('previewModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalDownload = document.getElementById('modalDownload');
const modalClose = document.getElementById('modalClose');

function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️';
  }
}

themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
    themeToggle.textContent = '🌙';
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    themeToggle.textContent = '☀️';
  }
});

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes;
  let i = -1;
  do { size /= 1024; i++; } while (size >= 1024 && i < units.length - 1);
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getExtension(name) {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
}

function iconFor(ext) {
  if (IMAGE_EXT.has(ext)) return '🖼️';
  if (ext === 'pdf') return '📕';
  if (ext === 'zip' || ext === 'rar' || ext === '7z') return '🗜️';
  if (ext === 'json') return '🧩';
  if (ext === 'txt' || ext === 'csv') return '📄';
  if (['mp3', 'wav'].includes(ext)) return '🎵';
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬';
  return '📁';
}

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

async function loadFiles() {
  setStatus('Loading files...');
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (categoryFilter.value) params.set('category', categoryFilter.value);

  try {
    const res = await fetch(`${API}/files?${params.toString()}`);
    const data = await res.json();
    if (!data.success) {
      setStatus(data.error || 'Failed to load files', 'error');
      fileGrid.innerHTML = '';
      return;
    }
    setStatus(data.count === 0 ? 'No files found.' : '');
    renderFiles(data.files);
  } catch (err) {
    setStatus('Could not reach the server.', 'error');
  }
}

function renderFiles(files) {
  fileGrid.innerHTML = '';
  files.forEach(file => {
    const ext = getExtension(file.originalName);
    const card = document.createElement('div');
    card.className = 'file-card';
    card.innerHTML = `
      <div class="file-icon">${iconFor(ext)}</div>
      <div class="file-name">${escapeHtml(file.title)}</div>
      <div class="file-category">${escapeHtml(file.category)}</div>
      <div class="file-meta">${formatSize(file.size)} · ${formatDate(file.uploaded)}</div>
      <div class="file-actions">
        <button class="btn btn-secondary" data-action="preview">Preview</button>
        <a class="btn btn-primary" href="${API}/download?key=${encodeURIComponent(file.key)}">Download</a>
      </div>
    `;
    card.querySelector('[data-action="preview"]').addEventListener('click', () => openPreview(file));
    fileGrid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function openPreview(file) {
  const ext = getExtension(file.originalName);
  modalTitle.textContent = file.title;
  modalDownload.href = `${API}/download?key=${encodeURIComponent(file.key)}`;
  modalBody.innerHTML = '<p>Loading preview...</p>';
  modal.classList.remove('hidden');

  const previewUrl = `${API}/preview?key=${encodeURIComponent(file.key)}`;

  if (IMAGE_EXT.has(ext)) {
    modalBody.innerHTML = `<img src="${previewUrl}" alt="${escapeHtml(file.title)}">`;
  } else if (ext === 'pdf') {
    modalBody.innerHTML = `<iframe src="${previewUrl}"></iframe>`;
  } else if (TEXT_EXT.has(ext)) {
    try {
      const res = await fetch(previewUrl);
      const data = await res.json();
      if (data.success) {
        modalBody.innerHTML = `<pre>${escapeHtml(data.content)}</pre>`;
      } else {
        modalBody.innerHTML = `<p>${escapeHtml(data.error || 'Preview unavailable.')}</p>`;
      }
    } catch {
      modalBody.innerHTML = '<p>Could not load preview.</p>';
    }
  } else {
    modalBody.innerHTML = '<p>No preview available for this file type. Please download it.</p>';
  }
}

modalClose.addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

searchBtn.addEventListener('click', loadFiles);
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadFiles(); });
categoryFilter.addEventListener('change', loadFiles);

initTheme();
loadFiles();
