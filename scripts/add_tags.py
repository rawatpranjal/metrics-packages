#!/usr/bin/env python3
"""
Add tags to all data files that don't have them.
Uses category/type/topic/subtopic fields to generate tags.
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"


def add_tags_to_papers():
    """Add tags to papers.json using topic and subtopic names."""
    papers_file = DATA_DIR / "papers.json"
    with open(papers_file) as f:
        data = json.load(f)

    count = 0
    for topic in data.get("topics", []):
        topic_name = topic.get("name", "")
        for subtopic in topic.get("subtopics", []):
            subtopic_name = subtopic.get("name", "")
            for paper in subtopic.get("papers", []):
                # Add tags if not already present
                if "tags" not in paper or not paper["tags"]:
                    paper["tags"] = []
                    if topic_name:
                        paper["tags"].append(topic_name)
                    if subtopic_name:
                        paper["tags"].append(subtopic_name)
                    count += 1

    with open(papers_file, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Papers: Added tags to {count} items")
    return count


def add_tags_to_flat_file(filename, tag_fields):
    """Add tags to a flat JSON array file using specified fields."""
    filepath = DATA_DIR / filename
    with open(filepath) as f:
        data = json.load(f)

    count = 0
    for item in data:
        if "tags" not in item or not item["tags"]:
            item["tags"] = []
            for field in tag_fields:
                value = item.get(field, "")
                if value and value not in item["tags"]:
                    item["tags"].append(value)
            if item["tags"]:
                count += 1

    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)

    print(f"{filename}: Added tags to {count} items")
    return count


def main():
    total = 0

    # Papers (nested structure)
    total += add_tags_to_papers()

    # Flat files with category and type
    total += add_tags_to_flat_file("resources.json", ["category", "type"])
    total += add_tags_to_flat_file("talks.json", ["category", "type"])
    total += add_tags_to_flat_file("books.json", ["category"])
    total += add_tags_to_flat_file("community.json", ["category", "type"])
    total += add_tags_to_flat_file("career.json", ["category", "type"])

    print(f"\nTotal: Added tags to {total} items")


if __name__ == "__main__":
    main()
