#!/usr/bin/env python3
"""
Generate vector embeddings for semantic search.

Uses sentence-transformers to create embeddings for all items in the data files.
Outputs a JSON file that can be loaded client-side for cosine similarity search.
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any


def get_model():
    """Load the sentence-transformers model."""
    try:
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer('all-MiniLM-L6-v2')
    except ImportError:
        print("Error: sentence-transformers not installed")
        print("Install with: pip install sentence-transformers")
        sys.exit(1)


# Data files to process
DATA_FILES = [
    "packages.json",
    "datasets.json",
    "resources.json",
    "talks.json",
    "career.json",
    "community.json",
    "roadmaps.json"
]

# Map file to type
FILE_TO_TYPE = {
    "packages.json": "package",
    "datasets.json": "dataset",
    "resources.json": "resource",
    "talks.json": "talk",
    "career.json": "career",
    "community.json": "community",
    "roadmaps.json": "roadmap"
}


def combine_text_for_embedding(item: Dict[str, Any]) -> str:
    """
    Combine relevant fields into a single text for embedding.

    Strategy: Name first (most important), then description, then metadata.
    This matches how users think about items and search for them.
    """
    parts = []

    # Name is most important - always first
    name = item.get("name", "").strip()
    if name:
        parts.append(name)

    # Description provides semantic richness
    description = item.get("description", "").strip()
    if description:
        parts.append(description)

    # Category provides domain context
    category = item.get("category", "").strip()
    if category:
        parts.append(f"Category: {category}")

    # Tags are valuable keywords
    tags = item.get("tags", [])
    if tags and isinstance(tags, list) and len(tags) > 0:
        tags_text = ", ".join(str(t) for t in tags)
        parts.append(f"Tags: {tags_text}")

    # best_for is highly descriptive
    best_for = item.get("best_for", "").strip()
    if best_for:
        parts.append(f"Best for: {best_for}")

    return ". ".join(parts)


def load_all_items(data_dir: Path) -> List[Dict[str, Any]]:
    """Load all items from data files with their types."""
    all_items = []

    for filename in DATA_FILES:
        filepath = data_dir / filename
        if not filepath.exists():
            print(f"Warning: {filename} not found, skipping")
            continue

        with open(filepath) as f:
            items = json.load(f)

        item_type = FILE_TO_TYPE.get(filename, "unknown")

        for item in items:
            # Create a unique ID for each item
            item_id = f"{item_type}-{item.get('name', 'unknown')}".lower()
            item_id = item_id.replace(" ", "-").replace("/", "-")[:100]

            all_items.append({
                "id": item_id,
                "type": item_type,
                "name": item.get("name", ""),
                "description": item.get("description", ""),
                "category": item.get("category", ""),
                "url": item.get("url", ""),
                "tags": item.get("tags", []),
                "best_for": item.get("best_for", ""),
                "text_for_embedding": combine_text_for_embedding(item)
            })

    return all_items


def generate_embeddings(items: List[Dict[str, Any]], model) -> Dict[str, Any]:
    """Generate embeddings for all items."""
    texts = [item["text_for_embedding"] for item in items]

    print(f"Generating embeddings for {len(texts)} items...")
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)

    # Build output structure
    output = {
        "model": "all-MiniLM-L6-v2",
        "dimensions": 384,
        "count": len(items),
        "items": []
    }

    for i, item in enumerate(items):
        # Round embeddings to reduce file size (6 decimal places)
        embedding_list = [round(float(x), 6) for x in embeddings[i]]

        output["items"].append({
            "id": item["id"],
            "type": item["type"],
            "name": item["name"],
            "description": item["description"],
            "category": item["category"],
            "url": item["url"],
            "embedding": embedding_list
        })

    return output


def main():
    script_dir = Path(__file__).parent
    data_dir = script_dir.parent / "data"
    output_dir = script_dir.parent / "static" / "embeddings"

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load items
    print(f"Loading items from {data_dir}...")
    items = load_all_items(data_dir)
    print(f"Loaded {len(items)} items")

    # Load model and generate embeddings
    print("Loading sentence-transformers model...")
    model = get_model()

    embeddings_data = generate_embeddings(items, model)

    # Write output
    output_file = output_dir / "search-embeddings.json"
    print(f"Writing embeddings to {output_file}...")

    with open(output_file, 'w') as f:
        json.dump(embeddings_data, f, separators=(',', ':'))  # Compact JSON

    # Report file size
    file_size = output_file.stat().st_size
    print(f"Done! File size: {file_size / 1024:.1f} KB ({file_size / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    main()
