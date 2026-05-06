import { categoryOf } from './HexGrid.js';

const CAT_COLOR = {
  base:'#6b7280', coast:'#0d9488', rivers:'#2563eb', roads:'#92400e',
  nature:'#16a34a', blue:'#3b82f6', green:'#22c55e', red:'#ef4444',
  yellow:'#eab308', neutral:'#9ca3af',
};

export class DetailPanel {
  constructor(container) {
    this.container = container;
    this._editor   = null; // set after Editor is created
    container.style.display = 'none';
  }

  setEditor(editor) { this._editor = editor; }

  show(cell) {
    if (!cell) { this.container.style.display = 'none'; return; }
    this.container.style.display = 'flex';
    this._render(cell);
  }

  _badge(key) {
    const cat   = categoryOf(key) ?? 'base';
    const color = CAT_COLOR[cat] ?? '#6b7280';
    return `<span class="detail-badge" style="background:${color}">${key}</span>`;
  }

  _render(cell) {
    const rotDeg = cell.rotation * 60;
    const topHtml = cell.topKey
      ? `${this._badge(cell.topKey)}
         <button class="detail-btn danger" id="removePropBtn">Remove prop</button>`
      : `<span class="detail-empty">— empty —</span>`;

    this.container.innerHTML = `
      <div class="detail-row">${this._badge(cell.baseKey)}</div>
      <div class="detail-row">${topHtml}</div>
      <div class="detail-row detail-row--spread">
        <span class="detail-label">Height</span>
        <div class="detail-stepper">
          <button id="elevDown">−</button>
          <span>${(cell.elev * 0.5).toFixed(1)}</span>
          <button id="elevUp">+</button>
        </div>
      </div>
      <div class="detail-row detail-row--spread">
        <span class="detail-label">Rotation</span>
        <div class="detail-stepper">
          <button id="rotLeft">◄ 60°</button>
          <span>${rotDeg}°</span>
          <button id="rotRight">60° ►</button>
        </div>
      </div>
      <button class="detail-btn danger" id="removeHexBtn">Remove hex</button>
    `;

    this.container.querySelector('#elevDown')    ?.addEventListener('click', () => this._editor?.adjustElev(-1));
    this.container.querySelector('#elevUp')      ?.addEventListener('click', () => this._editor?.adjustElev(1));
    this.container.querySelector('#rotLeft')     ?.addEventListener('click', () => this._editor?.adjustRotation(-1));
    this.container.querySelector('#rotRight')    ?.addEventListener('click', () => this._editor?.adjustRotation(1));
    this.container.querySelector('#removePropBtn')?.addEventListener('click', () => this._editor?.removeProp());
    this.container.querySelector('#removeHexBtn') ?.addEventListener('click', () => this._editor?.removeHex());
  }
}
