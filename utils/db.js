const DB_NAME = 'ezApply';
const DB_VERSION = 1;

const DB = {
  _db: null,

  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('applications')) {
          const store = db.createObjectStore('applications', { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date');
          store.createIndex('platform', 'platform');
          store.createIndex('status', 'status');
          store.createIndex('company', 'company');
        }
      };

      req.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
      req.onerror = e => reject(e.target.error);
    });
  },

  async add(storeName, record) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  },

  async getAll(storeName, { indexName, query, limit } = {}) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const source = indexName ? store.index(indexName) : store;
      const req = source.openCursor(query, 'prev'); // newest first
      const results = [];

      req.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor || (limit && results.length >= limit)) { resolve(results); return; }
        results.push(cursor.value);
        cursor.continue();
      };
      req.onerror = e => reject(e.target.error);
    });
  },

  async update(storeName, id, patch) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const updated = { ...getReq.result, ...patch };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = e => reject(e.target.error);
      };
      getReq.onerror = e => reject(e.target.error);
    });
  },

  async delete(storeName, id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  },

  async count(storeName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  }
};
