#!/usr/bin/env python3
"""
Cluster items by topic using semantic embeddings.

Uses K-means clustering on pre-computed embeddings to group similar content.
Generates cluster labels from the most common topic_tags in each cluster.

Output: data/topic_clusters.json
"""

import json
import numpy as np
from collections import Counter
from pathlib import Path
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score


def load_embeddings(embeddings_file: Path, count: int, dim: int) -> np.ndarray:
    """Load binary Float32 embeddings."""
    with open(embeddings_file, 'rb') as f:
        data = np.frombuffer(f.read(), dtype=np.float32)
    return data.reshape(count, dim)


def load_metadata(metadata_file: Path) -> dict:
    """Load search metadata JSON."""
    with open(metadata_file) as f:
        return json.load(f)


def extract_cluster_label(items: list, metadata_items: list, item_indices: list) -> tuple:
    """
    Extract a descriptive label for a cluster based on common topic_tags.
    Returns (label, top_tags, categories).
    """
    all_tags = []
    all_categories = []

    for idx in item_indices:
        item = metadata_items[idx]
        # Parse topic_tags (comma-separated string)
        tags = item.get('topic_tags', '')
        if tags:
            all_tags.extend([t.strip() for t in tags.split(',')])
        # Also collect categories
        cat = item.get('category', '')
        if cat:
            all_categories.append(cat)

    # Get most common tags and categories
    tag_counts = Counter(all_tags)
    cat_counts = Counter(all_categories)

    top_tags = [tag for tag, _ in tag_counts.most_common(5)]
    top_categories = [cat for cat, _ in cat_counts.most_common(3)]

    # Generate cleaner label - dedupe similar tags
    label = generate_clean_label(top_tags, top_categories)

    return label, top_tags, top_categories


def generate_clean_label(tags: list, categories: list) -> str:
    """Generate a clean, non-repetitive label from tags."""
    # Clean up category (remove hierarchy markers)
    clean_categories = []
    for cat in categories:
        # Take last part after ">" if present
        if '>' in cat:
            cat = cat.split('>')[-1].strip()
        clean_categories.append(cat)

    if not tags:
        return clean_categories[0] if clean_categories else "Miscellaneous"

    # Normalize tags for comparison
    def normalize(s):
        return s.lower().replace('-', ' ').replace('_', ' ')

    # Skip boring/generic tags
    SKIP_TAGS = {'career-portal', 'job-search', 'career-opportunities', 'job-board',
                 'economist-roles', 'economist-jobs', 'careers', 'hiring'}

    # Dedupe tags that are too similar
    seen_normalized = set()
    unique_tags = []
    for tag in tags:
        if tag.lower() in SKIP_TAGS:
            continue
        norm = normalize(tag)
        # Skip if we've seen something very similar
        is_dupe = False
        for seen in seen_normalized:
            # Check if one contains the other or they share >70% words
            words1 = set(norm.split())
            words2 = set(seen.split())
            if words1 == words2 or norm in seen or seen in norm:
                is_dupe = True
                break
            # High word overlap
            if len(words1 & words2) >= max(len(words1), len(words2)) * 0.7:
                is_dupe = True
                break
        if not is_dupe:
            seen_normalized.add(norm)
            unique_tags.append(tag)
        if len(unique_tags) >= 2:  # Only use 2 tags for cleaner labels
            break

    # Format nicely
    if unique_tags:
        formatted = [t.replace('-', ' ').title() for t in unique_tags]
        return ' & '.join(formatted)

    # Fall back to category
    return clean_categories[0] if clean_categories else "Miscellaneous"


def dedupe_labels(clusters: list) -> None:
    """Deduplicate cluster labels by adding differentiators."""
    from collections import defaultdict

    # Track all used labels to ensure uniqueness
    used_labels = set()

    # Find duplicate labels
    label_clusters = defaultdict(list)
    for c in clusters:
        label_clusters[c['label']].append(c)

    for label, dupes in label_clusters.items():
        if len(dupes) <= 1:
            used_labels.add(label)
            continue

        # Try to differentiate using categories or additional tags
        for i, c in enumerate(dupes):
            # Try category first
            cats = c.get('top_categories', [])
            extra_tags = c.get('top_tags', [])[2:5]  # Tags beyond the first 2

            new_label = None

            # Use category if it's informative
            for cat in cats:
                if cat and '>' in cat:
                    cat = cat.split('>')[-1].strip()
                if cat and cat.lower() not in label.lower() and len(cat) < 30:
                    candidate = f"{label}: {cat}"
                    if candidate not in used_labels:
                        new_label = candidate
                        break

            # Otherwise use an extra tag
            if not new_label:
                for tag in extra_tags:
                    tag_clean = tag.replace('-', ' ').title()
                    if tag_clean.lower() not in label.lower():
                        candidate = f"{label}: {tag_clean}"
                        if candidate not in used_labels:
                            new_label = candidate
                            break

            # If still no unique label, add a number
            if not new_label:
                num = 2
                while f"{label} #{num}" in used_labels:
                    num += 1
                if i == 0:
                    new_label = label  # Keep first as-is if possible
                    if new_label in used_labels:
                        new_label = f"{label} #{num}"
                else:
                    new_label = f"{label} #{num}"

            c['label'] = new_label
            used_labels.add(new_label)


