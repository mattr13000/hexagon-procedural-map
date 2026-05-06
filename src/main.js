import * as THREE from 'three';
import { OrbitControls }  from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }     from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter }   from 'three/addons/exporters/GLTFExporter.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass }    from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
import { loadAssets }     from './AssetLoader.js';
import { HexGrid }        from './HexGrid.js';
import { Editor }         from './Editor.js';
import { AssetPanel }     from './AssetPanel.js';
import { DetailPanel }    from './DetailPanel.js';

async function init() {
  const viewport = document.getElementById('viewport');

  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  renderer.shadowMap.enabled   = true;
  renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace    = THREE.SRGBColorSpace;
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  viewport.appendChild(renderer.domElement);

  // --- Scene ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7ec8e3);
  scene.fog = new THREE.FogExp2(0x7ec8e3, 0.012);

  // --- Camera ---
  const camera = new THREE.PerspectiveCamera(50, viewport.clientWidth / viewport.clientHeight, 0.1, 500);
  camera.position.set(0, 24, 24);

  // --- Controls ---
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance   = 5;
  controls.maxDistance   = 200;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.target.set(0, 0, 0);
  controls.update();

  // --- Lights ---
  scene.add(new THREE.AmbientLight(0xfff5e4, 1.2));
  const sun = new THREE.DirectionalLight(0xfffbe0, 2.8);
  sun.position.set(20, 40, 15);
  sun.castShadow            = true;
  sun.shadow.mapSize.width  = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near    = 1;
  sun.shadow.camera.far     = 300;
  const sc = 80;
  sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
  sun.shadow.camera.top  =  sc; sun.shadow.camera.bottom = -sc;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9ed8f0, 0x7a5c3e, 0.5));

  // --- Post-processing (OutlinePass for selection) ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const outlineSelect = new OutlinePass(
    new THREE.Vector2(viewport.clientWidth, viewport.clientHeight), scene, camera
  );
  outlineSelect.edgeStrength   = 4;
  outlineSelect.edgeThickness  = 1;
  outlineSelect.visibleEdgeColor.set('#4a90e2');
  outlineSelect.hiddenEdgeColor.set('#1a3a6b');
  composer.addPass(outlineSelect);

  const outlineErase = new OutlinePass(
    new THREE.Vector2(viewport.clientWidth, viewport.clientHeight), scene, camera
  );
  outlineErase.edgeStrength   = 4;
  outlineErase.edgeThickness  = 1;
  outlineErase.visibleEdgeColor.set('#ff4444');
  outlineErase.hiddenEdgeColor.set('#7f1d1d');
  composer.addPass(outlineErase);

  const outlineHover = new OutlinePass(
    new THREE.Vector2(viewport.clientWidth, viewport.clientHeight), scene, camera
  );
  outlineHover.edgeStrength   = 4;
  outlineHover.edgeThickness  = 1;
  outlineHover.visibleEdgeColor.set('#44ff88');
  outlineHover.hiddenEdgeColor.set('#1a5c33');
  composer.addPass(outlineHover);

  composer.addPass(new OutputPass());

  // --- Assets ---
  const library = await loadAssets();
  document.getElementById('loading').style.display = 'none';
  document.getElementById('controls').style.display = 'flex';
  document.getElementById('asset-panel').style.display = 'flex';

  // --- Grid ---
  const grid = new HexGrid(scene, library);
  grid.generate();
  fitCamera(camera, controls, grid.options.rows);

  // --- Panels ---
  const detailPanel = new DetailPanel(document.getElementById('detail'));
  const assetPanel  = new AssetPanel(document.getElementById('asset-panel'), library);

  // --- Editor ---
  const editor = new Editor(renderer, camera, grid, assetPanel, detailPanel);
  detailPanel.setEditor(editor);

  // Prevent OrbitControls from interfering when clicking on tiles
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (assetPanel.getSelected() || assetPanel.isEraseMode()) {
      controls.enabled = false;
    }
  });
  renderer.domElement.addEventListener('pointerup', () => {
    controls.enabled = true;
  });

  // --- Sync outlines each frame ---
  const syncOutlines = () => {
    outlineSelect.selectedObjects = editor.selectObjects;
    outlineErase.selectedObjects  = editor.eraseObjects;
    outlineHover.selectedObjects  = editor.hoverObjects;
  };

  // --- UI helpers ---
  const $ = (id) => document.getElementById(id);

  const gridSlider        = $('gridSize');
  const gridDisplay       = $('gridDisplay');
  const seedInput         = $('seed');
  const waterSlider       = $('waterLevel');
  const waterDisplay      = $('waterDisplay');
  const waterDensity      = $('waterDensity');
  const waterDensityDisp  = $('waterDensityDisplay');
  const landDensity       = $('landDensity');
  const landDensityDisp   = $('landDensityDisplay');
  const cloudDensity      = $('cloudDensity');
  const cloudDensityDisp  = $('cloudDensityDisplay');
  const cloudElevation    = $('cloudElevation');
  const cloudElevDisp     = $('cloudElevationDisplay');
  const genBtn            = $('generate');
  const blankBtn          = $('blank');
  const exportBtn         = $('export');
  const importBtn         = $('import');

  gridSlider.addEventListener('input', () => {
    gridDisplay.textContent = `${gridSlider.value}×${gridSlider.value}`;
  });
  waterSlider.addEventListener('input', () => {
    waterDisplay.textContent = parseFloat(waterSlider.value).toFixed(2);
  });
  waterDensity.addEventListener('input', () => {
    waterDensityDisp.textContent = `${Math.round(waterDensity.value * 100)}%`;
  });
  landDensity.addEventListener('input', () => {
    landDensityDisp.textContent = `${Math.round(landDensity.value * 100)}%`;
  });
  cloudDensity.addEventListener('input', () => {
    cloudDensityDisp.textContent = `${Math.round(cloudDensity.value * 100)}%`;
  });
  cloudElevation.addEventListener('input', () => {
    cloudElevDisp.textContent = cloudElevation.value;
  });

  genBtn.addEventListener('click', () => {
    editor.deselect();
    editor.clearPreview();
    editor.clearHistory();
    assetPanel.clearSelection();
    const size = parseInt(gridSlider.value);
    Object.assign(grid.options, {
      rows: size, cols: size,
      seed:             parseInt(seedInput.value) || 42,
      waterLine:        parseFloat(waterSlider.value),
      waterPropDensity: parseFloat(waterDensity.value),
      landPropDensity:  parseFloat(landDensity.value),
      cloudDensity:     parseFloat(cloudDensity.value),
      cloudElevation:   parseFloat(cloudElevation.value),
    });
    grid.generate();
    fitCamera(camera, controls, size);
  });

  blankBtn.addEventListener('click', () => {
    editor.deselect();
    editor.clearPreview();
    editor.clearHistory();
    assetPanel.clearSelection();
    const size = parseInt(gridSlider.value);
    grid.options.rows = size;
    grid.options.cols = size;
    grid.generateBlank();
    fitCamera(camera, controls, size);
  });

  // Export / Import
  const exporter = new GLTFExporter();
  const loader   = new GLTFLoader();
  exportBtn.addEventListener('click', () => {
    exportBtn.textContent = 'Exporting…';
    exportBtn.disabled = true;

    // Embed editor state as GLTF extras
    const cells = [];
    for (const cell of grid.hexMap.values()) {
      cells.push({
        r: cell.r, c: cell.c,
        elev: cell.elev, rotation: cell.rotation,
        baseKey:  cell.baseKey,
        topKey:   cell.topKey   ?? null,
        cloudKey: cell.cloudKey ?? null,
      });
    }
    grid.group.userData.hexmapSave = JSON.stringify({
      v: 1,
      options: { rows: grid.options.rows, cols: grid.options.cols },
      cells,
    });

    const cleanup = () => { delete grid.group.userData.hexmapSave; };

    exporter.parse(
      grid.group,
      (glb) => {
        cleanup();
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(new Blob([glb], { type: 'application/octet-stream' })),
          download: `hexmap_seed${grid.options.seed}.glb`,
        });
        a.click();
        URL.revokeObjectURL(a.href);
        exportBtn.textContent = 'Export .glb';
        exportBtn.disabled = false;
      },
      (err) => { cleanup(); console.error(err); exportBtn.textContent = 'Export .glb'; exportBtn.disabled = false; },
      { binary: true }
    );
  });

  importBtn.addEventListener('click', () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.glb' });
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      importBtn.textContent = 'Importing…';
      importBtn.disabled = true;
      const reader = new FileReader();
      reader.onload = (ev) => {
        loader.parse(ev.target.result, '', (gltf) => {
          let raw = null;
          gltf.scene.traverse(obj => {
            if (!raw && obj.userData.hexmapSave) raw = obj.userData.hexmapSave;
          });
          if (!raw) {
            alert('Not a hex map file — missing save data.');
            importBtn.textContent = 'Import .glb';
            importBtn.disabled = false;
            return;
          }
          const save = JSON.parse(raw);
          if (save.v !== 1) {
            alert('Incompatible hex map version.');
            importBtn.textContent = 'Import .glb';
            importBtn.disabled = false;
            return;
          }
          editor.deselect();
          editor.clearPreview();
          editor.clearHistory();
          assetPanel.clearSelection();
          grid.loadSave(save);
          const size = save.options?.rows ?? grid.options.rows;
          gridSlider.value = size;
          gridDisplay.textContent = `${size}×${size}`;
          fitCamera(camera, controls, size);
          importBtn.textContent = 'Import .glb';
          importBtn.disabled = false;
        }, (err) => {
          console.error(err);
          alert('Failed to parse GLB.');
          importBtn.textContent = 'Import .glb';
          importBtn.disabled = false;
        });
      };
      reader.readAsArrayBuffer(file);
    });
    input.click();
  });

  // --- Resize ---
  const onResize = () => {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    outlineSelect.setSize(w, h);
    outlineErase.setSize(w, h);
    outlineHover.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  // --- Loop ---
  renderer.setAnimationLoop(() => {
    controls.update();
    syncOutlines();
    composer.render();
  });
}

function fitCamera(camera, controls, gridSize) {
  const d = gridSize * 1.3;
  camera.position.set(0, d, d);
  controls.target.set(0, 0, 0);
  controls.update();
}

init().catch(console.error);
