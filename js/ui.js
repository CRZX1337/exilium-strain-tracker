// ==========================================
// UI Rendering Functions
// ==========================================

const UI = {
  // --- Render strain cards into the grid ---
  renderStrains(strains) {
    const grid = document.getElementById('strain-grid');
    if (!strains || strains.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🌿</div>
          <h3>Keine Sorten eingetragen</h3>
          <p>Füge deine erste Sorte hinzu, um deine Sammlung zu starten.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = strains.map((strain, i) => `
      <div class="strain-card" onclick="App.showDetail('${strain.id}')" style="animation-delay: ${i * 0.03}s">
        ${strain.image_url ? `<div class="strain-image-container"><img src="${strain.image_url}" alt="${this.escapeHtml(strain.name)}" class="strain-image" loading="lazy"></div>` : ''}
        <div class="strain-card-header" style="align-items: flex-start; justify-content: space-between;">
          <div style="flex-grow: 1; min-width: 0; padding-right: 12px;">
            <h3 class="strain-name" style="margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(strain.name)}</h3>
            ${strain.medical_name ? `<div class="strain-medical-name" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">${this.escapeHtml(strain.medical_name)}</div>` : ''}
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0;">
            <span class="strain-type-badge ${strain.type.toLowerCase()}">${strain.type}</span>
            <div class="strain-stars" style="display: inline-flex; font-size: 24px; line-height: 1;">
              ${this.renderStars(strain.rating)}
            </div>
          </div>
        </div>
        <div class="strain-meta">
          <span class="strain-meta-item"><strong>${strain.thc_content ?? '—'}%</strong> THC</span>
          <span class="strain-meta-item"><strong>${strain.cbd_content ?? '—'}%</strong> CBD</span>
          ${strain.price ? `<span class="strain-meta-item"><strong>${strain.price}€</strong> PREIS</span>` : ''}
        </div>
        ${strain.effects ? `<p class="strain-effects">${this.escapeHtml(strain.effects)}</p>` : ''}
        <div class="strain-card-footer">
          <span class="strain-date">${this.formatDate(strain.created_at)}</span>
          <div class="strain-actions" onclick="event.stopPropagation()">
            <button onclick="App.editStrain('${strain.id}')" title="Bearbeiten">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="delete" onclick="App.deleteStrain('${strain.id}')" title="Löschen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  },

  // --- Render star icons ---
  renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
      stars += `<span class="star ${i <= rating ? 'filled' : ''}">★</span>`;
    }
    return stars;
  },

  // --- Render star rating input ---
  renderStarInput(containerId, currentRating = 0) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `star-btn ${i <= currentRating ? 'filled' : ''}`;
      btn.textContent = '★';
      btn.onclick = () => {
        App.formRating = i;
        this.renderStarInput(containerId, i);
      };
      container.appendChild(btn);
    }
  },

  // --- Update stats bar ---
  updateStats(strains) {
    const totalEl = document.getElementById('stat-total');
    const avgEl = document.getElementById('stat-avg');
    const topTypeEl = document.getElementById('stat-top-type');
    const avgThcEl = document.getElementById('stat-avg-thc');

    totalEl.textContent = strains.length;

    if (strains.length === 0) {
      avgEl.textContent = '—';
      topTypeEl.textContent = '—';
      avgThcEl.textContent = '—';
      return;
    }

    const avgRating = (strains.reduce((sum, s) => sum + (s.rating || 0), 0) / strains.length).toFixed(1);
    avgEl.textContent = avgRating;

    const typeCounts = {};
    strains.forEach(s => {
      typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
    });
    const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
    topTypeEl.textContent = topType ? topType[0] : '—';

    const thcStrains = strains.filter(s => s.thc_content != null);
    const avgThc = thcStrains.length > 0
      ? (thcStrains.reduce((sum, s) => sum + s.thc_content, 0) / thcStrains.length).toFixed(1) + '%'
      : '—';
    avgThcEl.textContent = avgThc;
  },

  // --- Show/hide modals ---
  showModal(id) {
    const overlay = document.getElementById(id);
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  hideModal(id) {
    const overlay = document.getElementById(id);
    overlay.classList.remove('active');
    // Wait only for the modal transition to complete before unlocking scroll
    setTimeout(() => {
      document.body.style.overflow = '';
    }, 500);
  },

  // --- Image Lightbox ---
  openLightbox(url) {
    document.getElementById('lightbox-image').src = url;
    this.showModal('lightbox-modal');
  },

  // --- Toast notifications ---
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : '✗'}</span>
      <span>${this.escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },

  // --- Show loading skeleton loaders ---
  showLoading() {
    const grid = document.getElementById('strain-grid');
    const skeletonCount = 6; // Show 6 skeleton cards
    let skeletonHTML = '';
    
    for (let i = 0; i < skeletonCount; i++) {
      skeletonHTML += `
        <div class="skeleton-card" style="animation-delay: ${i * 0.05}s">
          <div class="skeleton-card-image"></div>
          <div class="skeleton-card-header">
            <div class="skeleton-card-title" style="flex: 1;"></div>
            <div class="skeleton-card-badge"></div>
          </div>
          <div class="skeleton-card-meta">
            <div class="skeleton-card-meta-item"></div>
            <div class="skeleton-card-meta-item"></div>
            <div class="skeleton-card-meta-item"></div>
          </div>
          <div class="skeleton-card-text" style="height: 40px;"></div>
          <div class="skeleton-card-text" style="width: 60%;"></div>
        </div>
      `;
    }
    
    grid.innerHTML = skeletonHTML;
  },

  // --- Detail modal content ---
  renderDetail(strain) {
    const content = document.getElementById('detail-content');
    content.innerHTML = `
      ${strain.image_url ? `
        <div class="detail-image-container" style="margin: -24px -28px 24px -28px; height: 260px; overflow: hidden; border-radius: var(--radius-xl) var(--radius-xl) 0 0; position: relative;">
          <img src="${strain.image_url}" alt="${this.escapeHtml(strain.name)}" class="detail-image-zoom" onclick="UI.openLightbox('${strain.image_url}')" style="width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; transition: transform var(--transition-slow);">
          <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 50%, var(--bg-secondary) 100%); pointer-events: none;"></div>
        </div>
      ` : ''}
      <div class="strain-card-header" style="margin-bottom:20px; align-items: flex-start; justify-content: space-between;">
        <div style="flex-grow: 1; padding-right: 16px;">
          <h2 class="strain-name" style="font-size:1.5rem; margin: 0;">${this.escapeHtml(strain.name)}</h2>
          ${strain.medical_name ? `<div class="strain-medical-name" style="font-size: 1rem; color: var(--text-secondary); margin-top: 6px;">${this.escapeHtml(strain.medical_name)}</div>` : ''}
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px; flex-shrink: 0;">
          <span class="strain-type-badge ${strain.type.toLowerCase()}">${strain.type}</span>
          <div class="strain-stars" style="font-size:32px; display: inline-flex; line-height: 1;">
            ${this.renderStars(strain.rating)}
          </div>
        </div>
      </div>
      <div class="detail-meta-grid">
        <div class="detail-meta-item">
          <div class="value">${strain.thc_content ?? '—'}%</div>
          <div class="label">THC</div>
        </div>
        <div class="detail-meta-item">
          <div class="value">${strain.cbd_content ?? '—'}%</div>
          <div class="label">CBD</div>
        </div>
        <div class="detail-meta-item">
          <div class="value">${strain.rating || '—'}/5</div>
          <div class="label">Bewertung</div>
        </div>
        ${strain.price ? `
        <div class="detail-meta-item">
          <div class="value" style="display: flex; align-items: baseline; justify-content: center; gap: 2px;">${strain.price}€<span style="font-size: 0.8rem; font-weight: 500; color: var(--text-secondary);">/g</span></div>
          <div class="label">PREIS</div>
        </div>
        ` : ''}
      </div>
      ${strain.importer ? `
        <div class="detail-section" style="margin-top:20px; display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:12px 16px; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
          <div class="detail-label" style="margin:0;">Importeur</div>
          <div class="detail-value" style="font-weight:600; color:var(--text-primary);">${this.escapeHtml(strain.importer)}</div>
        </div>
      ` : ''}
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
        ${strain.effects ? `
          <div class="detail-section" style="margin: 0;">
            <div class="detail-label">Wirkung</div>
            <div class="detail-value">${this.escapeHtml(strain.effects)}</div>
          </div>
        ` : ''}
        ${strain.taste ? `
          <div class="detail-section" style="margin: 0;">
            <div class="detail-label">Geschmack</div>
            <div class="detail-value">${this.escapeHtml(strain.taste)}</div>
          </div>
        ` : ''}
        ${strain.notes ? `
          <div class="detail-section" style="margin: 0;">
            <div class="detail-label">Notizen</div>
            <div class="detail-value">${this.escapeHtml(strain.notes)}</div>
          </div>
        ` : ''}
        <div class="detail-section" style="margin: 0;">
          <div class="detail-label">Hinzugefügt am</div>
          <div class="detail-value">${this.formatDate(strain.created_at)}</div>
        </div>
      </div>
    `;
  },

  // --- Initialize Custom Cursor ---
  initCustomCursor() {
    const cursorDot = document.getElementById('cursor-dot');
    const cursorHalo = document.getElementById('cursor-halo');

    // Don't initialize on touch devices
    if (window.matchMedia('(hover: none)').matches) return;

    // Track mouse movement
    document.addEventListener('mousemove', (e) => {
      cursorDot.style.left = e.clientX + 'px';
      cursorDot.style.top = e.clientY + 'px';
      cursorHalo.style.left = e.clientX + 'px';
      cursorHalo.style.top = e.clientY + 'px';
    });

    // Add active state to interactive elements
    const interactiveElements = document.querySelectorAll('button, a, [onclick], input, select, textarea, .custom-select-wrapper, .custom-select-trigger, .custom-select-option');
    
    interactiveElements.forEach(el => {
      el.addEventListener('mouseenter', () => {
        cursorHalo.classList.add('active');
      });
      
      el.addEventListener('mouseleave', () => {
        cursorHalo.classList.remove('active');
      });

      el.addEventListener('click', () => {
        cursorHalo.classList.add('pulse');
        setTimeout(() => {
          cursorHalo.classList.remove('pulse');
        }, 400);
      });
    });

    // Ensure custom cursor shows on input/select focus
    document.addEventListener('focusin', (e) => {
      if (e.target.matches('input, select, textarea, .custom-select-trigger')) {
        cursorHalo.classList.add('active');
        
        // Apply text-input styling for text inputs
        if (e.target.matches('input[type="text"], input[type="email"], input[type="password"], input[type="number"], textarea')) {
          cursorDot.classList.add('text-input');
          cursorHalo.classList.remove('dropdown');
          cursorHalo.classList.add('text-input');
        }
        // Apply dropdown styling for select/dropdown
        else if (e.target.matches('select, .custom-select-trigger')) {
          cursorDot.classList.remove('text-input');
          cursorHalo.classList.remove('text-input');
          cursorHalo.classList.add('dropdown');
        }
      }
    });

    document.addEventListener('focusout', (e) => {
      if (e.target.matches('input, select, textarea, .custom-select-trigger')) {
        cursorHalo.classList.remove('active');
        cursorDot.classList.remove('text-input');
        cursorHalo.classList.remove('text-input', 'dropdown');
      }
    });

    // Handle dynamic custom select options
    document.addEventListener('mouseenter', (e) => {
      if (e.target.matches('.custom-select-option')) {
        cursorHalo.classList.add('active', 'dropdown');
        cursorDot.classList.remove('text-input');
        cursorHalo.classList.remove('text-input');
      }
    }, true);

    document.addEventListener('mouseleave', (e) => {
      if (e.target.matches('.custom-select-option')) {
        cursorHalo.classList.remove('active', 'dropdown');
      }
    }, true);

    // Hide cursor when leaving window
    document.addEventListener('mouseleave', () => {
      cursorDot.style.opacity = '0';
      cursorHalo.style.opacity = '0';
    });

    document.addEventListener('mouseenter', () => {
      cursorDot.style.opacity = '1';
      cursorHalo.style.opacity = '0.6';
    });

    // Initialize mobile touch ripples
    this.initTouchRipples();
  },

  // --- Initialize Mobile Touch Ripples ---
  initTouchRipples() {
    const interactiveElements = document.querySelectorAll('button, a, [onclick]');
    
    interactiveElements.forEach(el => {
      el.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        const rect = el.getBoundingClientRect();
        
        // Create ripple element
        const ripple = document.createElement('div');
        ripple.className = 'touch-ripple';
        ripple.style.left = (touch.clientX - rect.left) + 'px';
        ripple.style.top = (touch.clientY - rect.top) + 'px';
        
        el.appendChild(ripple);
        
        // Remove ripple after animation
        setTimeout(() => {
          ripple.remove();
        }, 600);
      });
    });
  },

  // --- Custom Select Dropdowns ---
  initCustomSelects() {
    document.querySelectorAll('select.form-select, select.filter-select').forEach(select => {
      // Avoid wrapping twice
      if (select.closest('.custom-select-wrapper')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper';
      select.parentNode.insertBefore(wrapper, select);
      
      // Move original select inside wrapper and hide it
      select.style.display = 'none';
      wrapper.appendChild(select);

      const trigger = document.createElement('div');
      trigger.className = 'custom-select-trigger';
      
      const selectedItem = select.options[select.selectedIndex];
      const triggerText = document.createElement('span');
      triggerText.textContent = selectedItem ? selectedItem.text : select.options[0].text;
      
      const icon = document.createElement('div');
      icon.innerHTML = `<svg class="custom-select-arrow" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      
      trigger.appendChild(triggerText);
      trigger.appendChild(icon);
      
      const optionsContainer = document.createElement('div');
      optionsContainer.className = 'custom-select-options';

      Array.from(select.options).forEach(option => {
        // Skip entirely placeholder options if we are in the filter context, 
        // to match native behavior (mostly they just show "Alle Typen").
        const customOption = document.createElement('div');
        customOption.className = 'custom-select-option';
        if (option.selected) customOption.classList.add('selected');
        customOption.textContent = option.text;
        customOption.dataset.value = option.value;
        
        customOption.addEventListener('click', (e) => {
          e.stopPropagation();
          // Update native select
          select.value = customOption.dataset.value;
          // Dispatch change event for filtering logic
          select.dispatchEvent(new Event('change'));
          
          // Update custom UI
          triggerText.textContent = customOption.textContent;
          optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => opt.classList.remove('selected'));
          customOption.classList.add('selected');
          
          wrapper.classList.remove('open');
        });
        
        optionsContainer.appendChild(customOption);
      });

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close all other open selects
        document.querySelectorAll('.custom-select-wrapper').forEach(w => {
          if (w !== wrapper) w.classList.remove('open');
        });
        wrapper.classList.toggle('open');
      });

      wrapper.appendChild(trigger);
      wrapper.appendChild(optionsContainer);
    });

    // Close options when clicking outside
    document.addEventListener('click', () => {
      document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
        wrapper.classList.remove('open');
      });
    });
  },

  // --- Helpers ---
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
};
