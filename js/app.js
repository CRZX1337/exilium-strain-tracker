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

        // Initialise Supabase Auth and sync session state
        await Auth.init();

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

    // --- Admin auth (delegated to Supabase Auth) ---

    /** Show login modal directly */
    showLoginModal() {
        // Mark that we ONLY want to login, not add a strain after
        this._loginOnly = true;
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

    // --- Add Strain (with auth check) ---
    openAddStrain() {
        if (Auth.isAuthenticated) {
            this.editingId = null;
            this.formRating = 0;
            document.getElementById('form-title').textContent = 'Neue Sorte hinzufügen';
            document.getElementById('strain-form').reset();
            UI.renderStarInput('rating-input', 0);
            // Show privacy option for admins
            document.getElementById('privacy-group').style.display = 'flex';
            document.getElementById('strain-private').checked = false;
            this.removeImagePreview();
            UI.showModal('form-modal');
        } else {
            // Mark that we want to login AND then add a strain
            this._loginOnly = false;
            this.showLoginModal();
        }
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
            this.isAdmin = true;
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
                if (this._loginOnly) {
                    // Just logged in, nothing else to do
                    this._loginOnly = false;
                } else if (this._pendingEdit) {
                    const pendingId = this._pendingEdit;
                    this._pendingEdit = null;
                    this.editStrain(pendingId);
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
            is_private: document.getElementById('strain-private')?.checked || false,
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
        if (!Auth.isAuthenticated) {
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
        
        // Show privacy option for admins and set value
        document.getElementById('privacy-group').style.display = 'flex';
        document.getElementById('strain-private').checked = strain.is_private || false;
        
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
        if (!Auth.isAuthenticated) {
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
    },

    // ==========================================
    // ADMIN PANEL
    // ==========================================

    /** Show/hide admin panel button based on auth state */
    updateAdminButton() {
        const adminBtn = document.getElementById('admin-panel-btn');
        if (adminBtn) {
            adminBtn.style.display = Auth.isAuthenticated ? 'flex' : 'none';
        }
    },

    /** Open admin panel */
    openAdminPanel() {
        if (!Auth.isAuthenticated) {
            UI.showToast('Admin-Zugang erforderlich', 'error');
            return;
        }
        UI.showModal('admin-modal');
        this.switchAdminTab('strains');
    },

    /** Close admin panel */
    closeAdminPanel() {
        UI.hideModal('admin-modal');
    },

    /** Switch between admin tabs */
    async switchAdminTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`admin-tab-${tabName}`).classList.add('active');

        // Load tab data
        if (tabName === 'strains') {
            await this.loadAdminStrains();
        } else if (tabName === 'users') {
            await this.loadAdminUsers();
        } else if (tabName === 'images') {
            await this.loadAdminImages();
        }
    },

    // --- Strains Management ---

    /** Load all strains for admin panel */
    async loadAdminStrains() {
        const list = document.getElementById('admin-strains-list');
        if (!list) return;

        list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            const { data, error } = await db
                .from('strains')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.adminStrains = data || [];
            this.renderAdminStrains();
        } catch (err) {
            console.error('Error loading admin strains:', err);
            list.innerHTML = '<p class="empty-state">Fehler beim Laden der Sorten</p>';
        }
    },

    /** Render strains in admin panel */
    renderAdminStrains() {
        const list = document.getElementById('admin-strains-list');
        const search = document.getElementById('admin-strain-search')?.value.toLowerCase() || '';
        const visibility = document.getElementById('admin-strain-visibility')?.value || 'all';

        let filtered = this.adminStrains || [];

        // Apply search filter
        if (search) {
            filtered = filtered.filter(s =>
                s.name.toLowerCase().includes(search) ||
                (s.medical_name && s.medical_name.toLowerCase().includes(search))
            );
        }

        // Apply visibility filter
        if (visibility === 'public') {
            filtered = filtered.filter(s => !s.is_private);
        } else if (visibility === 'private') {
            filtered = filtered.filter(s => s.is_private);
        }

        if (filtered.length === 0) {
            list.innerHTML = '<p class="empty-state">Keine Sorten gefunden</p>';
            return;
        }

        list.innerHTML = filtered.map(strain => `
            <div class="admin-list-item ${strain.is_private ? 'private' : 'public'}">
                <div class="admin-item-info">
                    <div class="admin-item-title">${this.escapeHtml(strain.name)}</div>
                    <div class="admin-item-meta">
                        <span>${this.escapeHtml(strain.medical_name || '-')}</span>
                        <span class="strain-type-badge ${strain.type.toLowerCase()}">${strain.type}</span>
                        ${strain.is_private ? '<span class="visibility-badge private">🔒 Privat</span>' : '<span class="visibility-badge public">🌐 Öffentlich</span>'}
                    </div>
                </div>
                <div class="admin-item-actions">
                    <button class="btn-privacy ${strain.is_private ? 'private' : ''}" 
                            onclick="App.toggleStrainPrivacy('${strain.id}', ${!strain.is_private})"
                            title="${strain.is_private ? 'Öffentlich machen' : 'Privat machen'}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${strain.is_private 
                                ? '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
                                : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><line x1="12" y1="16" x2="12" y2="16"/>'
                            }
                        </svg>
                    </button>
                    <button class="btn btn-secondary" onclick="App.editStrain('${strain.id}')">Bearbeiten</button>
                    <button class="btn btn-danger" onclick="App.deleteStrain('${strain.id}')">Löschen</button>
                </div>
            </div>
        `).join('');
    },

    /** Filter admin strains based on search and visibility */
    filterAdminStrains() {
        this.renderAdminStrains();
    },

    /** Toggle strain privacy status */
    async toggleStrainPrivacy(strainId, isPrivate) {
        try {
            const { error } = await db
                .from('strains')
                .update({ is_private: isPrivate })
                .eq('id', strainId);

            if (error) throw error;

            UI.showToast(isPrivate ? 'Sorte ist jetzt privat' : 'Sorte ist jetzt öffentlich', 'success');
            
            // Update local data and re-render
            const strain = this.adminStrains.find(s => s.id === strainId);
            if (strain) {
                strain.is_private = isPrivate;
            }
            this.renderAdminStrains();
            
            // Also update main strain list
            const mainStrain = this.strains.find(s => s.id === strainId);
            if (mainStrain) {
                mainStrain.is_private = isPrivate;
                this.applyFilters();
            }
        } catch (err) {
            console.error('Error toggling privacy:', err);
            UI.showToast('Fehler beim Ändern der Sichtbarkeit', 'error');
        }
    },

    // --- Users Management ---

    /** Load all users for admin panel */
    async loadAdminUsers() {
        const list = document.getElementById('admin-users-list');
        if (!list) return;

        list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            // Get users from Supabase Auth API using the admin method
            const { data: { users }, error } = await db.auth.admin.listUsers();

            if (error) {
                // Fallback: if admin API not available, show current user info
                if (Auth.user) {
                    this.adminUsers = [{
                        id: Auth.user.id,
                        email: Auth.user.email,
                        email_confirmed_at: Auth.user.email_confirmed_at,
                        created_at: Auth.user.created_at,
                        last_sign_in_at: Auth.user.last_sign_in_at
                    }];
                    this.renderAdminUsers();
                    return;
                }
                throw error;
            }

            this.adminUsers = users || [];
            this.renderAdminUsers();
        } catch (err) {
            console.error('Error loading users:', err);
            // Fallback: show current user only
            if (Auth.user) {
                this.adminUsers = [{
                    id: Auth.user.id,
                    email: Auth.user.email,
                    email_confirmed_at: Auth.user.email_confirmed_at,
                    created_at: Auth.user.created_at,
                    last_sign_in_at: Auth.user.last_sign_in_at
                }];
                this.renderAdminUsers();
            } else {
                list.innerHTML = '<p class="empty-state">Benutzer konnten nicht geladen werden</p>';
            }
        }
    },

    /** Render users in admin panel */
    renderAdminUsers() {
        const list = document.getElementById('admin-users-list');
        
        if (!this.adminUsers || this.adminUsers.length === 0) {
            list.innerHTML = '<p class="empty-state">Keine Benutzer gefunden</p>';
            return;
        }

        list.innerHTML = this.adminUsers.map(user => {
            const isConfirmed = !!user.email_confirmed_at;
            const createdDate = new Date(user.created_at).toLocaleDateString('de-DE');
            const lastSignIn = user.last_sign_in_at 
                ? new Date(user.last_sign_in_at).toLocaleDateString('de-DE')
                : 'Nie';

            return `
                <div class="admin-list-item">
                    <div class="admin-item-info">
                        <div class="admin-item-title">${this.escapeHtml(user.email)}</div>
                        <div class="admin-item-meta">
                            <span class="user-status ${isConfirmed ? 'confirmed' : 'unconfirmed'}">
                                ${isConfirmed ? '✓ Bestätigt' : '⏳ Unbestätigt'}
                            </span>
                            <span>Erstellt: ${createdDate}</span>
                            <span>Letzter Login: ${lastSignIn}</span>
                        </div>
                    </div>
                    <div class="admin-item-actions">
                        ${user.id !== Auth.user?.id ? `
                            <button class="btn btn-danger" onclick="App.deleteUser('${user.id}')">Löschen</button>
                        ` : '<span class="form-hint">(Du)</span>'}
                    </div>
                </div>
            `;
        }).join('');
    },

    /** Show create user form */
    showCreateUserForm() {
        document.getElementById('create-user-form').reset();
        UI.showModal('create-user-modal');
    },

    /** Create new user */
    async createUser() {
        const email = document.getElementById('new-user-email').value.trim();
        const password = document.getElementById('new-user-password').value;

        if (!email || !password || password.length < 6) {
            UI.showToast('Bitte gültige E-Mail und Passwort (min. 6 Zeichen) eingeben', 'error');
            return;
        }

        try {
            // Try admin API first
            const { data, error } = await db.auth.admin.createUser({
                email,
                password,
                email_confirm: true
            });

            if (error) {
                // Fallback: regular signup (user will need to confirm email)
                const { error: signUpError } = await db.auth.signUp({
                    email,
                    password
                });
                
                if (signUpError) throw signUpError;
                
                UI.showToast('Benutzer erstellt. E-Mail-Bestätigung erforderlich.', 'success');
            } else {
                UI.showToast('Benutzer erfolgreich erstellt', 'success');
            }

            UI.hideModal('create-user-modal');
            await this.loadAdminUsers();
        } catch (err) {
            console.error('Error creating user:', err);
            UI.showToast('Fehler: ' + err.message, 'error');
        }
    },

    /** Delete user */
    async deleteUser(userId) {
        if (!confirm('Diesen Benutzer wirklich löschen?')) return;

        try {
            const { error } = await db.auth.admin.deleteUser(userId);

            if (error) throw error;

            UI.showToast('Benutzer gelöscht', 'success');
            await this.loadAdminUsers();
        } catch (err) {
            console.error('Error deleting user:', err);
            UI.showToast('Fehler beim Löschen: ' + err.message, 'error');
        }
    },

    // --- Images Management ---

    /** Load all images for admin panel */
    async loadAdminImages() {
        const list = document.getElementById('admin-images-list');
        const statsEl = document.getElementById('image-stats');
        if (!list) return;

        list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            // Get all images from storage
            const { data: files, error } = await db.storage
                .from('strain-images')
                .list();

            if (error) throw error;

            // Get all strain image URLs to check which images are used
            const { data: strains } = await db.from('strains').select('image_url');
            const usedUrls = new Set(strains?.map(s => s.image_url).filter(Boolean) || []);

            this.adminImages = (files || []).map(file => {
                const { data } = db.storage.from('strain-images').getPublicUrl(file.name);
                const publicUrl = data.publicUrl;
                return {
                    ...file,
                    publicUrl,
                    isUsed: usedUrls.has(publicUrl)
                };
            });

            // Update stats
            const total = this.adminImages.length;
            const orphaned = this.adminImages.filter(img => !img.isUsed).length;
            document.getElementById('total-images').textContent = `${total} Bilder`;
            document.getElementById('orphaned-images').textContent = `${orphaned} ungenutzt`;

            this.renderAdminImages();
        } catch (err) {
            console.error('Error loading images:', err);
            list.innerHTML = '<p class="empty-state">Fehler beim Laden der Bilder</p>';
        }
    },

    /** Render images in admin panel */
    renderAdminImages() {
        const list = document.getElementById('admin-images-list');
        
        if (!this.adminImages || this.adminImages.length === 0) {
            list.innerHTML = '<p class="empty-state">Keine Bilder vorhanden</p>';
            return;
        }

        list.innerHTML = this.adminImages.map(img => `
            <div class="admin-image-item ${img.isUsed ? '' : 'orphaned'}">
                <img src="${img.publicUrl}" alt="${this.escapeHtml(img.name)}">
                <div class="admin-image-overlay">
                    <button class="btn btn-primary" onclick="App.viewImage('${img.publicUrl}')">Ansehen</button>
                    <button class="btn btn-danger" onclick="App.deleteImage('${img.name}')">Löschen</button>
                </div>
                <div class="admin-image-info">
                    ${img.isUsed ? '✓ In Verwendung' : '⚠ Ungenutzt'} • ${this.formatFileSize(img.metadata?.size || 0)}
                </div>
            </div>
        `).join('');
    },

    /** Format file size */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /** View image in lightbox */
    viewImage(url) {
        document.getElementById('lightbox-image').src = url;
        UI.showModal('lightbox-modal');
    },

    /** Delete image from storage */
    async deleteImage(fileName) {
        if (!confirm('Dieses Bild wirklich löschen?')) return;

        try {
            const { error } = await db.storage
                .from('strain-images')
                .remove([fileName]);

            if (error) throw error;

            UI.showToast('Bild gelöscht', 'success');
            await this.loadAdminImages();
        } catch (err) {
            console.error('Error deleting image:', err);
            UI.showToast('Fehler beim Löschen', 'error');
        }
    }
};

// --- Mobile header scroll behavior (hide on scroll down, show on scroll up) ---
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

// --- Start the app ---
document.addEventListener('DOMContentLoaded', () => App.init());
