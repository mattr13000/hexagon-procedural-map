import os
import json
import sys

def generate_agnostic_manifest():
    # Detect the folder where this script is currently sitting
    base_path = os.path.dirname(os.path.abspath(__file__))
    output_file = os.path.join(base_path, "assets_manifest.json")

    manifest = {
        "generated_at": None, # Optional: could add a timestamp
        "base_folder": os.path.basename(base_path),
        "categories": {}
    }

    print(f"Scanning directory: {base_path}...")

    for root, dirs, files in os.walk(base_path):
        # Filter for 3D assets
        assets = [f for f in files if f.lower().endswith(('.glb', '.gltf'))]
        
        if not assets:
            continue
            
        # Create a category name based on the subfolder structure
        rel_path = os.path.relpath(root, base_path)
        
        # 'root' if files are in the same folder as the script, else the subfolder path
        category_name = "root" if rel_path == "." else rel_path.replace("\\", "/") 
        
        manifest["categories"][category_name] = assets
        print(f" Found {len(assets)} assets in category: {category_name}")

    # Write the JSON
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=4)
        print(f"\nSuccess! Manifest saved to: {output_file}")
    except Exception as e:
        print(f"Error writing file: {e}")

if __name__ == "__main__":
    generate_agnostic_manifest()