// ==========================================
// Supabase Authentication Module
// ==========================================

const Auth = {
    /** Current authenticated user (null if logged out) */
    user: null,

    /**
     * Initialise auth — restore session from storage and start listener.
     * Call this once before App.init() completes.
     */
    async init() {
        // Check URL hash BEFORE Supabase processes it
        const hash = window.location.hash;
        const isInvite = hash.includes('type=invite') || hash.includes('invite');
        
        // Restore any existing session (this also processes invite tokens in URL)
        const { data: { session } } = await db.auth.getSession();
        this.user = session?.user ?? null;

        // Listen for sign-in / sign-out events
        db.auth.onAuthStateChange((event, session) => {
            const previousUser = this.user;
            this.user = session?.user ?? null;
            
            // Log login/logout events
            if (event === 'SIGNED_IN' && !previousUser) {
                this.logAuthActivity('login');
            } else if (event === 'SIGNED_OUT' && previousUser) {
                this.logAuthActivity('logout');
            }
            
            this._onAuthChange();
        });

        // If this was an invite link, force password setup
        if (isInvite && this.user) {
            this._pendingPasswordSetup = true;
            // Clear the URL hash
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            setTimeout(() => this.showPasswordSetup(), 300);
        }
    },

    /**
     * Show password setup modal for invited users
     */
    showPasswordSetup() {
        // Check if user was invited (no password set yet or recent invite)
        const modal = document.getElementById('setup-password-modal');
        if (modal) {
            UI.showModal('setup-password-modal');
        }
    },

    /**
     * Complete password setup for invited user
     */
    async completePasswordSetup() {
        const password = document.getElementById('setup-password').value;
        const confirmPassword = document.getElementById('setup-password-confirm').value;

        if (!password || password.length < 6) {
            UI.showToast('Passwort muss mindestens 6 Zeichen haben', 'error');
            return;
        }

        if (password !== confirmPassword) {
            UI.showToast('Passwörter stimmen nicht überein', 'error');
            return;
        }

        try {
            const { error } = await db.auth.updateUser({ password });
            
            if (error) throw error;

            UI.showToast('Passwort erfolgreich gesetzt!', 'success');
            UI.hideModal('setup-password-modal');
            this._pendingPasswordSetup = false;
        } catch (err) {
            console.error('Error setting password:', err);
            UI.showToast('Fehler: ' + err.message, 'error');
        }
    },

    /**
     * Returns true when a user is currently logged in
     */
    get isAuthenticated() {
        return this.user !== null;
    },

    /**
     * Returns true when the current user is the owner (admin)
     */
    get isOwner() {
        return this.user?.email === 'g.sensale@icloud.com';
    },

    /**
     * Sign in with email + password.
     * @param {string} email
     * @param {string} password
     * @returns {{ success: boolean, error?: string }}
     */
    async signIn(email, password) {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true };
    },

    /** Show logout confirmation dialog */
    showSignOutConfirm() {
        UI.showModal('logout-confirm-modal');
    },

    /** Confirm and execute sign out */
    async confirmSignOut() {
        UI.hideModal('logout-confirm-modal');
        await this.signOut();
    },

    /** Sign out the current user */
    async signOut() {
        await db.auth.signOut();
    },

    /**
     * Log authentication activity (login/logout)
     * @param {string} action - 'login' or 'logout'
     */
    async logAuthActivity(action) {
        if (!this.user) return;
        
        try {
            const activityData = {
                action_type: action,
                strain_id: null,
                strain_name: action === 'login' ? 'Login' : 'Logout',
                user_id: this.user.id,
                user_email: this.user.email,
                details: { timestamp: new Date().toISOString() }
            };

            // Fire and forget
            db.from('activity_logs')
                .insert([activityData])
                .then(({ error }) => {
                    if (error) console.error('Error logging auth activity:', error);
                });
        } catch (err) {
            console.error('Error logging auth activity:', err);
        }
    },

    /**
     * Called whenever auth state changes.
     * Syncs isAdmin flag on the App object and updates UI affordances.
     */
    _onAuthChange() {
        if (typeof App !== 'undefined') {
            App.isAdmin = this.isOwner; // Only owner is admin
            App.updateAdminButton();

            // Toggle login button visibility (show when NOT authenticated)
            const loginBtn = document.getElementById('login-btn-header');
            if (loginBtn) {
                loginBtn.style.display = this.isAuthenticated ? 'none' : 'flex';
            }

            // Toggle + Neue Sorte button visibility (only show when authenticated)
            const addBtn = document.getElementById('add-strain-btn');
            if (addBtn) {
                addBtn.style.display = this.isAuthenticated ? 'flex' : 'none';
                if (this.isAuthenticated) {
                    addBtn.classList.remove('btn-secondary');
                    addBtn.classList.add('btn-primary');
                }
            }

            // Toggle logout button visibility (show when authenticated)
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.style.display = this.isAuthenticated ? 'flex' : 'none';
            }
        }
    },
};
