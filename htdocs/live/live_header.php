<nav class="nav-bar">
    <a href="<?php echo $back_url; ?>" class="nav-back">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        <?php echo $labels['back']; ?>
    </a>
    <div class="nav-center">
        <span>&#x1F534; <?php echo $labels['live_telemetry']; ?></span>
        <?php if ($demo_mode): ?>
        <span style="background:#f59e0b;color:#000;font-size:0.65rem;font-weight:800;padding:2px 10px;border-radius:999px;letter-spacing:0.1em;text-transform:uppercase;">DÉMO</span>
        <?php endif; ?>
    </div>
    <div style="display:flex;align-items:center;gap:10px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--text-muted);">
            <span class="conn-dot" id="conn-dot"></span>
            <span id="conn-label"><?php echo $labels['waiting']; ?></span>
        </div>
        <button onclick="popOutToScreen()" title="Détacher vers un autre écran" style="background:none;border:none;cursor:pointer;color:var(--text-sec);padding:4px;line-height:0;border-radius:4px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        </button>
        <button id="fs-btn" onclick="toggleFullscreen()" title="Plein écran" style="background:none;border:none;cursor:pointer;color:var(--text-sec);padding:4px;line-height:0;border-radius:4px;">
            <svg id="fs-icon-enter" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
            <svg id="fs-icon-exit" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display:none;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4m0 5H4m5 0L3 3m12 6h5m-5 0V4m0 5l6-6M9 15v5m0-5H4m5 0l-6 6m12-6h5m-5 0v5m0-5l6 6"/></svg>
        </button>
    </div>
</nav>

<div id="flag-banner"></div>

<div class="tabs">
    <button class="tab-btn active" id="tab-live"><?php echo $labels['tab_live']; ?></button>
    <button class="tab-btn" id="tab-standings"><?php echo $labels['tab_standings']; ?></button>
    <button class="tab-btn" id="tab-map"><?php echo $labels['tab_map']; ?></button>
    <button class="tab-btn" id="tab-3d"><?php echo $labels['tab_3d']; ?></button>
</div>

<div id="race-hud" style="grid-template-columns:1fr auto 1fr auto;">
    <div class="hud-block hud-left">
        <span class="hud-label"><?php echo $labels['lap_num'] ?? 'Tour'; ?></span>
        <span class="hud-value" id="hud-lap">—</span>
    </div>
    <div class="hud-block hud-center">
        <div class="hud-track-wrap">
            <span id="hud-flag"></span>
            <span class="hud-track-name" id="hud-track-name">—</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
            <strong id="driver" style="font-size:0.85rem;color:var(--text-pri);">…</strong>
            <span id="vehicle" style="font-size:0.75rem;color:var(--text-sec);">…</span>
            <span class="class-badge" id="class-badge" style="display:none;"></span>
        </div>
        <div class="hud-session-badge" id="hud-session-badge">LIVE</div>
    </div>
    <div class="hud-block hud-right">
        <span class="hud-label"><?php echo $labels['elapsed'] ?? 'Temps écoulé'; ?></span>
        <span class="hud-value" id="hud-time">—:——:——</span>
    </div>
    <div class="hud-block hud-right" style="min-width:80px;">
        <span class="hud-label"><?php echo $labels['last_upd']; ?></span>
        <span id="timestamp" style="font-size:0.85rem;font-weight:700;color:var(--text-sec);">…</span>
    </div>
</div>
