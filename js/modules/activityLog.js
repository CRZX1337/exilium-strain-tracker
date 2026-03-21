/**
 * @fileoverview Activity Log module for the Exilium Strain Tracker.
 * Handles activity logging, loading, filtering, and display in the admin panel.
 */

import { state } from './state.js';
import { Auth } from '../supabase-auth.js';
import { UI } from '../ui.js';

export const ActivityLog = {
    /**
     * Log an activity to the activity_logs table.
     * @param {string} actionType - 'create', 'update', 'delete', 'privacy_toggle', 'login', 'logout'
     * @param {Object} strain - The strain object
     * @param {Object|null} details - Additional details (optional)
     */
    async logActivity(actionType, strain, details = null) {
        if (!Auth.isAuthenticated) return;
        
        try {
            const activityData = {
                action_type: actionType,
                strain_id: strain.id || null,
                strain_name: strain.name || strain.medical_name || 'Unnamed',
                user_id: Auth.user?.id || null,
                user_email: Auth.user?.email || null,
                details: details
            };

            // Don't await - fire and forget to not slow down the UI
            db.from('activity_logs')
                .insert([activityData])
                .then(({ error }) => {
                    if (error) console.error('Error logging activity:', error);
                });
        } catch (err) {
            console.error('Error logging activity:', err);
        }
    },

    /**
     * Load activity logs with pagination.
     * @param {boolean} loadMore - Whether to append to existing data
     */
    async loadAdminActivity(loadMore = false) {
        const list = document.getElementById('admin-activity-list');
        const statsEl = document.getElementById('activity-stats');
        const loadMoreBtn = document.getElementById('activity-load-more');
        if (!list) return;

        if (!loadMore) {
            list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
            state.activityPagination.page = 1;
        }

        try {
            const from = (state.activityPagination.page - 1) * state.activityPagination.pageSize;
            const to = from + state.activityPagination.pageSize - 1;

            let query = db
                .from('activity_logs')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(from, to);

            // Apply filters
            const userFilter = document.getElementById('activity-filter-user')?.value;
            const actionFilter = document.getElementById('activity-filter-action')?.value;

            if (userFilter) {
                query = query.eq('user_id', userFilter);
            }
            if (actionFilter) {
                query = query.eq('action_type', actionFilter);
            }

            const { data, error, count } = await query;

            if (error) throw error;

            if (loadMore) {
                state.adminActivity = [...(state.adminActivity || []), ...(data || [])];
            } else {
                state.adminActivity = data || [];
            }

            // Check if there are more entries
            state.activityPagination.hasMore = data?.length === state.activityPagination.pageSize;
            if (loadMoreBtn) {
                loadMoreBtn.style.display = state.activityPagination.hasMore ? 'block' : 'none';
            }
            
            // Update stats
            if (statsEl) {
                const total = count || state.adminActivity.length;
                document.getElementById('total-activities').textContent = `${total} Einträge`;
            }

            // Update user filter options
            this.updateActivityUserFilter();

            this.renderAdminActivity(loadMore, data?.length || 0);
        } catch (err) {
            console.error('Error loading activity logs:', err);
            if (!loadMore) {
                list.innerHTML = '<p class="empty-state">Fehler beim Laden des Aktivitäts-Logs</p>';
            }
        }
    },

    /**
     * Load more activity entries (pagination).
     */
    async loadMoreActivity() {
        state.activityPagination.page++;
        await this.loadAdminActivity(true);
    },

    /**
     * Update user filter dropdown with unique users from loaded data.
     */
    updateActivityUserFilter() {
        const select = document.getElementById('activity-filter-user');
        if (!select || !state.adminActivity) return;

        const currentValue = select.value;
        const uniqueUsers = [...new Map(state.adminActivity.map(l => [l.user_id, l.user_email])).entries()]
            .filter(([id]) => id);

        // Keep "All users" option and add found users
        const allOption = select.querySelector('option[value=""]');
        select.innerHTML = '';
        select.appendChild(allOption || new Option('Alle Benutzer', ''));

        uniqueUsers.forEach(([id, email]) => {
            if (id && email) {
                select.appendChild(new Option(email, id));
            }
        });

        select.value = currentValue;
    },

    /**
     * Filter activity logs based on selected criteria.
     */
    filterAdminActivity() {
        state.activityPagination.page = 1;
        this.loadAdminActivity(false);
    },

    /**
     * Render activity logs in the admin panel.
     * @param {boolean} append - Whether to append to existing content
     * @param {number} newCount - Number of new items to render
     */
    renderAdminActivity(append = false, newCount = 0) {
        const list = document.getElementById('admin-activity-list');
        
        if (!state.adminActivity || state.adminActivity.length === 0) {
            if (!append) {
                list.innerHTML = '<p class="empty-state">Noch keine Aktivitäten aufgezeichnet</p>';
            }
            return;
        }

        if (!append) {
            list.innerHTML = '';
        }

        const actionLabels = {
            create: { icon: '✚', label: 'Hinzugefügt', class: 'create' },
            update: { icon: '✎', label: 'Bearbeitet', class: 'update' },
            delete: { icon: '🗑', label: 'Gelöscht', class: 'delete' },
            privacy_toggle: { icon: '🔒', label: 'Sichtbarkeit', class: 'privacy' },
            login: { icon: '🔑', label: 'Login', class: 'login' },
            logout: { icon: '🚪', label: 'Logout', class: 'logout' }
        };

        const html = state.adminActivity.slice(append ? -newCount : 0).map(log => {
            const action = actionLabels[log.action_type] || { icon: '?', label: log.action_type, class: '' };
            const date = new Date(log.created_at).toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const userEmail = log.user_email || 'Unbekannt';
            
            return `
                <div class="admin-list-item activity-log ${action.class}" data-activity-id="${log.id}" style="cursor:pointer">
                    <div class="activity-icon" title="${action.label}">${action.icon}</div>
                    <div class="admin-item-info activity-info">
                        <div class="admin-item-title">${this.escapeHtml(log.strain_name || '—')}</div>
                        <div class="admin-item-meta">
                            <span class="action-badge ${action.class}">${action.label}</span>
                            <span>von ${this.escapeHtml(userEmail)}</span>
                            <span>${date}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (append) {
            list.insertAdjacentHTML('beforeend', html);
        } else {
            list.innerHTML = html;
        }
    },

    /**
     * Show activity detail modal.
     * @param {string} logId - ID of the activity log entry
     */
    showActivityDetail(logId) {
        const log = state.adminActivity?.find(l => l.id === logId);
        if (!log) return;

        const actionLabels = {
            create: { icon: '✚', label: 'Hinzugefügt', class: 'create' },
            update: { icon: '✎', label: 'Bearbeitet', class: 'update' },
            delete: { icon: '🗑', label: 'Gelöscht', class: 'delete' },
            privacy_toggle: { icon: '🔒', label: 'Sichtbarkeit geändert', class: 'privacy' },
            login: { icon: '🔑', label: 'Login', class: 'login' },
            logout: { icon: '🚪', label: 'Logout', class: 'logout' }
        };

        const action = actionLabels[log.action_type] || { icon: '?', label: log.action_type, class: '' };
        const date = new Date(log.created_at).toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        let detailsHtml = '';
        if (log.details && Object.keys(log.details).length > 0) {
            if (log.action_type === 'privacy_toggle') {
                detailsHtml = `
                    <div class="detail-section">
                        <h4>Änderung</h4>
                        <p>Vorher: ${log.details.previous_state ? '🔒 Privat' : '🌐 Öffentlich'}</p>
                        <p>Nachher: ${log.details.new_state ? '🔒 Privat' : '🌐 Öffentlich'}</p>
                    </div>
                `;
            } else if (['create', 'update'].includes(log.action_type) && log.details.changes) {
                const changes = Object.entries(log.details.changes)
                    .map(([key, val]) => `<p><strong>${key}:</strong> ${val || '—'}</p>`)
                    .join('');
                detailsHtml = changes ? `<div class="detail-section"><h4>Geänderte Felder</h4>${changes}</div>` : '';
            } else {
                const details = Object.entries(log.details)
                    .map(([key, val]) => `<p><strong>${key}:</strong> ${typeof val === 'object' ? JSON.stringify(val) : val}</p>`)
                    .join('');
                detailsHtml = details ? `<div class="detail-section"><h4>Details</h4>${details}</div>` : '';
            }
        }

        const content = document.getElementById('activity-detail-content');
        content.innerHTML = `
            <div class="activity-detail">
                <div class="activity-header ${action.class}">
                    <div class="activity-icon-large">${action.icon}</div>
                    <div class="activity-title">
                        <h3>${action.label}</h3>
                        <p class="activity-strain">${this.escapeHtml(log.strain_name || '—')}</p>
                    </div>
                </div>
                <div class="activity-meta">
                    <p><strong>Benutzer:</strong> ${this.escapeHtml(log.user_email || 'Unbekannt')}</p>
                    <p><strong>Zeitpunkt:</strong> ${date}</p>
                    ${log.strain_id ? `<p><strong>Sorten-ID:</strong> <code>${log.strain_id}</code></p>` : ''}
                </div>
                ${detailsHtml}
            </div>
        `;

        UI.showModal('activity-detail-modal');
    },

    /**
     * Bind activity log click handlers via event delegation.
     */
    bindActivityLogEvents() {
        const list = document.getElementById('admin-activity-list');
        if (!list) return;
        if (state._activityLogBound) return;
        state._activityLogBound = true;

        list.addEventListener('click', (e) => {
            const item = e.target.closest('[data-activity-id]');
            if (!item) return;

            const logId = item.dataset.activityId;
            this.showActivityDetail(logId);
        });
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
