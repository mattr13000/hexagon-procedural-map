import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import manifest from './assets_manifest.json';

// --- Category helpers (used by Editor + AssetPanel) ---

const KEY_CATEGORY = {};
for (const [cat, files] of Object.entries(manifest.categories)) {
  for (const file of files) KEY_CATEGORY[file.replace('.gltf', '')] = cat;
}

const BASE_CATS = new Set(['base', 'coast', 'rivers', 'roads']);

export const categoryOf  = (key) => KEY_CATEGORY[key] ?? null;
export const isBaseKey   = (key) => BASE_CATS.has(categoryOf(key) ?? '');
export const isCloudKey  = (key) => key.startsWith('cloud_');

// --- Private helpers ---

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fbm(noise2D, x, y) {
  return (
    noise2D(x,     y    ) * 1.000 +
    noise2D(x * 2, y * 2) * 0.500 +
    noise2D(x * 4, y * 4) * 0.250 +
    noise2D(x * 8, y * 8) * 0.125
  ) / 1.875;
}

function hexNeighbors(r, c, rows, cols) {
  const odd = r % 2 !== 0;
  return [
    [r - 1, odd ? c : c - 1], [r - 1, odd ? c + 1 : c],
    [r,     c - 1           ], [r,     c + 1           ],
    [r + 1, odd ? c : c - 1], [r + 1, odd ? c + 1 : c],
  ].filter(([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols);
}

const WATER_PROPS = ['waterlily_A', 'waterlily_B', 'waterplant_A', 'waterplant_B', 'waterplant_C'];
const LAND_PROPS  = [
  'hills_A', 'hills_A_trees', 'hills_B', 'hills_B_trees', 'hills_C', 'hills_C_trees',
  'hill_single_A', 'hill_single_B', 'hill_single_C',
  'mountain_A', 'mountain_A_grass', 'mountain_A_grass_trees',
  'mountain_B', 'mountain_B_grass', 'mountain_B_grass_trees',
  'mountain_C', 'mountain_C_grass', 'mountain_C_grass_trees',
  'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E',
  'trees_A_large', 'trees_A_medium', 'trees_A_small',
  'trees_B_large', 'trees_B_medium', 'trees_B_small',
  'tree_single_A', 'tree_single_B',
];
const CLOUD_PROPS = ['cloud_big', 'cloud_small'];

// --- HexGrid ---

export class HexGrid {
  constructor(scene, library, options = {}) {
    this.scene   = scene;
    this.library = library;
    this.options = {
      rows: 20, cols: 20, seed: 42, noiseScale: 2.5, waterLine: -0.1,
      waterPropDensity: 0.15, landPropDensity: 0.20,
      cloudDensity: 0.05, cloudElevation: 3,
      ...options,
    };
    this.group = new THREE.Group();
    scene.add(this.group);

    // Exposed for Editor coordinate math
    this.colSpacing   = 0;
    this.rowSpacing   = 0;
    this.oddRowOffset = 0;

    // Source of truth: "r,c" → HexCell
    this.hexMap = new Map();
  }

  // ---- internal ----

  _key(r, c) { return `${r},${c}`; }

  _localPos(r, c) {
    return {
      x: c * this.colSpacing + (r % 2 !== 0 ? this.oddRowOffset : 0),
      z: r * this.rowSpacing,
    };
  }

  _makeObj(assetKey, x, y, z, hexKey, rotSteps = 0) {
    const bp = this.library[assetKey];
    if (!bp) return null;
    const obj = bp.clone(true);
    obj.position.set(x, y, z);
    obj.rotation.y     = rotSteps * (Math.PI / 3);
    obj.userData.hexKey = hexKey;
    obj.traverse(child => {
      if (child.isMesh) {
        child.castShadow    = true;
        child.receiveShadow = true;
      }
    });
    this.group.add(obj);
    return obj;
  }

  _removeObj(obj) {
    if (obj) this.group.remove(obj);
  }

  _topY(cell, key) {
    const baseY = cell.elev * 0.5;
    return baseY + (isCloudKey(key) ? this.options.cloudElevation : 0);
  }

  // ---- public editing API ----

  /** Place (or replace) the base tile on a hex. Creates the cell if needed. */
  placeBase(r, c, key, elev = 0) {
    const hk   = this._key(r, c);
    const { x, z } = this._localPos(r, c);
    let cell = this.hexMap.get(hk);

    if (cell) {
      this._removeObj(cell.baseObj);
      cell.baseKey = key;
      cell.elev    = elev;
    } else {
      cell = { r, c, posX: x, posZ: z, elev, rotation: 0, baseKey: key, baseObj: null, topKey: null, topObj: null };
      this.hexMap.set(hk, cell);
    }

    cell.baseObj = this._makeObj(key, x, cell.elev * 0.5, z, hk, cell.rotation);

    // Reposition top to match new elev
    if (cell.topObj) {
      cell.topObj.position.y = this._topY(cell, cell.topKey);
    }
    return cell;
  }

  /** Place (or replace) the top slot on an existing hex. Auto-creates hex_grass if hex doesn't exist. */
  placeTop(r, c, key) {
    const hk = this._key(r, c);
    if (!this.hexMap.has(hk)) this.placeBase(r, c, 'hex_grass', 0);
    const cell = this.hexMap.get(hk);
    this._removeObj(cell.topObj);
    const { x, z } = this._localPos(r, c);
    cell.topKey = key;
    cell.topObj = this._makeObj(key, x, this._topY(cell, key), z, hk, cell.rotation);
    return cell;
  }

  removeTop(r, c) {
    const cell = this.hexMap.get(this._key(r, c));
    if (!cell) return;
    this._removeObj(cell.topObj);
    cell.topKey = null;
    cell.topObj = null;
  }

  removeHex(r, c) {
    const hk   = this._key(r, c);
    const cell = this.hexMap.get(hk);
    if (!cell) return;
    this._removeObj(cell.baseObj);
    this._removeObj(cell.topObj);
    this.hexMap.delete(hk);
  }

  setElev(r, c, elev) {
    const cell = this.hexMap.get(this._key(r, c));
    if (!cell) return;
    cell.elev = Math.max(0, Math.min(3, elev));
    const y = cell.elev * 0.5;
    if (cell.baseObj) cell.baseObj.position.y = y;
    if (cell.topObj)  cell.topObj.position.y  = this._topY(cell, cell.topKey);
  }

  setRotation(r, c, steps) {
    const cell = this.hexMap.get(this._key(r, c));
    if (!cell) return;
    cell.rotation = ((steps % 6) + 6) % 6;
    const rad = cell.rotation * (Math.PI / 3);
    if (cell.baseObj) cell.baseObj.rotation.y = rad;
    if (cell.topObj)  cell.topObj.rotation.y  = rad;
  }

  /** Convert a world-space point to the nearest hex (r, c). */
  worldToHex(worldX, worldZ) {
    const lx = worldX - this.group.position.x;
    const lz = worldZ - this.group.position.z;
    const r  = Math.round(lz / this.rowSpacing);
    const c  = Math.round((lx - (r % 2 !== 0 ? this.oddRowOffset : 0)) / this.colSpacing);
    return { r, c };
  }

  // ---- generation ----

  generate() {
    this.group.clear();
    this.hexMap.clear();

    const { rows, cols, seed, noiseScale, waterLine,
            waterPropDensity, landPropDensity, cloudDensity } = this.options;

    const noise2D = createNoise2D(mulberry32(seed));
    const rng     = mulberry32(seed + 99999);

    const ref = this.library['hex_grass'];
    if (!ref) { console.error('hex_grass blueprint missing'); return; }
    const ts = new THREE.Vector3();
    new THREE.Box3().setFromObject(ref).getSize(ts);

    this.colSpacing   = ts.x;
    this.rowSpacing   = ts.z * 0.75;
    this.oddRowOffset = ts.x * 0.5;

    // Noise → raw cells
    const elevBand = (1.0 - waterLine) / 4;
    const raw = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const n = fbm(noise2D, (c / cols) * noiseScale, (r / rows) * noiseScale);
        if (n < waterLine) return { water: true, elev: 0 };
        const above = n - waterLine;
        const elev  = above < elevBand ? 0 : above < elevBand * 2 ? 1 : above < elevBand * 3 ? 2 : 3;
        return { water: false, elev };
      })
    );

    // Smooth land: no two adjacent land tiles differ by more than 1
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (raw[r][c].water) continue;
          for (const [nr, nc] of hexNeighbors(r, c, rows, cols)) {
            if (raw[nr][nc].water) continue;
            if (raw[r][c].elev - raw[nr][nc].elev > 1) {
              raw[r][c].elev--;
              changed = true;
            }
          }
        }
      }
    }

    const waterProps = WATER_PROPS.filter(k => this.library[k]);
    const landProps  = LAND_PROPS.filter(k => this.library[k]);
    const cloudProps = CLOUD_PROPS.filter(k => this.library[k]);
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const { water, elev } = raw[r][c];
        const baseKey = water ? 'hex_water' : 'hex_grass';

        // Creates cell + places base object
        this.placeBase(r, c, baseKey, elev);
        const cell = this.hexMap.get(this._key(r, c));

        // Top slot: first matching density roll wins
        let topKey = null;
        if (water && waterProps.length && rng() < waterPropDensity)  topKey = pick(waterProps);
        else if (!water && landProps.length && rng() < landPropDensity) topKey = pick(landProps);
        else if (cloudProps.length && rng() < cloudDensity)            topKey = pick(cloudProps);

        if (topKey) {
          const { x, z } = this._localPos(r, c);
          cell.topKey = topKey;
          cell.topObj = this._makeObj(topKey, x, this._topY(cell, topKey), z, this._key(r, c), 0);
        }
      }
    }

    // Centre group
    const center = new THREE.Box3().setFromObject(this.group).getCenter(new THREE.Vector3());
    this.group.position.set(-center.x, 0, -center.z);
  }
}
