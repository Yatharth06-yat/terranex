/**
 * TERRANEX 2.2 — Storage Layer (IndexedDB)
 * High-performance browser-side persistence for telemetry, detections,
 * snapshots, event timeline, operator notes, and replay history.
 */

class TerranexStorage {
  constructor() {
    this.dbName = 'TerranexIntelligenceDB';
    this.dbVersion = 1;
    this.db = null;
    this.isReady = false;
    this.initPromise = null;
    this.maxTelemetryRetention = 5000; // max historical packets
    this.maxSnapshotRetention = 100;   // max stored comparison snapshots
    this.maxEventRetention = 2000;     // max timeline events
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Telemetry store
        if (!db.objectStoreNames.contains('telemetry')) {
          const telemStore = db.createObjectStore('telemetry', { keyPath: 'id', autoIncrement: true });
          telemStore.createIndex('received_at', 'received_at', { unique: false });
        }

        // Detection events store (deduplicated)
        if (!db.objectStoreNames.contains('detections')) {
          const detStore = db.createObjectStore('detections', { keyPath: 'id', autoIncrement: true });
          detStore.createIndex('updated_at', 'updated_at', { unique: false });
          detStore.createIndex('count', 'count', { unique: false });
        }

        // Visual Memory Snapshots store
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapStore = db.createObjectStore('snapshots', { keyPath: 'id' });
          snapStore.createIndex('timestamp', 'timestamp', { unique: false });
          snapStore.createIndex('label', 'label', { unique: false });
        }

        // Unified Events Timeline store
        if (!db.objectStoreNames.contains('events')) {
          const eventStore = db.createObjectStore('events', { keyPath: 'id' });
          eventStore.createIndex('timestamp', 'timestamp', { unique: false });
          eventStore.createIndex('category', 'category', { unique: false });
          eventStore.createIndex('severity', 'severity', { unique: false });
          eventStore.createIndex('acknowledged', 'acknowledged', { unique: false });
        }

