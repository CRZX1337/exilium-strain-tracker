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
        // Restore any existing session
        const { data: { session } } = await db.auth.getSession();
        this.user = session?.user ?? null;

        // Listen for sign-in / sign-out events
        db.auth.onAuthStateChange((_event, session) => {
            this.user = session?.user ?? null;
            this._onAuthChange();
        });
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

            // Update the "Add Strain" button style to reflect login state
            const addBtn = document.getElementById('add-strain-btn');
            if (addBtn) {
                if (this.isAuthenticated) {
                    addBtn.classList.remove('btn-secondary');
                    addBtn.classList.add('btn-primary');
                } else {
                    addBtn.classList.remove('btn-primary');
                    addBtn.classList.add('btn-secondary');
                }
            }
        }
    },
};
