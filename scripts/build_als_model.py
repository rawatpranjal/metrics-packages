#!/usr/bin/env python3
"""
Build ALS recommendation model from user interaction data.

Uses session dwell time and clicks from D1 database to train
an Alternating Least Squares model for item-item recommendations.
"""

import subprocess
import json
import os
from collections import defaultdict
import numpy as np
from scipy.sparse import csr_matrix

try:
    from implicit.als import AlternatingLeastSquares
except ImportError:
    print("Please install implicit: pip install implicit")
    exit(1)


def fetch_d1_data(query):
    """Execute D1 query via wrangler and return results."""
    cmd = [
        'npx', 'wrangler', 'd1', 'execute', 'tech-econ-analytics-db',
        '--remote', '--command', query, '--json'
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        if data and len(data) > 0 and 'results' in data[0]:
            return data[0]['results']
        return []
    except Exception as e:
        print(f"Error fetching data: {e}")
        return []


def main():
    print("Fetching interaction data from D1...")

    # Fetch dwell data (has session_id)
    dwell = fetch_d1_data("SELECT session_id, name, dwell_ms FROM content_dwell")
    print(f"  Dwell records: {len(dwell)}")

    # Fetch click data
    clicks = fetch_d1_data("SELECT name, click_count FROM content_clicks")
    print(f"  Click records: {len(clicks)}")

    if len(dwell) < 5:
        print("Not enough dwell data to train model (need at least 5 records)")
        return

    # Build user (session) and item indices
    sessions = sorted(set(d['session_id'] for d in dwell if d.get('session_id')))
    items_from_dwell = set(d['name'].lower() for d in dwell if d.get('name'))
    items_from_clicks = set(c['name'].lower() for c in clicks if c.get('name'))
    items = sorted(items_from_dwell | items_from_clicks)

    print(f"\nBuilding matrix: {len(sessions)} sessions x {len(items)} items")

    session_idx = {s: i for i, s in enumerate(sessions)}
    item_idx = {it: i for i, it in enumerate(items)}
    idx_to_item = {i: it for it, i in item_idx.items()}

    # Build click weights per item (aggregate across all sessions)
    click_weights = defaultdict(float)
    for c in clicks:
        name = c.get('name', '').lower()
        count = c.get('click_count', 0) or 0
        click_weights[name] += count * 5  # Weight clicks higher

    # Build user-item matrix from dwell data
    data, rows, cols = [], [], []

    for d in dwell:
        session = d.get('session_id')
        name = d.get('name', '').lower()
        dwell_ms = d.get('dwell_ms', 0) or 0

        if session not in session_idx or name not in item_idx:
            continue

        # Engagement score = dwell (seconds) + click bonus
        score = dwell_ms / 1000.0 + click_weights.get(name, 0)

        rows.append(session_idx[session])
        cols.append(item_idx[name])
        data.append(score)

    # Create sparse matrix
    n_users = len(sessions)
    n_items = len(items)
    user_item_matrix = csr_matrix((data, (rows, cols)), shape=(n_users, n_items))

    print(f"  Non-zero entries: {user_item_matrix.nnz}")
    print(f"  Sparsity: {100 * (1 - user_item_matrix.nnz / (n_users * n_items)):.2f}%")

    # Train ALS model
    print("\nTraining ALS model...")

    # Use smaller factors for small dataset
    n_factors = min(32, min(n_users, n_items) - 1)
    n_factors = max(n_factors, 5)

    model = AlternatingLeastSquares(
        factors=n_factors,
        regularization=0.1,
        iterations=15,
        random_state=42
    )

    # Fit on item-user matrix for similar_items
    item_user_matrix = user_item_matrix.T.tocsr()
    model.fit(item_user_matrix)

    print(f"  Model trained with {n_factors} factors")

    # Generate item-item recommendations
    print("\nGenerating item recommendations...")
    recommendations = {}

    for item_name, idx in item_idx.items():
        try:
            # Get similar items
            similar_ids, scores = model.similar_items(idx, N=6)

            # Filter out self and format
            similar_items = []
            for sim_idx, score in zip(similar_ids, scores):
                if sim_idx != idx and sim_idx in idx_to_item:
                    similar_items.append({
                        "name": idx_to_item[sim_idx],
                        "score": round(float(score), 4)
                    })

            if similar_items:
                recommendations[item_name] = similar_items[:5]
        except Exception as e:
            # Skip items that cause issues
            continue

    print(f"  Generated recommendations for {len(recommendations)} items")

    # Save output
    output_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'static', 'data', 'als-recommendations.json'
    )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(recommendations, f, indent=2)

    print(f"\nSaved to: {output_path}")

    # Show sample
    print("\nSample recommendations:")
    for item, recs in list(recommendations.items())[:3]:
        print(f"  {item}:")
        for r in recs[:3]:
            print(f"    - {r['name']} ({r['score']:.3f})")


if __name__ == "__main__":
    main()