        // Inspection Journal notes
        if (!db.objectStoreNames.contains('journal')) {
          const journalStore = db.createObjectStore('journal', { keyPath: 'id' });
          journalStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Maintenance advisories store
        if (!db.objectStoreNames.contains('maintenance')) {
          const maintStore = db.createObjectStore('maintenance', { keyPath: 'id' });
          maintStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.isReady = true;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[TerranexStorage] IndexedDB initialization failed:', event.target.error);
        reject(event.target.error);
      };
    });

    return this.initPromise;
  }

  // --- Generic Helpers ---
  async _tx(storeName, mode = 'readonly') {
    await this.init();
    const tx = this.db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    return { tx, store };
  }

  // --- Telemetry Methods ---
  async addTelemetry(record) {
    try {
      const data = {
        ...record,
        client_timestamp: Date.now()
      };
      const { store } = await this._tx('telemetry', 'readwrite');
      return new Promise((resolve, reject) => {
        const req = store.add(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[TerranexStorage] addTelemetry error:', err);
    }
  }

  async getRecentTelemetry(limit = 100) {
    try {
      const { store } = await this._tx('telemetry', 'readonly');
      return new Promise((resolve) => {
        const results = [];
        const req = store.openCursor(null, 'prev');
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results.reverse());
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      console.warn('[TerranexStorage] getRecentTelemetry error:', err);
      return [];
    }
  }

  async getAllTelemetry() {
    try {
      const { store } = await this._tx('telemetry', 'readonly');
      return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  // --- Detection Methods ---
  async addDetection(record) {
    try {
      const { store } = await this._tx('detections', 'readwrite');
      return new Promise((resolve, reject) => {
        const req = store.add({
          ...record,
          client_timestamp: Date.now()
        });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[TerranexStorage] addDetection error:', err);
    }
  }

  async getRecentDetections(limit = 50) {
    try {
      const { store } = await this._tx('detections', 'readonly');
      return new Promise((resolve) => {
        const results = [];
        const req = store.openCursor(null, 'prev');
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  // --- Snapshot Methods ---
  async saveSnapshot(snapshot) {
    try {
      const { store } = await this._tx('snapshots', 'readwrite');
      const item = {
        id: snapshot.id || 'snap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        timestamp: snapshot.timestamp || new Date().toISOString(),
        image: snapshot.image, // Base64 data URL
        label: snapshot.label || 'Manual Snapshot',
        note: snapshot.note || '',
        detectionsCount: snapshot.detectionsCount || 0,
        telemetrySummary: snapshot.telemetrySummary || null
      };
      return new Promise((resolve, reject) => {
        const req = store.put(item);
        req.onsuccess = () => {
          this.pruneSnapshots();
          resolve(item);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[TerranexStorage] saveSnapshot error:', err);
      throw err;
    }
  }

  async getSnapshots() {
    try {
      const { store } = await this._tx('snapshots', 'readonly');
      return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  async deleteSnapshot(id) {
    try {
      const { store } = await this._tx('snapshots', 'readwrite');
      return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      return false;
    }
  }

  // --- Events Timeline Methods ---
  async addEvent(eventObj) {
    try {
      const { store } = await this._tx('events', 'readwrite');
      const item = {
        id: eventObj.id || 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        timestamp: eventObj.timestamp || new Date().toISOString(),
        category: eventObj.category || 'system', // detection, environment, anomaly, sensor, network, maintenance
        severity: eventObj.severity || 'info',   // info, normal, warning, critical
        title: eventObj.title || 'Event',
        description: eventObj.description || '',
        source: eventObj.source || 'system',
        value: eventObj.value !== undefined ? eventObj.value : null,
        acknowledged: !!eventObj.acknowledged,
        resolved: !!eventObj.resolved,
        resolutionNote: eventObj.resolutionNote || ''
      };
      return new Promise((resolve, reject) => {
        const req = store.put(item);
        req.onsuccess = () => resolve(item);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[TerranexStorage] addEvent error:', err);
    }
  }

  async getEvents(filter = {}) {
    try {
      const { store } = await this._tx('events', 'readonly');
      return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
          let list = req.result || [];
          if (filter.category && filter.category !== 'all') {
            list = list.filter(e => e.category === filter.category);
          }
          if (filter.severity && filter.severity !== 'all') {
            list = list.filter(e => e.severity === filter.severity);
          }
          if (filter.search) {
            const q = filter.search.toLowerCase();
            list = list.filter(e =>
              (e.title && e.title.toLowerCase().includes(q)) ||
              (e.description && e.description.toLowerCase().includes(q)) ||
              (e.source && e.source.toLowerCase().includes(q))
            );
          }
          list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  async updateEvent(id, updates) {
    try {
      const { store } = await this._tx('events', 'readwrite');
      return new Promise((resolve, reject) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const item = getReq.result;
          if (!item) return resolve(false);
          const updated = { ...item, ...updates };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve(updated);
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    } catch (err) {
      return false;
    }
  }

  // --- Maintenance Advisories ---
  async saveMaintenanceAdvisory(adv) {
    try {
      const { store } = await this._tx('maintenance', 'readwrite');
      const item = {
        id: adv.id || 'maint_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        timestamp: adv.timestamp || new Date().toISOString(),
        component: adv.component,
        severity: adv.severity || 'warning',
        condition: adv.condition,
        recommendation: adv.recommendation,
        metrics: adv.metrics || {},
        acknowledged: false
      };
      return new Promise((resolve, reject) => {
        const req = store.put(item);
        req.onsuccess = () => resolve(item);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[TerranexStorage] saveMaintenanceAdvisory error:', err);
    }
  }

  async getMaintenanceHistory() {
    try {
      const { store } = await this._tx('maintenance', 'readonly');
      return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  // --- Inspection Journal Notes ---
  async saveJournalNote(text, author = 'Operator') {
    try {
      const { store } = await this._tx('journal', 'readwrite');
      const item = {
        id: 'note_' + Date.now(),
        timestamp: new Date().toISOString(),
        author,
        text
      };
      return new Promise((resolve, reject) => {
        const req = store.put(item);
        req.onsuccess = () => resolve(item);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      return null;
    }
  }

  async getJournalNotes() {
    try {
      const { store } = await this._tx('journal', 'readonly');
      return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  // --- Retention & Quota Management ---
  async pruneSnapshots() {
    try {
      const snapshots = await this.getSnapshots();
      if (snapshots.length > this.maxSnapshotRetention) {
        const toDelete = snapshots.slice(this.maxSnapshotRetention);
        for (const snap of toDelete) {
          await this.deleteSnapshot(snap.id);
        }
      }
    } catch (e) {}
  }

  async clearAll() {
    const stores = ['telemetry', 'detections', 'snapshots', 'events', 'journal', 'maintenance'];
    for (const name of stores) {
      try {
        const { store } = await this._tx(name, 'readwrite');
        store.clear();
      } catch (e) {}
    }
    return true;
  }

  async getStorageStats() {
    const stats = {};
    const stores = ['telemetry', 'detections', 'snapshots', 'events', 'journal', 'maintenance'];
    for (const name of stores) {
      try {
        const { store } = await this._tx(name, 'readonly');
        stats[name] = await new Promise(r => {
          const req = store.count();
          req.onsuccess = () => r(req.result);
          req.onerror = () => r(0);
        });
      } catch (e) {
        stats[name] = 0;
      }
    }
    return stats;
  }
}

// Global storage singleton
window.terranexStorage = new TerranexStorage();
