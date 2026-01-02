#!/usr/bin/env python3
"""
Clean up packages.json by removing non-package items and moving them to resources.json
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"

# Items to REMOVE completely (duplicates already in resources.json)
DUPLICATES_TO_REMOVE = {
    "Causal Inference for the Brave and True",
    "Python for Econometrics",
}

# Items to MOVE to resources.json (not actual packages)
ITEMS_TO_MOVE = {
    # Courses
    "Machine Learning Specialization (Coursera)": {
        "category": "Machine Learning",
        "domain": "Machine Learning",
        "type": "Course"
    },
    "Deep Learning Specialization (Coursera)": {
        "category": "Machine Learning",
        "domain": "Machine Learning",
        "type": "Course"
    },
    "The Missing Semester of Your CS Education (MIT)": {
        "category": "Python",
        "domain": "Developer Tools",
        "type": "Course"
    },
    "QuantEcon Lectures": {
        "category": "Econometrics",
        "domain": "Economics",
        "type": "Course"
    },
    "Beyond Jupyter (TransferLab)": {
        "category": "Python",
        "domain": "Machine Learning",
        "type": "Course"
    },
    "Coding for Economists": {
        "category": "Python",
        "domain": "Economics",
        "type": "Course"
    },
    # Curated lists
    "Awesome Quant": {
        "category": "Quantitative Finance",
        "domain": "Finance",
        "type": "Curated List"
    },
    "Awesome Economics": {
        "category": "Econometrics",
        "domain": "Economics",
        "type": "Curated List"
    },
    # Educational/Textbook implementations
    "First Course in Causal Inference (Python)": {
        "category": "Causal Inference & ML",
        "domain": "Causal Inference",
        "type": "Online Book"
    },
    # Tools
    "Google NotebookLM": {
        "category": "LLMs & Agents",
        "domain": "AI Tools",
        "type": "Tool"
    },
}

def main():
    # Load packages.json
    packages_file = DATA_DIR / "packages.json"
    with open(packages_file, 'r') as f:
        packages = json.load(f)

    print(f"Loaded {len(packages)} packages")

    # Load resources.json
    resources_file = DATA_DIR / "resources.json"
    with open(resources_file, 'r') as f:
        resources = json.load(f)

    print(f"Loaded {len(resources)} resources")

    # Track what we do
    removed = []
    moved = []
    new_packages = []

    for pkg in packages:
        name = pkg.get("name", "")

        if name in DUPLICATES_TO_REMOVE:
            removed.append(name)
            print(f"REMOVING (duplicate): {name}")
            continue

        if name in ITEMS_TO_MOVE:
            moved.append(name)
            move_config = ITEMS_TO_MOVE[name]

            # Create resource entry
            resource_entry = {
                "name": name,
                "description": pkg.get("description", ""),
                "category": move_config["category"],
                "domain": move_config["domain"],
                "url": pkg.get("url", pkg.get("docs_url", "")),
                "type": move_config["type"],
            }

            # Add model_score if present
            if "model_score" in pkg:
                resource_entry["model_score"] = pkg["model_score"]

            resources.append(resource_entry)
            print(f"MOVING to resources: {name} -> {move_config['category']}")
            continue

        # Keep this package
        new_packages.append(pkg)

    print(f"\nSummary:")
    print(f"  Removed (duplicates): {len(removed)}")
    print(f"  Moved to resources: {len(moved)}")
    print(f"  Remaining packages: {len(new_packages)}")
    print(f"  New resources total: {len(resources)}")

    # Save updated packages.json
    with open(packages_file, 'w') as f:
        json.dump(new_packages, f, indent=2)
    print(f"\nSaved {len(new_packages)} packages to {packages_file}")

    # Save updated resources.json
    with open(resources_file, 'w') as f:
        json.dump(resources, f, indent=2)
    print(f"Saved {len(resources)} resources to {resources_file}")

if __name__ == "__main__":
    main()
