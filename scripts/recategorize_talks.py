#!/usr/bin/env python3
"""
Re-categorize talks.json with more granular subtopics.
"""

import json
from pathlib import Path

DATA_FILE = Path(__file__).parent.parent / "data" / "talks.json"

def get_new_subtopic(talk):
    """Assign new subtopic based on content analysis."""
    name = talk.get("name", "").lower()
    desc = talk.get("description", "").lower()
    content = f"{name} {desc}"
    current_macro = talk.get("macro_category", "")
    current_subtopic = talk.get("subtopic", "")
    talk_type = talk.get("type", "")

    # CAUSAL & EXPERIMENTATION
    if current_macro == "Causal & Experimentation":
        # Podcasts
        if talk_type in ["Podcast", "Podcast Series"] or "podcast" in name:
            return "Causal Podcasts"
        # ML & Causal
        if any(x in content for x in ["double ml", "causal forest", "heterogeneous treatment", "machine learning", "llm", "neural"]):
            return "ML & Causal"
        # A/B Testing / Experimentation
        if any(x in content for x in ["a/b test", "ab test", "experiment", "kohavi", "variance reduction", "cuped"]):
            return "Experimentation"
        # Bayesian
        if any(x in content for x in ["bayesian", "pymc", "stan", "mcmc"]):
            return "Bayesian Methods"
        # Academic courses/seminars
        if any(x in content for x in ["course", "lecture", "seminar", "nber", "aea"]):
            return "Causal Methods"
        # Default
        return "Causal Inference"

    # PLATFORMS & MARKETS
    if current_macro == "Platforms & Markets":
        # General economics podcasts
        if talk_type in ["Podcast", "Podcast Series"]:
            if any(x in name for x in ["econtalk", "freakonomics", "planet money", "odd lots", "conversations with tyler", "macro musings", "economics, applied", "the pie"]):
                return "Economics Commentary"
        # Marketplace specific
        if any(x in content for x in ["marketplace", "instacart", "doordash", "uber eats", "grubhub", "etsy", "airbnb"]):
            return "Marketplace Economics"
        # Auction & Matching
        if any(x in content for x in ["auction", "matching", "market design", "alvin roth", "kidney", "school choice"]):
            return "Auction & Matching"
        # Antitrust
        if any(x in content for x in ["antitrust", "competition", "dma", "regulation", "lina khan", "stigler"]):
            return "Antitrust"
        # Network effects / two-sided
        if any(x in content for x in ["network effect", "two-sided", "glen weyl", "quadratic", "radical market"]):
            return "Network Effects"
        # Tech industry interviews
        if talk_type == "Interview" or any(x in content for x in ["amazon", "bajari", "jonathan hall"]):
            return "Tech Interviews"
        # Platform theory
        return "Platform Strategy"

    # AI & TECHNOLOGY
    if current_macro == "AI & Technology":
        # AI & Labor
        if any(x in content for x in ["labor", "job", "work", "autor", "automation", "employment"]):
            return "AI & Labor"
        # MLOps
        if any(x in content for x in ["mlops", "deployment", "production", "infrastructure"]):
            return "ML Engineering"
        # Recommendations
        if any(x in content for x in ["recommend", "personalization"]):
            return "Recommendations"
        return "AI Research"

    # INDUSTRY ECONOMICS
    if current_macro == "Industry Economics":
        if any(x in content for x in ["energy", "climate", "utility", "electric"]):
            return "Energy & Climate"
        if any(x in content for x in ["healthcare", "insurance", "transport", "defense", "cyber"]):
            return "Other Industries"
        return current_subtopic  # Keep Tech Industry, Gig Economy, Real Estate

    # LABOR & CAREERS
    if current_macro == "Labor & Careers":
        if any(x in content for x in ["career", "interview", "job", "hire", "resume"]):
            return "Career Advice"
        if current_subtopic == "Tech Strategy":
            return "Tech Strategy"
        return "Labor Economics"

    # Keep others as-is
    return current_subtopic


def main():
    with open(DATA_FILE) as f:
        talks = json.load(f)

    changes = []
    for talk in talks:
        old_subtopic = talk.get("subtopic", "")
        new_subtopic = get_new_subtopic(talk)
        if new_subtopic != old_subtopic:
            changes.append({
                "name": talk["name"][:50],
                "old": old_subtopic,
                "new": new_subtopic
            })
            talk["subtopic"] = new_subtopic

    # Save
    with open(DATA_FILE, "w") as f:
        json.dump(talks, f, indent=2)

    print(f"Updated {len(changes)} talks")
    print("\nChanges:")
    for c in changes[:30]:
        print(f"  {c['name']}")
        print(f"    {c['old']} → {c['new']}")


if __name__ == "__main__":
    main()
