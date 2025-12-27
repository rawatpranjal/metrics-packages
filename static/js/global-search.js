// Global Search Module
(function() {
  'use strict';

  // Configuration
  var CONFIG = {
    fuseOptions: {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'tags', weight: 1.5 },
        { name: 'best_for', weight: 1.2 },
        { name: 'description', weight: 1 },
        { name: 'category', weight: 0.8 }
      ],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 2
    },
    debounceMs: 150,
    maxResultsPerType: 5,
    maxTotalResults: 20
  };

  // Type display configuration
  var TYPE_CONFIG = {
    package: { label: 'Package', icon: 'pkg', color: '#0066cc', href: '/packages/' },
    dataset: { label: 'Dataset', icon: 'data', color: '#2e7d32', href: '/datasets/' },
    resource: { label: 'Resource', icon: 'book', color: '#7b1fa2', href: '/resources/' },
    talk: { label: 'Talk', icon: 'mic', color: '#e65100', href: '/talks/' },
    career: { label: 'Career', icon: 'job', color: '#c2185b', href: '/career/' },
    community: { label: 'Community', icon: 'people', color: '#00796b', href: '/community/' },
    roadmap: { label: 'Roadmap', icon: 'map', color: '#1565c0', href: '/start/' }
  };

  // State
  var fuse = null;
  var searchIndex = [];
  var isOpen = false;
  var selectedIndex = -1;
  var currentResults = [];
  var flatResults = [];

  // DOM Elements (cached after init)
  var modal, backdrop, input, resultsContainer, emptyState, hint, triggers;

  // Initialize
  function init() {
    modal = document.getElementById('global-search-modal');
    if (!modal) return;

    backdrop = modal.querySelector('.global-search-backdrop');
    input = document.getElementById('global-search-input');
    resultsContainer = document.getElementById('global-search-results');
    emptyState = document.getElementById('global-search-empty');
    hint = document.getElementById('global-search-hint');
    triggers = document.querySelectorAll('.global-search-trigger');

    loadSearchIndex();
    bindEvents();
  }

  function loadSearchIndex() {
    var dataEl = document.getElementById('global-search-data');
    if (dataEl) {
      try {
        searchIndex = JSON.parse(dataEl.textContent);
        initFuse();
      } catch (e) {
        console.error('Failed to parse search index:', e);
      }
    }
  }

  function initFuse() {
    if (typeof Fuse !== 'undefined' && searchIndex.length > 0) {
      fuse = new Fuse(searchIndex, CONFIG.fuseOptions);
    }
  }

  function bindEvents() {
    // Keyboard shortcut (Cmd/Ctrl + K)
    document.addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleModal();
      }
      if (e.key === 'Escape' && isOpen) {
        closeModal();
      }
    });

    // Trigger buttons
    triggers.forEach(function(trigger) {
      trigger.addEventListener('click', function(e) {
        e.preventDefault();
        openModal();
      });
    });

    // Backdrop click
    if (backdrop) {
      backdrop.addEventListener('click', closeModal);
    }

    // Search input
    if (input) {
      var debounceTimer;
      input.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(performSearch, CONFIG.debounceMs);
      });

      // Keyboard navigation
      input.addEventListener('keydown', handleKeyNavigation);
    }

    // Result clicks (event delegation)
    if (resultsContainer) {
      resultsContainer.addEventListener('click', handleResultClick);
    }
  }

  function toggleModal() {
    isOpen ? closeModal() : openModal();
  }

  function openModal() {
    if (!modal) return;
    modal.style.display = 'flex';
    isOpen = true;
    selectedIndex = -1;
    flatResults = [];
    input.value = '';
    setTimeout(function() { input.focus(); }, 50);
    showHint();
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modal) return;
    modal.style.display = 'none';
    isOpen = false;
    document.body.style.overflow = '';
  }

  function performSearch() {
    var query = input.value.trim();

    if (!query || query.length < 2) {
      showHint();
      currentResults = [];
      flatResults = [];
      return;
    }

    if (!fuse) return;

    var results = fuse.search(query);
    currentResults = results.slice(0, CONFIG.maxTotalResults);

    if (currentResults.length === 0) {
      showEmpty();
      flatResults = [];
    } else {
      renderResults(currentResults);
    }
  }

  function renderResults(results) {
    hint.style.display = 'none';
    emptyState.style.display = 'none';

    // Group by type
    var grouped = {};
    results.forEach(function(result) {
      var type = result.item.type;
      if (!grouped[type]) grouped[type] = [];
      if (grouped[type].length < CONFIG.maxResultsPerType) {
        grouped[type].push(result);
      }
    });

    var html = '';
    flatResults = [];
    var globalIndex = 0;

    // Order of types
    var typeOrder = ['package', 'dataset', 'resource', 'talk', 'career', 'community', 'roadmap'];

    typeOrder.forEach(function(type) {
      if (!grouped[type]) return;

      var typeConfig = TYPE_CONFIG[type] || { label: type, icon: 'file', color: '#666' };

      html += '<div class="result-group">';
      html += '<div class="result-group-header">';
      html += '<span class="result-type-label">' + typeConfig.label + 's</span>';
      html += '</div>';

      grouped[type].forEach(function(result) {
        var item = result.item;
        var isSelected = globalIndex === selectedIndex;
        flatResults.push(item);

        html += '<a href="' + escapeHtml(item.url) + '" ';
        html += 'class="result-item' + (isSelected ? ' selected' : '') + '" ';
        html += 'data-index="' + globalIndex + '" ';
        html += 'target="_blank" rel="noopener">';
        html += '<div class="result-content">';
        html += '<span class="result-name">' + escapeHtml(item.name) + '</span>';
        html += '<span class="result-description">' + escapeHtml(truncate(item.description, 80)) + '</span>';
        html += '</div>';
        html += '<span class="result-category">' + escapeHtml(item.category) + '</span>';
        html += '</a>';

        globalIndex++;
      });

      html += '</div>';
    });

    resultsContainer.innerHTML = html;
    selectedIndex = 0;
    updateSelection();
  }

  function showHint() {
    resultsContainer.innerHTML = '';
    emptyState.style.display = 'none';
    hint.style.display = 'block';
  }

  function showEmpty() {
    resultsContainer.innerHTML = '';
    hint.style.display = 'none';
    emptyState.style.display = 'flex';
  }

  function handleKeyNavigation(e) {
    if (flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, flatResults.length - 1);
      updateSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection();
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      var selected = resultsContainer.querySelector('.result-item.selected');
      if (selected) {
        window.open(selected.href, '_blank');
        closeModal();
      }
    }
  }

  function updateSelection() {
    var items = resultsContainer.querySelectorAll('.result-item');
    items.forEach(function(item, i) {
      if (i === selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  function handleResultClick(e) {
    var item = e.target.closest('.result-item');
    if (item) {
      closeModal();
    }
  }

  // Utility functions
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
