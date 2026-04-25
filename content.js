let profile = {};
let jobContext = {};

async function init() {
  profile = await Storage.getProfile();
  detectJobContext();
  injectFloatingUI();
  observeNavigation();
  observeLinkedInModal();
  observeForNewFields();
  listenForStorageChanges();
}

// Re-load profile + settings whenever user saves them from the popup
function listenForStorageChanges() {
  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.profile) profile = changes.profile.newValue || {};
  });
}

// ── SPA navigation (LinkedIn, Indeed use pushState) ──────────────────────────
function observeNavigation() {
  const onNavigate = () => {
    setTimeout(() => {
      detectJobContext();
      if (!document.getElementById('ez-widget')) injectFloatingUI();
    }, 800); // slight delay for DOM to settle
  };

  const originalPush = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPush(...args);
    onNavigate();
  };
  window.addEventListener('popstate', onNavigate);
}

// ── LinkedIn Easy Apply modal detection ──────────────────────────────────────
function observeLinkedInModal() {
  if (!location.hostname.includes('linkedin.com')) return;

  const observer = new MutationObserver(() => {
    const modal = document.querySelector('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"]');
    if (modal && !modal.dataset.ezWired) {
      modal.dataset.ezWired = '1';
      injectLinkedInModalBanner(modal);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function injectLinkedInModalBanner(modal) {
  if (modal.querySelector('#ez-modal-banner')) return;
  const container = modal.querySelector('.jobs-easy-apply-content-container, .artdeco-modal__content');
  if (!container) return;

  const banner = document.createElement('div');
  banner.id = 'ez-modal-banner';
  banner.innerHTML = `
    <button id="ez-linkedin-fill">⚡ ezApply — Auto-fill this step</button>
  `;
  container.insertBefore(banner, container.firstChild);

  banner.querySelector('#ez-linkedin-fill').addEventListener('click', () => {
    if (!profile || !Object.keys(profile).length) {
      showToast('Set up your profile in the ezApply extension first', 'warning');
      return;
    }
    const filled = FormFiller.fillForm(profile);
    showToast(filled > 0 ? `Filled ${filled} fields` : 'No fillable fields on this step', filled > 0 ? 'success' : 'info');
  });
}

// ── Job context detection ─────────────────────────────────────────────────────
function detectJobContext() {
  const host = location.hostname;

  if (host.includes('linkedin.com')) {
    jobContext.platform = 'linkedin';
    // Try multiple selectors — LinkedIn changes class names often
    jobContext.jobTitle = (
      document.querySelector('.job-details-jobs-unified-top-card__job-title')
      || document.querySelector('h1.t-24')
      || document.querySelector('.jobs-unified-top-card__job-title')
      || document.querySelector('h1')
    )?.textContent?.trim();
    jobContext.company = (
      document.querySelector('.job-details-jobs-unified-top-card__company-name a')
      || document.querySelector('.jobs-unified-top-card__company-name a')
      || document.querySelector('.topcard__org-name-link')
    )?.textContent?.trim();
    jobContext.jobDescription = (
      document.querySelector('#job-details')
      || document.querySelector('.jobs-description__content')
      || document.querySelector('.jobs-box__html-content')
    )?.textContent?.trim();
  } else if (host.includes('indeed.com')) {
    jobContext.platform = 'indeed';
    jobContext.jobTitle = (
      document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')
      || document.querySelector('h1.jobsearch-JobInfoHeader-title')
    )?.textContent?.trim();
    jobContext.company = (
      document.querySelector('[data-testid="inlineHeader-companyName"]')
      || document.querySelector('.jobsearch-InlineCompanyRating-companyHeader')
    )?.textContent?.trim();
    jobContext.jobDescription = document.querySelector('#jobDescriptionText')?.textContent?.trim();
  } else if (host.includes('jobright.ai')) {
    jobContext.platform = 'jobright';
    jobContext.jobTitle = document.querySelector('h1, .job-title')?.textContent?.trim();
    jobContext.company = document.querySelector('.company-name, .employer-name')?.textContent?.trim();
    jobContext.jobDescription = document.querySelector('.job-description, .description')?.textContent?.trim();
  } else {
    jobContext.platform = 'generic';
    jobContext.jobTitle = document.querySelector('h1')?.textContent?.trim();
    jobContext.company = document.title;
  }
}

// ── Floating widget ───────────────────────────────────────────────────────────
function injectFloatingUI() {
  if (document.getElementById('ez-widget')) return;

  const widget = document.createElement('div');
  widget.id = 'ez-widget';
  widget.innerHTML = `
    <div id="ez-cover-btn" class="ez-btn ez-btn--primary">✦ Cover Letter</div>
    <div id="ez-fill-btn" class="ez-btn ez-btn--secondary">⚡ Fill Fields</div>
  `;
  widget.querySelector('#ez-cover-btn').addEventListener('click', onCoverLetterClick);
  widget.querySelector('#ez-fill-btn').addEventListener('click', onFillClick);
  document.body.appendChild(widget);
  injectQuestionButtons();
}

// ── Custom question answering ─────────────────────────────────────────────────
function injectQuestionButtons() {
  const textareas = document.querySelectorAll('textarea:not([data-ez-wired])');
  textareas.forEach(ta => {
    ta.dataset.ezWired = '1';
    const label = getFieldLabel(ta);
    if (!label || label.length < 8) return; // skip unlabelled / trivial fields

    const btn = document.createElement('button');
    btn.className = 'ez-qa-btn';
    btn.textContent = '✦ AI Answer';
    btn.addEventListener('click', async e => {
      e.preventDefault();
      if (!profile || !Object.keys(profile).length) {
        showToast('Set up your profile first', 'warning'); return;
      }
      btn.textContent = '…';
      btn.disabled = true;
      const isCoverLetter = /cover.?letter/i.test(label);
      const msgType = isCoverLetter ? 'GENERATE_COVER_LETTER' : 'TAILOR_ANSWERS';
      const payload = isCoverLetter
        ? { profile, ...jobContext }
        : { profile, question: label, ...jobContext };
      const res = await chrome.runtime.sendMessage({ type: msgType, payload });
      btn.textContent = '✦ AI Answer';
      btn.disabled = false;
      if (res?.error) { showToast(res.error, 'error'); return; }
      FormFiller.injectValue(ta, res.text);
      showToast('Answer inserted — review before submitting', 'success');
    });

    ta.parentNode.insertBefore(btn, ta.nextSibling);
  });
}

// Re-scan for new textareas as forms load dynamically
function observeForNewFields() {
  new MutationObserver(() => injectQuestionButtons())
    .observe(document.body, { childList: true, subtree: true });
}

async function onCoverLetterClick() {
  if (!profile || !Object.keys(profile).length) {
    showToast('Set up your profile in the ezApply extension first', 'warning');
    return;
  }
  detectJobContext();
  showCoverLetterModal();
}

async function onFillClick() {
  if (!profile || !Object.keys(profile).length) {
    showToast('Set up your profile in the ezApply extension first', 'warning');
    return;
  }
  const filled = FormFiller.fillForm(profile);
  showToast(filled > 0 ? `Filled ${filled} fields` : 'No fillable fields found on this page', filled > 0 ? 'success' : 'info');

  if (filled > 0) {
    await Storage.logApplication({
      jobTitle: jobContext.jobTitle || 'Unknown',
      company: jobContext.company || location.hostname,
      platform: jobContext.platform,
      url: location.href,
      status: 'auto-filled'
    });
  }
}

// ── Cover Letter Modal ────────────────────────────────────────────────────────
function showCoverLetterModal() {
  if (document.getElementById('ez-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'ez-modal';
  modal.innerHTML = `
    <div id="ez-modal-box">
      <div id="ez-modal-header">
        <span id="ez-modal-title">✦ Cover Letter</span>
        <button id="ez-modal-close">✕</button>
      </div>
      <div id="ez-modal-meta">
        <span id="ez-job-label">${escHtml(jobContext.jobTitle || 'Unknown role')} @ ${escHtml(jobContext.company || 'Unknown company')}</span>
      </div>
      <div id="ez-tone-row">
        <span class="ez-tone-label">Tone:</span>
        ${['Professional', 'Conversational', 'Confident', 'Concise'].map(t =>
          `<button class="ez-tone-btn${t === 'Professional' ? ' active' : ''}" data-tone="${t}">${t}</button>`
        ).join('')}
      </div>
      <div id="ez-modal-body">
        <div id="ez-spinner" class="ez-spinner">
          <div class="ez-spinner-ring"></div>
          <span>Generating your cover letter…</span>
        </div>
        <textarea id="ez-cover-text" style="display:none"></textarea>
      </div>
      <div id="ez-modal-footer">
        <button id="ez-regenerate-btn" class="ez-footer-btn ez-footer-btn--ghost">↺ Regenerate</button>
        <div style="display:flex;gap:8px">
          <button id="ez-copy-btn" class="ez-footer-btn ez-footer-btn--ghost">Copy</button>
          <button id="ez-insert-btn" class="ez-footer-btn ez-footer-btn--primary">Insert into page</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#ez-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  modal.querySelector('#ez-regenerate-btn').addEventListener('click', generateAndShow);
  modal.querySelector('#ez-copy-btn').addEventListener('click', onCopy);
  modal.querySelector('#ez-insert-btn').addEventListener('click', onInsert);
  modal.querySelectorAll('.ez-tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.ez-tone-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      generateAndShow();
    });
  });

  generateAndShow();
}

function getSelectedTone() {
  return document.querySelector('#ez-modal .ez-tone-btn.active')?.dataset.tone || 'Professional';
}

async function generateAndShow() {
  const spinner = document.getElementById('ez-spinner');
  const textarea = document.getElementById('ez-cover-text');
  const regenBtn = document.getElementById('ez-regenerate-btn');
  if (!spinner || !textarea) return;

  spinner.style.display = 'flex';
  textarea.style.display = 'none';
  if (regenBtn) regenBtn.disabled = true;

  const res = await chrome.runtime.sendMessage({
    type: 'GENERATE_COVER_LETTER',
    payload: { profile, ...jobContext, tone: getSelectedTone() }
  });

  spinner.style.display = 'none';
  textarea.style.display = 'block';
  if (regenBtn) regenBtn.disabled = false;

  if (res?.error) {
    textarea.value = `Error: ${res.error}`;
    showToast(res.error, 'error');
  } else {
    textarea.value = res.text;
    textarea.focus();
  }
}

function onCopy() {
  const text = document.getElementById('ez-cover-text')?.value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard', 'success'));
}

function onInsert() {
  const text = document.getElementById('ez-cover-text')?.value;
  if (!text) return;

  const allTextareas = Array.from(document.querySelectorAll('textarea'));
  const target = allTextareas.find(ta => /cover.?letter/i.test(getFieldLabel(ta)))
    || allTextareas.find(ta => ta.offsetParent !== null && !ta.value);

  if (target) {
    FormFiller.injectValue(target, text);
    showToast('Cover letter inserted!', 'success');
    closeModal();
    Storage.logApplication({
      jobTitle: jobContext.jobTitle || 'Unknown',
      company: jobContext.company || location.hostname,
      platform: jobContext.platform,
      url: location.href,
      status: 'cover-letter-inserted'
    });
  } else {
    showToast('No textarea found — use Copy instead', 'warning');
  }
}

function closeModal() {
  document.getElementById('ez-modal')?.remove();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getFieldLabel(el) {
  const id = el.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent.trim();
  }
  const parent = el.closest('div, fieldset, section');
  const label = parent?.querySelector('label, legend, [class*="label"], [class*="question"]');
  return label?.textContent?.trim() || el.placeholder || el.getAttribute('aria-label') || '';
}

function showToast(message, type = 'info') {
  document.getElementById('ez-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'ez-toast';
  toast.className = `ez-toast ez-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function observeNavigation() {
  const onNavigate = () => {
    setTimeout(() => {
      detectJobContext();
      if (!document.getElementById('ez-widget')) injectFloatingUI();
    }, 800);
  };

  const originalPush = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPush(...args);
    onNavigate();
  };
  window.addEventListener('popstate', onNavigate);
}

init();
