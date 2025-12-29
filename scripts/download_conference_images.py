#!/usr/bin/env python3
"""Download conference logos/favicons for local storage."""

import json
import os
import urllib.request
import urllib.parse
from pathlib import Path

def get_domain(url):
    """Extract domain from URL."""
    parsed = urllib.parse.urlparse(url)
    return parsed.netloc

def download_favicon(url, output_dir):
    """Download favicon for a given URL."""
    domain = get_domain(url)
    if not domain:
        return None

    # Create safe filename from domain
    filename = domain.replace(".", "-").replace("www-", "") + ".png"
    output_path = Path(output_dir) / filename

    # Skip if already exists
    if output_path.exists():
        print(f"  Already exists: {filename}")
        return f"/images/conferences/{filename}"

    # Try Google's favicon service (most reliable)
    favicon_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=64"

    try:
        urllib.request.urlretrieve(favicon_url, output_path)
        print(f"  Downloaded: {filename}")
        return f"/images/conferences/{filename}"
    except Exception as e:
        print(f"  Failed to download {filename}: {e}")
        return None

def main():
    # Load community data
    data_path = Path(__file__).parent.parent / "data" / "community.json"
    output_dir = Path(__file__).parent.parent / "static" / "images" / "conferences"

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(data_path) as f:
        data = json.load(f)

    # Filter conferences
    conferences = [item for item in data if item.get("category") == "Conferences"]

    print(f"Found {len(conferences)} conferences")
    print(f"Downloading favicons to: {output_dir}\n")

    # Download favicons
    updated = False
    for conf in conferences:
        name = conf.get("name", "Unknown")
        url = conf.get("url", "")

        if not url:
            continue

        print(f"Processing: {name}")
        image_path = download_favicon(url, output_dir)

        if image_path and not conf.get("image_url"):
            conf["image_url"] = image_path
            updated = True

    # Save updated data if needed
    if updated:
        with open(data_path, "w") as f:
            json.dump(data, f, indent=2)
        print("\nUpdated community.json with image paths")

    print(f"\nDone! Downloaded images to {output_dir}")

if __name__ == "__main__":
    main()
