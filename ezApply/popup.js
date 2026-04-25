const profileFields = [
  'firstName', 'lastName', 'email', 'phone', 'city', 'state',
  'linkedin', 'github', 'website', 'currentTitle', 'currentCompany',
  'yearsExperience', 'expectedSalary', 'resumeText'
];

const PROVIDER_DEFAULTS = {
  anthropic: { model: 'claude-haiku-4-5-20251001', baseUrl: '', keyPlaceholder: 'sk-ant-...' },
  openai:    { model: 'gpt-4o-mini',               baseUrl: '', keyPlaceholder: 'sk-...' },
  groq:      { model: 'llama-3.3-70b-versatile',   baseUrl: '', keyPlaceholder: 'gsk_...' },
  ollama:    { model: 'llama3',                     baseUrl: 'http://localhost:11434/v1', keyPlaceholder: 'ollama (no key needed)' },
  custom:    { model: '',                           baseUrl: '', keyPlaceholder: 'API key' },
};

const STATUSES = ['applied', 'phone screen', 'interview', 'offer', 'rejected'];
const STATUS_COLORS = {
  'applied': '#6b7280', 'phone screen': '#2563eb',
  'interview': '#d97706', 'offer': '#16a34a', 'rejected': '#dc2626'
};

let activeFilter = '';

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'applications') loadApplications();
  });
});

// ── Status filters ────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.status;
    loadApplications();
  });
});

// ── Provider change ───────────────────────────────────────────────────────────
document.getElementById('provider').addEventListener('change', onProviderChange);

function onProviderChange() {
  const provider = document.getElementById('provider').value;
  const defaults = PROVIDER_DEFAULTS[provider];
  const baseUrlRow = document.getElementById('baseUrlRow');
  const modelEl = document.getElementById('model');
  const apiKeyEl = document.getElementById('apiKey');

  apiKeyEl.placeholder = defaults.keyPlaceholder;
  baseUrlRow.style.display = (provider === 'ollama' || provider === 'custom') ? 'flex' : 'none';

  if (defaults.baseUrl && !document.getElementById('baseUrl').value) {
    document.getElementById('baseUrl').value = defaults.baseUrl;
  }

  const prevDefaults = Object.values(PROVIDER_DEFAULTS).map(d => d.model);
  if (!modelEl.value || prevDefaults.includes(modelEl.value)) {
    modelEl.value = defaults.model;
  }
}

// ── Load saved data ───────────────────────────────────────────────────────────
Storage.getProfile().then(profile => {
  profileFields.forEach(key => {
    const el = document.getElementById(key);
    if (el && profile[key]) el.value = profile[key];
  });
});

Storage.getSettings().then(settings => {
  if (settings.provider) document.getElementById('provider').value = settings.provider;
  if (settings.apiKey)   document.getElementById('apiKey').value   = settings.apiKey;
  if (settings.baseUrl)  document.getElementById('baseUrl').value  = settings.baseUrl;
  if (settings.model)    document.getElementById('model').value    = settings.model;
  onProviderChange();
});

// ── Save handlers ─────────────────────────────────────────────────────────────
document.getElementById('saveProfile').addEventListener('click', async () => {
  const profile = {};
  profileFields.forEach(key => {
    const el = document.getElementById(key);
    if (el) profile[key] = el.value.trim();
  });
  profile.fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  await Storage.saveProfile(profile);
  showStatus('profileStatus', 'Profile saved!');
});

document.getElementById('saveSettings').addEventListener('click', async () => {
  const settings = {
    provider: document.getElementById('provider').value,
    apiKey:   document.getElementById('apiKey').value.trim(),
    baseUrl:  document.getElementById('baseUrl').value.trim(),
    model:    document.getElementById('model').value.trim(),
  };
  await Storage.saveSettings(settings);
  showStatus('settingsStatus', 'Settings saved!');
});

// ── Applications with status pipeline ────────────────────────────────────────
async function loadApplications() {
  const filter = activeFilter ? { status: activeFilter } : {};
  const [apps, total] = await Promise.all([
    Storage.getApplications({ limit: 100, ...filter }),
    Storage.countApplications()
  ]);
  const list = document.getElementById('appList');

  if (!apps.length) {
    list.innerHTML = `<p class="empty">${activeFilter ? `No "${activeFilter}" applications.` : 'No applications logged yet.'}</p>`;
    return;
  }

  const header = `<div class="app-count">${total} total · ${apps.length} shown</div>`;

  list.innerHTML = header + apps.map(app => {
    const date = new Date(app.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const statusColor = STATUS_COLORS[app.status] || '#6b7280';
    const statusOptions = STATUSES.map(s =>
      `<option value="${s}" ${app.status === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    return `
      <div class="app-item" data-id="${app.id}">
        <div class="app-title">${escHtml(app.jobTitle || 'Unknown role')} — ${escHtml(app.company || '?')}</div>
        <div class="app-meta">
          <select class="app-status-select" data-id="${app.id}" style="color:${statusColor}">
            ${statusOptions}
          </select>
          <span class="app-date">${date}</span>
          <button class="app-delete" data-id="${app.id}">✕</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.app-status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const color = STATUS_COLORS[sel.value] || '#6b7280';
      sel.style.color = color;
      await Storage.updateApplicationStatus(Number(sel.dataset.id), sel.value);
    });
  });

  list.querySelectorAll('.app-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await Storage.deleteApplication(Number(btn.dataset.id));
      loadApplications();
    });
  });
}

// ── Resume tailoring ──────────────────────────────────────────────────────────
document.getElementById('tailorBtn').addEventListener('click', async () => {
  const jd = document.getElementById('tailorJD').value.trim();
  if (!jd) { showStatus('tailorStatus', 'Paste a job description first', true); return; }

  const profile = await Storage.getProfile();
  if (!profile.resumeText) { showStatus('tailorStatus', 'Add your resume text in Profile first', true); return; }

  const btn = document.getElementById('tailorBtn');
  btn.textContent = 'Generating…';
  btn.disabled = true;

  const res = await chrome.runtime.sendMessage({
    type: 'TAILOR_RESUME',
    payload: { profile, jobDescription: jd }
  });

  btn.textContent = '✦ Tailor My Resume';
  btn.disabled = false;

  if (res?.error) { showStatus('tailorStatus', res.error, true); return; }

  document.getElementById('tailorOutput').style.display = 'block';
  document.getElementById('tailorResult').value = res.text;
});

document.getElementById('tailorCopy').addEventListener('click', () => {
  const text = document.getElementById('tailorResult').value;
  navigator.clipboard.writeText(text).then(() => showStatus('tailorStatus', 'Copied!'));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function showStatus(id, msg, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'status' + (isError ? ' error' : '');
  setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 2500);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
