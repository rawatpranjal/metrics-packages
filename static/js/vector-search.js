/**
 * Vector Search Module for Semantic Similarity
 *
 * Provides cosine similarity search using pre-computed embeddings.
 * Falls back to Fuse.js if embeddings fail to load.
 */
(function(global) {
  'use strict';

  var VectorSearch = {
    embeddings: null,
    model: null,
    isLoaded: false,
    isLoading: false,
    loadError: null,
    _loadPromise: null
  };

  /**
   * Load embeddings from JSON file
   * @returns {Promise<boolean>} - True if loaded successfully
   */
  VectorSearch.loadEmbeddings = function() {
    if (this.isLoaded) return Promise.resolve(true);
    if (this.isLoading) return this._loadPromise;

    this.isLoading = true;
    var self = this;

    this._loadPromise = fetch('/embeddings/search-embeddings.json')
      .then(function(response) {
        if (!response.ok) throw new Error('Failed to load embeddings');
        return response.json();
      })
      .then(function(data) {
        self.embeddings = data.items;
        self.model = data.model;
        self.isLoaded = true;
        self.isLoading = false;
        console.log('[VectorSearch] Loaded ' + data.count + ' embeddings');
        return true;
      })
      .catch(function(err) {
        self.loadError = err;
        self.isLoading = false;
        console.warn('[VectorSearch] Failed to load embeddings:', err);
        return false;
      });

    return this._loadPromise;
  };

  /**
   * Compute cosine similarity between two vectors
   * (Embeddings are pre-normalized, so dot product = cosine similarity)
   */
  VectorSearch.cosineSimilarity = function(a, b) {
    var dot = 0;
    var len = Math.min(a.length, b.length);
    for (var i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  };

  /**
   * Search using a query embedding
   * @param {number[]} queryEmbedding - The query vector
   * @param {number} topK - Number of results to return
   * @returns {Array} - Ranked results with similarity scores
   */
  VectorSearch.searchByEmbedding = function(queryEmbedding, topK) {
    if (!this.isLoaded || !this.embeddings) {
      return [];
    }

    topK = topK || 20;
    var self = this;

    // Calculate similarity for all items
    var scored = this.embeddings.map(function(item) {
      return {
        item: item,
        score: self.cosineSimilarity(queryEmbedding, item.embedding)
      };
    });

    // Sort by similarity (descending)
    scored.sort(function(a, b) {
      return b.score - a.score;
    });

    // Return top K results
    return scored.slice(0, topK);
  };

  /**
   * Get embedding for a query string using lexical matches as proxy.
   *
   * Since we can't run the model in browser without additional setup,
   * we use Fuse.js to find lexically similar items and average their
   * embeddings as a proxy for the query embedding.
   *
   * @param {string} query - Search query
   * @param {Fuse} fuseInstance - Fuse.js instance
   * @returns {number[]|null} - Query embedding or null
   */
  VectorSearch.getQueryEmbedding = function(query, fuseInstance) {
    if (!this.isLoaded || !fuseInstance) {
      return null;
    }

    // Use Fuse.js to find lexically similar items
    var fuseResults = fuseInstance.search(query);

    if (fuseResults.length === 0) {
      // No lexical matches - return average of top items from index
      // This ensures we always return some results
      return this._getAverageEmbedding(this.embeddings.slice(0, 10));
    }

    // Take top 3-5 lexical matches and average their embeddings
    var topMatches = fuseResults.slice(0, Math.min(5, fuseResults.length));
    var matchedItems = [];

    var self = this;
    topMatches.forEach(function(result) {
      // Find the item in our embeddings by matching name
      var found = self.embeddings.find(function(e) {
        return e.name === result.item.name;
      });
      if (found) {
        matchedItems.push(found);
      }
    });

    if (matchedItems.length === 0) {
      // Fallback: use top items
      return this._getAverageEmbedding(this.embeddings.slice(0, 10));
    }

    return this._getAverageEmbedding(matchedItems);
  };

  /**
   * Compute average embedding from multiple items and normalize
   * @param {Array} items - Items with embedding property
   * @returns {number[]|null} - Normalized average embedding
   */
  VectorSearch._getAverageEmbedding = function(items) {
    if (items.length === 0) return null;

    var dim = items[0].embedding.length;
    var avg = new Array(dim).fill(0);

    items.forEach(function(item) {
      for (var i = 0; i < dim; i++) {
        avg[i] += item.embedding[i];
      }
    });

    // Normalize
    var norm = 0;
    for (var i = 0; i < dim; i++) {
      avg[i] /= items.length;
      norm += avg[i] * avg[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (var i = 0; i < dim; i++) {
        avg[i] /= norm;
      }
    }

    return avg;
  };

  /**
   * Full semantic search - combines lexical and vector search
   * @param {string} query - Search query
   * @param {Fuse} fuseInstance - Fuse.js instance for lexical search
   * @param {number} topK - Number of results
   * @returns {Array} - Ranked results in Fuse.js output format
   */
  VectorSearch.search = function(query, fuseInstance, topK) {
    topK = topK || 20;

    if (!this.isLoaded) {
      // Fall back to pure Fuse.js
      return fuseInstance ? fuseInstance.search(query).slice(0, topK) : [];
    }

    // Get query embedding using lexical matches as proxy
    var queryEmbedding = this.getQueryEmbedding(query, fuseInstance);

    if (!queryEmbedding) {
      // Fall back to Fuse.js
      return fuseInstance ? fuseInstance.search(query).slice(0, topK) : [];
    }

    // Get vector search results
    var vectorResults = this.searchByEmbedding(queryEmbedding, topK * 2);

    // Format results to match Fuse.js output format
    return vectorResults.slice(0, topK).map(function(r) {
      return {
        item: {
          id: r.item.id,
          type: r.item.type,
          name: r.item.name,
          description: r.item.description,
          category: r.item.category,
          url: r.item.url
        },
        score: 1 - r.score, // Invert so lower is better (like Fuse.js)
        refIndex: 0
      };
    });
  };

  // Expose globally
  global.VectorSearch = VectorSearch;

})(typeof window !== 'undefined' ? window : this);
