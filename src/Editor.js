import * as THREE from 'three';
import { isBaseKey, isCloudKey } from './HexGrid.js';

export class Editor {
  constructor(renderer, camera, grid, assetPanel, detailPanel) {
    this.renderer    = renderer;
    this.camera      = camera;
    this.grid        = grid;
    this.assetPanel  = assetPanel;
    this.detailPanel = detailPanel;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.set(0); // only hit layer-0 objects (not preview)
    this.pointer   = new THREE.Vector2();

    // Invisible floor plane for clicking empty space
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0;
    grid.scene.add(this.floor);

    // Selection state
    this.selectedKey   = null;
    this.eraseHoverKey = null;

    // Outline target lists (read by main.js OutlinePass)
    this.selectObjects = [];
    this.eraseObjects  = [];

    // Undo stack (max 50 entries)
    this._undoStack = [];

    // Hover state
    this._hoverKey      = null;
    this.hoverObjects   = [];
    this._previewObj    = null;
    this._previewHexKey = null;
    this._previewAsset  = null;

    this._onDown   = this._onPointerDown.bind(this);
    this._onMove   = this._onPointerMove.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    renderer.domElement.addEventListener('pointerdown', this._onDown);
    renderer.domElement.addEventListener('pointermove', this._onMove);
    window.addEventListener('keydown', this._onKeyDown);
  }

  dispose() {
    this.renderer.domElement.removeEventListener('pointerdown', this._onDown);
    this.renderer.domElement.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('keydown', this._onKeyDown);
    this.grid.scene.remove(this.floor);
    this.clearPreview();
  }

  clearHistory() {
    this._undoStack = [];
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
    this.clearPreview();

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
    this._setPointer(e);

    if (this.assetPanel.isEraseMode()) {
      this.clearPreview();
      const hexKey = this._castGrid();
      if (hexKey !== this.eraseHoverKey) {
        this.eraseHoverKey = hexKey;
        this.eraseObjects  = hexKey ? this._objectsForKey(hexKey) : [];
      }
      return;
    }

    // Not erase mode — clear erase highlight
    if (this.eraseHoverKey !== null) {
      this.eraseHoverKey = null;
      this.eraseObjects  = [];
    }

    const selected = this.assetPanel.getSelected();
    if (!selected) { this.clearPreview(); return; }

    let hexKey = this._castGrid();
    if (!hexKey) {
      const coords = this._castFloor();
      if (coords) hexKey = `${coords.r},${coords.c}`;
    }

    this._updateHover(hexKey ?? null, selected.key);
  }

  // ---- hover highlight + preview ----

  _updateHover(hexKey, assetKey) {
    // Outline highlight
    if (hexKey !== this._hoverKey) {
      this._hoverKey    = hexKey;
      this.hoverObjects = hexKey ? this._objectsForKey(hexKey) : [];
    }

    // 3D preview — recreate only when hex or asset changes
    if (hexKey === this._previewHexKey && assetKey === this._previewAsset) return;

    if (this._previewObj) {
      this.grid.group.remove(this._previewObj);
      this._previewObj = null;
    }
    this._previewHexKey = hexKey;
    this._previewAsset  = assetKey;

    if (!hexKey || !assetKey) return;
    const bp = this.grid.library[assetKey];
    if (!bp) return;

    const [r, c] = hexKey.split(',').map(Number);
    const { x, z } = this.grid._localPos(r, c);
    const cell = this.grid.hexMap.get(hexKey);
    const elev = cell ? cell.elev : 0;
    const y    = isBaseKey(assetKey) ? elev * 0.5
               : isCloudKey(assetKey) ? this.grid._cloudY({ elev })
               : this.grid._topY({ elev });

    const obj = bp.clone(true);
    obj.position.set(x, y, z);
    obj.renderOrder = 999;
    obj.traverse(child => {
      if (child.isMesh) {
        child.renderOrder  = 999;
        child.material     = child.material.clone();
        child.material.transparent  = true;
        child.material.opacity      = 0.6;
        child.material.depthTest    = false;
        child.material.depthWrite   = false;
      }
    });
    this.grid.group.add(obj);
    this._previewObj = obj;
  }

