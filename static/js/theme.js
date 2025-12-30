// Dark mode toggle with localStorage persistence
(function() {
    const STORAGE_KEY = 'theme-preference';

    // Get theme preference: localStorage > light (default)
    function getThemePreference() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) return stored;
        } catch(e) {}
        return 'dark';
    }

    // Apply theme to document
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        // Update toggle button icon
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            const sunIcon = toggle.querySelector('.sun-icon');
            const moonIcon = toggle.querySelector('.moon-icon');
            if (sunIcon && moonIcon) {
                sunIcon.style.display = theme === 'dark' ? 'block' : 'none';
                moonIcon.style.display = theme === 'light' ? 'block' : 'none';
            }
        }
    }

    // Toggle between light and dark
    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(STORAGE_KEY, next); } catch(e) {}
        applyTheme(next);
    }

    // Apply theme immediately to prevent flash
    applyTheme(getThemePreference());

    // Set up toggle button after DOM loads
    document.addEventListener('DOMContentLoaded', function() {
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.addEventListener('click', toggleTheme);
        }
        // Re-apply to ensure icons are correct
        applyTheme(getThemePreference());
    });

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        try {
            if (!localStorage.getItem(STORAGE_KEY)) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        } catch(err) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });
})();

// Texture toggle with localStorage persistence (disabled by default for performance)
(function() {
    const TEXTURE_KEY = 'texture-preference';

    function getTexturePreference() {
        try {
            return localStorage.getItem(TEXTURE_KEY) === 'enabled';
        } catch(e) {
            return false;
        }
    }

    function applyTexture(enabled) {
        if (enabled) {
            document.documentElement.classList.add('texture-enabled');
        } else {
            document.documentElement.classList.remove('texture-enabled');
        }
        // Update toggle button state
        const toggle = document.getElementById('texture-toggle');
        if (toggle) {
            toggle.setAttribute('aria-pressed', enabled);
            toggle.title = enabled ? 'Disable texture (faster)' : 'Enable texture';
        }
    }

    function toggleTexture() {
        const current = document.documentElement.classList.contains('texture-enabled');
        const next = !current;
        try {
            localStorage.setItem(TEXTURE_KEY, next ? 'enabled' : 'disabled');
        } catch(e) {}
        applyTexture(next);
    }

    // Apply texture preference immediately
    applyTexture(getTexturePreference());

    // Set up toggle button after DOM loads
    document.addEventListener('DOMContentLoaded', function() {
        const toggle = document.getElementById('texture-toggle');
        if (toggle) {
            toggle.addEventListener('click', toggleTexture);
        }
        applyTexture(getTexturePreference());
    });
})();
