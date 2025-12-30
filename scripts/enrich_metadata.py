#!/usr/bin/env python3
"""
Enrich data files with LLM-generated metadata using Anthropic Claude.
Adds: difficulty, prerequisites, summary, synthetic_questions

Usage:
    ANTHROPIC_API_KEY=sk-... python3 scripts/enrich_metadata.py [--dry-run] [--file packages.json]

Cost estimate: ~$2-3 for 3,000 items using Claude Haiku
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import anthropic
except ImportError:
    print("Error: anthropic package not installed")
    print("Install with: pip install anthropic")
    sys.exit(1)

DATA_DIR = Path(__file__).parent.parent / "data"
CHECKPOINT_FILE = DATA_DIR / ".enrichment_checkpoint.json"

# Files to enrich (flat structure)
DATA_FILES = [
    "packages.json",
    "datasets.json",
    "resources.json",
    "talks.json",
    "career.json",
    "community.json",
    "books.json",
]

# Rate limiting
REQUESTS_PER_MINUTE = 50
REQUEST_DELAY = 60.0 / REQUESTS_PER_MINUTE


def load_checkpoint():
    """Load checkpoint of already enriched items."""
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE) as f:
            return json.load(f)
    return {"enriched_ids": set()}


def save_checkpoint(checkpoint):
    """Save checkpoint."""
    # Convert set to list for JSON serialization
    checkpoint_copy = {"enriched_ids": list(checkpoint.get("enriched_ids", set()))}
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(checkpoint_copy, f)


def get_item_id(item, item_type):
    """Generate unique ID for an item."""
    name = item.get("name", item.get("title", "unknown"))
    return f"{item_type}-{name}".lower().replace(" ", "-")[:100]


def enrich_item(client, item, item_type):
    """Use Claude to enrich a single item with metadata."""
    name = item.get("name", item.get("title", ""))
    description = item.get("description", "")
    category = item.get("category", "")
    tags = item.get("tags", "")

    prompt = f"""Analyze this {item_type} resource for tech economists and return JSON with exactly these fields:

{{
  "difficulty": "beginner" | "intermediate" | "advanced",
  "prerequisites": ["skill1", "skill2"],
  "summary": "2-sentence description",
  "synthetic_questions": ["question1", "question2", "question3"]
}}

Resource:
- Name: {name}
- Description: {description}
- Category: {category}
- Tags: {tags}

Rules:
1. difficulty: Based on required background knowledge
2. prerequisites: 1-3 specific skills needed (e.g., "Python", "basic statistics", "causal inference")
3. summary: Concise 2-sentence description of what it is and who would use it
4. synthetic_questions: 2-3 natural questions someone might ask when searching for this

Return ONLY valid JSON, no markdown code blocks or explanation."""

    try:
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}]
        )

        # Parse JSON response
        text = response.content[0].text.strip()
        # Remove markdown code blocks if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        return json.loads(text)

    except json.JSONDecodeError as e:
        print(f"  JSON parse error for {name}: {e}")
        return None
    except Exception as e:
        print(f"  API error for {name}: {e}")
        return None


def enrich_file(client, filename, dry_run=False, checkpoint=None):
    """Enrich all items in a data file."""
    filepath = DATA_DIR / filename
    if not filepath.exists():
        print(f"Skipping {filename} (not found)")
        return 0

    with open(filepath) as f:
        data = json.load(f)

    if not isinstance(data, list):
        print(f"Skipping {filename} (not a list)")
        return 0

    item_type = filename.replace(".json", "").rstrip("s")  # packages -> package
    enriched_count = 0
    skipped_count = 0

    print(f"\nProcessing {filename} ({len(data)} items)...")

    for i, item in enumerate(data):
        item_id = get_item_id(item, item_type)

        # Skip if already enriched (has all fields or in checkpoint)
        if all(key in item for key in ["difficulty", "prerequisites", "summary", "synthetic_questions"]):
            skipped_count += 1
            continue

        if checkpoint and item_id in checkpoint.get("enriched_ids", set()):
            skipped_count += 1
            continue

        name = item.get("name", item.get("title", "unknown"))
        print(f"  [{i+1}/{len(data)}] Enriching: {name[:50]}...")

        if dry_run:
            print(f"    [DRY RUN] Would enrich {name}")
            continue

        # Call API
        enriched = enrich_item(client, item, item_type)

        if enriched:
            item["difficulty"] = enriched.get("difficulty", "intermediate")
            item["prerequisites"] = enriched.get("prerequisites", [])
            item["summary"] = enriched.get("summary", "")
            item["synthetic_questions"] = enriched.get("synthetic_questions", [])
            enriched_count += 1

            # Update checkpoint
            if checkpoint:
                checkpoint["enriched_ids"].add(item_id)
                save_checkpoint(checkpoint)

        # Rate limiting
        time.sleep(REQUEST_DELAY)

    # Save enriched data back to file
    if not dry_run and enriched_count > 0:
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        print(f"  Saved {enriched_count} enriched items to {filename}")

    print(f"  Done: {enriched_count} enriched, {skipped_count} skipped")
    return enriched_count


def main():
    parser = argparse.ArgumentParser(description="Enrich data files with LLM metadata")
    parser.add_argument("--dry-run", action="store_true", help="Don't make API calls or save")
    parser.add_argument("--file", type=str, help="Only process specific file")
    parser.add_argument("--reset", action="store_true", help="Reset checkpoint and re-enrich all")
    args = parser.parse_args()

    # Check API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not args.dry_run:
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        print("Usage: ANTHROPIC_API_KEY=sk-... python3 scripts/enrich_metadata.py")
        sys.exit(1)

    # Initialize client
    client = anthropic.Anthropic(api_key=api_key) if api_key else None

    # Load or reset checkpoint
    if args.reset and CHECKPOINT_FILE.exists():
        os.remove(CHECKPOINT_FILE)
        print("Checkpoint reset")

    checkpoint = load_checkpoint()
    checkpoint["enriched_ids"] = set(checkpoint.get("enriched_ids", []))

    # Process files
    files_to_process = [args.file] if args.file else DATA_FILES
    total_enriched = 0

    print(f"Enriching data files...")
    print(f"Checkpoint: {len(checkpoint['enriched_ids'])} items already enriched")

    for filename in files_to_process:
        if filename not in DATA_FILES and args.file:
            # Allow processing specific file even if not in default list
            pass
        total_enriched += enrich_file(client, filename, args.dry_run, checkpoint)

    print(f"\n{'='*50}")
    print(f"Total enriched: {total_enriched} items")
    if args.dry_run:
        print("[DRY RUN - no changes made]")


if __name__ == "__main__":
    main()
