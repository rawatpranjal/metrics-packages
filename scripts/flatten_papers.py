#!/usr/bin/env python3
"""
Flatten hierarchical papers.json into papers_flat.json for Discover page.

papers.json structure: Topics -> Subtopics -> Papers (nested)
papers_flat.json: Flat array matching other content types
"""

import json
import re
from pathlib import Path


def slugify(text: str) -> str:
    """Convert text to URL-safe slug (matches JS slugify in explore.js)."""
    slug = re.sub(r'[^a-z0-9]+', '-', text.lower())
    return re.sub(r'^-|-$', '', slug)[:100]


def flatten_papers(data_dir: Path) -> list:
    """Load papers.json and flatten to list."""
    with open(data_dir / "papers.json") as f:
        data = json.load(f)

    items = []
    seen_ids = {}

    for topic in data.get('topics', []):
        topic_name = topic.get('name', '')
        for subtopic in topic.get('subtopics', []):
            subtopic_name = subtopic.get('name', '')
            for paper in subtopic.get('papers', []):
                title = paper.get('title', '')
                base_id = f"paper-{slugify(title)}"

                # Handle duplicate IDs by appending suffix
                if base_id in seen_ids:
                    seen_ids[base_id] += 1
                    item_id = f"{base_id}-{seen_ids[base_id]}"
                else:
                    seen_ids[base_id] = 0
                    item_id = base_id

                items.append({
                    'id': item_id,
                    'name': title,
                    'title': title,
                    'authors': paper.get('authors', ''),
                    'year': paper.get('year'),
                    'url': paper.get('url', ''),
                    'description': paper.get('description', ''),
                    'citations': paper.get('citations'),
                    'tag': paper.get('tag', ''),
                    'tags': paper.get('tags', []),
                    'type': 'paper',
                    'category': f"{topic_name} > {subtopic_name}",
                    'topic': topic_name,
                    'subtopic': subtopic_name
                })

    return items


def main():
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "data"

    papers = flatten_papers(data_dir)

    output_file = data_dir / "papers_flat.json"
    with open(output_file, 'w') as f:
        json.dump(papers, f, indent=2)

    print(f"Generated {output_file} with {len(papers)} papers")


if __name__ == "__main__":
    main()
