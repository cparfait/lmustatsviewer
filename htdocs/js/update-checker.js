document.addEventListener('DOMContentLoaded', function() {
    if (typeof lmuStatsViewer === 'undefined' || !lmuStatsViewer.versionCheckUrl) {
        return;
    }

    const { appVersion, versionCheckUrl, lang, demo } = lmuStatsViewer;

    const CACHE_KEY = 'lmu_version_check';
    const CACHE_TTL = 3600 * 1000; // 1 heure

    function getCachedVersionData() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const { ts, data } = JSON.parse(raw);
            if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(CACHE_KEY); return null; }
            return data;
        } catch { return null; }
    }

    function setCachedVersionData(data) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
    }

    function appendChangelogLink(container) {
        const url = container.dataset.changelogUrl;
        if (!url) return;
        const label = container.dataset.changelogLabel || 'Changelog';
        const notice = container.querySelector('.update-notice');
        if (!notice) return;
        const p = document.createElement('p');
        p.style.cssText = 'margin:8px 0 0; font-size:.85em; opacity:.8;';
        p.innerHTML = `<a href="${url}" style="text-decoration:none; color:inherit;">📋 ${label}</a>`;
        notice.appendChild(p);
    }

    function renderVersionData(data) {
        if (data && data.latest_version && data.latest_version > appVersion) {
            const configContainer = document.getElementById('update-notification-container');
            if (configContainer) {
                const params = new URLSearchParams({
                    v:   data.latest_version || '',
                    dl:  data.download_url   || '',
                    rel: data.release_url    || '',
                });
                if (demo) params.set('demo', '1');
                const dlBtn = data.download_url
                    ? `<a href="${data.download_url}" class="btn btn-primary" style="font-size:.85em;padding:7px 18px;">⬇️ ${lang.button}</a>`
                    : '';
                configContainer.innerHTML = `
                    <div class="message success update-notice">
                        <strong>🚀 ${lang.title}</strong>
                        <div class="update-summary" style="margin:10px 0 8px;">
                            <div class="version-info">
                                <span class="version-label">${lang.current}</span>
                                <span class="version-number">${appVersion}</span>
                            </div>
                            <div class="version-arrow">→</div>
                            <div class="version-info latest">
                                <span class="version-label">${lang.latest}</span>
                                <span class="version-number">${data.latest_version}</span>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                            ${dlBtn}
                        </div>
                    </div>`;
                appendChangelogLink(configContainer);
            }

            const footerIndicator = document.getElementById('footer-update-indicator');
            if (footerIndicator) {
                const dlAttr = data.download_url ? ` | <a href="${data.download_url}" class="update-indicator" download>⬇️</a>` : '';
                footerIndicator.innerHTML = `
                    <a href="config.php" class="update-indicator" title="${lang.available_short} (v${data.latest_version})">
                        ⚠️ <span class="update-text">${lang.available_short}</span>
                    </a>${dlAttr}
                `;
            }
        } else {
            const configContainer = document.getElementById('update-notification-container');
            if (configContainer) {
                configContainer.innerHTML = `
                    <div class="message info update-notice">
                        <strong>✅ ${lang.no_update_title}</strong><br>
                        ${lang.up_to_date} (<code>${appVersion}</code>)
                    </div>`;
                appendChangelogLink(configContainer);
            }
        }
    }

    const cached = getCachedVersionData();
    if (cached) {
        renderVersionData(cached);
        return;
    }

    fetch(versionCheckUrl)
        .then(response => {
            if (!response.ok) return Promise.reject('Network error');
            return response.json();
        })
        .then(data => {
            setCachedVersionData(data);
            return data;
        })
        .then(renderVersionData)
        .catch(error => {
            console.error('Erreur lors de la vérification de la mise à jour :', error);
            const configContainer = document.getElementById('update-notification-container');
            if (configContainer) {
                configContainer.innerHTML = `
                    <div class="message error update-notice">
                        <strong>${lang.error_title || 'Erreur de mise à jour'}</strong><br>
                        ${lang.error_message || 'Impossible de vérifier les mises à jour. Veuillez vérifier la console de votre navigateur pour les erreurs.'}
                    </div>`;
                appendChangelogLink(configContainer);
            }
        });
});
