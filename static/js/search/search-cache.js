/**
 * Search Cache Module - IndexedDB caching for search assets
 *
 * Caches:
 * - Embeddings (binary Float32Array, ~1MB)
 * - Transformers.js model weights (~23MB)
 * - Search index (~50KB)
 */
(function(global) {
  'use strict';

  var DB_NAME = 'tech-econ-search';
  var DB_VERSION = 2;  // Increment for cache schema changes
  var STORE_NAME = 'cache';

  // Cache configuration
  var CACHE_VERSION = 3;  // Increment when cache format changes
  var CACHE_TTL = 7 * 24 * 60 * 60 * 1000;  // 7 days in milliseconds

  var SearchCache = {
    db: null,
    isReady: false,
    _initPromise: null
  };

  /**
   * Check if a cached item is expired
   * @param {Object} cachedItem - Cached item with timestamp
   * @returns {boolean}
   */
  SearchCache.isExpired = function(cachedItem) {
    if (!cachedItem || !cachedItem.timestamp) return true;
    return Date.now() - cachedItem.timestamp > CACHE_TTL;
  };

  /**
   * Check if cache version matches
   * @param {Object} cachedItem - Cached item with version
   * @returns {boolean}
   */
  SearchCache.isValidVersion = function(cachedItem) {
    if (!cachedItem || typeof cachedItem.version !== 'number') return false;
    return cachedItem.version === CACHE_VERSION;
  };

  /**
   * Wrap value with metadata (version, timestamp)
   * @param {any} value - Value to wrap
   * @returns {Object}
   */
  SearchCache.wrapWithMeta = function(value) {
    return {
      value: value,
      version: CACHE_VERSION,
      timestamp: Date.now()
    };
  };

  /**
   * Initialize IndexedDB
   * @returns {Promise<boolean>}
   */
  SearchCache.init = function() {
    if (this.isReady) return Promise.resolve(true);
    if (this._initPromise) return this._initPromise;

    var self = this;
    this._initPromise = new Promise(function(resolve, reject) {
      if (!window.indexedDB) {
        console.warn('[SearchCache] IndexedDB not supported');
        resolve(false);
        return;
      }

      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = function(event) {
        console.warn('[SearchCache] Failed to open database:', event.target.error);
        resolve(false);
      };

      request.onsuccess = function(event) {
        self.db = event.target.result;
        self.isReady = true;
        console.log('[SearchCache] Database ready');
        resolve(true);
      };

      request.onupgradeneeded = function(event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });

    return this._initPromise;
  };

  /**
   * Get cached item
   * @param {string} key - Cache key
   * @returns {Promise<any>}
   */
  SearchCache.get = function(key) {
    var self = this;
    return this.init().then(function(ready) {
      if (!ready || !self.db) return null;

      return new Promise(function(resolve) {
        try {
          var transaction = self.db.transaction([STORE_NAME], 'readonly');
          var store = transaction.objectStore(STORE_NAME);
          var request = store.get(key);

          request.onsuccess = function() {
            resolve(request.result || null);
          };

          request.onerror = function() {
            resolve(null);
          };
        } catch (e) {
          resolve(null);
        }
      });
    });
  };

  /**
   * Set cached item
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @returns {Promise<boolean>}
   */
  SearchCache.set = function(key, value) {
    var self = this;
    return this.init().then(function(ready) {
      if (!ready || !self.db) return false;

      return new Promise(function(resolve) {
        try {
          var transaction = self.db.transaction([STORE_NAME], 'readwrite');
          var store = transaction.objectStore(STORE_NAME);
          var request = store.put(value, key);

          request.onsuccess = function() {
            resolve(true);
          };

          request.onerror = function() {
            console.warn('[SearchCache] Failed to cache:', key);
            resolve(false);
          };
        } catch (e) {
          resolve(false);
        }
      });
    });
  };

  /**
   * Delete cached item
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  SearchCache.delete = function(key) {
    var self = this;
    return this.init().then(function(ready) {
      if (!ready || !self.db) return false;

      return new Promise(function(resolve) {
        try {
          var transaction = self.db.transaction([STORE_NAME], 'readwrite');
          var store = transaction.objectStore(STORE_NAME);
          var request = store.delete(key);

          request.onsuccess = function() {
            resolve(true);
          };

          request.onerror = function() {
            resolve(false);
          };
        } catch (e) {
          resolve(false);
        }
      });
    });
  };

  /**
   * Clear all cached items
   * @returns {Promise<boolean>}
   */
  SearchCache.clear = function() {
    var self = this;
    return this.init().then(function(ready) {
      if (!ready || !self.db) return false;

      return new Promise(function(resolve) {
        try {
          var transaction = self.db.transaction([STORE_NAME], 'readwrite');
          var store = transaction.objectStore(STORE_NAME);
          var request = store.clear();

          request.onsuccess = function() {
            console.log('[SearchCache] Cache cleared');
            resolve(true);
          };

          request.onerror = function() {
            resolve(false);
          };
        } catch (e) {
          resolve(false);
        }
      });
    });
  };

  // Cache keys
  SearchCache.KEYS = {
    EMBEDDINGS: 'embeddings-v2',
    EMBEDDINGS_METADATA: 'embeddings-metadata-v2',
    SEARCH_INDEX: 'search-index-v1',
    MODEL_LOADED: 'model-loaded-v1'
  };

  /**
   * Get cached embeddings
   * @param {string} contentHash - Expected content hash for validation
   * @returns {Promise<{metadata: Object, embeddings: ArrayBuffer, quantized: boolean}|null>}
   */
  SearchCache.getEmbeddings = function(contentHash) {
    var self = this;
    return Promise.all([
      this.get(this.KEYS.EMBEDDINGS_METADATA),
      this.get(this.KEYS.EMBEDDINGS)
    ]).then(function(results) {
      var metadataWrapper = results[0];
      var embeddingsWrapper = results[1];

      if (!metadataWrapper || !embeddingsWrapper) {
        return null;
      }

      // Check version and expiry
      if (!self.isValidVersion(metadataWrapper) || self.isExpired(metadataWrapper)) {
        console.log('[SearchCache] Embeddings cache expired or version mismatch');
        self.delete(self.KEYS.EMBEDDINGS_METADATA);
        self.delete(self.KEYS.EMBEDDINGS);
        return null;
      }

      var metadata = metadataWrapper.value;

      // Validate content hash if provided
      if (contentHash && metadata.contentHash !== contentHash) {
        console.log('[SearchCache] Embeddings cache invalidated (content changed)');
        return null;
      }

      // Guard: validate embeddings buffer exists
      if (!embeddingsWrapper.value || !embeddingsWrapper.value.buffer) {
        console.warn('[SearchCache] Embeddings cache corrupted (no buffer)');
        return null;
      }

      return {
        metadata: metadata,
        embeddings: embeddingsWrapper.value.buffer,
        quantized: embeddingsWrapper.value.quantized || false
      };
    });
  };

  /**
   * Cache embeddings
   * @param {Object} metadata - Metadata object
   * @param {ArrayBuffer} embeddingsBuffer - Binary embeddings
   * @param {boolean} quantized - Whether embeddings are quantized Int8
   * @returns {Promise<boolean>}
   */
  SearchCache.setEmbeddings = function(metadata, embeddingsBuffer, quantized) {
    return Promise.all([
      this.set(this.KEYS.EMBEDDINGS_METADATA, this.wrapWithMeta(metadata)),
      this.set(this.KEYS.EMBEDDINGS, this.wrapWithMeta({
        buffer: embeddingsBuffer,
        quantized: !!quantized
      }))
    ]).then(function(results) {
      var success = results[0] && results[1];
      if (success) {
        console.log('[SearchCache] Embeddings cached successfully (quantized:', !!quantized, ')');
      }
      return success;
    });
  };

  /**
   * Get cached search index
   * @returns {Promise<Object|null>}
   */
  SearchCache.getSearchIndex = function() {
    return this.get(this.KEYS.SEARCH_INDEX);
  };

  /**
   * Cache search index
   * @param {Object} index - Search index data
   * @returns {Promise<boolean>}
   */
  SearchCache.setSearchIndex = function(index) {
    return this.set(this.KEYS.SEARCH_INDEX, index);
  };

  // Export
  if (typeof module === 'object' && module.exports) {
    module.exports = SearchCache;
  } else {
    global.SearchCache = SearchCache;
  }

})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
