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
        <div class="strain-card-header">
          <h3 class="strain-name">${this.escapeHtml(strain.name)}</h3>
          <span class="strain-type-badge ${strain.type.toLowerCase()}">${strain.type}</span>
        </div>
        <div class="strain-stars">
          ${this.renderStars(strain.rating)}
        </div>
        <div class="strain-meta">
          <span class="strain-meta-item"><strong>${strain.thc_content ?? '—'}%</strong> THC</span>
          <span class="strain-meta-item"><strong>${strain.cbd_content ?? '—'}%</strong> CBD</span>
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
        document.body.style.overflow = '';
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

    // --- Show loading spinner ---
    showLoading() {
        document.getElementById('strain-grid').innerHTML = `
      <div class="loading"><div class="spinner"></div></div>
    `;
    },

    // --- Detail modal content ---
    renderDetail(strain) {
        const content = document.getElementById('detail-content');
        content.innerHTML = `
      <div class="strain-card-header" style="margin-bottom:16px">
        <h2 class="strain-name" style="font-size:1.5rem">${this.escapeHtml(strain.name)}</h2>
        <span class="strain-type-badge ${strain.type.toLowerCase()}">${strain.type}</span>
      </div>
      <div class="strain-stars" style="margin-bottom:20px;font-size:20px">
        ${this.renderStars(strain.rating)}
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
      </div>
      ${strain.effects ? `
        <div class="detail-section" style="margin-top:20px">
          <div class="detail-label">Wirkung</div>
          <div class="detail-value">${this.escapeHtml(strain.effects)}</div>
        </div>
      ` : ''}
      ${strain.taste ? `
        <div class="detail-section">
          <div class="detail-label">Geschmack</div>
          <div class="detail-value">${this.escapeHtml(strain.taste)}</div>
        </div>
      ` : ''}
      ${strain.notes ? `
        <div class="detail-section">
          <div class="detail-label">Notizen</div>
          <div class="detail-value">${this.escapeHtml(strain.notes)}</div>
        </div>
      ` : ''}
      <div class="detail-section">
        <div class="detail-label">Hinzugefügt am</div>
        <div class="detail-value">${this.formatDate(strain.created_at)}</div>
      </div>
    `;
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
