/* store.js */

/* =============================================
   ImageDB — IndexedDB wrapper (shared)
   ============================================= */
const ImageDB = {
  db: null,

  async open() {
    return new Promise((res, rej) => {
      const req = indexedDB.open('shop_images', 1);
      req.onupgradeneeded = e =>
        e.target.result.createObjectStore('images', { keyPath: 'name' });
      req.onsuccess = e => { this.db = e.target.result; res(); };
      req.onerror   = ()  => rej(req.error);
    });
  },

  async save(name, blob) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction('images', 'readwrite');
      tx.objectStore('images').put({ name, blob });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },

  async get(name) {
    return new Promise((res, rej) => {
      const req = this.db.transaction('images').objectStore('images').get(name);
      req.onsuccess = e => res(e.target.result?.blob ?? null);
      req.onerror   = ()  => rej(req.error);
    });
  },

  async getAll() {
    return new Promise((res, rej) => {
      const req = this.db.transaction('images').objectStore('images').getAll();
      req.onsuccess = e => res(e.target.result ?? []);
      req.onerror   = ()  => rej(req.error);
    });
  },

  async delete(name) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction('images', 'readwrite');
      tx.objectStore('images').delete(name);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },

  isLocal(url)  { return typeof url === 'string' && url.startsWith('/assets/images/'); },
  filename(url) { return url?.split('/').pop() ?? ''; },
};

/**
 * Resolves all local image paths in `root` via IndexedDB.
 * Fixes <img src> and [data-url] attributes used by thumbnails.
 */
async function resolveLocalImages(root = document) {
  await Promise.all([...root.querySelectorAll('img[src]')].map(async img => {
    const src = img.getAttribute('src');
    if (!ImageDB.isLocal(src)) return;
    const blob = await ImageDB.get(ImageDB.filename(src));
    if (blob) img.src = URL.createObjectURL(blob);
  }));
  await Promise.all([...root.querySelectorAll('[data-url]')].map(async el => {
    const url = el.dataset.url;
    if (!ImageDB.isLocal(url)) return;
    const blob = await ImageDB.get(ImageDB.filename(url));
    if (blob) el.dataset.url = URL.createObjectURL(blob);
  }));
}

const Store = {
  KEY: 'shop_products',

  /* --- Admin: localStorage ---------------------------------------- */
  async init() {
    if (!localStorage.getItem(this.KEY)) await this.loadFromJSON();
  },
  async loadFromJSON() {
    try {
      const r = await fetch('/data/products.json');
      if (!r.ok) throw new Error();
      const data = await r.json();
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch { localStorage.setItem(this.KEY, JSON.stringify([])); }
  },

  /* --- Public pages: fetch JSON directly, no localStorage --------- */
  _mem: null,
  async fetchJSON() {
    try {
      const r = await fetch('/data/products.json');
      if (!r.ok) throw new Error();
      return await r.json();
    } catch { return []; }
  },
  fromData(data) { this._mem = data; },

  /* --- Reads: use in-memory if set, otherwise localStorage -------- */
  getAll()         { return this._mem ?? JSON.parse(localStorage.getItem(this.KEY) || '[]'); },
  getFeatured()    { return this.getAll().filter(p => p.featured); },
  getById(id)      { return this.getAll().find(p => p.id === id) ?? null; },
  getByCategory(c) { return (!c || c === 'todos') ? this.getAll() : this.getAll().filter(p => p.category === c); },
  getCategories()  { return [...new Set(this.getAll().map(p => p.category).filter(Boolean))]; },
  save(p) {
    const all = this.getAll();
    if (!p.id) { p.id = 'prod_' + Date.now(); p.createdAt = new Date().toISOString(); }
    p.updatedAt = new Date().toISOString();
    const i = all.findIndex(x => x.id === p.id);
    i >= 0 ? all[i] = p : all.unshift(p);
    localStorage.setItem(this.KEY, JSON.stringify(all));
    return p;
  },
  delete(id) {
    localStorage.setItem(this.KEY, JSON.stringify(this.getAll().filter(p => p.id !== id)));
  },
  exportJSON() {
    const blob = new Blob([JSON.stringify(this.getAll(), null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'products.json' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  },
  formatPrice(n) {
    return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', minimumFractionDigits: 2 }).format(n);
  },
  stockStatus(n) {
    if (n === 0) return { label: 'Sin stock', cls: 'out' };
    if (n <= 3)  return { label: `Últimas ${n} unidades`, cls: 'low' };
    return { label: `En stock (${n})`, cls: 'ok' };
  }
};

function showToast(msg, type = 'success') {
  const c = document.getElementById('toasts'); if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
