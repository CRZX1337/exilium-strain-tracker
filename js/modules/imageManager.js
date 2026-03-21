/**
 * @fileoverview Image Manager module for the Exilium Strain Tracker.
 * Handles image preview functionality, admin image management, and file operations.
 */

import { state } from './state.js';
import { UI } from '../ui.js';

export const ImageManager = {
    /**
     * Handle image file selection and preview generation.
     * @param {HTMLInputElement} input - The file input element
     */
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

    /**
     * Update the image preview UI with the selected image.
     * @param {string} src - Image source (data URL or URL)
     * @param {string} name - Image filename for display
     */
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

    /**
     * Remove the image preview and reset the file input.
     */
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

    /**
     * Load all images from storage for the admin panel.
     */
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

            state.adminImages = (files || []).map(file => {
                const { data } = db.storage.from('strain-images').getPublicUrl(file.name);
                const publicUrl = data.publicUrl;
                return {
                    ...file,
                    publicUrl,
                    isUsed: usedUrls.has(publicUrl)
                };
            });

            // Update stats
            const total = state.adminImages.length;
            const orphaned = state.adminImages.filter(img => !img.isUsed).length;
            document.getElementById('total-images').textContent = `${total} Bilder`;
            document.getElementById('orphaned-images').textContent = `${orphaned} ungenutzt`;

            this.renderAdminImages();
        } catch (err) {
            console.error('Error loading images:', err);
            list.innerHTML = '<p class="empty-state">Fehler beim Laden der Bilder</p>';
        }
    },

    /**
     * Render images in the admin panel grid.
     */
    renderAdminImages() {
        const list = document.getElementById('admin-images-list');
        
        if (!state.adminImages || state.adminImages.length === 0) {
            list.innerHTML = '<p class="empty-state">Keine Bilder vorhanden</p>';
            return;
        }

        list.innerHTML = state.adminImages.map(img => `
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

    /**
     * View image in lightbox modal.
     * @param {string} url - Image URL to display
     */
    viewImage(url) {
        document.getElementById('lightbox-image').src = url;
        UI.showModal('lightbox-modal');
    },

    /**
     * Show delete confirmation modal for an image.
     * @param {string} fileName - Name of the file to delete
     */
    showDeleteImageConfirm(fileName) {
        state._pendingDeleteImageName = fileName;
        
        const confirmBtn = document.getElementById('confirm-delete-image-btn');
        confirmBtn.onclick = () => this.confirmDeleteImage();
        
        UI.showModal('delete-image-confirm-modal');
    },

    /**
     * Confirm and execute image deletion.
     */
    async confirmDeleteImage() {
        const fileName = state._pendingDeleteImageName;
        if (!fileName) return;
        
        UI.hideModal('delete-image-confirm-modal');
        state._pendingDeleteImageName = null;

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
    },

    /**
     * Legacy deleteImage method - redirects to modal confirmation.
     * @param {string} fileName - Name of the file to delete
     */
    async deleteImage(fileName) {
        this.showDeleteImageConfirm(fileName);
    },

    /**
     * Format file size in human-readable format.
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size string
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
