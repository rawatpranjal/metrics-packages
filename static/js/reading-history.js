// Reading History - Track recently viewed items for "Continue where you left off"
// Stores last 10 clicked items in localStorage

(function() {
    'use strict';

    const STORAGE_KEY = 'techEconHistory';
    const MAX_ITEMS = 10;

    // Get history from localStorage
    function getHistory() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            console.error('Error reading history:', e);
            return [];
        }
    }

    // Save history to localStorage
    function saveHistory(items) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (e) {
            console.error('Error saving history:', e);
        }
    }

    // Add item to history
    function addToHistory(item) {
        if (!item.name || !item.url) return;

        let history = getHistory();

        // Remove if already exists (will re-add at front)
        history = history.filter(h => h.name !== item.name);

        // Add to front
        history.unshift({
            name: item.name,
            url: item.url,
            type: item.type || 'item',
            category: item.category || '',
            description: item.description || '',
            viewedAt: Date.now()
        });

        // Keep only last MAX_ITEMS
        if (history.length > MAX_ITEMS) {
            history = history.slice(0, MAX_ITEMS);
        }

        saveHistory(history);
    }

    // Get recent items
    function getRecent(count) {
        return getHistory().slice(0, count || MAX_ITEMS);
    }

    // Clear history
    function clearHistory() {
        saveHistory([]);
    }

    // Track clicks on cards and links
    function initTracking() {
        document.addEventListener('click', function(e) {
            // Check for card click
            const card = e.target.closest('[data-name]');
            if (card) {
                const link = card.querySelector('a[href]');
                const url = link ? link.getAttribute('href') : null;
                if (url && url.startsWith('http')) {
                    addToHistory({
                        name: card.dataset.name,
                        url: url,
                        type: getItemType(),
                        category: card.dataset.category || '',
                        description: card.querySelector('.package-desc, .item-desc, p')?.textContent?.slice(0, 150) || ''
                    });
                }
            }

            // Also track direct link clicks in tables/lists
            const link = e.target.closest('a[href^="http"]');
            if (link && !card) {
                const row = link.closest('tr, .list-item, .card');
                if (row) {
                    const name = row.querySelector('.pkg-name, .item-name')?.textContent?.trim() ||
                                 link.textContent?.trim();
                    if (name && name.length < 100) {
                        addToHistory({
                            name: name,
                            url: link.href,
                            type: getItemType(),
                            category: '',
                            description: ''
                        });
                    }
                }
            }
        });
    }

    // Determine item type from current page
    function getItemType() {
        const path = window.location.pathname;
        if (path.includes('/packages')) return 'package';
        if (path.includes('/papers')) return 'paper';
        if (path.includes('/datasets')) return 'dataset';
        if (path.includes('/talks')) return 'talk';
        if (path.includes('/books')) return 'book';
        if (path.includes('/career')) return 'career';
        if (path.includes('/community')) return 'community';
        if (path.includes('/learning')) return 'resource';
        return 'item';
    }

    // Render history section on homepage
    function renderHistorySection() {
        const container = document.getElementById('reading-history-section');
        if (!container) return;

        const history = getRecent(5);
        if (history.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        const cardsHtml = history.map(item => `
            <a href="${item.url}" target="_blank" rel="noopener" class="history-card">
                <span class="history-type">${item.type}</span>
                <span class="history-name">${escapeHtml(item.name)}</span>
                ${item.category ? `<span class="history-category">${escapeHtml(item.category)}</span>` : ''}
            </a>
        `).join('');

        container.innerHTML = `
            <div class="history-header">
                <h3>Pick up where you left off</h3>
                <button class="history-clear" onclick="TechEconHistory.clear(); this.closest('.reading-history-section').style.display='none';">Clear</button>
            </div>
            <div class="history-cards">${cardsHtml}</div>
        `;
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initTracking();
            renderHistorySection();
        });
    } else {
        initTracking();
        renderHistorySection();
    }

    // Expose API
    window.TechEconHistory = {
        get: getHistory,
        getRecent: getRecent,
        add: addToHistory,
        clear: clearHistory,
        render: renderHistorySection
    };

})();
