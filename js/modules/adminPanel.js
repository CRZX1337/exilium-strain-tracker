/**
 * @fileoverview Admin Panel module for the Exilium Strain Tracker.
 * Handles admin panel UI, user management, strain management, and tab switching.
 */

import { state } from './state.js';
import { Auth } from '../supabase-auth.js';
import { UI } from '../ui.js';
import { ActivityLog } from './activityLog.js';
import { ImageManager } from './imageManager.js';

export const AdminPanel = {
    /**
     * Show/hide admin panel button based on auth state.
     */
    updateAdminButton() {
        const adminBtn = document.getElementById('admin-panel-btn');
        if (adminBtn) {
            adminBtn.style.display = Auth.isAuthenticated ? 'flex' : 'none';
        }
    },

    /**
     * Open the admin panel.
     */
    openAdminPanel() {
        if (!Auth.isAuthenticated) {
            UI.showToast('Admin-Zugang erforderlich', 'error');
            return;
        }
        UI.showModal('admin-modal');
        this.switchAdminTab('strains');
    },

    /**
     * Close the admin panel.
     */
    closeAdminPanel() {
        UI.hideModal('admin-modal');
    },

    /**
     * Switch between admin tabs.
     * @param {string} tabName - Name of the tab to switch to
     */
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
            await ImageManager.loadAdminImages();
        } else if (tabName === 'activity') {
            await ActivityLog.loadAdminActivity();
            ActivityLog.bindActivityLogEvents();
        }
    },

    // --- Strains Management ---

    /**
     * Load all strains for admin panel.
     */
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

            state.adminStrains = data || [];
            this.renderAdminStrains();
        } catch (err) {
            console.error('Error loading admin strains:', err);
            list.innerHTML = '<p class="empty-state">Fehler beim Laden der Sorten</p>';
        }
    },

    /**
     * Render strains in admin panel.
     */
    renderAdminStrains() {
        const list = document.getElementById('admin-strains-list');
        const search = document.getElementById('admin-strain-search')?.value.toLowerCase() || '';
        const visibility = document.getElementById('admin-strain-visibility')?.value || 'all';

        let filtered = state.adminStrains || [];

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

    /**
     * Filter admin strains based on search and visibility.
     */
    filterAdminStrains() {
        this.renderAdminStrains();
    },

    /**
     * Toggle strain privacy status.
     * @param {string} strainId - ID of the strain
     * @param {boolean} isPrivate - New privacy state
     */
    async toggleStrainPrivacy(strainId, isPrivate) {
        try {
            const { error } = await db
                .from('strains')
                .update({ is_private: isPrivate })
                .eq('id', strainId);

            if (error) throw error;

            // Log privacy toggle activity
            const strain = state.adminStrains.find(s => s.id === strainId) || state.strains.find(s => s.id === strainId);
            if (strain) {
                ActivityLog.logActivity('privacy_toggle', strain, { 
                    previous_state: !isPrivate, 
                    new_state: isPrivate,
                    is_private: isPrivate 
                });
            }
            
            UI.showToast(isPrivate ? 'Sorte ist jetzt privat' : 'Sorte ist jetzt öffentlich', 'success');
            
            // Update local data and re-render
            const adminStrain = state.adminStrains.find(s => s.id === strainId);
            if (adminStrain) {
                adminStrain.is_private = isPrivate;
            }
            this.renderAdminStrains();
            
            // Also update main strain list
            const mainStrain = state.strains.find(s => s.id === strainId);
            if (mainStrain) {
                mainStrain.is_private = isPrivate;
            }
        } catch (err) {
            console.error('Error toggling privacy:', err);
            UI.showToast('Fehler beim Ändern der Sichtbarkeit', 'error');
        }
    },

    // --- Users Management ---

    /**
     * Load all users for admin panel.
     */
    async loadAdminUsers() {
        const list = document.getElementById('admin-users-list');
        if (!list) return;

        list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            // Get current session for auth token
            const { data: { session } } = await db.auth.getSession();
            if (!session) {
                throw new Error('Not authenticated');
            }

            // Call edge function to list users
            const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: 'listUsers' })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to load users');
            }

            state.adminUsers = result.users || [];
            this.renderAdminUsers();
        } catch (err) {
            console.error('Error loading users:', err);
            list.innerHTML = '<p class="empty-state">Benutzer konnten nicht geladen werden: ' + this.escapeHtml(err.message) + '</p>';
        }
    },

    /**
     * Render users in admin panel.
     */
    renderAdminUsers() {
        const list = document.getElementById('admin-users-list');
        
        if (!state.adminUsers || state.adminUsers.length === 0) {
            list.innerHTML = '<p class="empty-state">Keine Benutzer gefunden</p>';
            return;
        }

        list.innerHTML = state.adminUsers.map(user => {
            const isConfirmed = !!user.email_confirmed_at;
            const createdDate = new Date(user.created_at).toLocaleDateString('de-DE');
            const lastSignIn = user.last_sign_in_at 
                ? new Date(user.last_sign_in_at).toLocaleDateString('de-DE')
                : '<em style="color:var(--text-secondary)">Noch nie eingeloggt</em>';

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

    /**
     * Show create user form modal.
     */
    showCreateUserForm() {
        document.getElementById('create-user-form').reset();
        UI.showModal('create-user-modal');
    },

    /**
     * Create new user by invitation.
     */
    async createUser() {
        const email = document.getElementById('new-user-email').value.trim();

        if (!email) {
            UI.showToast('Bitte gültige E-Mail eingeben', 'error');
            return;
        }

        try {
            // Get current session for auth token
            const { data: { session } } = await db.auth.getSession();
            if (!session) {
                throw new Error('Not authenticated');
            }

            // Call edge function to invite user
            const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: 'inviteUser', email })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to invite user');
            }

            UI.showToast('Einladung erfolgreich gesendet! Der Benutzer erhält eine E-Mail zum Einrichten des Passworts.', 'success');
            UI.hideModal('create-user-modal');
            await this.loadAdminUsers();
        } catch (err) {
            console.error('Error inviting user:', err);
            UI.showToast('Fehler: ' + err.message, 'error');
        }
    },

    /**
     * Show delete confirmation modal for user.
     * @param {string} userId - ID of the user to delete
     */
    showDeleteUserConfirm(userId) {
        state._pendingDeleteUserId = userId;
        
        const confirmBtn = document.getElementById('confirm-delete-user-btn');
        confirmBtn.onclick = () => this.confirmDeleteUser();
        
        UI.showModal('delete-user-confirm-modal');
    },

    /**
     * Confirm and execute user deletion.
     */
    async confirmDeleteUser() {
        const userId = state._pendingDeleteUserId;
        if (!userId) return;
        
        UI.hideModal('delete-user-confirm-modal');
        state._pendingDeleteUserId = null;

        try {
            // Get current session for auth token
            const { data: { session } } = await db.auth.getSession();
            if (!session) {
                throw new Error('Not authenticated');
            }

            // Call edge function to delete user
            const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: 'deleteUser', userId })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete user');
            }

            UI.showToast('Benutzer gelöscht', 'success');
            await this.loadAdminUsers();
        } catch (err) {
            console.error('Error deleting user:', err);
            UI.showToast('Fehler beim Löschen: ' + err.message, 'error');
        }
    },

    /**
     * Legacy deleteUser method - redirects to modal confirmation.
     * @param {string} userId - ID of the user to delete
     */
    async deleteUser(userId) {
        this.showDeleteUserConfirm(userId);
    },

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
