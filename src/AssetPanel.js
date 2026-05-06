import manifest from './assets_manifest.json';

// Per-category badge colours
const CAT_COLOR = {
  base:               '#6b7280',
  coast:              '#0d9488',
  'coast/waterless':  '#0d9488',
  rivers:             '#2563eb',
  'rivers/waterless': '#2563eb',
  roads:              '#92400e',
  nature:             '#16a34a',
  'buildings/blue':   '#3b82f6',
  'buildings/green':  '#22c55e',
  'buildings/red':    '#ef4444',
  'buildings/yellow': '#eab308',
  'buildings/neutral':'#9ca3af',
};

// Human-readable category labels
const CAT_LABEL = {
  base: 'Base', coast: 'Coast', rivers: 'Rivers', roads: 'Roads',
  nature: 'Nature',
  'buildings/blue':    'Blue',
  'buildings/green':   'Green',
  'buildings/red':     'Red',
  'buildings/yellow':  'Yellow',
  'buildings/neutral': 'Neutral',
};

export class AssetPanel {
  constructor(container, library) {
    this.container   = container;
    this.library     = library;
    this._selected   = null; // { key, category }
    this._eraseMode  = false;
    this._onSelect   = null; // callback(key) | null
    this._onErase    = null; // callback(active)
    this._build();
  }

  onSelect(cb) { this._onSelect = cb; }
  onErase(cb)  { this._onErase  = cb; }

  getSelected()  { return this._selected; }
  isEraseMode()  { return this._eraseMode; }

  clearSelection() {
    this._selected = null;
    this._eraseMode = false;
    this._syncHighlight();
    this._syncErase();
  }

  // ---- DOM ----

  _build() {
    this.container.innerHTML = '';

    // Erase button
    const eraseBtn = document.createElement('button');
    eraseBtn.id        = 'eraseBtn';
    eraseBtn.textContent = '⌫  Erase';
    eraseBtn.addEventListener('click', () => {
      this._eraseMode = !this._eraseMode;
      if (this._eraseMode) this._selected = null;
      this._syncHighlight();
      this._syncErase();
      this._onErase?.(this._eraseMode);
    });
    this.container.appendChild(eraseBtn);

    // Category groups (skip waterless)
    for (const [cat, files] of Object.entries(manifest.categories)) {
      if (cat.includes('waterless')) continue;

      const section = document.createElement('div');
      section.className = 'cat-section';

      // Header
      const header = document.createElement('div');
      header.className = 'cat-header';
      const badge = document.createElement('span');
      badge.className   = 'cat-badge';
      badge.style.background = CAT_COLOR[cat] ?? '#6b7280';
      badge.textContent = CAT_LABEL[cat] ?? cat;
      const arrow = document.createElement('span');
      arrow.className   = 'cat-arrow';
      arrow.textContent = '▾';
      header.append(badge, arrow);
      header.addEventListener('click', () => {
        const open = grid.style.display !== 'none';
        grid.style.display = open ? 'none' : 'grid';
        arrow.textContent  = open ? '▸' : '▾';
      });

      // Item grid
      const grid = document.createElement('div');
      grid.className = 'cat-grid';

      for (const file of files) {
        const key = file.replace('.gltf', '');
        if (!this.library[key]) continue; // skip failed loads

        const item = document.createElement('div');
        item.className       = 'asset-item';
        item.dataset.key     = key;
        item.dataset.cat     = cat;

        const dot = document.createElement('span');
        dot.className   = 'asset-dot';
        dot.style.background = CAT_COLOR[cat] ?? '#6b7280';

        const label = document.createElement('span');
        label.className   = 'asset-label';
        label.textContent = key;
        label.title       = key;

        item.append(dot, label);
        item.addEventListener('click', () => this._pickItem(key, cat, item));
        grid.appendChild(item);
      }

      section.append(header, grid);
      this.container.appendChild(section);
    }
  }

  _pickItem(key, cat, el) {
    this._eraseMode = false;
    this._selected  = { key, cat };
    this._syncHighlight(el);
    this._syncErase();
    this._onSelect?.(key);
  }

  _syncHighlight(activeEl = null) {
    this.container.querySelectorAll('.asset-item').forEach(el => {
      el.classList.toggle('selected', el === activeEl || el.dataset.key === this._selected?.key);
    });
  }

  _syncErase() {
    const btn = document.getElementById('eraseBtn');
    if (btn) btn.classList.toggle('active', this._eraseMode);
  }
}
