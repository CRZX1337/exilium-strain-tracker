// ==========================================
// IP Tracker Module
// Fetches visitor's IPv4 + geo info, then POSTs to the
// local server which saves logs/{ip}.json
// ==========================================

(async function initIPTracker() {
    try {
        // Step 1: Force IPv4 — api4.ipify.org only resolves over IPv4
        const ipv4Res = await fetch('https://api4.ipify.org?format=json', {
            signal: AbortSignal.timeout(5000)
        });
        if (!ipv4Res.ok) throw new Error(`ipify returned ${ipv4Res.status}`);
        const { ip: ipv4 } = await ipv4Res.json();

        // Step 2: Geo enrichment using the explicit IPv4
        const geoRes = await fetch(`https://ipapi.co/${ipv4}/json/`, {
            signal: AbortSignal.timeout(5000)
        });
        if (!geoRes.ok) throw new Error(`ipapi.co returned ${geoRes.status}`);
        const geo = await geoRes.json();

        // Step 3: Build the log record
        const logEntry = {
            ip_address: ipv4                 || 'unknown',
            country:    geo.country_name     || null,
            city:       geo.city             || null,
            region:     geo.region           || null,
            isp:        geo.org              || null,
            user_agent: navigator.userAgent  || null,
            page_url:   window.location.href || null,
            referrer:   document.referrer    || null,
        };

        // Step 4: POST to local server — it writes logs/{ip}.json
        const res = await fetch('/log-visit', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(logEntry),
            signal:  AbortSignal.timeout(5000)
        });

        const result = await res.json();
        if (result.ok) {
            console.log(`[IP Tracker] Logged ✓ ${logEntry.ip_address} (visit #${result.visits})`);
        } else {
            console.warn('[IP Tracker] Server error:', result.error);
        }

    } catch (err) {
        // Never crash the page over tracking failures
        console.warn('[IP Tracker] Tracking skipped:', err.message);
    }
})();
