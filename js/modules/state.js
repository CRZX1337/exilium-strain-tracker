-/**
 * @fileoverview Shared application state for the Exilium Strain Tracker.
 * This module exports the reactive state object used across all modules.
 */

/**
 * Shared application state object.
 * All modules import this to read/write shared state.
 */
export const state = {
    /** @type {Array<Object>} All strains loaded from database */
    strains: [],
    
    /** @type {Array<Object>} Strains filtered by search/sort criteria */
    filteredStrains: [],
    
    /** @type {boolean} Whether current user is admin */
    isAdmin: false,
    
    /** @type {number} Current form rating (0-5) */
    formRating: 0,
    
    /** @type {string|null} ID of strain being edited */
    editingId: null,
    
    /** @type {string|null} ID of currently open strain detail */
    openStrainId: null,
    
    // Admin panel data
    /** @type {Array<Object>} All strains for admin panel */
    adminStrains: [],
    
    /** @type {Array<Object>} Users for admin panel */
    adminUsers: [],
    
    /** @type {Array<Object>} Images for admin panel */
    adminImages: [],
    
    /** @type {Array<Object>} Activity logs for admin panel */
    adminActivity: [],
    
    /** @type {Object} Activity pagination state */
    activityPagination: {
        page: 1,
        pageSize: 50,
        hasMore: false
    },
    
    // Pending operation flags
    /** @type {boolean} Whether login is only for auth (not adding strain) */
    _loginOnly: false,
    
    /** @type {string|null} ID of pending edit operation */
    _pendingEdit: null,
    
    /** @type {string|null} ID of pending strain deletion */
    _pendingDeleteStrainId: null,
    
    /** @type {string|null} ID of pending user deletion */
    _pendingDeleteUserId: null,
    
    /** @type {string|null} Filename of pending image deletion */
    _pendingDeleteImageName: null,
    
    /** @type {boolean} Whether activity log events are bound */
    _activityLogBound: false,
    
    /** @type {Object|null} Current context menu target */
    _contextTarget: null,

    /** @type {boolean} Flag to remove existing image when editing */
    _removeExistingImage: false,

    /** @type {Object|null} Original strain data for diff tracking */
    _originalStrain: null,

    /** @type {number} Timestamp of last save for rate limiting */
    _lastSaveTime: 0,
};
