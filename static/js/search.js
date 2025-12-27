// Package Search Module - Fuse.js fuzzy search with relevance ordering
(function() {
    'use strict';

    // Constants
    var RECENT_SEARCHES_KEY = 'recent-searches';
    var MAX_RECENT_SEARCHES = 5;
    var SUGGESTIONS = ['causal inference', 'CUPED', 'diff-in-diff', 'synthetic control', 'A/B testing'];

    // DOM Elements
    let searchInput, clearBtn, resultCount, categorySelect, cardsView, tableView;
    let noResults, searchTermDisplay, resetFiltersBtn;
    let cards, tableRows, categorySections;
    let flatContainer = null;
    let suggestionsContainer = null;

    // State
    let currentCategory = 'all';
    let currentSearch = '';
    let debounceTimer = null;
    let totalPackages = 0;
    let fuse = null;
    let packagesData = [];
    let originalOrder = [];

    function init() {
        // Get DOM elements
        searchInput = document.getElementById('package-search');
        clearBtn = document.getElementById('clear-search');
        resultCount = document.getElementById('result-count');
        categorySelect = document.getElementById('category-select');
        cardsView = document.getElementById('cards-view');
        tableView = document.getElementById('table-view');
        noResults = document.getElementById('no-results');
        searchTermDisplay = document.getElementById('search-term');
        resetFiltersBtn = document.getElementById('reset-filters');

        if (!searchInput) return;

        // Get all filterable elements
        cards = document.querySelectorAll('.package-card');
        tableRows = document.querySelectorAll('.package-table tbody tr');
        categorySections = document.querySelectorAll('.category-section');
        totalPackages = cards.length;

        // Store original order for reset
        originalOrder = Array.from(cards);

        // Create flat container for search results
        createFlatContainer();

        // Initialize Fuse.js with search data
        initFuse();

        // Search input listener with debounce
        searchInput.addEventListener('input', function(e) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() {
                currentSearch = e.target.value.trim();
                filterPackages();
                toggleClearButton();
                updateURL(currentSearch);
                hideSuggestions();
                if (currentSearch) {
                    addRecentSearch(currentSearch);
                }
            }, 150);
        });

        // Clear button
        if (clearBtn) {
            clearBtn.addEventListener('click', clearSearch);
        }

        // Category dropdown
        if (categorySelect) {
            categorySelect.addEventListener('change', function() {
                currentCategory = this.value;
                filterPackages();
            });
        }

        // Tag click handlers (event delegation)
        if (cardsView) {
            cardsView.addEventListener('click', function(e) {
                if (e.target.classList.contains('use-case-tag')) {
                    var tag = e.target.dataset.tag;
                    searchInput.value = tag;
                    currentSearch = tag;
                    filterPackages();
                    toggleClearButton();
                }
            });
        }

        // Reset filters button
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', resetAllFilters);
        }

        // Create suggestions container
        createSuggestionsContainer();

        // Initial state
        toggleClearButton();
        updateResultCount(totalPackages);

        // Check URL for search query
        loadFromURL();

        // Show suggestions on focus when empty
        searchInput.addEventListener('focus', function() {
            if (!searchInput.value.trim()) {
                showSuggestions();
            }
        });

        // Hide suggestions on blur (with delay for clicks)
        searchInput.addEventListener('blur', function() {
            setTimeout(hideSuggestions, 200);
        });
    }

    // URL Query Params
    function loadFromURL() {
        var params = new URLSearchParams(window.location.search);
        var q = params.get('q');
        if (q) {
            searchInput.value = q;
            currentSearch = q;
            filterPackages();
            toggleClearButton();
        }
    }

    function updateURL(query) {
        var url = new URL(window.location);
        if (query) {
            url.searchParams.set('q', query);
        } else {
            url.searchParams.delete('q');
        }
        history.replaceState(null, '', url);
    }

    // Recent Searches
    function getRecentSearches() {
        try {
            return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    function addRecentSearch(query) {
        if (!query || query.length < 2) return;
        var recent = getRecentSearches();
        // Remove if exists, add to front
        recent = recent.filter(function(s) { return s.toLowerCase() !== query.toLowerCase(); });
        recent.unshift(query);
        recent = recent.slice(0, MAX_RECENT_SEARCHES);
        try {
            localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
        } catch (e) {}
    }

    function clearRecentSearches() {
        try {
            localStorage.removeItem(RECENT_SEARCHES_KEY);
        } catch (e) {}
        showSuggestions();
    }

    // Suggestions Container
    function createSuggestionsContainer() {
        suggestionsContainer = document.createElement('div');
        suggestionsContainer.className = 'search-suggestions';
        suggestionsContainer.style.display = 'none';
        var wrapper = searchInput.closest('.search-input-wrapper') || searchInput.parentNode;
        wrapper.style.position = 'relative';
        wrapper.appendChild(suggestionsContainer);
    }

    function showSuggestions() {
        if (!suggestionsContainer) return;
        var recent = getRecentSearches();
        var html = '';

        if (recent.length > 0) {
            html += '<div class="suggestions-section">';
            html += '<div class="suggestions-header"><span>Recent</span><button class="clear-recent">Clear</button></div>';
            recent.forEach(function(s) {
                html += '<button class="suggestion-chip recent-chip" data-query="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>';
            });
            html += '</div>';
        }

        html += '<div class="suggestions-section">';
        html += '<div class="suggestions-header"><span>Try searching</span></div>';
        SUGGESTIONS.forEach(function(s) {
            html += '<button class="suggestion-chip" data-query="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>';
        });
        html += '</div>';

        suggestionsContainer.innerHTML = html;
        suggestionsContainer.style.display = 'block';

        // Bind click events
        suggestionsContainer.querySelectorAll('.suggestion-chip').forEach(function(chip) {
            chip.addEventListener('click', function() {
                var query = this.dataset.query;
                searchInput.value = query;
                currentSearch = query;
                filterPackages();
                toggleClearButton();
                updateURL(query);
                addRecentSearch(query);
                hideSuggestions();
            });
        });

        var clearBtn = suggestionsContainer.querySelector('.clear-recent');
        if (clearBtn) {
            clearBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                clearRecentSearches();
            });
        }
    }

    function hideSuggestions() {
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'none';
        }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function createFlatContainer() {
        // Create a container for flat search results
        flatContainer = document.createElement('div');
        flatContainer.id = 'flat-results';
        flatContainer.className = 'cards-row';
        flatContainer.style.display = 'none';
        if (cardsView) {
            cardsView.appendChild(flatContainer);
        }
    }

    function initFuse() {
        // Load search data from embedded JSON
        var searchDataEl = document.getElementById('search-data');
        if (searchDataEl) {
            try {
                packagesData = JSON.parse(searchDataEl.textContent);
            } catch (e) {
                console.error('Failed to parse search data:', e);
                packagesData = [];
            }
        }

        // Initialize Fuse with weighted keys for relevance
        if (typeof Fuse !== 'undefined' && packagesData.length > 0) {
            fuse = new Fuse(packagesData, {
                keys: [
                    { name: 'name', weight: 2 },
                    { name: 'tags', weight: 1.5 },
                    { name: 'best_for', weight: 1.2 },
                    { name: 'description', weight: 1 },
                    { name: 'category', weight: 0.5 }
                ],
                threshold: 0.35,
                ignoreLocation: true,
                includeScore: true,
                minMatchCharLength: 2
            });
        }
    }

    function filterPackages() {
        var visibleCount = 0;

        if (currentSearch && fuse) {
            // Search mode: show flat list ordered by relevance
            showFlatResults();
        } else {
            // No search: show original category layout
            showCategoryLayout();
        }

        // Update table view
        filterTableRows();

        // Update UI
        updateResultCount(getVisibleCount());
        // Never show "no results" - we always show everything
        if (noResults) {
            noResults.style.display = 'none';
        }
    }

    function showFlatResults() {
        // Hide category sections
        categorySections.forEach(function(section) {
            section.style.display = 'none';
        });

        // Show flat container
        if (flatContainer) {
            flatContainer.style.display = 'grid';
        }

        // Get all results with scores
        var results = fuse.search(currentSearch);
        var scoreMap = new Map();
        results.forEach(function(result) {
            scoreMap.set(result.item.name.toLowerCase(), result.score);
        });

        // Sort all cards by relevance
        var cardsArray = Array.from(cards);
        cardsArray.sort(function(a, b) {
            var scoreA = scoreMap.has(a.dataset.name) ? scoreMap.get(a.dataset.name) : 1;
            var scoreB = scoreMap.has(b.dataset.name) ? scoreMap.get(b.dataset.name) : 1;
            return scoreA - scoreB;
        });

        // Filter by category if needed
        cardsArray = cardsArray.filter(function(card) {
            return currentCategory === 'all' || card.dataset.category === currentCategory;
        });

        // Move cards to flat container in sorted order
        cardsArray.forEach(function(card) {
            card.classList.remove('hidden');
            card.classList.add('visible');
            // Add visual indicator for match quality
            var score = scoreMap.get(card.dataset.name);
            if (score !== undefined && score < 0.3) {
                card.style.opacity = '1';
            } else if (score !== undefined && score < 0.5) {
                card.style.opacity = '0.9';
            } else {
                card.style.opacity = '0.7';
            }
            flatContainer.appendChild(card);
        });
    }

    function showCategoryLayout() {
        // Show category sections
        categorySections.forEach(function(section) {
            var cat = section.dataset.sectionCategory;
            var shouldShow = currentCategory === 'all' || cat === currentCategory;
            section.style.display = shouldShow ? '' : 'none';
        });

        // Hide flat container
        if (flatContainer) {
            flatContainer.style.display = 'none';
        }

        // Restore cards to original positions
        originalOrder.forEach(function(card) {
            var cardCategory = card.dataset.category;
            var matchesCategory = currentCategory === 'all' || cardCategory === currentCategory;

            // Find the original parent (cards-row within category section)
            var section = document.querySelector('[data-section-category="' + cardCategory + '"]');
            if (section) {
                var cardsRow = section.querySelector('.cards-row');
                if (cardsRow && card.parentNode !== cardsRow) {
                    cardsRow.appendChild(card);
                }
            }

            if (matchesCategory) {
                card.classList.remove('hidden');
                card.classList.add('visible');
                card.style.opacity = '1';
            } else {
                card.classList.add('hidden');
                card.classList.remove('visible');
            }
        });
    }

    function filterTableRows() {
        var scoreMap = new Map();
        if (currentSearch && fuse) {
            var results = fuse.search(currentSearch);
            results.forEach(function(result) {
                scoreMap.set(result.item.name.toLowerCase(), result.score);
            });
        }

        // Sort table rows by score
        var tbody = document.querySelector('.package-table tbody');
        if (!tbody) return;

        var rowsArray = Array.from(tableRows);

        if (currentSearch) {
            rowsArray.sort(function(a, b) {
                var elA = a.querySelector('.pkg-name');
                var elB = b.querySelector('.pkg-name');
                var nameA = elA ? elA.textContent.toLowerCase() : '';
                var nameB = elB ? elB.textContent.toLowerCase() : '';
                var scoreA = scoreMap.has(nameA) ? scoreMap.get(nameA) : 1;
                var scoreB = scoreMap.has(nameB) ? scoreMap.get(nameB) : 1;
                return scoreA - scoreB;
            });
        }

        rowsArray.forEach(function(row) {
            var nameEl = row.querySelector('.pkg-name');
            var catEl = row.querySelector('.category-badge-sm');
            var name = nameEl ? nameEl.textContent.toLowerCase() : '';
            var cat = catEl ? catEl.textContent : '';

            var matchesCategory = currentCategory === 'all' || cat === currentCategory;

            if (matchesCategory) {
                row.style.display = '';
                var score = scoreMap.get(name);
                if (currentSearch) {
                    if (score !== undefined && score < 0.3) {
                        row.style.opacity = '1';
                    } else if (score !== undefined && score < 0.5) {
                        row.style.opacity = '0.9';
                    } else {
                        row.style.opacity = '0.7';
                    }
                } else {
                    row.style.opacity = '1';
                }
                tbody.appendChild(row);
            } else {
                row.style.display = 'none';
            }
        });
    }

    function getVisibleCount() {
        var count = 0;
        cards.forEach(function(card) {
            if (!card.classList.contains('hidden') && card.offsetParent !== null) {
                count++;
            }
        });
        return count || totalPackages;
    }

    function updateResultCount(count) {
        if (!resultCount) return;
        var text = count === 1 ? '1 package' : count + ' packages';
        if (currentSearch) {
            text += ' (sorted by relevance)';
        }
        resultCount.textContent = text;
        resultCount.classList.remove('no-match');
    }

    function toggleClearButton() {
        if (!clearBtn) return;
        clearBtn.style.display = searchInput.value ? 'flex' : 'none';
    }

    function clearSearch() {
        searchInput.value = '';
        currentSearch = '';
        filterPackages();
        toggleClearButton();
        updateURL('');
        searchInput.focus();
    }

    function resetAllFilters() {
        clearSearch();
        currentCategory = 'all';
        if (categorySelect) {
            categorySelect.value = 'all';
        }
        filterPackages();
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
