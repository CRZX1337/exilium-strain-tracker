// ==========================================
// App — Core Application Logic
// ==========================================

const App = {
    strains: [],
    filteredStrains: [],
    isAdmin: false,
    formRating: 0,
    editingId: null,
    openStrainId: null,

    // --- URL State (strain in URL = name slug, e.g. ?strain=blue-dream) ---
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

    /** Build unique URL slug for a strain: name + medical name (or importer / short id if no medical name). */
    getStrainSlug(strain) {
        const namePart = this.slugify(strain.name);
        if (!namePart) return '';
        const medical = this.slugify(strain.medical_name || '');
        if (medical) return `${namePart}-${medical}`;
        const importer = this.slugify(strain.importer || '');
        if (importer) return `${namePart}-${importer}`;
        return `${namePart}-${(strain.id || '').slice(0, 8)}`;
    },

    getStrainBySlug(slug) {
        if (!slug) return null;
        const normalized = slug.toLowerCase().trim();
        return this.strains.find(s => this.getStrainSlug(s) === normalized) || null;
    },

    getUrlState() {
        const p = new URLSearchParams(window.location.search);
        return {
            q: p.get('q') || '',
            type: p.get('type') || '',
            sort: p.get('sort') || 'newest',
            strainSlug: p.get('strain') || null,
        };
    },

    setUrlState(state, push = false) {
        const p = new URLSearchParams();
        if (state.q) p.set('q', state.q);
        if (state.type) p.set('type', state.type);
        if (state.sort && state.sort !== 'newest') p.set('sort', state.sort);
        if (state.strainId) {
            const strain = this.strains.find(s => s.id === state.strainId);
            if (strain) {
                const slug = this.getStrainSlug(strain);
                if (slug) p.set('strain', slug);
            }
        }
        const query = p.toString();
        const url = `${window.location.pathname}${query ? '?' + query : ''}`;
        const historyState = { ...state };
        if (push) {
            window.history.pushState(historyState, '', url);
        } else {
            window.history.replaceState(historyState, '', url);
        }
    },

    applyUrlState() {
        const state = this.getUrlState();
        const searchEl = document.getElementById('search-input');
        const typeEl = document.getElementById('filter-type');
        const sortEl = document.getElementById('filter-sort');
        if (searchEl) searchEl.value = state.q;
        if (typeEl) typeEl.value = state.type;
        if (sortEl) sortEl.value = state.sort;
        UI.syncCustomSelectDisplays();
        this.applyFilters();
    },

    syncUrlFromFilters() {
        const q = document.getElementById('search-input').value.trim();
        const type = document.getElementById('filter-type').value;
        const sort = document.getElementById('filter-sort').value;
        this.setUrlState({
            q,
            type,
            sort,
            strainId: this.openStrainId || null,
        }, false);
    },

    // --- Initialize ---
    async init() {
        const loadStart = Date.now();

        UI.showLoading();
        await this.loadStrains();
        UI.initCustomSelects();
        const urlState = this.getUrlState();
        const initialStrain = this.getStrainBySlug(urlState.strainSlug);
        if (initialStrain) this.openStrainId = initialStrain.id;
        this.applyUrlState();
        UI.initCustomCursor();
        this.bindEvents();

        if (urlState.strainSlug) {
            const strain = this.getStrainBySlug(urlState.strainSlug);
            if (strain) {
                UI.renderDetail(strain);
                UI.showModal('detail-modal');
            } else {
                this.openStrainId = null;
                this.syncUrlFromFilters();
            }
        }

        window.addEventListener('popstate', () => {
            const state = this.getUrlState();
            if (!state.strainSlug && this.openStrainId) {
                this.openStrainId = null;
                UI.hideModal('detail-modal');
            } else if (state.strainSlug) {
                const strain = this.getStrainBySlug(state.strainSlug);
                if (strain && strain.id !== this.openStrainId) {
                    this.openStrainId = strain.id;
                    UI.renderDetail(strain);
                    UI.showModal('detail-modal');
                }
            }
        });

        // Disable right-click context menu globally
        document.addEventListener('contextmenu', event => event.preventDefault());

        // Enforce a minimum 2s display time for the startup loader to look premium
        const loadEnd = Date.now();
        const loadTime = loadEnd - loadStart;
        const minLoaderTime = 2000;
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

    // --- Load strains from Supabase ---
    async loadStrains() {
        try {
            const { data, error } = await db
                .from('strains')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.strains = data || [];
            this.filteredStrains = [...this.strains];
            this.applyFilters();
            UI.updateStats(this.strains);
        } catch (err) {
            console.error('Error loading strains:', err);
            UI.showToast('Fehler beim Laden der Sorten', 'error');
            UI.renderStrains([]);
        }
    },

    // --- Bind event listeners ---
    bindEvents() {
        // Search
        document.getElementById('search-input').addEventListener('input', () => {
            this.applyFilters();
            this.syncUrlFromFilters();
        });

        // Filters
        document.getElementById('filter-type').addEventListener('change', () => {
            this.applyFilters();
            this.syncUrlFromFilters();
        });
        document.getElementById('filter-sort').addEventListener('change', () => {
            this.applyFilters();
            this.syncUrlFromFilters();
        });

        // Card cursor tracking for interactive glow
        document.addEventListener('mousemove', (e) => {
            document.querySelectorAll('.strain-card').forEach(card => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const percentX = (x / rect.width) * 100;
                const percentY = (y / rect.height) * 100;
                card.style.setProperty('--mouse-x', `${percentX}%`);
                card.style.setProperty('--mouse-y', `${percentY}%`);
            });
        });

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    if (overlay.id === 'detail-modal') {
                        this.closeDetail();
                    } else {
                        UI.hideModal(overlay.id);
                        this.resetForm();
                    }
                }
            });
        });

        // Close modals on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const detailOverlay = document.getElementById('detail-modal');
                if (detailOverlay && detailOverlay.classList.contains('active')) {
                    this.closeDetail();
                } else {
                    document.querySelectorAll('.modal-overlay.active').forEach(overlay => {
                        UI.hideModal(overlay.id);
                        this.resetForm();
                    });
                }
            }
        });
    },

    // --- Apply search and filters ---
    applyFilters() {
        const query = document.getElementById('search-input').value.toLowerCase().trim();
        const type = document.getElementById('filter-type').value;
        const sort = document.getElementById('filter-sort').value;

        let results = [...this.strains];

        // Search
        if (query) {
            results = results.filter(s =>
                s.name.toLowerCase().includes(query) ||
                (s.effects && s.effects.toLowerCase().includes(query)) ||
                (s.notes && s.notes.toLowerCase().includes(query)) ||
                (s.taste && s.taste.toLowerCase().includes(query))
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

        this.filteredStrains = results;
        UI.renderStrains(results);
    },

    // --- Admin password check ---
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    async verifyPassword(password) {
        const hash = await this.hashPassword(password);
        return hash === ADMIN_PASSWORD_HASH;
    },

    // --- Add Strain (with password check) ---
    openAddStrain() {
        if (this.isAdmin) {
            this.editingId = null;
            this.formRating = 0;
            document.getElementById('form-title').textContent = 'Neue Sorte hinzufügen';
            document.getElementById('strain-form').reset();
            UI.renderStarInput('rating-input', 0);
            UI.showModal('form-modal');
        } else {
            UI.showModal('password-modal');
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-password').focus();
            document.querySelector('.password-error').classList.remove('show');
        }
    },

    async submitPassword() {
        const passwordInput = document.getElementById('admin-password');
        const password = passwordInput.value;
        const errorEl = document.querySelector('.password-error');
        const modal = document.querySelector('#password-modal .modal');

        if (!password) {
            modal.classList.remove('shake');
            void modal.offsetWidth; // Trigger reflow to restart animation
            modal.classList.add('shake');
            errorEl.textContent = 'Bitte Passwort eingeben';
            errorEl.classList.add('show');
            return;
        }

        const valid = await this.verifyPassword(password);
        if (valid) {
            this.isAdmin = true;
            errorEl.classList.remove('show');

            // Success animation
            modal.classList.add('success-pulse');
            setTimeout(() => {
                UI.hideModal('password-modal');
                modal.classList.remove('success-pulse');
                UI.showToast('Admin-Zugang aktiviert');

                // Update button
                const addBtn = document.getElementById('add-strain-btn');
                addBtn.classList.remove('btn-secondary');
                addBtn.classList.add('btn-primary');

                // Now open the form or edit the pending strain
                if (this._pendingEdit) {
                    const pendingId = this._pendingEdit;
                    this._pendingEdit = null;
                    this.editStrain(pendingId);
                } else {
                    this.openAddStrain();
                }
            }, 400); // Wait for pulse animation
        } else {
            // Error animation
            modal.classList.remove('shake');
            void modal.offsetWidth; // Trigger reflow to restart animation
            modal.classList.add('shake');
            errorEl.textContent = 'Falsches Passwort';
            errorEl.classList.add('show');
            passwordInput.value = '';
            passwordInput.focus();
        }
    },

    // --- Save strain (add or edit) ---
    async saveStrain() {
        const form = document.getElementById('strain-form');
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
            rating: this.formRating || null,
            effects: document.getElementById('strain-effects').value.trim() || null,
            taste: document.getElementById('strain-taste').value.trim() || null,
            notes: document.getElementById('strain-notes').value.trim() || null,
        };

        const fileInput = document.getElementById('strain-image');

        try {
            // Handle image upload if a file was selected
            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;

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

            if (this.editingId) {
                // Update
                const { error } = await db
                    .from('strains')
                    .update(strainData)
                    .eq('id', this.editingId);

                if (error) throw error;
                UI.showToast('Sorte aktualisiert');

                // Update local state to avoid full reload
                const index = this.strains.findIndex(s => s.id === this.editingId);
                if (index !== -1) {
                    this.strains[index] = { ...this.strains[index], ...strainData };
                    this.strains[index]._isEdited = true; // Set highlight flag for UI
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
                    this.strains.unshift(newStrain);
                }
            }

            UI.hideModal('form-modal');
            this.resetForm();

            // Re-render and clear flags
            this.applyFilters();
            UI.updateStats(this.strains);

            setTimeout(() => {
                this.strains.forEach(s => {
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

    // --- Edit strain ---
    async editStrain(id) {
        if (!this.isAdmin) {
            UI.showModal('password-modal');
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-password').focus();
            document.querySelector('.password-error').classList.remove('show');
            // Store the pending action
            this._pendingEdit = id;
            return;
        }

        const strain = this.strains.find(s => s.id === id);
        if (!strain) return;

        this.editingId = id;
        this.formRating = strain.rating || 0;

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
        
        // Show existing image in preview if available
        if (strain.image_url) {
            this.updateImagePreviewUI(strain.image_url, 'Aktuelles Foto');
        } else {
            this.removeImagePreview();
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

        UI.renderStarInput('rating-input', this.formRating);

        UI.showModal('form-modal');
    },

    // --- Delete strain ---
    async deleteStrain(id) {
        if (!this.isAdmin) {
            UI.showToast('Admin-Zugang erforderlich', 'error');
            return;
        }

        const strain = this.strains.find(s => s.id === id);
        if (!strain) return;

        if (!confirm(`"${strain.name}" wirklich löschen?`)) return;

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

            // Remove from local state
            this.strains = this.strains.filter(s => s.id !== id);
            this.applyFilters();
            UI.updateStats(this.strains);
        } catch (err) {
            console.error('Error deleting strain:', err);
            UI.showToast('Fehler beim Löschen: ' + err.message, 'error');
            // Revert animation if error
            if (targetCard) targetCard.classList.remove('removing');
        }
    },

    // --- Show detail modal ---
    showDetail(id) {
        const strain = this.strains.find(s => s.id === id);
        if (!strain) return;
        this.openStrainId = id;
        UI.renderDetail(strain);
        UI.showModal('detail-modal');
        const urlState = this.getUrlState();
        const state = {
            q: document.getElementById('search-input').value.trim(),
            type: document.getElementById('filter-type').value,
            sort: document.getElementById('filter-sort').value,
            strainId: id,
        };
        const currentSlug = this.getStrainSlug(strain);
        if (urlState.strainSlug === currentSlug) {
            this.setUrlState(state, false);
        } else {
            this.setUrlState(state, true);
        }
    },

    // --- Close detail modal and clear strain from URL ---
    closeDetail() {
        this.openStrainId = null;
        UI.hideModal('detail-modal');
        this.syncUrlFromFilters();
    },

    // --- Reset form ---
    resetForm() {
        this.editingId = null;
        this.formRating = 0;
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
        this.removeImagePreview();
    },

    // --- Image Preview Logic ---
    handleImagePreview(input) {
        const file = input.files[0];
        const uploadBtn = document.getElementById('upload-btn');
        
        if (!file) {
            this.removeImagePreview();
            if (uploadBtn) {
                uploadBtn.classList.remove('uploading');
            }
            return;
        }

        // Add uploading animation
        if (uploadBtn) {
            uploadBtn.classList.add('uploading');
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.updateImagePreviewUI(e.target.result, file.name);
            // Remove animation after preview is shown
            if (uploadBtn) {
                setTimeout(() => {
                    uploadBtn.classList.remove('uploading');
                }, 800);
            }
        };
        reader.readAsDataURL(file);
    },

    updateImagePreviewUI(src, name) {
        const container = document.getElementById('image-preview-container');
        if (!container) return;

        container.innerHTML = `
            <img src="${src}" class="preview-image" alt="Preview">
            <div class="preview-info">
                <span class="preview-name">${this.escapeHtml(name)}</span>
                <button type="button" class="preview-remove" onclick="App.removeImagePreview()">Entfernen</button>
            </div>
        `;
        container.classList.remove('hidden');
    },

    removeImagePreview() {
        const container = document.getElementById('image-preview-container');
        if (container) {
            container.innerHTML = '';
            container.classList.add('hidden');
        }
        const fileInput = document.getElementById('strain-image');
        if (fileInput) fileInput.value = '';
        
        // Remove uploading animation
        const uploadBtn = document.getElementById('upload-btn');
        if (uploadBtn) {
            uploadBtn.classList.remove('uploading');
        }
    },

    // --- Helpers ---
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // --- Copy medical name to clipboard ---
    async copyMedicalName(medicalName) {
        try {
            await navigator.clipboard.writeText(medicalName);
            UI.showToast('Medizinischer Name kopiert', 'success');
        } catch (err) {
            console.error('Failed to copy medical name:', err);
            UI.showToast('Fehler beim Kopieren', 'error');
        }
    },

    // --- Cancel form ---
    cancelForm() {
        UI.hideModal('form-modal');
        this.resetForm();
    }
};

// --- Start the app ---
document.addEventListener('DOMContentLoaded', () => App.init());
