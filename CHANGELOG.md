# Changelog

## 2026-01-01 (AI for Economists content expansion)
- Added ~70 new entries for "AI for Economists" content across all data files
- New paper topic: "AI for Economic Research" with 6 subtopics (LLMs, Homo Silicus, Causal ML, Text-as-Data, Satellite Imagery)
- New packages: EDSL, Anthropic SDK, OpenAI SDK, NLTK, sentence-transformers, TensorFlow, 6 research tools (Elicit, Consensus, etc.)
- Added Korinek, Horton, Athey, Dell, Gentzkow foundational papers
- New resources: Stanford GSB ML course, AEA webcasts, prompt engineering guides, Korinek newsletter
- New conferences: NBER Economics of AI, MLESI, SoFiE, ACM EC

## 2026-01-02
- Integrated model_score into search as post-RRF boost (0.4 weight)
- Added popularity boost toggle in search modal (📈 icon, default ON)

## 2026-01-01
- Added viewability signal to ranking model (hybrid: clicks×5 + impressions×0.5 + viewable×0.1 + dwell×1)
- Surfaces content users actually viewed, not just loaded

## 2025-12-31
- Added per-interaction AUC metrics to ranking evaluation
- Migrated analytics to D1 database with ML-ready schema

## 2025-12-30
- Added model_score field to content items for ranking
- Implemented category-level rankings

## 2025-12-29
- Upgraded to bge-large-en-v1.5 embeddings (1024 dims)
- Added weighted shuffle for Discover tab
