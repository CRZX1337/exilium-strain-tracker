// ==========================================
// App — Core Application Logic (Orchestrator)
// ==========================================

import { state } from './modules/state.js';
import { Auth } from './supabase-auth.js';
import { UI } from './ui.js';
import { StrainManager } from './modules/strainManager.js';
import { AdminPanel } from './modules/adminPanel.js';
import { ActivityLog } from './modules/activityLog.js';
import { ImageManager } from './modules/imageManager.js';

/**
 * App orchestrator - delegates to specialized modules.
 * Maintains backward compatibility with inline onclick handlers.
 */
const App = {
    // ==========================================
    // Core Lifecycle
    // ==========================================

    async init() {
        const loadStart = Date.now();

        // Initialise Supabase Auth and sync session state
        await Auth.init();

        UI.showLoading();
        await StrainManager.loadStrains();
        UI.initCustomSelects();
        const urlState = StrainManager.getUrlState();
        const initialStrain = StrainManager.getStrainBySlug(urlState.strainSlug);
        if (initialStrain) state.openStrainId = initialStrain.id;
        StrainManager.applyUrlState();
        UI.initCustomCursor();
        this.bindEvents();
        this.initContextMenu();

        if (urlState.strainSlug) {
            const strain = StrainManager.getStrainBySlug(urlState.strainSlug);
            if (strain) {
                UI.renderDetail(strain);
                UI.showModal('detail-modal');
            } else {
                UI.showToast('Sorte nicht gefunden', 'error');
                state.openStrainId = null;
                StrainManager.syncUrlFromFilters();
            }
        }

        window.addEventListener('popstate', () => {
            const urlState = StrainManager.getUrlState();
            if (!urlState.strainSlug && state.openStrainId) {
                state.openStrainId = null;
                UI.hideModal('detail-modal');
            } else if (urlState.strainSlug) {
                const strain = StrainManager.getStrainBySlug(urlState.strainSlug);
                if (strain && strain.id !== state.openStrainId) {
                    state.openStrainId = strain.id;
                    UI.renderDetail(strain);
                    UI.showModal('detail-modal');
                }
            }
        });

        // Enforce a minimum 400ms display time for the startup loader to look premium
        const loadEnd = Date.now();
        const loadTime = loadEnd - loadStart;
        const minLoaderTime = 400;
        const remainingTime = Math.max(0, minLoaderTime - loadTime);

        setTimeout(() => {
            const loader = document.getElementById('startup-loader');
            if (loader) {
                loader.classList.add('hidden');
                // Remove from DOM after transition
                setTimeout(() => loader.remove(), 800);
            }
        }, remainingTime);
    },

    // ==========================================
    // Event Binding
    // ==========================================

    bindEvents() {
        // Debounce helper for search input
        function debounce(fn, delay) {
            let timer;
            return function(...args) {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        }

        // Search
        const searchInput = document.getElementById('search-input');
        const clearBtn = document.getElementById('search-clear-btn');
        
        searchInput.addEventListener('input', debounce(() => {
            StrainManager.applyFilters();
            StrainManager.syncUrlFromFilters();
            // Toggle clear button visibility
            if (clearBtn) {
                clearBtn.classList.toggle('visible', searchInput.value.length > 0);
            }
        }, 200));

        // Show clear button if search has content on init
        if (clearBtn && searchInput.value.length > 0) {
            clearBtn.classList.add('visible');
        }

        // Filters
        document.getElementById('filter-type').addEventListener('change', () => {
            StrainManager.applyFilters();
            StrainManager.syncUrlFromFilters();
        });
        document.getElementById('filter-sort').addEventListener('change', () => {
            StrainManager.applyFilters();
            StrainManager.syncUrlFromFilters();
        });

        // Card cursor tracking - attach to individual cards for better performance
        this.bindCardMouseTracking();

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    if (overlay.id === 'detail-modal') {
                        StrainManager.closeDetail();
                    } else {
                        UI.hideModal(overlay.id);
                        StrainManager.resetForm();
                    }
                }
            });
        });

        // Close modals on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const detailOverlay = document.getElementById('detail-modal');
                if (detailOverlay && detailOverlay.classList.contains('active')) {
                    StrainManager.closeDetail();
                } else {
                    document.querySelectorAll('.modal-overlay.active').forEach(overlay => {
                        UI.hideModal(overlay.id);
                        StrainManager.resetForm();
                    });
                }
            }
        });
    },

    /** Attach mouse tracking listeners to individual cards for performance */
    bindCardMouseTracking() {
        const grid = document.getElementById('strain-grid');
        if (!grid) return;

        // Use event delegation with a single listener on the grid
        grid.addEventListener('mousemove', (e) => {
            const card = e.target.closest('.strain-card');
            if (!card) return;

            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const percentX = (x / rect.width) * 100;
            const percentY = (y / rect.height) * 100;
            card.style.setProperty('--mouse-x', `${percentX}%`);
            card.style.setProperty('--mouse-y', `${percentY}%`);
        });
    },

    // ==========================================
    // Context Menu
    // ==========================================

    initContextMenu() {
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        let justOpened = false;

        // Helper: build and show menu
        const show = (x, y, items) => {
            menu.innerHTML = items.map(item => {
                if (item === 'separator') {
                    return '<div class="context-menu-separator"></div>';
                }
                return `
                    <button class="context-menu-item ${item.cls || ''}" 
                            data-action="${item.action}">
                        <span class="ctx-icon">${item.icon}</span>
                        ${item.label}
                    </button>`;
            }).join('');

            // Position menu — keep inside viewport
            menu.classList.remove('visible');
            menu.style.left = '0px';
            menu.style.top = '0px';
            menu.classList.add('visible');

            const menuW = menu.offsetWidth;
            const menuH = menu.offsetHeight;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            menu.style.left = (x + menuW > vw ? vw - menuW - 8 : x) + 'px';
            menu.style.top = (y + menuH > vh ? vh - menuH - 8 : y) + 'px';

            // Wire up item clicks
            menu.querySelectorAll('.context-menu-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.action;
                    this._handleContextAction(action);
                    hide();
                });
            });

            // Set flag to prevent immediate hide
            justOpened = true;
            setTimeout(() => { justOpened = false; }, 100);
        };

        const hide = () => {
            if (justOpened) return;
            menu.classList.remove('visible');
            state._contextTarget = null;
        };

        // Right-click handler
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            // Check if on a strain card
            const card = e.target.closest('.strain-card');
            const isImage = e.target.closest('.strain-image, .strain-image-container');

            if (card) {
                const strainId = card.dataset.id;
                state._contextTarget = { type: 'card', strainId };
                const strain = state.strains.find(s => s.id === strainId);

                const items = [
                    { icon: '👁️', label: 'Details anzeigen', action: 'view', cls: 'accent' },
                    { icon: '🔗', label: 'Link kopieren', action: 'copy-link' },
                    { icon: '📋', label: 'Med. Name kopieren', action: 'copy-medical' },
                ];

                if (isImage) {
                    items.push('separator');
                    items.push({ icon: '🔍', label: 'Bild vergrößern', action: 'zoom-image' });
                }

                if (Auth.isAuthenticated) {
                    items.push('separator');
                    items.push({ icon: '✏️', label: 'Bearbeiten', action: 'edit' });
                    items.push({ icon: '🗑️', label: 'Löschen', action: 'delete', cls: 'danger' });
                }

                show(e.clientX, e.clientY, items);
            } else {
                // Background context menu
                state._contextTarget = { type: 'background' };
                const items = [
                    { icon: '🔄', label: 'Aktualisieren', action: 'refresh', cls: 'accent' },
                    { icon: '🔝', label: 'Nach oben scrollen', action: 'scroll-top' },
                ];
                if (Auth.isAuthenticated) {
                    items.push('separator');
                    items.push({ icon: '➕', label: 'Neue Sorte', action: 'add-strain', cls: 'accent' });
                }
                show(e.clientX, e.clientY, items);
            }
        });

        // Hide on click outside, scroll, or Escape
        document.addEventListener('click', (e) => {
            // Don't hide if clicking inside the menu
            if (menu.contains(e.target)) return;
            hide();
        });
        document.addEventListener('scroll', () => {
            if (!justOpened) hide();
        }, { passive: true });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hide();
        });
    },

    _handleContextAction(action) {
        const target = state._contextTarget;
        const strain = target?.strainId
            ? state.strains.find(s => s.id === target.strainId)
            : null;

        switch (action) {
            case 'view':
                if (strain) StrainManager.showDetail(strain.id);
                break;
            case 'copy-link':
                if (strain) {
                    const slug = StrainManager.getStrainSlug(strain);
                    const url = `${window.location.origin}${window.location.pathname}?strain=${slug}`;
                    navigator.clipboard.writeText(url);
                    UI.showToast('Link kopiert!', 'success');
                }
                break;
            case 'copy-medical':
                if (strain?.medical_name) StrainManager.copyMedicalName(strain.medical_name);
                break;
            case 'zoom-image':
                if (strain?.image_url) ImageManager.viewImage(strain.image_url);
                break;
            case 'edit':
                if (strain) StrainManager.editStrain(strain.id);
                break;
            case 'delete':
                if (strain) StrainManager.showDeleteStrainConfirm(strain.id);
                break;
            case 'refresh':
                StrainManager.loadStrains();
                UI.showToast('Sorten aktualisiert', 'success');
                break;
            case 'scroll-top':
                window.scrollTo({ top: 0, behavior: 'smooth' });
                break;
            case 'add-strain':
                this.openAddStrain();
                break;
        }
    },

    // ==========================================
    // Strain Operations (delegated to StrainManager)
    // ==========================================

    showDetail(id) { return StrainManager.showDetail(id); },
    closeDetail() { return StrainManager.closeDetail(); },
    editStrain(id) { return StrainManager.editStrain(id); },
    saveStrain() { return StrainManager.saveStrain(); },
    deleteStrain(id) { return StrainManager.deleteStrain(id); },
    showDeleteStrainConfirm(id) { return StrainManager.showDeleteStrainConfirm(id); },
    confirmDeleteStrain() { return StrainManager.confirmDeleteStrain(); },
    clearSearch() { return StrainManager.clearSearch(); },
    resetForm() { return StrainManager.resetForm(); },
    copyMedicalName(name) { return StrainManager.copyMedicalName(name); },

    // ==========================================
    // Image Operations (delegated to ImageManager)
    // ==========================================

    handleImagePreview(input) { return ImageManager.handleImagePreview(input); },
    removeImagePreview() { return ImageManager.removeImagePreview(); },
    viewImage(url) { return ImageManager.viewImage(url); },
    deleteImage(fileName) { return ImageManager.deleteImage(fileName); },
    showDeleteImageConfirm(fileName) { return ImageManager.showDeleteImageConfirm(fileName); },
    confirmDeleteImage() { return ImageManager.confirmDeleteImage(); },

    // ==========================================
    // Admin Panel (delegated to AdminPanel)
    // ==========================================

    openAdminPanel() { return AdminPanel.openAdminPanel(); },
    closeAdminPanel() { return AdminPanel.closeAdminPanel(); },
    switchAdminTab(tabName) { return AdminPanel.switchAdminTab(tabName); },
    loadAdminStrains() { return AdminPanel.loadAdminStrains(); },
    renderAdminStrains() { return AdminPanel.renderAdminStrains(); },
    filterAdminStrains() { return AdminPanel.filterAdminStrains(); },
    toggleStrainPrivacy(strainId, isPrivate) { return AdminPanel.toggleStrainPrivacy(strainId, isPrivate); },
    loadAdminUsers() { return AdminPanel.loadAdminUsers(); },
    renderAdminUsers() { return AdminPanel.renderAdminUsers(); },
    showCreateUserForm() { return AdminPanel.showCreateUserForm(); },
    createUser() { return AdminPanel.createUser(); },
    deleteUser(userId) { return AdminPanel.deleteUser(userId); },
    showDeleteUserConfirm(userId) { return AdminPanel.showDeleteUserConfirm(userId); },
    confirmDeleteUser() { return AdminPanel.confirmDeleteUser(); },
    updateAdminButton() { return AdminPanel.updateAdminButton(); },

    // ==========================================
    // Activity Log (delegated to ActivityLog)
    // ==========================================

    loadAdminActivity(loadMore) { return ActivityLog.loadAdminActivity(loadMore); },
    loadMoreActivity() { return ActivityLog.loadMoreActivity(); },
    renderAdminActivity(append, newCount) { return ActivityLog.renderAdminActivity(append, newCount); },
    filterAdminActivity() { return ActivityLog.filterAdminActivity(); },
    showActivityDetail(logId) { return ActivityLog.showActivityDetail(logId); },
    bindActivityLogEvents() { return ActivityLog.bindActivityLogEvents(); },

    // ==========================================
    // Authentication
    // ==========================================

    showLoginModal() {
        // Mark that we ONLY want to login, not add a strain after
        state._loginOnly = true;
        UI.showModal('password-modal');
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-email').value = '';
        document.querySelector('.password-error').classList.remove('show');
        // Reset success overlay state
        const promptInner = document.getElementById('password-prompt-inner');
        const successEl = document.getElementById('login-success');
        if (promptInner) promptInner.style.display = '';
        if (successEl) successEl.classList.remove('visible');
        document.getElementById('admin-email').focus();
    },

    openAddStrain() {
        if (Auth.isAuthenticated) {
            state.editingId = null;
            state.formRating = 0;
            document.getElementById('form-title').textContent = 'Neue Sorte hinzufügen';
            document.getElementById('strain-form').reset();
            UI.renderStarInput('rating-input', 0);
            // Show privacy option for admins
            document.getElementById('privacy-group').style.display = 'flex';
            document.getElementById('strain-private').checked = false;
            ImageManager.removeImagePreview();
            UI.showModal('form-modal');
        } else {
            // Mark that we want to login AND then add a strain
            state._loginOnly = false;
            this.showLoginModal();
        }
    },

    cancelForm() {
        UI.hideModal('form-modal');
        StrainManager.resetForm();
    },

    async submitPassword() {
        const passwordInput = document.getElementById('admin-password');
        const emailInput = document.getElementById('admin-email');
        const password = passwordInput.value;
        const email = emailInput ? emailInput.value.trim() : '';
        const errorEl = document.querySelector('.password-error');
        const modal = document.querySelector('#password-modal .modal');

        if (!email || !password) {
            modal.classList.remove('shake');
            void modal.offsetWidth;
            modal.classList.add('shake');
            errorEl.textContent = 'Bitte E-Mail und Passwort eingeben';
            errorEl.classList.add('show');
            return;
        }

        const { success, error } = await Auth.signIn(email, password);
        if (success) {
            state.isAdmin = true;
            errorEl.classList.remove('show');

            // Show checkmark animation
            const promptInner = document.getElementById('password-prompt-inner');
            const successEl = document.getElementById('login-success');
            promptInner.style.display = 'none';
            successEl.classList.add('visible');

            // Re-trigger SVG stroke animations by cloning the SVG node
            const svg = successEl.querySelector('svg');
            const fresh = svg.cloneNode(true);
            svg.parentNode.replaceChild(fresh, svg);

            modal.classList.add('success-pulse');
            setTimeout(() => {
                UI.hideModal('password-modal');
                modal.classList.remove('success-pulse');
                UI.showToast('Admin-Zugang aktiviert');

                // Update button
                const addBtn = document.getElementById('add-strain-btn');
                addBtn.classList.remove('btn-secondary');
                addBtn.classList.add('btn-primary');

                // Check if we should open add strain form or just login
                if (state._loginOnly) {
                    // Just logged in, nothing else to do
                    state._loginOnly = false;
                } else if (state._pendingEdit) {
                    const pendingId = state._pendingEdit;
                    state._pendingEdit = null;
                    StrainManager.editStrain(pendingId);
                } else {
                    // Came from "+ Neue Sorte" button, open the form
                    this.openAddStrain();
                }
            }, 1400);
        } else {
            // Error animation
            modal.classList.remove('shake');
            void modal.offsetWidth;
            modal.classList.add('shake');
            errorEl.textContent = error || 'Ungültige Anmeldedaten';
            errorEl.classList.add('show');
            passwordInput.value = '';
            passwordInput.focus();
        }
    },

    // ==========================================
    // Utilities
    // ==========================================

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ==========================================
// Mobile header scroll behavior
// ==========================================
(function() {
    let lastScrollY = window.scrollY;
    let headerHidden = false;
    const header = document.querySelector('.header');
    const scrollThreshold = 100;

    function handleHeaderScroll() {
        const currentScrollY = window.scrollY;
        
        // Only apply on mobile
        if (window.innerWidth > 768) {
            header?.classList.remove('header-hidden');
            return;
        }
        
        // Scrolling down and past threshold - hide header
        if (currentScrollY > lastScrollY && currentScrollY > scrollThreshold) {
            if (!headerHidden && header) {
                header.classList.add('header-hidden');
                headerHidden = true;
            }
        }
        // Scrolling up - show header
        else if (currentScrollY < lastScrollY) {
            if (headerHidden && header) {
                header.classList.remove('header-hidden');
                headerHidden = false;
            }
        }
        
        lastScrollY = currentScrollY;
    }

    // Throttled scroll listener
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                handleHeaderScroll();
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    // Reset on resize to desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && header) {
            header.classList.remove('header-hidden');
            headerHidden = false;
        }
    });
})();

// ==========================================
// Export App to global scope for inline handlers
// ==========================================
window.App = App;

// Start the app
document.addEventListener('DOMContentLoaded', () => App.init());
