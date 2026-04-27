<div id="pane-3d" style="display:none;">
    <div class="card" style="padding:20px;">
        <div class="card-title" style="font-size:1.3rem;margin-bottom:12px;"><?php echo $labels['view_3d'] ?? 'Vue 3D du Circuit'; ?></div>
        <div style="width:100%;aspect-ratio:16/9;position:relative;background:#000;border-radius:8px;overflow:hidden;" id="three-container">
            <div id="three-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:0.9rem;"><?php echo $labels['loading_3d'] ?? 'Chargement de Three.js…'; ?></div>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;align-items:center;">
            <label style="font-size:0.75rem;color:var(--text-sec);"><?php echo $labels['elevation'] ?? 'Élévation'; ?>:</label>
            <input type="range" id="z-scale-slider" min="0" max="200" value="100" style="flex:1;max-width:200px;">
            <span id="z-scale-val" style="font-size:0.75rem;color:var(--text-sec);">1.0x</span>
            <button id="three-reset-cam" style="font-size:0.7rem;padding:4px 10px;border-radius:4px;background:var(--bg-card2);border:1px solid var(--border);color:var(--text-sec);cursor:pointer;"><?php echo $labels['reset_cam'] ?? 'Reset caméra'; ?></button>
        </div>
    </div>
</div>
