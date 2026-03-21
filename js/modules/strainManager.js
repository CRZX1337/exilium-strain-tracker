/**
 * @fileoverview Strain Manager module for the Exilium Strain Tracker.
 * Handles all strain CRUD operations, filtering, URL state management, and strain display.
 */

import { state } from './state.js';
import { Auth } from '../supabase-auth.js';
import { UI } from '../ui.js';
import { ActivityLog } from './activityLog.js';
import { ImageManager } from './imageManager.js';

export const StrainManager = {
    // ==========================================
    // URL State Management (strain in URL = name slug)
    // ==========================================

    /**
     * Convert a string to a URL-friendly slug.
     * @param {string} name - String to slugify
     * @returns {string} Slugified string
     */
    slugify(name) {
        if (!name || typeof name !== 'string') return '';
        return name
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ä/g, 'ae')
            .replace(/ö/g, 'oe')
            .replace(/ü/g, 'ue')
            .replace(/ß/g, 'ss')
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    },

    /**
     * Build unique URL slug for a strain: name + medical name (or importer / short id if no medical name).
     * @param {Object} strain - Strain object
     * @returns {string} Unique slug
     */
    getStrainSlug(strain) {
        const namePart = this.slugify(strain.name);
        if (!namePart) return '';
        const medical = this.slugify(strain.medical_name || '');
        if (medical) return `${namePart}-${medical}`;
        const importer = this.slugify(strain.importer || '');
        if (importer) return `${namePart}-${importer}`;
        return `${namePart}-${(strain.id || '').slice(0, 8)}`;
    },

    /**
     * Find a strain by its URL slug.
     * @param {string} slug - URL slug to search for
     * @returns {Object|null} Matching strain or null
     */
    getStrainBySlug(slug) {
        if (!slug) return null;
        const normalized = slug.toLowerCase().trim();
        return state.strains.find(s => this.getStrainSlug(s) === normalized) || null;
    },

    /**
     * Get current URL state parameters.
     * @returns {Object} URL state object
     */
    getUrlState() {
        const p = new URLSearchParams(window.location.search);
        return {
            q: p.get('q') || '',
            type: p.get('type') || '',
            sort: p.get('sort') || 'newest',
            strainSlug: p.get('strain') || null,
        };
    },

    /**
     * Set URL state parameters.
     * @param {Object} state - State to set
     * @param {boolean} push - Whether to push new history entry
     */
    setUrlState(stateObj, push = false) {
        const p = new URLSearchParams();
        if (stateObj.q) p.set('q', stateObj.q);
        if (stateObj.type) p.set('type', stateObj.type);
        if (stateObj.sort) p.set('sort', stateObj.sort);
        if (stateObj.strainId) {
            const strain = state.strains.find(s => s.id === stateObj.strainId);
            if (strain) {
                const slug = this.getStrainSlug(strain);
                if (slug) p.set('strain', slug);
            }
        }
        const query = p.toString();
        const url = `${window.location.pathname}${query ? '?' + query : ''}`;
        const historyState = { ...stateObj };
        if (push) {
            window.history.pushState(historyState, '', url);
        } else {
            window.history.replaceState(historyState, '', url);
        }
    },

    /**
     * Apply URL state to UI controls.
     */
    applyUrlState() {
        const urlState = this.getUrlState();
        const searchEl = document.getElementById('search-input');
        const typeEl = document.getElementById('filter-type');
        const sortEl = document.getElementById('filter-sort');
        if (searchEl) searchEl.value = urlState.q;
        if (typeEl) typeEl.value = urlState.type;
        if (sortEl) sortEl.value = urlState.sort;
        UI.syncCustomSelectDisplays();
        this.applyFilters();
    },

    /**
     * Sync URL from current filter values.
     */
    syncUrlFromFilters() {
        const q = document.getElementById('search-input').value.trim();
        const type = document.getElementById('filter-type').value;
        const sort = document.getElementById('filter-sort').value;
        this.setUrlState({
            q,
            type,
            sort,
            strainId: state.openStrainId || null,
        }, false);
    },

    // ==========================================
    // Strain Loading and Filtering
    // ==========================================

    /**
     * Load strains from Supabase.
     */
    async loadStrains() {
        try {
            let query = db
                .from('strains')
                .select('*')
                .order('created_at', { ascending: false });

            // Non-authenticated users only see public strains
            if (!Auth.isAuthenticated) {
                query = query.eq('is_private', false);
            }

            const { data, error } = await query;

            if (error) throw error;

            state.strains = data || [];
            state.filteredStrains = [...state.strains];
            this.applyFilters();
            UI.updateStats(state.strains);
        } catch (err) {
            console.error('Error loading strains:', err);
            UI.showToast('Fehler beim Laden der Sorten', 'error');
            UI.renderStrains([]);
        }
    },

    /**
     * Apply search and filter criteria.
     */
    applyFilters() {
        const query = document.getElementById('search-input').value.toLowerCase().trim();
        const type = document.getElementById('filter-type').value;
        const sort = document.getElementById('filter-sort').value;

        let results = [...state.strains];

        // Search
        if (query) {
            results = results.filter(s =>
                s.name.toLowerCase().includes(query) ||
                (s.effects && s.effects.toLowerCase().includes(query)) ||
                (s.notes && s.notes.toLowerCase().includes(query)) ||
                (s.taste && s.taste.toLowerCase().includes(query)) ||
                (s.medical_name && s.medical_name.toLowerCase().includes(query)) ||
                (s.importer && s.importer.toLowerCase().includes(query))
            );
        }

        // Type filter
        if (type) {
            results = results.filter(s => s.type === type);
        }

        // Sort
        switch (sort) {
            case 'rating':
                results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                break;
            case 'name':
                results.sort((a, b) => a.name.localeCompare(b.name, 'de'));
                break;
            case 'thc':
                results.sort((a, b) => (b.thc_content || 0) - (a.thc_content || 0));
                break;
            case 'newest':
            default:
                results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                break;
        }

        state.filteredStrains = results;
        UI.renderStrains(results);
    },

    /**
     * Clear search input and reset filters.
     */
    clearSearch() {
        const searchInput = document.getElementById('search-input');
        const clearBtn = document.getElementById('search-clear-btn');
        
        searchInput.value = '';
        if (clearBtn) {
            clearBtn.classList.remove('visible');
        }
        
        this.applyFilters();
        this.syncUrlFromFilters();
        searchInput.focus();
    },

    // ==========================================
    // Strain CRUD Operations
    // ==========================================

    /**
     * Show strain detail modal.
     * @param {string} id - Strain ID
     */
    showDetail(id) {
        const strain = state.strains.find(s => s.id === id);
        if (!strain) return;
        state.openStrainId = id;
        UI.renderDetail(strain);
        UI.showModal('detail-modal');
        const urlState = this.getUrlState();
        const stateObj = {
            q: document.getElementById('search-input').value.trim(),
            type: document.getElementById('filter-type').value,
            sort: document.getElementById('filter-sort').value,
            strainId: id,
        };
        const currentSlug = this.getStrainSlug(strain);
        if (urlState.strainSlug === currentSlug) {
            this.setUrlState(stateObj, false);
        } else {
            this.setUrlState(stateObj, true);
        }
    },

    /**
     * Close detail modal and clear strain from URL.
     */
    closeDetail() {
        state.openStrainId = null;
        UI.hideModal('detail-modal');
        this.syncUrlFromFilters();
    },

    /**
     * Show delete confirmation modal for strain.
     * @param {string} id - Strain ID
     */
    showDeleteStrainConfirm(id) {
        const strain = state.strains.find(s => s.id === id);
        if (!strain) return;
        
        state._pendingDeleteStrainId = id;
        document.getElementById('delete-strain-name').textContent = strain.name;
        
        const confirmBtn = document.getElementById('confirm-delete-strain-btn');
        confirmBtn.onclick = () => this.confirmDeleteStrain();
        
        UI.showModal('delete-strain-confirm-modal');
    },

    /**
     * Confirm and execute strain deletion.
     */
    async confirmDeleteStrain() {
        const id = state._pendingDeleteStrainId;
        if (!id) return;
        
        UI.hideModal('delete-strain-confirm-modal');
        state._pendingDeleteStrainId = null;
        
        const strain = state.strains.find(s => s.id === id);
        if (!strain) return;

        // Capture strain data before deletion for activity log
        const strainCopy = { ...strain };

        // Animate removal first
        const cardElements = document.querySelectorAll('.strain-card');
        let targetCard = Array.from(cardElements).find(card => card.getAttribute('onclick') === `App.showDetail('${id}')`);

        if (targetCard) {
            targetCard.classList.add('removing');
        }

        try {
            // Wait for slide out animation
            await new Promise(resolve => setTimeout(resolve, 350));

            const { error } = await db
                .from('strains')
                .delete()
                .eq('id', id);

            if (error) throw error;
            UI.showToast('Sorte gelöscht');
            
            // Log activity
            ActivityLog.logActivity('delete', strainCopy);

            // Remove from local state
            state.strains = state.strains.filter(s => s.id !== id);
            this.applyFilters();
            UI.updateStats(state.strains);
        } catch (err) {
            console.error('Error deleting strain:', err);
            UI.showToast('Fehler beim Löschen: ' + err.message, 'error');
            // Revert animation if error
            if (targetCard) targetCard.classList.remove('removing');
        }
    },

    /**
     * Legacy deleteStrain method - redirects to modal confirmation.
     * @param {string} id - Strain ID
     */
    async deleteStrain(id) {
        if (!Auth.isAuthenticated) {
            UI.showToast('Admin-Zugang erforderlich', 'error');
            return;
        }
        this.showDeleteStrainConfirm(id);
    },

    /**
     * Save strain (add or edit).
     */
    async saveStrain() {
        const submitBtn = document.getElementById('submit-strain-btn');
        const name = document.getElementById('strain-name').value.trim();
        const type = document.getElementById('strain-type').value;

        if (!name) {
            UI.showToast('Bitte einen Namen eingeben', 'error');
            return;
        }
        if (!type) {
            UI.showToast('Bitte einen Typ auswählen', 'error');
            return;
        }

        const medicalName = document.getElementById('strain-medical-name').value.trim();
        if (!medicalName) {
            UI.showToast('Bitte einen medizinischen Namen eingeben', 'error');
            return;
        }

        const setSaving = (saving) => {
            if (!submitBtn) return;
            submitBtn.disabled = saving;
            submitBtn.textContent = saving ? 'Speichern…' : 'Speichern';
        };

        setSaving(true);

        const strainData = {
            name,
            type,
            medical_name: medicalName,
            importer: document.getElementById('strain-importer').value.trim() || null,
            thc_content: parseFloat(document.getElementById('strain-thc').value) || null,
            cbd_content: parseFloat(document.getElementById('strain-cbd').value) || null,
            price: parseFloat(document.getElementById('strain-price').value) || null,
            rating: state.formRating || null,
            effects: document.getElementById('strain-effects').value.trim() || null,
            taste: document.getElementById('strain-taste').value.trim() || null,
            notes: document.getElementById('strain-notes').value.trim() || null,
            is_private: document.getElementById('strain-private')?.checked || false,
        };

        const fileInput = document.getElementById('strain-image');

        try {
            // Handle image upload if a file was selected
            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                
                // File validation: max 5MB
                const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
                if (file.size > MAX_FILE_SIZE) {
                    UI.showToast('Bild zu groß (max. 5MB)', 'error');
                    setSaving(false);
                    return;
                }
                
                // File validation: allowed image types only
                const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                if (!ALLOWED_TYPES.includes(file.type)) {
                    UI.showToast('Ungültiges Dateiformat (nur JPG, PNG, GIF, WebP erlaubt)', 'error');
                    setSaving(false);
                    return;
                }
                
                const fileExt = file.name.split('.').pop();
                const fileName = `${ImageManager.generateUUID()}.${fileExt}`;

                UI.showToast('Lade Bild hoch...', 'info');

                const { error: uploadError } = await db.storage
                    .from('strain-images')
                    .upload(fileName, file);

                if (uploadError) throw uploadError;

                const { data } = db.storage
                    .from('strain-images')
                    .getPublicUrl(fileName);

                strainData.image_url = data.publicUrl;
            }

            if (state.editingId) {
                // Update
                const { error } = await db
                    .from('strains')
                    .update(strainData)
                    .eq('id', state.editingId);

                if (error) throw error;
                UI.showToast('Sorte aktualisiert');

                // Log activity
                const updatedStrain = { ...strainData, id: state.editingId };
                ActivityLog.logActivity('update', updatedStrain);

                // Update local state to avoid full reload
                const index = state.strains.findIndex(s => s.id === state.editingId);
                if (index !== -1) {
                    state.strains[index] = { ...state.strains[index], ...strainData };
                    state.strains[index]._isEdited = true; // Set highlight flag for UI
                }
            } else {
                // Insert
                const { data, error } = await db
                    .from('strains')
                    .insert([strainData])
                    .select(); // Need to select to get the ID

                if (error) throw error;
                UI.showToast('Sorte hinzugefügt');

                if (data && data.length > 0) {
                    const newStrain = data[0];
                    newStrain._isNew = true; // Set highlight flag for UI
                    state.strains.unshift(newStrain);
                    
                    // Log activity
                    ActivityLog.logActivity('create', newStrain);
                }
            }

            UI.hideModal('form-modal');
            this.resetForm();

            // Re-render and clear flags
            this.applyFilters();
            UI.updateStats(state.strains);

            setTimeout(() => {
                state.strains.forEach(s => {
                    delete s._isNew;
                    delete s._isEdited;
                });
            }, 2000);
        } catch (err) {
            console.error('Error saving strain:', err);
            UI.showToast('Fehler beim Speichern: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    },

    /**
     * Edit strain - populate form with existing strain data.
     * @param {string} id - Strain ID
     */
    async editStrain(id) {
        if (!Auth.isAuthenticated) {
            UI.showModal('password-modal');
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-password').focus();
            document.querySelector('.password-error').classList.remove('show');
            // Store the pending action
            state._pendingEdit = id;
            return;
        }

        const strain = state.strains.find(s => s.id === id);
        if (!strain) return;

        state.editingId = id;
        state.formRating = strain.rating || 0;

        document.getElementById('form-title').textContent = 'Sorte bearbeiten';
        document.getElementById('strain-name').value = strain.name;
        document.getElementById('strain-medical-name').value = strain.medical_name || '';
        document.getElementById('strain-importer').value = strain.importer || '';
        document.getElementById('strain-type').value = strain.type;
        document.getElementById('strain-thc').value = strain.thc_content || '';
        document.getElementById('strain-cbd').value = strain.cbd_content || '';
        document.getElementById('strain-price').value = strain.price || '';
        document.getElementById('strain-effects').value = strain.effects || '';
        document.getElementById('strain-taste').value = strain.taste || '';
        document.getElementById('strain-notes').value = strain.notes || '';
        document.getElementById('strain-image').value = ''; // Reset file input
        
        // Show privacy option for admins and set value
        document.getElementById('privacy-group').style.display = 'flex';
        document.getElementById('strain-private').checked = strain.is_private || false;
        
        // Show existing image in preview if available
        if (strain.image_url) {
            ImageManager.updateImagePreviewUI(strain.image_url, 'Aktuelles Foto');
        } else {
            ImageManager.removeImagePreview();
        }
        
        // Sync custom dropdown UI for Type
        const typeSelect = document.getElementById('strain-type');
        const typeWrapper = typeSelect.closest('.custom-select-wrapper');
        if (typeWrapper) {
            const triggerSpan = typeWrapper.querySelector('.custom-select-trigger span');
            if (triggerSpan) {
                // Find visible text for the selected value
                const optionList = Array.from(typeSelect.options);
                const selectedOpt = optionList.find(o => o.value === strain.type) || optionList[0];
                triggerSpan.textContent = selectedOpt.text;
            }
            typeWrapper.querySelectorAll('.custom-select-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.value === strain.type);
            });
        }

        UI.renderStarInput('rating-input', state.formRating);

        UI.showModal('form-modal');
    },

    /**
     * Reset strain form to default state.
     */
    resetForm() {
        state.editingId = null;
        state.formRating = 0;
        const form = document.getElementById('strain-form');
        if (form) {
            form.reset();
            
            // Sync custom dropdowns back to their default empty states
            form.querySelectorAll('select').forEach(select => {
                const wrapper = select.closest('.custom-select-wrapper');
                if (wrapper) {
                    const selectedItem = select.options[select.selectedIndex];
                    const triggerSpan = wrapper.querySelector('.custom-select-trigger span');
                    if (triggerSpan) triggerSpan.textContent = selectedItem.text;
                    
                    wrapper.querySelectorAll('.custom-select-option').forEach(opt => {
                        opt.classList.toggle('selected', opt.dataset.value === select.value);
                    });
                }
            });
        }
        ImageManager.removeImagePreview();
    },

    /**
     * Copy medical name to clipboard.
     * @param {string} medicalName - Medical name to copy
     */
    async copyMedicalName(medicalName) {
        try {
            await navigator.clipboard.writeText(medicalName);
            UI.showToast('Medizinischer Name kopiert', 'success');
        } catch (err) {
            console.error('Failed to copy medical name:', err);
            UI.showToast('Fehler beim Kopieren', 'error');
        }
    },

    // ==========================================
    // Utility Functions
    // ==========================================

    /**
     * Escape HTML special characters.
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
