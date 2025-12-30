/**
 * Explore Page - Netflix-style topic browsing
 * Features:
 * - Horizontal scrolling rows per cluster
 * - Client-side shuffle (random order)
 * - Lazy loading of rows as user scrolls
 * - Keyboard and touch navigation
 */

(function() {
    'use strict';

    // Configuration
    const ROWS_PER_BATCH = 10;      // Load 10 rows at a time
    const ITEMS_PER_ROW = 15;       // Show max 15 items per row
    const MIN_CLUSTER_SIZE = 5;    // Hide clusters with < 5 items

    let clusterData = null;
    let allItemsData = null;
    let itemLookup = {};
    let shuffledClusters = [];
    let loadedRowCount = 0;
    let isLoading = false;

    // Initialize on DOM load
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        // Parse data from script tags
        try {
            clusterData = JSON.parse(document.getElementById('cluster-data').textContent);
            allItemsData = JSON.parse(document.getElementById('all-items-data').textContent);
        } catch (e) {
            console.error('Failed to parse explore data:', e);
            return;
        }

        // Build item lookup by ID
        buildItemLookup();

        // Initial shuffle and load
        shuffleAndLoad();

        // Setup lazy loading on scroll
        setupLazyLoad();

        // Setup shuffle button
        document.getElementById('shuffle-btn').addEventListener('click', function() {
            shuffleAndLoad();
        });
    }

    function buildItemLookup() {
        // Map item IDs to full item data
        // IDs are in format: "type-slugified-name" (e.g., "package-dowhy")

        const typeMap = {
            'package': allItemsData.packages,
            'resource': allItemsData.resources,
            'dataset': allItemsData.datasets,
            'talk': allItemsData.talks,
            'career': allItemsData.career,
            'community': allItemsData.community,
            'book': allItemsData.books
        };

        for (const [type, items] of Object.entries(typeMap)) {
            if (!items) continue;
            items.forEach(item => {
                const slug = slugify(item.name || item.title || '');
                const id = `${type}-${slug}`;
                itemLookup[id] = { ...item, _type: type };
            });
        }
    }

    function slugify(text) {
        return text.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function shuffleAndLoad() {
        // Filter clusters by min size and shuffle
        const filtered = clusterData.clusters.filter(c => c.item_count >= MIN_CLUSTER_SIZE);
        shuffledClusters = shuffleArray(filtered);

        // Reset and reload
        const container = document.getElementById('explore-rows');
        container.innerHTML = '';
        loadedRowCount = 0;
        loadMoreRows();
    }

    function loadMoreRows() {
        if (isLoading) return;

        const remaining = shuffledClusters.length - loadedRowCount;

        if (remaining <= 0) {
            document.getElementById('explore-loader').classList.remove('visible');
            return;
        }

        isLoading = true;
        document.getElementById('explore-loader').classList.add('visible');

        const container = document.getElementById('explore-rows');
        const toLoad = Math.min(ROWS_PER_BATCH, remaining);

        // Use requestAnimationFrame for smooth rendering
        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();

            for (let i = 0; i < toLoad; i++) {
                const cluster = shuffledClusters[loadedRowCount + i];
                const rowEl = createClusterRow(cluster);
                fragment.appendChild(rowEl);
            }

            container.appendChild(fragment);
            loadedRowCount += toLoad;
            isLoading = false;

            // Hide loader if all loaded
            if (loadedRowCount >= shuffledClusters.length) {
                document.getElementById('explore-loader').classList.remove('visible');
            }
        });
    }

    function createClusterRow(cluster) {
        const row = document.createElement('div');
        row.className = 'explore-row';
        row.dataset.clusterId = cluster.id;

        // Header
        const header = document.createElement('div');
        header.className = 'explore-row-header';
        header.innerHTML = `
            <h2 class="explore-row-title">${escapeHtml(cluster.label)}</h2>
            <span class="explore-row-count">${cluster.item_count} items</span>
        `;
        row.appendChild(header);

        // Scroller wrapper (for nav arrows)
        const wrapper = document.createElement('div');
        wrapper.className = 'explore-scroller-wrapper';

        // Scroller
        const scroller = document.createElement('div');
        scroller.className = 'explore-scroller';

        // Get all items for this cluster and shuffle
        const itemIds = getClusterItems(cluster.id);
        const shuffledIds = shuffleArray(itemIds);
        const displayItems = shuffledIds.slice(0, ITEMS_PER_ROW);

        displayItems.forEach(itemId => {
            const item = itemLookup[itemId];
            if (item) {
                const card = createExploreCard(item);
                scroller.appendChild(card);
            }
        });

        wrapper.appendChild(scroller);

        // Navigation arrows
        const prevBtn = document.createElement('button');
        prevBtn.className = 'scroller-nav prev';
        prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
        prevBtn.addEventListener('click', () => scrollRow(scroller, -1));

        const nextBtn = document.createElement('button');
        nextBtn.className = 'scroller-nav next';
        nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        nextBtn.addEventListener('click', () => scrollRow(scroller, 1));

        wrapper.appendChild(prevBtn);
        wrapper.appendChild(nextBtn);

        row.appendChild(wrapper);

        // Update nav button states on scroll
        scroller.addEventListener('scroll', () => updateNavButtons(scroller, prevBtn, nextBtn));
        // Initial state check after render
        setTimeout(() => updateNavButtons(scroller, prevBtn, nextBtn), 0);

        return row;
    }

    function getClusterItems(clusterId) {
        // Get all item IDs belonging to this cluster
        const items = [];
        for (const [itemId, cid] of Object.entries(clusterData.item_to_cluster)) {
            if (cid === clusterId) {
                items.push(itemId);
            }
        }
        return items;
    }

    function createExploreCard(item) {
        const card = document.createElement('div');
        card.className = 'explore-card';

        const type = item._type || 'resource';
        const name = item.name || item.title || 'Untitled';
        const description = item.description || item.summary || '';
        const url = item.url || '#';

        // Handle tags - could be array or comma-separated string
        let tags = [];
        if (item.topic_tags) {
            tags = typeof item.topic_tags === 'string'
                ? item.topic_tags.split(',').map(t => t.trim()).filter(t => t)
                : item.topic_tags;
        } else if (item.tags) {
            tags = Array.isArray(item.tags) ? item.tags : [];
        }

        card.innerHTML = `
            <span class="explore-card-type type-${type}">${type}</span>
            <h3 class="explore-card-title">
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>
            </h3>
            <p class="explore-card-desc">${escapeHtml(truncate(description, 120))}</p>
            ${tags.length > 0 ? `
                <div class="explore-card-tags">
                    ${tags.slice(0, 3).map(t => `<span class="explore-card-tag">${escapeHtml(t)}</span>`).join('')}
                </div>
            ` : ''}
        `;

        // Make entire card clickable
        card.addEventListener('click', (e) => {
            if (e.target.tagName !== 'A') {
                window.open(url, '_blank');
            }
        });

        return card;
    }

    function truncate(str, len) {
        if (!str) return '';
        if (str.length <= len) return str;
        return str.slice(0, len).trim() + '...';
    }

    function scrollRow(scroller, direction) {
        const scrollAmount = 300 * direction;
        scroller.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }

    function updateNavButtons(scroller, prevBtn, nextBtn) {
        const atStart = scroller.scrollLeft <= 0;
        const atEnd = scroller.scrollLeft >= scroller.scrollWidth - scroller.clientWidth - 10;

        prevBtn.classList.toggle('disabled', atStart);
        nextBtn.classList.toggle('disabled', atEnd);
    }

    function setupLazyLoad() {
        // Intersection Observer for infinite scroll
        const loader = document.getElementById('explore-loader');
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !isLoading) {
                loadMoreRows();
            }
        }, { rootMargin: '300px' });

        observer.observe(loader);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();
