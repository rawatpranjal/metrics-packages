#!/usr/bin/env python3
"""Add lat/lng coordinates to community.json entries for map display."""

import json
from pathlib import Path

# Pre-geocoded locations mapping
COORDINATES = {
    # US Cities
    "Cambridge, MA": (42.3601, -71.0942),
    "Boston, MA": (42.3601, -71.0589),
    "New York, NY": (40.7128, -74.0060),
    "Stanford, CA": (37.4275, -122.1697),
    "San Francisco, CA": (37.7749, -122.4194),
    "Chicago, IL": (41.8781, -87.6298),
    "Philadelphia, PA": (39.9526, -75.1652),
    "Atlanta, GA": (33.7490, -84.3880),
    "Washington, DC": (38.9072, -77.0369),
    "Seattle, WA": (47.6062, -122.3321),
    "Los Angeles, CA": (34.0522, -118.2437),
    "Austin, TX": (30.2672, -97.7431),
    "Denver, CO": (39.7392, -104.9903),
    "Nashville": (36.1627, -86.7816),
    "Nashville (2025)": (36.1627, -86.7816),
    "Nashville (2025), Minneapolis (2026)": (36.1627, -86.7816),
    "Minneapolis": (44.9778, -93.2650),
    "Minneapolis (2025)": (44.9778, -93.2650),
    "Minneapolis (2026)": (44.9778, -93.2650),
    "Orlando, FL": (28.5383, -81.3792),
    "Orlando, FL (2025)": (28.5383, -81.3792),
    "Indianapolis, IN": (39.7684, -86.1581),
    "Indianapolis, IN (2025)": (39.7684, -86.1581),
    "Atlanta, GA (2025)": (33.7490, -84.3880),
    "Atlanta (2025)": (33.7490, -84.3880),
    "Detroit, MI": (42.3314, -83.0458),
    "Detroit, MI (2025)": (42.3314, -83.0458),
    "Salt Lake City": (40.7608, -111.8910),
    "Salt Lake City (2025)": (40.7608, -111.8910),
    "Phoenix, AZ": (33.4484, -112.0740),
    "St. Simons Island, GA": (31.1500, -81.3700),
    "Rutgers, NJ": (40.5008, -74.4474),
    "Rutgers, NJ (2025)": (40.5008, -74.4474),
    "Columbia (2025)": (40.8075, -73.9626),  # Columbia University NYC
    "Washington DC (2025)": (38.9072, -77.0369),
    "Washington DC/Various": (38.9072, -77.0369),
    "Seattle, WA (2025)": (47.6062, -122.3321),

    # Canada
    "Toronto, Canada": (43.6532, -79.3832),
    "Toronto, Canada (2025)": (43.6532, -79.3832),

    # International
    "Seoul, Korea": (37.5665, 126.9780),
    "Seoul, Korea (2025)": (37.5665, 126.9780),
    "Sydney, Australia": (-33.8688, 151.2093),
    "Sydney, Australia (2025)": (-33.8688, 151.2093),
    "London Business School": (51.5246, -0.1640),
    "London Business School (2025)": (51.5246, -0.1640),

    # Multi-city (use primary/first city)
    "Dallas/Las Vegas": (32.7767, -96.7970),  # Dallas
    "Las Vegas/Chicago": (36.1699, -115.1398),  # Las Vegas
    "Austin/SF/NYC": (37.7749, -122.4194),  # SF
    "SF/Boston/Toronto/Chicago": (37.7749, -122.4194),  # SF
    "UC San Diego (2026)": (32.8801, -117.2340),
    "Philadelphia (US), Various (Europe)": (39.9526, -75.1652),  # Philadelphia

    # Research Labs - use company HQ locations
    "Stanford GSB": (37.4275, -122.1697),
    "MIT": (42.3601, -71.0942),
    "Harvard SEAS": (42.3770, -71.1167),
    "Harvard": (42.3770, -71.1167),
    "UC Berkeley": (37.8716, -122.2727),
}

def find_coordinates(location):
    """Find coordinates for a location string."""
    if not location or location == "Online" or location.startswith("Various"):
        return None

    # Direct match
    if location in COORDINATES:
        return COORDINATES[location]

    # Try partial matching
    for key, coords in COORDINATES.items():
        if key in location or location in key:
            return coords

    # Check if it contains a known city
    for key, coords in COORDINATES.items():
        city = key.split(",")[0].split("(")[0].strip()
        if city in location:
            return coords

    return None

def main():
    data_path = Path(__file__).parent.parent / "data" / "community.json"

    with open(data_path) as f:
        data = json.load(f)

    updated_count = 0
    skipped_locations = set()

    for item in data:
        location = item.get("location", "")
        category = item.get("category", "")

        # Skip online/blogs categories
        if category in ["Online", "Blogs"]:
            continue

        # Skip if already has coordinates
        if "lat" in item and "lng" in item:
            continue

        coords = find_coordinates(location)
        if coords:
            item["lat"] = coords[0]
            item["lng"] = coords[1]
            updated_count += 1
            print(f"  Added: {item['name']} -> {location} ({coords[0]}, {coords[1]})")
        elif location and location != "Online" and not location.startswith("Various"):
            skipped_locations.add(location)

    # Save updated data
    with open(data_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"\nUpdated {updated_count} entries with coordinates")

    if skipped_locations:
        print(f"\nSkipped locations (no coordinates found):")
        for loc in sorted(skipped_locations):
            print(f"  - {loc}")

if __name__ == "__main__":
    main()
