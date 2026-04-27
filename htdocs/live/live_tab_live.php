<div id="pane-live">
    <div class="live-grid" style="grid-template-columns:1fr 1fr 2fr;">

        <div class="card" id="f1-gauge-card" style="text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 8px 6px;">
            <div id="gear" style="font-size:2.6rem;font-weight:900;line-height:1;color:#00aaff;">N</div>
            <div class="f1-gauge-wrap" style="max-width:180px;height:130px;">
                <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid meet">
                    <path class="arc-bg" d="M 20 180 A 130 130 0 0 1 280 180" stroke-width="18"/>
                    <path id="arc-speed" class="arc-speed" d="M 20 180 A 130 130 0 0 1 280 180" stroke-dasharray="408" stroke-dashoffset="408"/>
                </svg>
                <div class="f1-gauge-center" style="top:50%;">
                    <div class="f1-gauge-rpm" style="font-size:0.8rem;"><span id="rpm">0</span> RPM</div>
                    <div class="f1-gauge-speed-label"><span id="speed" style="font-size:1.4rem;font-weight:900;color:#00aaff;">0</span> KM/H</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center;margin-top:2px;width:100%;max-width:180px;">
                <div><span class="pedal-lbl" style="font-size:0.5rem;"><?php echo $labels['water']; ?></span><div id="water-temp" class="tire-val" style="font-size:0.7rem;">0°C</div></div>
                <div><span class="pedal-lbl" style="font-size:0.5rem;"><?php echo $labels['oil']; ?></span><div id="oil-temp" class="tire-val" style="font-size:0.7rem;">0°C</div></div>
                <div><span class="pedal-lbl" style="font-size:0.5rem;"><?php echo $labels['max']; ?></span><div id="max-rpm" class="tire-val" style="font-size:0.7rem;">10000</div></div>
            </div>
        </div>

        <div class="card" style="display:flex;gap:16px;padding:10px 14px;align-items:center;justify-content:center;">
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-width:120px;">
                <div style="text-align:center;line-height:1;">
                    <span style="font-size:2rem;font-weight:900;color:var(--text-sec);">P</span><span id="position" style="font-size:5rem;font-weight:900;line-height:1;">0</span>
                </div>
                <div id="class-pos-wrap" style="display:none;font-size:0.65rem;font-weight:700;padding:2px 10px;border-radius:999px;background:var(--bg-card2);"><span id="class-pos-val"></span></div>
                <div class="steering-wrap" style="gap:2px;flex-direction:row;align-items:center;">
                    <div class="steering-wheel" style="width:44px;height:44px;">
                        <img id="steering-img" src="" alt="wheel" style="width:100%;height:100%;object-fit:contain;transform:rotate(0deg);transition:transform 0.05s;display:none;">
                        <svg id="steering-svg-fallback" viewBox="0 0 120 120" style="width:100%;height:100%;transform:rotate(0deg);">
                            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--text-sec)" stroke-width="8"/>
                            <circle cx="60" cy="60" r="18" fill="none" stroke="var(--text-sec)" stroke-width="4"/>
                            <line x1="60" y1="8" x2="60" y2="42" stroke="var(--text-sec)" stroke-width="5" stroke-linecap="round"/>
                            <line x1="12" y1="85" x2="45" y2="70" stroke="var(--text-sec)" stroke-width="5" stroke-linecap="round"/>
                            <line x1="108" y1="85" x2="75" y2="70" stroke="var(--text-sec)" stroke-width="5" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <span class="steering-val" id="steering-val" style="font-size:0.6rem;">0%</span>
                </div>
                <div id="pos-gaps" style="display:none;width:100%;margin-top:4px;padding-top:4px;border-top:1px solid var(--border);">
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.9rem;padding:2px 0;">
                        <span style="color:var(--text-muted);"><?php echo $labels['vs_leader']; ?></span>
                        <span id="gap-to-leader" style="font-weight:900;font-size:1.1rem;color:#f87171;">—</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.9rem;padding:2px 0;">
                        <span style="color:var(--text-muted);"><?php echo $labels['gap_ahead']; ?></span>
                        <span id="gap-to-ahead" style="font-weight:900;font-size:1.1rem;color:#fb923c;">—</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="card" style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;">
            <div class="card-title" style="font-size:1rem;margin-bottom:0;"><?php echo $labels['chrono']; ?></div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:0 6px;font-size:1.1rem;line-height:2;">
                <span class="text-sec"><?php echo $labels['current_lap']; ?>:</span> <strong id="lap-time">0:00.000</strong>
                <span class="text-sec"><?php echo $labels['last_lap']; ?>:</span> <strong id="last-lap">—:——.———</strong>
                <span class="text-sec"><?php echo $labels['best_lap']; ?>:</span> <strong id="best-lap" style="color:#e5a00d;">—:——.———</strong>
            </div>
            <div style="padding-top:3px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;">
                <div class="delta-val" id="delta-val" style="font-size:1.6rem;">—</div>
                <div class="delta-bar-track" style="flex:1;">
                    <div class="delta-bar-center"></div>
                    <div class="delta-bar-fill" id="delta-bar-fill"></div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center;padding-top:3px;border-top:1px solid var(--border);">
                <div><span class="pedal-lbl">S1</span><div id="p-s1" class="tire-val" style="font-size:1.1rem;">——</div></div>
                <div><span class="pedal-lbl">S2</span><div id="p-s2" class="tire-val" style="font-size:1.1rem;">——</div></div>
                <div><span class="pedal-lbl">S3</span><div id="p-s3" class="tire-val" style="font-size:1.1rem;">——</div></div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;padding-top:3px;border-top:1px solid var(--border);">
                <span class="pedal-lbl"><?php echo $labels['sectors']; ?>:</span>
                <div id="s1-dot" class="sector-dot"></div>
                <div id="s2-dot" class="sector-dot"></div>
                <div id="s3-dot" class="sector-dot"></div>
            </div>
        </div>

    </div>

    <div class="live-grid" style="grid-template-columns:1fr 1fr 1fr 1fr;margin-top:10px;">

        <div class="card" style="padding:8px 10px;display:flex;flex-direction:column;gap:4px;">
            <div class="card-title" style="margin-bottom:0;font-size:0.75rem;"><?php echo $labels['fuel']; ?></div>
            <div class="fuel-track" style="height:18px;"><div class="fuel-fill" id="fuel" style="width:0%"></div><div class="fuel-label" style="font-size:0.7rem;"><span id="fuel-text">0.0</span> L</div></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;font-size:0.7rem;text-align:center;">
                <div><div class="stint-lbl" style="font-size:0.5rem;"><?php echo $labels['stint_lap'] ?? 'Stint'; ?></div><div class="stint-val" id="stint-lap" style="font-size:0.75rem;">0</div></div>
                <div><div class="stint-lbl" style="font-size:0.5rem;"><?php echo $labels['conso']; ?></div><div class="stint-val" id="stint-conso" style="font-size:0.75rem;">0.00 L</div></div>
                <div><div class="stint-lbl" style="font-size:0.5rem;"><?php echo $labels['remaining'] ?? 'Reste'; ?></div><div class="stint-val" id="stint-remaining" style="color:#22c55e;font-size:0.75rem;">0</div></div>
                <div><div class="stint-lbl" style="font-size:0.5rem;"><?php echo $labels['pit_window'] ?? 'Pit'; ?></div><div class="stint-val" id="stint-pit" style="font-size:0.75rem;">—</div></div>
            </div>
            <canvas id="fuel-sparkline" class="fuel-sparkline" width="400" height="40" style="height:24px;"></canvas>
        </div>

        <div class="card" style="padding:8px 10px;">
            <div class="card-title" style="margin-bottom:4px;font-size:0.75rem;"><?php echo $labels['pedals']; ?></div>
            <div style="display:flex;gap:10px;align-items:center;">
                <div style="display:flex;gap:8px;align-items:flex-end;flex-shrink:0;">
                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                        <span class="pedal-lbl" style="color:#22c55e;font-size:0.5rem;"><?php echo $labels['throttle_input']; ?></span>
                        <div style="width:28px;height:70px;background:var(--bg-card2);border-radius:5px;position:relative;overflow:hidden;border:1px solid var(--border);">
                            <div class="pedal-bar-fill throttle" id="pedal-throttle" style="height:0%"></div>
                        </div>
                        <span class="pedal-bar-val" id="pedal-throttle-val" style="color:#22c55e;font-size:0.7rem;">0%</span>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                        <span class="pedal-lbl" style="color:#ef4444;font-size:0.5rem;"><?php echo $labels['brake_input']; ?></span>
                        <div style="width:28px;height:70px;background:var(--bg-card2);border-radius:5px;position:relative;overflow:hidden;border:1px solid var(--border);">
                            <div class="pedal-bar-fill brake" id="pedal-brake" style="height:0%"></div>
                        </div>
                        <span class="pedal-bar-val" id="pedal-brake-val" style="color:#ef4444;font-size:0.7rem;">0%</span>
                    </div>
                </div>
                <div style="flex:1;min-width:0;">
                    <span class="pedal-lbl" style="font-size:0.5rem;"><?php echo $labels['history']; ?></span>
                    <canvas id="sparkline-canvas" class="sparkline-canvas" width="400" height="70" style="height:70px;"></canvas>
                </div>
            </div>
        </div>

        <div class="card" style="padding:8px 10px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
            <div class="card-title" style="margin-bottom:0;font-size:0.75rem;"><?php echo $labels['damage']; ?> <span id="damage-total" style="font-weight:900;">0</span>%</div>
            <div id="car-damage-svg" style="width:100%;max-width:140px;">
                <svg viewBox="0 0 200 100">
                    <path class="dz" d="M50 20 L150 20 L150 80 L50 80 Z"/>
                    <path id="dz-front"  class="dz" d="M50 0  L150 0  L150 20 L50 20 Z"/>
                    <path id="dz-rear"   class="dz" d="M50 80 L150 80 L150 100 L50 100 Z"/>
                    <path id="dz-left"   class="dz" d="M20 20 L50 20 L50 80 L20 80 Z"/>
                    <path id="dz-right"  class="dz" d="M150 20 L180 20 L180 80 L150 80 Z"/>
                    <path id="dz-fl"     class="dz" d="M20 0  L50 0  L50 20 L20 20 Z"/>
                    <path id="dz-fr"     class="dz" d="M150 0 L180 0 L180 20 L150 20 Z"/>
                    <path id="dz-rl"     class="dz" d="M20 80 L50 80 L50 100 L20 100 Z"/>
                    <path id="dz-rr"     class="dz" d="M150 80 L180 80 L180 100 L150 100 Z"/>
                </svg>
            </div>
        </div>

        <div class="card" style="padding:8px 10px;">
            <div class="card-title" style="margin-bottom:4px;font-size:0.75rem;"><?php echo $labels['weather']; ?></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;text-align:center;">
                <div><span class="pedal-lbl" style="font-size:0.5rem;"><?php echo $labels['air']; ?></span><div id="air-temp" class="tire-val" style="font-size:0.8rem;">0°C</div></div>
                <div><span class="pedal-lbl" style="font-size:0.5rem;"><?php echo $labels['track_t']; ?></span><div id="track-temp" class="tire-val" style="font-size:0.8rem;">0°C</div></div>
                <div><span class="pedal-lbl" style="font-size:0.5rem;"><?php echo $labels['wind']; ?></span><div id="wind-speed" class="tire-val" style="font-size:0.8rem;">0 km/h</div></div>
                <div><span class="pedal-lbl" style="font-size:0.5rem;"><?php echo $labels['condition']; ?></span><div id="track-status" class="tire-val" style="font-size:0.8rem;">…</div></div>
            </div>
        </div>

    </div>

    <div class="live-grid" style="margin-top:10px;">
        <div class="card full-row">
            <div class="card-title"><?php echo $labels['tires']; ?></div>
            <div class="tires-grid">
                <div class="tire-card" id="t-fl">
                    <div class="tire-name">AVG <span class="wear-badge" id="fl-wear">100%</span></div>
                    <div class="tire-row"><div><span class="tire-lbl"><?php echo $labels['tire_temp']; ?></span><span id="fl-temp" class="tire-val">0°C</span></div><div><span class="tire-lbl"><?php echo $labels['brake']; ?></span><span id="fl-bt" class="tire-val">0°C</span></div></div>
                    <div class="tire-pres"><span class="tire-lbl"><?php echo $labels['pressure']; ?></span><span id="fl-pres" class="tire-val" style="font-size:0.85rem;">0.0 kPa</span></div>
                </div>
                <div class="tire-card" id="t-fr">
                    <div class="tire-name">AVD <span class="wear-badge" id="fr-wear">100%</span></div>
                    <div class="tire-row"><div><span class="tire-lbl"><?php echo $labels['tire_temp']; ?></span><span id="fr-temp" class="tire-val">0°C</span></div><div><span class="tire-lbl"><?php echo $labels['brake']; ?></span><span id="fr-bt" class="tire-val">0°C</span></div></div>
                    <div class="tire-pres"><span class="tire-lbl"><?php echo $labels['pressure']; ?></span><span id="fr-pres" class="tire-val" style="font-size:0.85rem;">0.0 kPa</span></div>
                </div>
                <div class="tire-card" id="t-rl">
                    <div class="tire-name">ARG <span class="wear-badge" id="rl-wear">100%</span></div>
                    <div class="tire-row"><div><span class="tire-lbl"><?php echo $labels['tire_temp']; ?></span><span id="rl-temp" class="tire-val">0°C</span></div><div><span class="tire-lbl"><?php echo $labels['brake']; ?></span><span id="rl-bt" class="tire-val">0°C</span></div></div>
                    <div class="tire-pres"><span class="tire-lbl"><?php echo $labels['pressure']; ?></span><span id="rl-pres" class="tire-val" style="font-size:0.85rem;">0.0 kPa</span></div>
                </div>
                <div class="tire-card" id="t-rr">
                    <div class="tire-name">ARD <span class="wear-badge" id="rr-wear">100%</span></div>
                    <div class="tire-row"><div><span class="tire-lbl"><?php echo $labels['tire_temp']; ?></span><span id="rr-temp" class="tire-val">0°C</span></div><div><span class="tire-lbl"><?php echo $labels['brake']; ?></span><span id="rr-bt" class="tire-val">0°C</span></div></div>
                    <div class="tire-pres"><span class="tire-lbl"><?php echo $labels['pressure']; ?></span><span id="rr-pres" class="tire-val" style="font-size:0.85rem;">0.0 kPa</span></div>
                </div>
            </div>
        </div>
    </div>
</div>
