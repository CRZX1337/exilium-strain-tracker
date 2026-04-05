// ==========================================
// Exilium Tracker — Local Dev Server
// Serves static files + logs visitor IPs to /logs/{ip}.json
// Usage: node server.js
// ==========================================

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const url     = require('url');

const PORT     = 3000;
const LOGS_DIR = path.join(__dirname, 'logs');
const ROOT_DIR = __dirname;

// MIME types for static file serving
const MIME = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.png':  'image/png',
    '.webp': 'image/webp',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
};

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    console.log('[Server] Created logs/ directory');
}

// ── Helper: sanitize IP so it's safe as a filename ──────────────────────────
function safeFilename(ip) {
    // Replace colons (IPv6) and any unsafe chars with underscores
    return ip.replace(/[^a-zA-Z0-9.\-]/g, '_') + '.json';
}

// ── Helper: read body from request ──────────────────────────────────────────
function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end',  () => { resolve(body); });
        req.on('error', reject);
    });
}

// ── Request handler ──────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const parsed  = url.parse(req.url);
    const reqPath = parsed.pathname;

    // CORS for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Pre-flight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // ── POST /log-visit — write IP log file ──────────────────────────────────
    if (req.method === 'POST' && reqPath === '/log-visit') {
        try {
            const raw  = await readBody(req);
            const data = JSON.parse(raw);

            const ip       = (data.ip_address || 'unknown').trim();
            const filename = safeFilename(ip);
            const filepath = path.join(LOGS_DIR, filename);

            // Build this visit's record
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

            // Load existing visits for this IP (or start fresh)
            let visits = [];
            if (fs.existsSync(filepath)) {
                try {
                    visits = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                } catch {
                    visits = [];
                }
            }

            visits.push(visit);

            // Write back (pretty-printed for easy reading)
            fs.writeFileSync(filepath, JSON.stringify(visits, null, 2), 'utf8');

            console.log(`[IP Log] ${ip} → logs/${filename} (${visits.length} visit${visits.length === 1 ? '' : 's'})`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, visits: visits.length }));

        } catch (err) {
            console.error('[IP Log] Error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
    }

    // ── GET — serve static files ──────────────────────────────────────────────
    let filePath = path.join(ROOT_DIR, reqPath === '/' ? 'index.html' : reqPath);

    // Prevent directory traversal outside ROOT_DIR
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // Append index.html for bare directories
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    const ext      = path.extname(filePath).toLowerCase();
    const mimeType = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mimeType });
    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
    console.log('');
    console.log('  🌿 Exilium Tracker running at http://localhost:' + PORT);
    console.log('  📁 IP logs will be saved to: ./logs/{ip}.json');
    console.log('  Press Ctrl+C to stop.');
    console.log('');
});
