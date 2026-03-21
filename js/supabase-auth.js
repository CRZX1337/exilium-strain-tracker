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
        // Check for invite/recovery token in URL first
        const url = new URL(window.location.href);
        const token = url.hash.match(/access_token=([^&]*)/)?.[1];
        const type = url.hash.match(/type=([^&]*)/)?.[1];
        
        if (token && type === 'invite') {
            // Handle invite token - exchange for session
            const { data, error } = await db.auth.exchangeCodeForSession(token);
            if (!error && data.session) {
                this.user = data.session.user;
                // Clear the hash and show password setup
                window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
                this._pendingPasswordSetup = true;
            }
        }

        // Restore any existing session (if not already set from invite)
        if (!this.user) {
            const { data: { session } } = await db.auth.getSession();
            this.user = session?.user ?? null;
        }

        // Listen for sign-in / sign-out events
        db.auth.onAuthStateChange((_event, session) => {
            this.user = session?.user ?? null;
            this._onAuthChange();
        });

        // Check if we need to show password setup
        if (this._pendingPasswordSetup) {
            setTimeout(() => this.showPasswordSetup(), 500);
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

    /** Returns true when a user is currently logged in */
    get isAuthenticated() {
        return this.user !== null;
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

    /** Sign out the current user */
    async signOut() {
        await db.auth.signOut();
    },

    /**
     * Called whenever auth state changes.
     * Syncs isAdmin flag on the App object and updates UI affordances.
     */
    _onAuthChange() {
        if (typeof App !== 'undefined') {
            App.isAdmin = this.isAuthenticated;
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
        }
    },
};
