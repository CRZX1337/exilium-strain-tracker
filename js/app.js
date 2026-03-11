// ==========================================
// App — Core Application Logic
// ==========================================

const App = {
    strains: [],
    filteredStrains: [],
    isAdmin: false,
    formRating: 0,
    editingId: null,

    // --- Initialize ---
    async init() {
        const loadStart = Date.now();

        UI.showLoading();
        await this.loadStrains();
        this.bindEvents();

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
        document.getElementById('search-input').addEventListener('input', () => this.applyFilters());

        // Filters
        document.getElementById('filter-type').addEventListener('change', () => this.applyFilters());
        document.getElementById('filter-sort').addEventListener('change', () => this.applyFilters());

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    UI.hideModal(overlay.id);
                    this.resetForm();
                }
            });
        });

        // Close modals on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(overlay => {
                    UI.hideModal(overlay.id);
                    this.resetForm();
                });
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

                // Now open the form
                this.openAddStrain();
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

        const strainData = {
            name,
            type,
            medical_name: document.getElementById('strain-medical-name').value.trim() || null,
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
        UI.renderDetail(strain);
        UI.showModal('detail-modal');
    },

    // --- Reset form ---
    resetForm() {
        this.editingId = null;
        this.formRating = 0;
        const form = document.getElementById('strain-form');
        if (form) form.reset();
    },

    // --- Cancel form ---
    cancelForm() {
        UI.hideModal('form-modal');
        this.resetForm();
    }
};

// --- Start the app ---
document.addEventListener('DOMContentLoaded', () => App.init());
