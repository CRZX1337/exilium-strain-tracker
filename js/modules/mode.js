// ==========================================
// Mode Manager - Coffeeshop Mode Easter Egg
// ==========================================

import { StrainManager } from './strainManager.js';
import { UI } from '../ui.js';

const STORAGE_KEY = 'exilium_mode';
const HASH_TRIGGER = '#/ams';

export const ModeManager = {
    current: 'medical',
    _originalTitle: null,
    _resetTimer: null,
    _tapCount: 0,

    isShop() {
        return this.current === 'shop';
    },

    init() {
        this._originalTitle = document.title;

        const hash = location.hash;
        const stored = localStorage.getItem(STORAGE_KEY);

        if (hash === HASH_TRIGGER) {
            this._applyMode('shop', true);
        } else if (stored === 'shop') {
            this._applyMode('shop', true);
        } else {
            this._applyMode('medical', true);
        }
    },

    toggle() {
        const newMode = this.current === 'medical' ? 'shop' : 'medical';
        this._applyMode(newMode, false);
        StrainManager.applyFilters();
    },

    _applyMode(mode, silent) {
        const wasShop = this.current === 'shop';
        const isShop = mode === 'shop';
        this.current = mode;

        localStorage.setItem(STORAGE_KEY, mode);

        const hash = location.hash;
        if (isShop && hash !== HASH_TRIGGER) {
            history.replaceState(null, '', HASH_TRIGGER);
        } else if (!isShop && hash === HASH_TRIGGER) {
            history.replaceState(null, '', location.pathname + location.search);
        }

        document.body.classList.toggle('mode-shop', isShop);

        const badge = document.getElementById('mode-badge');
        if (isShop) {
            if (!badge) {
                const logoText = document.querySelector('.logo-text');
                if (logoText) {
                    const pill = document.createElement('span');
                    pill.id = 'mode-badge';
                    pill.textContent = '☕ Coffeeshop';
                    pill.style.cssText = `
                        display: inline-block;
                        margin-left: 8px;
                        padding: 2px 10px;
                        background: var(--accent);
                        color: var(--text-inverse);
                        font-size: 0.65rem;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        border-radius: var(--radius-full);
                        vertical-align: middle;
                    `;
                    logoText.appendChild(pill);
                }
            }
            document.title = 'Exilium — Coffeeshop Tracker';
        } else {
            if (badge) badge.remove();
            document.title = this._originalTitle || 'Exilium Tracker';
        }

        if (!silent) {
            UI.initCustomSelects();
        }
    },

    initLogoTap() {
        const logoImg = document.querySelector('.logo-icon-img');
        if (!logoImg) return;

        logoImg.style.cursor = 'pointer';

        logoImg.addEventListener('click', () => {
            if (navigator.vibrate) {
                navigator.vibrate(15);
            }

            this._tapCount++;

            if (this._resetTimer) {
                clearTimeout(this._resetTimer);
            }

            this._resetTimer = setTimeout(() => {
                this._tapCount = 0;
            }, 2000);

            if (this._tapCount >= 5) {
                this._tapCount = 0;
                if (this._resetTimer) {
                    clearTimeout(this._resetTimer);
                    this._resetTimer = null;
                }
                if (navigator.vibrate) {
                    navigator.vibrate([30, 20, 30]);
                }
                this.toggle();
            }
        });
    }
};
