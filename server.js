// ==========================================
// Exilium Tracker — Express Server
// Serves static files + logs visitor IPs to /logs/{ip}.json
// Usage: node server.js  (managed by PM2)
// ==========================================

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const PORT     = 3000;
const LOGS_DIR = path.join(__dirname, 'logs');
const app      = express();

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    console.log('[Server] Created logs/ directory');
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// CORS (for local dev)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ── POST /log-visit — write IP log file ─────────────────────────────────────
app.post('/log-visit', (req, res) => {
    try {
        const data     = req.body || {};
        const ip       = (data.ip_address || 'unknown').trim();
        const filename = ip.replace(/[^a-zA-Z0-9.\-]/g, '_') + '.json';
        const filepath = path.join(LOGS_DIR, filename);

        const visit = {
            visited_at: new Date().toISOString(),
            ip_address: ip,
            country:    data.country    || null,
            city:       data.city       || null,
            region:     data.region     || null,
            isp:        data.isp        || null,
            user_agent: data.user_agent || null,
            page_url:   data.page_url   || null,
            referrer:   data.referrer   || null,
        };

        let visits = [];
        if (fs.existsSync(filepath)) {
            try { visits = JSON.parse(fs.readFileSync(filepath, 'utf8')); } catch {}
        }
        visits.push(visit);
        fs.writeFileSync(filepath, JSON.stringify(visits, null, 2), 'utf8');

        console.log(`[IP Log] ${ip} → logs/${filename} (${visits.length} visit${visits.length === 1 ? '' : 's'})`);
        res.json({ ok: true, visits: visits.length });

    } catch (err) {
        console.error('[IP Log] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── Serve static files ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname), {
    index: 'index.html',
    dotfiles: 'ignore',
}));

// ── 404 fallback ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).send('Not found');
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('');
    console.log('  🌿 Exilium Tracker running at http://localhost:' + PORT);
    console.log('  📁 IP logs will be saved to: ./logs/{ip}.json');
    console.log('  Press Ctrl+C to stop.');
    console.log('');
});
