#!/usr/bin/env python3
"""
Inject model scores into source JSON files and create category rankings.

1. Adds 'model_score' field to each item in source files
2. Sorts items within each file by score (descending)
3. Creates category_rankings.json with ranked categories
"""

import json
import os
from collections import defaultdict
from pathlib import Path

# Source files to update
SOURCE_FILES = [
    'packages.json',
    'datasets.json',
    'resources.json',
    'papers_flat.json',
    'career.json',
    'community.json',
    'talks.json',
    'books.json',
]

def main():
    data_dir = Path(__file__).parent.parent / 'data'

    # Load global rankings
    rankings_path = data_dir / 'global_rankings.json'
    with open(rankings_path) as f:
        rankings_data = json.load(f)

    # Build name -> score lookup (case-insensitive)
    score_lookup = {}
    for item in rankings_data['rankings']:
        name = item['name'].lower()
        score_lookup[name] = item['score']

    print(f"Loaded {len(score_lookup)} scores from global_rankings.json")

    # Track category scores by content type
    category_rankings = {}

    # Process each source file
    for filename in SOURCE_FILES:
        filepath = data_dir / filename
        if not filepath.exists():
            print(f"  Skipping {filename} (not found)")
            continue

        with open(filepath) as f:
            items = json.load(f)

        content_type = filename.replace('.json', '').replace('_flat', '')
        category_scores = defaultdict(lambda: {'total': 0, 'count': 0, 'max': 0, 'engaged': 0})

        # Add scores to items
        matched = 0
        for item in items:
            name = item.get('name', '').lower()
            score = score_lookup.get(name, 0.0)
            item['model_score'] = round(score, 4)

            if score > 0:
                matched += 1

            # Aggregate by category
            category = item.get('category', 'Uncategorized')
            category_scores[category]['total'] += score
            category_scores[category]['count'] += 1
            category_scores[category]['max'] = max(category_scores[category]['max'], score)
            if score > 0:
                category_scores[category]['engaged'] += 1

        # Sort items by score descending
        items.sort(key=lambda x: x.get('model_score', 0), reverse=True)

        # Save updated file
        with open(filepath, 'w') as f:
            json.dump(items, f, indent=2)

        print(f"  {filename}: {matched}/{len(items)} items matched, sorted by score")

        # Build category rankings for this content type
        cat_list = []
        for cat, stats in category_scores.items():
            cat_list.append({
                'category': cat,
                'total_score': round(stats['total'], 3),
                'avg_score': round(stats['total'] / stats['count'], 4) if stats['count'] > 0 else 0,
                'max_score': round(stats['max'], 4),
                'count': stats['count'],
                'engaged_count': stats['engaged'],
            })

        # Sort categories by total score
        cat_list.sort(key=lambda x: x['total_score'], reverse=True)
        category_rankings[content_type] = cat_list

    # Save category rankings
    cat_rankings_path = data_dir / 'category_rankings.json'
    with open(cat_rankings_path, 'w') as f:
        json.dump(category_rankings, f, indent=2)

    print(f"\nSaved category_rankings.json")

    # Print top categories per content type
    print("\n" + "="*60)
    print("TOP CATEGORIES BY CONTENT TYPE")
    print("="*60)

    for content_type, cats in category_rankings.items():
        print(f"\n{content_type.upper()}:")
        for cat in cats[:5]:
            print(f"  {cat['total_score']:>6.2f}  {cat['category']} ({cat['engaged_count']}/{cat['count']} engaged)")


if __name__ == "__main__":
    main()
