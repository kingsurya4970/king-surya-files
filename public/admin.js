const API = '/api';

const themeToggle = document.getElementById('themeToggle');
const uploadForm = document.getElementById('uploadForm');
const uploadStatus = document.getElementById('uploadStatus');
const adminStatus = document.getElementById('adminStatus');
const adminFileList = document.getElementById('adminFileList');

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

function setUploadStatus(msg, type = '') {
  uploadStatus.textContent = msg;
  uploadStatus.className = `status ${type}`;
}

function setAdminStatus(msg, type = '') {
  adminStatus.textContent = msg;
  adminStatus.className = `status ${type}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes;
  let i = -1;
  do { size /= 1024; i++; } while (size >= 1024 && i < units.length - 1);
  return `${size.toFixed(1)} ${units[i]}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setUploadStatus('Uploading...');

  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) {
    setUploadStatus('Please choose a file.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', document.getElementById('titleInput').value);
  formData.append('description', document.getElementById('descInput').value);
  formData.append('category', document.getElementById('catInput').value);
  formData.append('password', document.getElementById('uploadPassword').value);

  try {
    const res = await fetch(`${API}/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      setUploadStatus('File uploaded successfully.', 'success');
      uploadForm.reset();
      loadAdminFiles();
    } else {
      setUploadStatus(data.error || 'Upload failed.', 'error');
    }
  } catch (err) {
    setUploadStatus('Could not reach the server.', 'error');
  }
});

async function loadAdminFiles() {
  setAdminStatus('Loading files...');
  try {
    const res = await fetch(`${API}/files`);
    const data = await res.json();
    if (!data.success) {
      setAdminStatus(data.error || 'Failed to load files.', 'error');
      return;
    }
    setAdminStatus(data.count === 0 ? 'No files uploaded yet.' : '');
    renderAdminFiles(data.files);
  } catch (err) {
    setAdminStatus('Could not reach the server.', 'error');
  }
}

function renderAdminFiles(files) {
  adminFileList.innerHTML = '';
  files.forEach(file => {
    const row = document.createElement('div');
    row.className = 'admin-file-row';
    row.innerHTML = `
      <div class="admin-file-info">
        <span class="name">${escapeHtml(file.title)}</span>
        <span class="meta">${escapeHtml(file.category)} · ${formatSize(file.size)}</span>
      </div>
      <div class="file-actions">
        <a class="btn btn-secondary" href="${API}/download?key=${encodeURIComponent(file.key)}">Download</a>
        <button class="btn btn-danger" data-action="delete">Delete</button>
      </div>
    `;
    row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteFile(file));
    adminFileList.appendChild(row);
  });
}

async function deleteFile(file) {
  const confirmed = confirm(`Delete "${file.title}"? This cannot be undone.`);
  if (!confirmed) return;

  const password = prompt('Enter admin password to confirm deletion:');
  if (password === null) return;

  setAdminStatus('Deleting...');
  try {
    const res = await fetch(`${API}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: file.key, password })
    });
    const data = await res.json();
    if (data.success) {
      setAdminStatus('File deleted.', 'success');
      loadAdminFiles();
    } else {
      setAdminStatus(data.error || 'Delete failed.', 'error');
    }
  } catch (err) {
    setAdminStatus('Could not reach the server.', 'error');
  }
}

initTheme();
loadAdminFiles();
