import * as THREE from 'three';
import { isBaseKey } from './HexGrid.js';

export class Editor {
  constructor(renderer, camera, grid, assetPanel, detailPanel) {
    this.renderer    = renderer;
    this.camera      = camera;
    this.grid        = grid;
    this.assetPanel  = assetPanel;
    this.detailPanel = detailPanel;

    this.raycaster   = new THREE.Raycaster();
    this.pointer     = new THREE.Vector2();

    // Invisible floor plane for clicking empty space
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0;
    grid.scene.add(this.floor);

    // Selection state
    this.selectedKey  = null; // "r,c" of selected hex
    this.eraseHoverKey = null;

    // Outline target lists (filled by main.js OutlinePass)
    this.selectObjects = [];
    this.eraseObjects  = [];

    this._onDown  = this._onPointerDown.bind(this);
    this._onMove  = this._onPointerMove.bind(this);
    renderer.domElement.addEventListener('pointerdown', this._onDown);
    renderer.domElement.addEventListener('pointermove', this._onMove);
  }

  dispose() {
    this.renderer.domElement.removeEventListener('pointerdown', this._onDown);
    this.renderer.domElement.removeEventListener('pointermove', this._onMove);
    this.grid.scene.remove(this.floor);
  }

  // ---- pointer handling ----

  _setPointer(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1
    );
  }

  _castGrid() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.grid.group.children, true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj.parent && obj.parent !== this.grid.group) obj = obj.parent;
      if (obj.userData.hexKey) return obj.userData.hexKey;
    }
    return null;
  }

  _castFloor() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.floor);
    if (!hits.length) return null;
    const pt = hits[0].point;
    return this.grid.worldToHex(pt.x, pt.z);
  }

  _onPointerDown(e) {
    if (e.button !== 0) return;
    this._setPointer(e);

    const eraseMode = this.assetPanel.isEraseMode();
    const hexKey    = this._castGrid();

    if (hexKey) {
      const [r, c] = hexKey.split(',').map(Number);
      if (eraseMode) {
        this._eraseStep(r, c);
      } else {
        const selected = this.assetPanel.getSelected();
        if (selected) {
          this._place(r, c, selected.key);
        } else {
          this._select(hexKey);
        }
      }
      return;
    }

    // Miss — try floor
    const coords = this._castFloor();
    if (!coords) { this._select(null); return; }
    const { r, c } = coords;

    if (!eraseMode) {
      const selected = this.assetPanel.getSelected();
      if (selected) this._place(r, c, selected.key);
    }
  }

  _onPointerMove(e) {
    if (!this.assetPanel.isEraseMode()) {
      if (this.eraseHoverKey !== null) {
        this.eraseHoverKey = null;
        this.eraseObjects  = [];
      }
      return;
    }
    this._setPointer(e);
    const hexKey = this._castGrid();
    if (hexKey !== this.eraseHoverKey) {
      this.eraseHoverKey = hexKey;
      this.eraseObjects  = hexKey ? this._objectsForKey(hexKey) : [];
    }
  }

  // ---- actions ----

  _place(r, c, key) {
    if (isBaseKey(key)) {
      this.grid.placeBase(r, c, key);
    } else {
      this.grid.placeTop(r, c, key);
    }
    const hk = `${r},${c}`;
    this._select(hk);
  }

  _eraseStep(r, c) {
    const hk   = `${r},${c}`;
    const cell = this.grid.hexMap.get(hk);
    if (!cell) return;

    if (cell.topKey) {
      this.grid.removeTop(r, c);
    } else {
      this.grid.removeHex(r, c);
      if (this.selectedKey === hk) this._select(null);
      return;
    }
    this._select(hk);
  }

  _select(hexKey) {
    this.selectedKey   = hexKey;
    this.selectObjects = hexKey ? this._objectsForKey(hexKey) : [];
    this.detailPanel.show(hexKey ? this.grid.hexMap.get(hexKey) : null);
  }

  // Collect all THREE objects for a hexKey (base + top)
  _objectsForKey(hexKey) {
    const cell = this.grid.hexMap.get(hexKey);
    if (!cell) return [];
    return [cell.baseObj, cell.topObj].filter(Boolean);
  }

  // Called by detail panel controls
  adjustElev(delta) {
    if (!this.selectedKey) return;
    const [r, c] = this.selectedKey.split(',').map(Number);
    const cell   = this.grid.hexMap.get(this.selectedKey);
    this.grid.setElev(r, c, cell.elev + delta);
    this.detailPanel.show(this.grid.hexMap.get(this.selectedKey));
  }

  adjustRotation(steps) {
    if (!this.selectedKey) return;
    const [r, c] = this.selectedKey.split(',').map(Number);
    const cell   = this.grid.hexMap.get(this.selectedKey);
    this.grid.setRotation(r, c, cell.rotation + steps);
    this.detailPanel.show(this.grid.hexMap.get(this.selectedKey));
  }

  removeProp() {
    if (!this.selectedKey) return;
    const [r, c] = this.selectedKey.split(',').map(Number);
    this.grid.removeTop(r, c);
    this.detailPanel.show(this.grid.hexMap.get(this.selectedKey));
  }

  removeHex() {
    if (!this.selectedKey) return;
    const [r, c] = this.selectedKey.split(',').map(Number);
    this.grid.removeHex(r, c);
    this._select(null);
  }

  deselect() { this._select(null); }
}
