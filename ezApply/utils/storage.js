// Profile + Settings → chrome.storage.local (lightweight key-value)
// Applications       → IndexedDB via DB (structured, queryable, no size limit)

const Storage = {
  // ── Profile ────────────────────────────────────────────────────────────────
  async getProfile() {
    return new Promise(resolve => {
      chrome.storage.local.get('profile', data => resolve(data.profile || {}));
    });
  },

  async saveProfile(profile) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ profile }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  async getSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get('settings', data => resolve(data.settings || {}));
    });
  },

  async saveSettings(settings) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ settings }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  },

  // ── Applications → IndexedDB ───────────────────────────────────────────────
  async logApplication(app) {
    return DB.add('applications', {
      ...app,
      date: new Date().toISOString(),
      status: app.status || 'applied'
    });
  },

  async getApplications({ limit = 200, platform, status } = {}) {
    const all = await DB.getAll('applications', { limit });
    return all.filter(a =>
      (!platform || a.platform === platform) &&
      (!status   || a.status   === status)
    );
  },

  async updateApplicationStatus(id, status) {
    return DB.update('applications', id, { status });
  },

  async deleteApplication(id) {
    return DB.delete('applications', id);
  },

  async countApplications() {
    return DB.count('applications');
  }
};
