/* ==========================================================================
   EXILIUM — UI Animation Layer (purely additive)

   Provides: 3D card tilt, floating particle ambience, one-shot stat
   count-ups, and the navbar scroll state.

   HARD RULES (compatibility contract with the existing app code):
   - Never references App / UI / Auth and never touches app state.
   - Never calls preventDefault / stopPropagation (card onclick must fire).
   - Tilt uses ONE delegated listener on #strain-grid because cards are
     recreated via innerHTML on every render — per-card listeners would die.
   - Tilt only writes the CSS custom properties --tilt-x / --tilt-y, which
     the stylesheet composes with hover lift (--lift) in a single transform.
   - Count-up waits for the app's first real textContent write (via a
     MutationObserver that disconnects immediately), so data flow stays
     owned by the app. All later updates apply instantly.
   - Everything motion-related is gated by prefers-reduced-motion, and
     tilt additionally by (pointer: fine).
   ========================================================================== */

(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');

  /* ------------------------------------------------------------------------
     1. 3D CARD TILT — delegated, rAF-throttled
     ------------------------------------------------------------------------ */
  const tilt = {
    grid: null,
    activeCard: null,
    rafId: 0,
    lastEvent: null,
    bound: false,

    onMove(e) {
      this.lastEvent = e;
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => this.apply());
      }
    },

    apply() {
      this.rafId = 0;
      const e = this.lastEvent;
      if (!e) return;

      const card = e.target && e.target.closest ? e.target.closest('.strain-card') : null;

      if (card !== this.activeCard) this.reset(this.activeCard);

      if (!card || card.classList.contains('removing')) {
        this.activeCard = null;
        return;
      }

      this.activeCard = card;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // x, y in [-0.5, 0.5] → max ±6deg with gain 12
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      card.style.setProperty('--tilt-x', (-y * 12).toFixed(2) + 'deg');
      card.style.setProperty('--tilt-y', (x * 12).toFixed(2) + 'deg');
      card.style.willChange = 'transform';
    },

    reset(card) {
      if (!card) return;
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
      card.style.willChange = '';
    },

    onLeave() {
      this.reset(this.activeCard);
      this.activeCard = null;
      this.lastEvent = null;
    },

    start() {
      if (this.bound) return;
      this.grid = document.getElementById('strain-grid');
      if (!this.grid) return;
      this._move = (e) => this.onMove(e);
      this._leave = () => this.onLeave();
      this.grid.addEventListener('pointermove', this._move, { passive: true });
      this.grid.addEventListener('pointerleave', this._leave, { passive: true });
      this.bound = true;
    },

    stop() {
      if (!this.bound || !this.grid) return;
      this.grid.removeEventListener('pointermove', this._move);
      this.grid.removeEventListener('pointerleave', this._leave);
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      this.onLeave();
      this.bound = false;
    }
  };

  /* ------------------------------------------------------------------------
     2. FLOATING PARTICLES — one canvas, one composited layer
     Sits at z-index 0 (above the mesh gradient, below .container at z 1).
     ------------------------------------------------------------------------ */
  const particles = {
    canvas: null,
    ctx: null,
    items: [],
    rafId: 0,
    lastT: 0,
    running: false,

    targetCount() {
      return window.innerWidth < 768 ? 15 : 28;
    },

    spawn(w, h, randomY) {
      return {
        x: Math.random() * w,
        y: randomY ? Math.random() * h : h + 8,
        r: 0.8 + Math.random() * 1.6,
        speed: 8 + Math.random() * 16,          // px/s upward
        swayAmp: 6 + Math.random() * 14,
        swayFreq: 0.2 + Math.random() * 0.5,    // Hz
        phase: Math.random() * Math.PI * 2,
        alpha: 0.12 + Math.random() * 0.3,
        twinkleFreq: 0.3 + Math.random() * 0.8,
        bright: Math.random() < 0.3              // some lighter green
      };
    },

    resize() {
      if (!this.canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(window.innerWidth * dpr);
      this.canvas.height = Math.round(window.innerHeight * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const n = this.targetCount();
      while (this.items.length > n) this.items.pop();
      while (this.items.length < n) {
        this.items.push(this.spawn(window.innerWidth, window.innerHeight, true));
      }
    },

    frame(now) {
      this.rafId = 0;
      if (!this.running || !this.ctx) return;

      const dt = Math.min((now - this.lastT) / 1000, 0.1);
      this.lastT = now;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const t = now / 1000;
      const ctx = this.ctx;

      ctx.clearRect(0, 0, w, h);

      for (const p of this.items) {
        p.y -= p.speed * dt;
        const x = p.x + Math.sin(t * p.swayFreq * Math.PI * 2 + p.phase) * p.swayAmp;

        if (p.y < -10) {
          Object.assign(p, this.spawn(w, h, false));
          continue;
        }

        const twinkle = 0.65 + 0.35 * Math.sin(t * p.twinkleFreq * Math.PI * 2 + p.phase);
        ctx.globalAlpha = p.alpha * twinkle;
        ctx.fillStyle = p.bright ? 'rgb(94, 232, 145)' : 'rgb(34, 197, 94)';
        ctx.beginPath();
        ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      this.rafId = requestAnimationFrame((n) => this.frame(n));
    },

    resume() {
      if (!this.running || this.rafId) return;
      this.lastT = performance.now();
      this.rafId = requestAnimationFrame((n) => this.frame(n));
    },

    pause() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    },

    start() {
      if (this.canvas) return;
      this.canvas = document.createElement('canvas');
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.cssText =
        'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
      document.body.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.items = [];
      this.resize();

      this._onResize = () => {
        clearTimeout(this._rsT);
        this._rsT = setTimeout(() => this.resize(), 150);
      };
      this._onVis = () => {
        if (document.hidden) this.pause();
        else this.resume();
      };
      window.addEventListener('resize', this._onResize);
      document.addEventListener('visibilitychange', this._onVis);

      this.running = true;
      this.resume();
    },

    stop() {
      this.running = false;
      this.pause();
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVis);
      clearTimeout(this._rsT);
      if (this.canvas) this.canvas.remove();
      this.canvas = null;
      this.ctx = null;
      this.items = [];
    }
  };

  /* ------------------------------------------------------------------------
     3. STAT COUNT-UP — one-shot, observer disconnects on first data write.
     #stat-top-type is text and is skipped. tabular-nums in CSS keeps CLS 0.
     ------------------------------------------------------------------------ */
  function initCountUps() {
    ['stat-total', 'stat-avg', 'stat-avg-thc'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const mo = new MutationObserver(() => {
        mo.disconnect(); // one-shot: later updates from the app apply instantly

        const finalText = el.textContent.trim();
        const m = finalText.match(/^(-?\d+(?:[.,]\d+)?)(.*)$/);
        if (!m) return;

        const num = parseFloat(m[1].replace(',', '.'));
        if (!isFinite(num) || num === 0) return;

        const suffix = m[2] || '';
        const decMatch = m[1].match(/[.,](\d+)/);
        const decimals = decMatch ? decMatch[1].length : 0;
        const comma = m[1].indexOf(',') !== -1;
        const duration = 700;
        const t0 = performance.now();
        let lastWritten = null;

        const step = (now) => {
          // if the app wrote a fresh value mid-animation, yield to it
          if (lastWritten !== null && el.textContent !== lastWritten) return;

          const p = Math.min((now - t0) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);

          if (p < 1) {
            let v = (num * eased).toFixed(decimals);
            if (comma) v = v.replace('.', ',');
            lastWritten = v + suffix;
            el.textContent = lastWritten;
            requestAnimationFrame(step);
          } else {
            el.textContent = finalText; // exact original string
          }
        };
        requestAnimationFrame(step);
      });

      mo.observe(el, { childList: true, characterData: true, subtree: true });

      // safety: never observe forever if no data ever arrives
      setTimeout(() => mo.disconnect(), 15000);
    });
  }

  /* ------------------------------------------------------------------------
     4. NAVBAR SCROLL STATE — class only changes blur/border/background;
     transform stays exclusively owned by .header-hidden (existing app code).
     ------------------------------------------------------------------------ */
  function initNavState() {
    const header = document.querySelector('.header');
    if (!header) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      header.classList.toggle('header-scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', () => {
      if (!raf) raf = requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------------
     BOOT + live reduced-motion handling
     ------------------------------------------------------------------------ */
  function applyMotionPreference() {
    if (reducedMotion.matches) {
      tilt.stop();
      particles.stop();
    } else {
      particles.start();
      if (finePointer.matches) tilt.start();
    }
  }

  function boot() {
    initNavState();
    if (!reducedMotion.matches) initCountUps();
    applyMotionPreference();

    const onChange = () => applyMotionPreference();
    if (typeof reducedMotion.addEventListener === 'function') {
      reducedMotion.addEventListener('change', onChange);
      finePointer.addEventListener('change', onChange);
    } else if (typeof reducedMotion.addListener === 'function') {
      reducedMotion.addListener(onChange);
      finePointer.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