def find_optimal_k(embeddings: np.ndarray, k_range: range) -> int:
    """Find optimal K using silhouette score."""
    best_k = k_range.start
    best_score = -1

    print("Finding optimal K...")
    for k in k_range:
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(embeddings)
        score = silhouette_score(embeddings, labels, sample_size=min(5000, len(embeddings)))
        print(f"  K={k}: silhouette={score:.4f}")
        if score > best_score:
            best_score = score
            best_k = k

    print(f"Best K={best_k} with silhouette={best_score:.4f}")
    return best_k


def main():
    # Paths
    project_root = Path(__file__).parent.parent
    embeddings_dir = project_root / "static" / "embeddings"
    output_file = project_root / "data" / "topic_clusters_all.json"

    # Load metadata first to get count and dimensions
    print("Loading metadata...")
    metadata = load_metadata(embeddings_dir / "search-metadata.json")
    count = metadata['count']
    dim = metadata['dimensions']
    items = metadata['items']

    print(f"  {count} items, {dim} dimensions")

    # Load embeddings
    print("Loading embeddings...")
    all_embeddings = load_embeddings(embeddings_dir / "search-embeddings.bin", count, dim)
    print(f"  Loaded shape: {all_embeddings.shape}")

    # Include all items for comprehensive explore view
    print("\nUsing all items (including career)...")
    filtered_indices = list(range(len(items)))
    items_filtered = items
    embeddings = all_embeddings
    print(f"  Total: {len(items_filtered)} items")

    # Normalize embeddings for better clustering
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    embeddings_norm = embeddings / norms

    # Adjust K based on filtered count (~15 items per cluster)
    optimal_k = max(50, len(items_filtered) // 15)

    # Run K-means clustering
    print(f"\nRunning K-means with K={optimal_k}...")
    kmeans = KMeans(n_clusters=optimal_k, random_state=42, n_init=10, max_iter=300)
    cluster_labels = kmeans.fit_predict(embeddings_norm)

    # Build cluster data
    print("\nBuilding cluster profiles...")
    clusters = []
    item_to_cluster = {}

    for cluster_id in range(optimal_k):
        # Get indices of items in this cluster
        indices = np.where(cluster_labels == cluster_id)[0].tolist()

        # Extract label from common tags
        label, top_tags, top_categories = extract_cluster_label(items_filtered, items_filtered, indices)

        # Get item IDs
        item_ids = [items_filtered[i]['id'] for i in indices]

        # Store mapping
        for item_id in item_ids:
            item_to_cluster[item_id] = cluster_id

        # Sample items for display
        sample_items = item_ids[:10]

        clusters.append({
            "id": cluster_id,
            "label": label,
            "top_tags": top_tags,
            "top_categories": top_categories,
            "item_count": len(indices),
            "sample_items": sample_items
        })

        print(f"  Cluster {cluster_id}: {label} ({len(indices)} items)")

    # Sort clusters by size (largest first)
    clusters.sort(key=lambda x: -x['item_count'])

    # Reassign IDs after sorting
    id_map = {c['id']: i for i, c in enumerate(clusters)}
    for c in clusters:
        c['id'] = id_map[c['id']]
    for item_id in item_to_cluster:
        item_to_cluster[item_id] = id_map[item_to_cluster[item_id]]

    # Deduplicate labels by adding differentiator from category or top tag
    dedupe_labels(clusters)

    # Output
    output = {
        "generated_at": np.datetime64('now').astype(str),
        "num_clusters": optimal_k,
        "num_items": len(items_filtered),
        "clusters": clusters,
        "item_to_cluster": item_to_cluster
    }

    print(f"\nWriting output to {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"Done! Generated {optimal_k} clusters.")

    # Print summary
    print("\n" + "="*60)
    print("CLUSTER SUMMARY")
    print("="*60)
    for c in clusters[:15]:
        print(f"\n[{c['id']}] {c['label']} ({c['item_count']} items)")
        print(f"    Tags: {', '.join(c['top_tags'][:3])}")
        print(f"    Sample: {', '.join(c['sample_items'][:3])}")


if __name__ == "__main__":
    main()
