import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import manifest from './assets_manifest.json';

export async function loadAssets() {
  const loader = new GLTFLoader();
  const library = {};
  const tasks = [];

  for (const [category, files] of Object.entries(manifest.categories)) {
    if (category.includes('waterless')) continue;

    for (const file of files) {
      const key = file.replace('.gltf', '');
      const url = `${manifest.basePath}${category}/${file}`;

      tasks.push(
        new Promise((resolve) => {
          loader.load(
            url,
            (gltf) => { library[key] = gltf.scene; resolve(); },
            undefined,
            (err) => { console.warn(`Failed to load: ${url}`, err); resolve(); }
          );
        })
      );
    }
  }

  await Promise.all(tasks);
  return library;
}
