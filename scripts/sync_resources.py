#!/usr/bin/env python3
"""
Sync resources from roadmaps.json and domains.json to resources.json.
Ensures all links from "Getting Started" are also in "Learning" tab.

Usage:
    python scripts/sync_resources.py
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
ROADMAPS_FILE = DATA_DIR / "roadmaps.json"
DOMAINS_FILE = DATA_DIR / "domains.json"
RESOURCES_FILE = DATA_DIR / "resources.json"

# Mapping from roadmap/domain names to resources.json domain/category
DOMAIN_MAPPING = {
    # Roadmaps
    "Learn Python": ("Programming & Tools", "Python Fundamentals"),
    "Learn Statistics": ("Programming & Tools", "Statistics"),
    "Learn ML": ("Machine Learning", "ML Fundamentals"),
    "Learn Causal Inference": ("Causal Inference & Experimentation", "Causal Inference Fundamentals"),
    "Learn Product Sense": ("Product & Strategy", "Product Analytics"),
    "Learn Experimentation": ("Causal Inference & Experimentation", "Experimentation"),
    "Learn SQL": ("Programming & Tools", "SQL & Databases"),
    "Learn Data Structures": ("Programming & Tools", "Computer Science"),
    "Learn Algorithms": ("Programming & Tools", "Computer Science"),
    "Learn LeetCode": ("Programming & Tools", "Interview Prep"),
    "Learn Automation": ("Programming & Tools", "Engineering"),
    "Learn Optimization (OR)": ("Optimization & Operations Research", "Operations Research"),
    "Learn Agentic Workflows": ("Machine Learning", "AI & LLMs"),
    "Learn Forecasting": ("Machine Learning", "Forecasting"),
    # Domains
    "Pricing & Subscriptions": ("Economics & Strategy", "Pricing"),
    "Ads & Auctions": ("Economics & Strategy", "Ads & Auctions"),
    "Marketing Analytics": ("Marketing & Growth", "Marketing Analytics"),
    "Risk, Safety & Trust": ("Risk & Trust", "Trust & Safety"),
    "Recommendation Systems": ("Machine Learning", "Recommendation Systems"),
    "Search & Ranking": ("Machine Learning", "Search & Ranking"),
    "Logistics & Supply Chain": ("Optimization & Operations Research", "Logistics"),
    "Growth Data Science": ("Marketing & Growth", "Growth"),
}


def extract_urls_from_source(data: list, source_name: str) -> list:
    """Extract all resource URLs from roadmaps or domains data."""
    resources = []

    for item in data:
        item_name = item.get("name", "")
        domain, category = DOMAIN_MAPPING.get(item_name, ("Other", "Other"))

        # Extract from resources array
        for res in item.get("resources", []):
            resources.append({
                "name": res.get("name", ""),
                "description": res.get("why", ""),
                "url": res.get("url", ""),
                "source": source_name,
                "source_item": item_name,
                "domain": domain,
                "category": category,
                "type": "Resource",
                "level": "Medium",
                "tags": [category]
            })

        # Extract from packages array
        for pkg in item.get("packages", []):
            resources.append({
                "name": pkg.get("name", ""),
                "description": pkg.get("why", ""),
                "url": pkg.get("url", ""),
                "source": source_name,
                "source_item": item_name,
                "domain": domain,
                "category": category,
                "type": "Package",
                "level": "Medium",
                "tags": [category, "Python Package"]
            })

    return resources


def normalize_url(url: str) -> str:
    """Normalize URL for comparison."""
    url = url.lower().strip()
    url = url.rstrip("/")
    # Remove common prefixes for comparison
    for prefix in ["https://www.", "http://www.", "https://", "http://"]:
        if url.startswith(prefix):
            url = url[len(prefix):]
            break
    return url


def main():
    # Load data
    with open(ROADMAPS_FILE) as f:
        roadmaps = json.load(f)

    with open(DOMAINS_FILE) as f:
        domains = json.load(f)

    with open(RESOURCES_FILE) as f:
        resources = json.load(f)

    # Get existing URLs in resources.json
    existing_urls = {normalize_url(r.get("url", "")) for r in resources}

    print(f"Existing resources in resources.json: {len(resources)}")
    print(f"Unique URLs: {len(existing_urls)}")

    # Extract URLs from roadmaps and domains
    roadmap_resources = extract_urls_from_source(roadmaps, "roadmaps")
    domain_resources = extract_urls_from_source(domains, "domains")

    all_source_resources = roadmap_resources + domain_resources

    print(f"\nResources in roadmaps.json: {len(roadmap_resources)}")
    print(f"Resources in domains.json: {len(domain_resources)}")
    print(f"Total source resources: {len(all_source_resources)}")

    # Find missing resources
    missing = []
    for res in all_source_resources:
        if normalize_url(res["url"]) not in existing_urls:
            missing.append(res)

    print(f"\nMissing resources: {len(missing)}")

    if not missing:
        print("All resources are already synced!")
        return

    # Add missing resources
    for res in missing:
        new_resource = {
            "name": res["name"],
            "description": res["description"],
            "category": res["category"],
            "url": res["url"],
            "type": res["type"],
            "level": res["level"],
            "tags": res["tags"],
            "domain": res["domain"]
        }
        resources.append(new_resource)
        print(f"  + {res['name']} ({res['source_item']})")

    # Save updated resources
    with open(RESOURCES_FILE, "w") as f:
        json.dump(resources, f, indent=2)

    print(f"\nDone! Added {len(missing)} resources to resources.json")
    print(f"Total resources now: {len(resources)}")


if __name__ == "__main__":
    main()