  clearPreview() {
    this._hoverKey      = null;
    this.hoverObjects   = [];
    if (this._previewObj) {
      this.grid.group.remove(this._previewObj);
      this._previewObj = null;
    }
    this._previewHexKey = null;
    this._previewAsset  = null;
  }

  // ---- undo ----

  _snapshotCell(r, c) {
    const hk   = `${r},${c}`;
    const cell = this.grid.hexMap.get(hk);
    if (!cell) return { exists: false, r, c, hk };
    return {
      exists: true, r, c, hk,
      elev:     cell.elev,
      rotation: cell.rotation,
      baseKey:  cell.baseKey,
      topKey:   cell.topKey,
      cloudKey: cell.cloudKey,
    };
  }

  _pushUndo(snap) {
    this._undoStack.push(snap);
    if (this._undoStack.length > 50) this._undoStack.shift();
  }

  undo() {
    if (!this._undoStack.length) return;
    const snap = this._undoStack.pop();
    this.grid.restoreCell(snap);
    if (this.selectedKey === snap.hk) {
      this._select(snap.exists ? snap.hk : null);
    }
  }

  _onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      this.undo();
    }
  }

  // ---- actions ----

  _place(r, c, key) {
    this._pushUndo(this._snapshotCell(r, c));
    if (isBaseKey(key)) {
      const existing = this.grid.hexMap.get(`${r},${c}`);
      this.grid.placeBase(r, c, key, existing ? existing.elev : 0);
    } else if (isCloudKey(key)) {
      this.grid.placeCloud(r, c, key);
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

    this._pushUndo(this._snapshotCell(r, c));

    if (cell.cloudKey) {
      this.grid.removeCloud(r, c);
    } else if (cell.topKey) {
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

  // Collect all THREE objects for a hexKey (base + top + cloud)
  _objectsForKey(hexKey) {
    const cell = this.grid.hexMap.get(hexKey);
    if (!cell) return [];
    return [cell.baseObj, cell.topObj, cell.cloudObj].filter(Boolean);
  }

  // Called by detail panel controls
  adjustElev(delta) {
    if (!this.selectedKey) return;
    const [r, c] = this.selectedKey.split(',').map(Number);
    this._pushUndo(this._snapshotCell(r, c));
    const cell = this.grid.hexMap.get(this.selectedKey);
    this.grid.setElev(r, c, cell.elev + delta);
    this.detailPanel.show(this.grid.hexMap.get(this.selectedKey));
  }

  adjustRotation(steps) {
    if (!this.selectedKey) return;
    const [r, c] = this.selectedKey.split(',').map(Number);
    this._pushUndo(this._snapshotCell(r, c));
    const cell = this.grid.hexMap.get(this.selectedKey);
    this.grid.setRotation(r, c, cell.rotation + steps);
    this.detailPanel.show(this.grid.hexMap.get(this.selectedKey));
  }

  removeProp() {
    if (!this.selectedKey) return;
    const [r, c] = this.selectedKey.split(',').map(Number);
    this._pushUndo(this._snapshotCell(r, c));
    this.grid.removeTop(r, c);
    this.detailPanel.show(this.grid.hexMap.get(this.selectedKey));
  }

  removeCloud() {
    if (!this.selectedKey) return;
    const [r, c] = this.selectedKey.split(',').map(Number);
    this._pushUndo(this._snapshotCell(r, c));
    this.grid.removeCloud(r, c);
    this.detailPanel.show(this.grid.hexMap.get(this.selectedKey));
  }

  removeHex() {
    if (!this.selectedKey) return;
    const [r, c] = this.selectedKey.split(',').map(Number);
    this._pushUndo(this._snapshotCell(r, c));
    this.grid.removeHex(r, c);
    this._select(null);
  }

  deselect() { this._select(null); }
}
