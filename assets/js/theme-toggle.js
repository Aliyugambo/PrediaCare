/* Theme Toggle - Carenix Medical Clinic Dark Mode
   Handles theme switching between light and dark themes.
   Persists preference in localStorage.
   Uses data-theme attribute on <html> element.
*/
(function() {
    'use strict';

    var THEME_KEY = 'theme';
    var THEME_DARK = 'dark';
    var THEME_LIGHT = 'light';
    var rootElement = document.documentElement;

    function readStoredTheme() {
        try {
            return localStorage.getItem(THEME_KEY);
        } catch (error) {
            return null;
        }
    }

    function saveStoredTheme(theme) {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (error) {}
    }

    function getStoredTheme() {
        var stored = readStoredTheme();
        if (stored === THEME_DARK || stored === THEME_LIGHT) {
            return stored;
        }
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return THEME_DARK;
        }
        return THEME_LIGHT;
    }

    function applyTheme(theme) {
        rootElement.setAttribute('data-theme', theme);
        if (theme === THEME_DARK) {
            rootElement.classList.add('theme-dark');
        } else {
            rootElement.classList.remove('theme-dark');
        }
        updateToggleIcons(theme);
    }

    function updateToggleIcons(theme) {
        var toggles = document.querySelectorAll('.theme-toggle, .header-theme-toggle');
        for (var i = 0; i < toggles.length; i++) {
            var toggle = toggles[i];
            var icon = toggle.querySelector('.theme-icon');
            if (!icon) {
                icon = document.createElement('span');
                icon.className = 'theme-icon';
                toggle.insertBefore(icon, toggle.firstChild);
            }

            icon.innerHTML = theme === THEME_DARK ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';

            var nextLabel = theme === THEME_DARK ? 'Switch to light mode' : 'Switch to dark mode';
            toggle.setAttribute('title', nextLabel);
            toggle.setAttribute('aria-label', nextLabel);
        }
    }

    function toggleTheme() {
        var current = getStoredTheme();
        var next = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
        saveStoredTheme(next);
        applyTheme(next);
    }

    function wireToggleButtons() {
        var toggles = document.querySelectorAll('.theme-toggle');
        for (var i = 0; i < toggles.length; i++) {
            toggles[i].addEventListener('click', toggleTheme);
        }
    }

    function isDashboardPage() {
        if (!document.body) {
            return false;
        }
        return /(?:doctor|patient|staff|admin|bloodbank|diagnostic|customer-care|pharmacist)-dashboard/.test(document.body.className);
    }

    function createToggleButton() {
        if (document.querySelector('.theme-toggle, .header-theme-toggle')) {
            return;
        }

        if (isDashboardPage()) {
            return;
        }

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-toggle';
        button.id = 'themeToggle';
        button.setAttribute('aria-label', 'Toggle dark mode');
        button.setAttribute('title', 'Toggle dark mode');
        button.innerHTML = '<span class="theme-icon"><i class="fas fa-moon"></i></span><span class="theme-label">Theme</span>';
        button.addEventListener('click', toggleTheme);
        document.body.appendChild(button);
    }

    function initTheme() {
        wireToggleButtons();
        createToggleButton();
        var theme = getStoredTheme();
        applyTheme(theme);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }

    window.themeToggle = {
        toggle: toggleTheme,
        apply: applyTheme,
        getTheme: getStoredTheme,
        THEME_DARK: THEME_DARK,
        THEME_LIGHT: THEME_LIGHT
    };
})();
