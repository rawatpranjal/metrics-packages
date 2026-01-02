#!/usr/bin/env python3
"""
Fetch company logos as fallback images for entries missing OG images.
Uses Clearbit Logo API with Google Favicon API as backup.

Usage:
    python3 scripts/fetch_logo_fallbacks.py --file resources.json
    python3 scripts/fetch_logo_fallbacks.py --file community.json
"""

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("Error: requests not installed")
    print("Install with: pip install requests")
    sys.exit(1)

DATA_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR = Path(__file__).parent.parent / "static" / "images" / "logos"

# Rate limiting
REQUEST_DELAY = 0.3
TIMEOUT = 10

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
}


def get_root_domain(url):
    """Extract root domain from URL (e.g., uber.com from eng.uber.com)."""
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()

        # Remove www prefix
        if netloc.startswith("www."):
            netloc = netloc[4:]

        # Handle subdomains - get last two parts for most domains
        parts = netloc.split(".")
        if len(parts) >= 2:
            # Special cases for common TLDs
            if parts[-2] in ["co", "com", "org", "edu", "gov", "net"]:
                return ".".join(parts[-3:]) if len(parts) >= 3 else netloc
            return ".".join(parts[-2:])
        return netloc
    except Exception:
        return None


def download_logo(domain, output_path):
    """Try to download logo from Clearbit, fallback to Google Favicon."""

    # Try Clearbit Logo API first (higher quality)
    clearbit_url = f"https://logo.clearbit.com/{domain}"
    try:
        response = requests.get(clearbit_url, headers=HEADERS, timeout=TIMEOUT)
        if response.status_code == 200 and len(response.content) > 1000:
            # Clearbit returns PNG
            final_path = output_path.with_suffix(".png")
            with open(final_path, "wb") as f:
                f.write(response.content)
            return final_path
    except Exception:
        pass

    # Fallback to Google Favicon API (128px)
    google_url = f"https://www.google.com/s2/favicons?sz=128&domain={domain}"
    try:
        response = requests.get(google_url, headers=HEADERS, timeout=TIMEOUT)
        if response.status_code == 200 and len(response.content) > 500:
            final_path = output_path.with_suffix(".png")
            with open(final_path, "wb") as f:
                f.write(response.content)
            return final_path
    except Exception:
        pass

    return None


def process_file(filepath, dry_run=False):
    """Process a JSON file and add logo fallbacks for missing images."""
    print(f"\nProcessing {filepath.name}...")

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(filepath) as f:
        data = json.load(f)

    updated = 0
    skipped = 0
    failed = 0
    already_have = 0

    # Track domains we've already processed
    processed_domains = set()

    for item in data:
        name = item.get("name", item.get("title", "Unknown"))
        url = item.get("url", "")

        # Skip if already has image_url
        if item.get("image_url"):
            already_have += 1
            continue

        # Skip if no URL
        if not url:
            continue

        domain = get_root_domain(url)
        if not domain:
            continue

        # Check if we already have this logo
        existing = list(OUTPUT_DIR.glob(f"{domain}.*"))
        if existing:
            local_path = f"/images/logos/{existing[0].name}"
            item["image_url"] = local_path
            updated += 1
            skipped += 1
            continue

        # Skip if we already tried this domain this run
        if domain in processed_domains:
            # But still update the item to use the logo if it exists
            existing = list(OUTPUT_DIR.glob(f"{domain}.*"))
            if existing:
                item["image_url"] = f"/images/logos/{existing[0].name}"
                updated += 1
            continue

        processed_domains.add(domain)

        print(f"  {name[:40]:40} → {domain}")

        if dry_run:
            continue

        output_path = OUTPUT_DIR / domain
        downloaded = download_logo(domain, output_path)

        if downloaded:
            local_path = f"/images/logos/{downloaded.name}"
            item["image_url"] = local_path
            updated += 1
            print(f"    ✓ Downloaded: {downloaded.name}")
        else:
            failed += 1
            print(f"    ✗ No logo found")

        time.sleep(REQUEST_DELAY)

    # Second pass: update all items with same domain
    if not dry_run:
        for item in data:
            if item.get("image_url"):
                continue
            url = item.get("url", "")
            if not url:
                continue
            domain = get_root_domain(url)
            if domain:
                existing = list(OUTPUT_DIR.glob(f"{domain}.*"))
                if existing:
                    item["image_url"] = f"/images/logos/{existing[0].name}"
                    updated += 1

    if not dry_run and updated > 0:
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        print(f"\nSaved {filepath.name}")

    print(f"\nResults for {filepath.name}:")
    print(f"  Already had image: {already_have}")
    print(f"  Updated with logo: {updated}")
    print(f"  Reused existing: {skipped}")
    print(f"  Failed: {failed}")

    return updated


def main():
    parser = argparse.ArgumentParser(description="Fetch logo fallbacks for missing images")
    parser.add_argument("--file", required=True, help="JSON file to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't save changes")
    args = parser.parse_args()

    filepath = DATA_DIR / args.file
    if not filepath.exists():
        print(f"Error: {filepath} not found")
        sys.exit(1)

    process_file(filepath, args.dry_run)


if __name__ == "__main__":
    main()
