document.addEventListener('DOMContentLoaded', function() {
    if (typeof lmuStatsViewer === 'undefined' || !lmuStatsViewer.versionCheckUrl) {
        return;
    }

    const { appVersion, versionCheckUrl, lang } = lmuStatsViewer;
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
                configContainer.innerHTML = `
                    <div class="message success update-notice">
                        <strong>🚀 ${lang.title}</strong><br>
                        ${lang.current} <code>${appVersion}</code><br>
                        ${lang.latest} <code>${data.latest_version}</code><br>
                        <a href="update.php" class="btn btn-secondary" style="margin-top:10px; display:inline-block;">
                            ${lang.button}
                        </a>
                    </div>`;
            }

            const footerIndicator = document.getElementById('footer-update-indicator');
            if (footerIndicator) {
                const dlAttr = data.download_url ? ` | <a href="${data.download_url}" class="update-indicator" download>⬇️</a>` : '';
                footerIndicator.innerHTML = `
                    <a href="update.php" class="update-indicator" title="${lang.available_short} (v${data.latest_version})">
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
            // Stocker en session PHP pour update.php
            return fetch('fetch_version.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })
            .then(proxyResponse => proxyResponse.json())
            .then(proxyResult => {
                if (proxyResult.status !== 'success') {
                    console.error('Failed to store update info via proxy.');
                }
                return data;
            });
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
