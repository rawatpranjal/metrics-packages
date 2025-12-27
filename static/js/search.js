// Package Search Module - Instant filtering with category and tag support
(function() {
    'use strict';

    // DOM Elements
    let searchInput, clearBtn, resultCount, categoryBtns, cardsView, tableView;
    let noResults, searchTermDisplay, resetFiltersBtn;
    let cards, tableRows, categorySections;

    // State
    let currentCategory = 'all';
    let currentSearch = '';
    let debounceTimer = null;
    let totalPackages = 0;

    function init() {
        // Get DOM elements
        searchInput = document.getElementById('package-search');
        clearBtn = document.getElementById('clear-search');
        resultCount = document.getElementById('result-count');
        categoryBtns = document.querySelectorAll('.category-btn');
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

        // Search input listener with debounce
        searchInput.addEventListener('input', function(e) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() {
                currentSearch = e.target.value.toLowerCase().trim();
                filterPackages();
                toggleClearButton();
            }, 150);
        });

        // Clear button
        if (clearBtn) {
            clearBtn.addEventListener('click', clearSearch);
        }

        // Category filter buttons
        categoryBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                categoryBtns.forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                currentCategory = this.dataset.category;
                filterPackages();
            });
        });

        // Tag click handlers (event delegation)
        if (cardsView) {
            cardsView.addEventListener('click', function(e) {
                if (e.target.classList.contains('use-case-tag')) {
                    var tag = e.target.dataset.tag;
                    searchInput.value = tag;
                    currentSearch = tag.toLowerCase();
                    filterPackages();
                    toggleClearButton();
                }
            });
        }

        // Reset filters button
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', resetAllFilters);
        }

        // Initial state
        toggleClearButton();
        updateResultCount(totalPackages);
    }

    function filterPackages() {
        var visibleCount = 0;
        var sectionVisibility = {};

        // Initialize section visibility tracking
        categorySections.forEach(function(section) {
            sectionVisibility[section.dataset.sectionCategory] = 0;
        });

        // Filter cards
        cards.forEach(function(card) {
            var cardCategory = card.dataset.category;
            var matchesCategory = currentCategory === 'all' || cardCategory === currentCategory;

            var matchesSearch = !currentSearch ||
                card.dataset.name.includes(currentSearch) ||
                card.dataset.description.includes(currentSearch) ||
                (card.dataset.tags && card.dataset.tags.toLowerCase().includes(currentSearch)) ||
                cardCategory.toLowerCase().includes(currentSearch);

            var isVisible = matchesCategory && matchesSearch;

            if (isVisible) {
                card.classList.remove('hidden');
                card.classList.add('visible');
                visibleCount++;

                // Track section visibility
                if (sectionVisibility[cardCategory] !== undefined) {
                    sectionVisibility[cardCategory]++;
                }
            } else {
                card.classList.add('hidden');
                card.classList.remove('visible');
            }
        });

        // Update section visibility
        categorySections.forEach(function(section) {
            var cat = section.dataset.sectionCategory;
            if (sectionVisibility[cat] > 0) {
                section.classList.remove('section-hidden');
            } else {
                section.classList.add('section-hidden');
            }
        });

        // Filter table rows
        tableRows.forEach(function(row) {
            var nameEl = row.querySelector('.pkg-name');
            var descEl = row.querySelector('.pkg-desc');
            var catEl = row.querySelector('.category-badge-sm');

            var name = nameEl ? nameEl.textContent.toLowerCase() : '';
            var desc = descEl ? descEl.textContent.toLowerCase() : '';
            var cat = catEl ? catEl.textContent : '';

            var matchesCategory = currentCategory === 'all' || cat === currentCategory;
            var matchesSearch = !currentSearch ||
                name.includes(currentSearch) ||
                desc.includes(currentSearch) ||
                cat.toLowerCase().includes(currentSearch);

            row.style.display = (matchesCategory && matchesSearch) ? '' : 'none';
        });

        // Update UI
        updateResultCount(visibleCount);
        toggleNoResults(visibleCount);
    }

    function updateResultCount(count) {
        if (!resultCount) return;
        var text = count === 1 ? '1 package found' : count + ' packages found';
        resultCount.textContent = text;
        resultCount.classList.toggle('no-match', count === 0);
    }

    function toggleNoResults(count) {
        if (!noResults) return;
        if (count === 0 && (currentSearch || currentCategory !== 'all')) {
            noResults.style.display = 'flex';
            if (searchTermDisplay) {
                searchTermDisplay.textContent = currentSearch || currentCategory;
            }
        } else {
            noResults.style.display = 'none';
        }
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
        searchInput.focus();
    }

    function resetAllFilters() {
        clearSearch();
        currentCategory = 'all';
        categoryBtns.forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.category === 'all');
        });
        filterPackages();
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
