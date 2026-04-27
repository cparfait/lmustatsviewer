let lastStandings = null;
let lastLayout = null;
let lastTrackPoints = null;
let lastTs = 0, noDataSince = null, sessionId = null, fuelCap = 75;
let _stintStartLap = 0, _prevLap = 0;
const _sparklineHistory = { throttle: [], brake: [] };
const _SPARKLINE_MAX = 25;
const _fuelHistory = [];
const _FUEL_HIST_MAX = 40;
const _trackHeatmap = [];
const _HEATMAP_MAX = 2000;

const $ = id => document.getElementById(id);
const dom = {
    statusOverlay: $('status-overlay'), statusMsg: $('status-msg'),
    connDot: $('conn-dot'), connLabel: $('conn-label'),
    flagOverlay: $('flag-overlay'), flagBanner: $('flag-banner'),
    speed: $('speed'), gear: $('gear'),
    arcSpeed: $('arc-speed'),
    rpm: $('rpm'), maxRpm: $('max-rpm'), f1GaugeCard: $('f1-gauge-card'),
    fuel: $('fuel'), fuelText: $('fuel-text'),
    damageTotal: $('damage-total'),
    dz: { front:$('dz-front'), rear:$('dz-rear'), left:$('dz-left'), right:$('dz-right'), fl:$('dz-fl'), fr:$('dz-fr'), rl:$('dz-rl'), rr:$('dz-rr') },
    airTemp: $('air-temp'), trackTemp: $('track-temp'), windSpeed: $('wind-speed'), trackStatus: $('track-status'),
    waterTemp: $('water-temp'), oilTemp: $('oil-temp'),
    driver: $('driver'), vehicle: $('vehicle'),
    classBadge: $('class-badge'),
    position: $('position'), classPosWrap: $('class-pos-wrap'), classPosVal: $('class-pos-val'),
    posGaps: $('pos-gaps'), gapToLeader: $('gap-to-leader'), gapToAhead: $('gap-to-ahead'),
    lapTime: $('lap-time'), deltaVal: $('delta-val'), deltaBarFill: $('delta-bar-fill'),
    lastLap: $('last-lap'), bestLap: $('best-lap'),
    pS1: $('p-s1'), pS2: $('p-s2'), pS3: $('p-s3'),
    timestamp: $('timestamp'),
    s1Dot: $('s1-dot'), s2Dot: $('s2-dot'), s3Dot: $('s3-dot'),
    hudLap: $('hud-lap'), hudTime: $('hud-time'), hudFlag: $('hud-flag'),
    hudTrackName: $('hud-track-name'), hudSessionBadge: $('hud-session-badge'),
    standingsBody: $('standings-body'), trackMap: $('track-map'), mapLegend: $('map-legend'),
    pedalThrottle: $('pedal-throttle'), pedalBrake: $('pedal-brake'),
    pedalThrottleVal: $('pedal-throttle-val'), pedalBrakeVal: $('pedal-brake-val'),
    sparklineCanvas: $('sparkline-canvas'),
    steeringSvg: $('steering-svg-fallback'), steeringVal: $('steering-val'),
    steeringImg: $('steering-img'),
    stintLap: $('stint-lap'), stintConso: $('stint-conso'), stintRemaining: $('stint-remaining'), stintPit: $('stint-pit'),
    fuelSparkline: $('fuel-sparkline'),
    tires: {
        fl:{card:$('t-fl'),temp:$('fl-temp'),wear:$('fl-wear'),bt:$('fl-bt'),pres:$('fl-pres')},
        fr:{card:$('t-fr'),temp:$('fr-temp'),wear:$('fr-wear'),bt:$('fr-bt'),pres:$('fr-pres')},
        rl:{card:$('t-rl'),temp:$('rl-temp'),wear:$('rl-wear'),bt:$('rl-bt'),pres:$('rl-pres')},
        rr:{card:$('t-rr'),temp:$('rr-temp'),wear:$('rr-wear'),bt:$('rr-bt'),pres:$('rr-pres')},
    },
};

const fmtTime = (s, hours=false, noMs=false) => {
    if (!s || isNaN(s) || s <= 0) return noMs ? '--:--' : '--:--.---';
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sc=Math.floor(s%60), ms=Math.round((s%1)*1000);
    if (hours) return `${h}:${p2(m)}:${p2(sc)}`;
    if (noMs)  return `${m}:${p2(sc)}`;
    return `${m}:${p2(sc)}.${p3(ms)}`;
};
const fmtSec = s => (!s||isNaN(s)||s<=0) ? '—' : `${Math.floor(s)}.${p3(Math.round((s%1)*1000))}`;
const fmtGap = s => s <= 0 ? '—' : s < 60 ? `+${s.toFixed(1)}s` : `+${fmtTime(s,false,true)}`;
const p2 = n => String(n).padStart(2,'0');
const p3 = n => String(n).padStart(3,'0');

const tireClass = t => t<70?'cold':t>105?'hot':'ok';
const brakeColor = t => t<0?'var(--text-muted)':t<200?'#60a5fa':t>600?'#f87171':'#4ade80';
const classCol = c => {
    if (!c) return '';
    const l=c.toLowerCase();
    if (l.includes('lmp2')) return '#60a5fa';
    if (l.includes('gte')) return '#fb923c';
    if (l.includes('gt3')) return '#4ade80';
    if (l.includes('hypercar')) return '#f87171';
    return 'var(--text-sec)';
};

function getClassStyle(cls) {
    if (!cls) return { bg: 'rgba(107,114,128,0.2)', col: '#9ca3af' };
    const l = cls.toLowerCase();
    if (l.includes('hyper')) return { bg: 'rgba(239,68,68,0.2)', col: '#f87171' };
    if (l.includes('lmp2')) return { bg: 'rgba(96,165,250,0.2)', col: '#60a5fa' };
    if (l.includes('lmp3')) return { bg: 'rgba(192,132,252,0.2)', col: '#c084fc' };
    if (l.includes('gte')) return { bg: 'rgba(251,146,60,0.2)', col: '#fb923c' };
    if (l.includes('gt3')) return { bg: 'rgba(74,222,128,0.2)', col: '#4ade80' };
    return { bg: 'rgba(107,114,128,0.2)', col: '#9ca3af' };
}

const STEERING_WHEELS = {
    'alpine a424': 'Alpine A424.png',
    'aston martin valkyrie': 'Aston Martin Valkyrie LMH.png',
    'aston martin vantage amr lmgt3': 'Aston Martin Vantage AMR LMGT3.png',
    'aston martin vantage': 'Aston Martin Vantage AMR.png',
    'bmw m hybrid': 'BMW M Hybrid V8.png',
    'bmw m4': 'BMW M4 LMGT3.png',
    'cadillac v-series': 'Cadillac V-Series.R.png',
    'corvette c8.r gte': 'Corvette C8.R GTE.png',
    'corvette c8': 'Chevrolet Corvette C8.R.png',
    'corvette z06': 'Chevrolet Corvette Z06 LMGT3.R.png',
    'duqueine': 'Duqueine D09 P3.png',
    'ferrari 499p': 'Ferrari 499P.png',
    'ferrari 296': 'Ferrari 296 LMGT3.png',
    'ferrari 488': 'Ferrari 488 GTE Evo.png',
    'ford mustang': 'Ford Mustang LMGT3.png',
    'genesis': 'Genesis GMR-001.png',
    'ginetta': 'Ginetta G61-LT-P325 Evo.png',
    'glickenhaus': 'Glickenhaus SCG 007.png',
    'isotta': 'Isotta Fraschini Tipo6.png',
    'lamborghini sc63': 'Lamborghini SC63.png',
    'Lamborghini Huracan LMGT3 Evo2': 'Lamborghini Huracan LMGT3 Evo2.png',
    'lexus': 'Lexus RCF LMGT3.png',
    'ligier': 'Ligier JS P325.png',
    'mclaren 720s': 'McLaren 720S LMGT3 Evo.png',
    'mercedes': 'Mercedes-AMG LMGT3.png',
    'oreca': 'ORECA 07.png',
    'peugeot 9x8': 'Peugeot 9X8.png',
    'porsche 963': 'Porsche 963.png',
    'porsche 911 gt3': 'Porsche 911 GT3 R LMGT3.png',
    'porsche 911 rsr': 'Porsche 911 RSR-19.png',
    'toyota gr010': 'Toyota GR010.png',
    'vanwall': 'Vanwall Vandervell 680.png',
};

function getSteeringWheelImage(vehicleName) {
    if (!vehicleName) return null;
    const low = vehicleName.toLowerCase();
    const sorted = Object.entries(STEERING_WHEELS).sort((a, b) => b[0].length - a[0].length);
    for (const [key, file] of sorted) {
        if (low.includes(key)) return 'live/steering_wheels/' + file;
    }
    return null;
}

const updateFlags = (flags, playerFlag) => {
    if (!flags) return;
    dom.flagOverlay.className = '';
    dom.flagBanner.style.display = 'none';
    const { gamePhase, yellowFlagState, sectorFlags } = flags;
    let ovClass='';
    switch(yellowFlagState) {
        case 1: case 2: case 4: showBanner(CFG.lang.fcy, '#a16207','#fef08a'); ovClass='fcy'; break;
        case 6: showBanner(CFG.lang.race_resume,'#15803d','#bbf7d0'); ovClass='green'; break;
        case 7: showBanner(CFG.lang.red_flag,'#991b1b','#fecaca'); ovClass='red'; break;
    }
    if (!ovClass && playerFlag===6) ovClass='blue';
    if (gamePhase===2||gamePhase===3) showBanner(CFG.lang.formation,'#374151','#d1d5db');
    if (ovClass) dom.flagOverlay.classList.add(ovClass);
    const dots=[dom.s1Dot,dom.s2Dot,dom.s3Dot];
    if (gamePhase===0) dots.forEach(d=>d.classList.remove('yellow'));
    else sectorFlags.forEach((f,i)=> f!==0?dots[i].classList.add('yellow'):dots[i].classList.remove('yellow'));
};
const showBanner = (txt,bg,col) => {
    dom.flagBanner.textContent = txt;
    dom.flagBanner.style.cssText = `display:block;background:${bg};color:${col};`;
};

const circuitPointsCache = {};
const circuitFileAlias = {
    "Autodromo Nazionale Monza": "monza",
    "Autodromo Nazionale di Monza": "monza",
    "Monza": "monza",
};

async function loadTrackPointsForCircuit(circuitName) {
    if (!circuitName) return null;
    if (circuitPointsCache[circuitName]) return circuitPointsCache[circuitName];
    let baseName = circuitFileAlias[circuitName];
    if (!baseName) baseName = circuitName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    let data = null;
    for (const ext of ['.geojson', '.json']) {
        const fileName = `${baseName}${ext}`;
        try {
            const resp = await fetch(`circuits/${fileName}`);
            if (resp.ok) { data = await resp.json(); break; }
        } catch(e) {}
    }
    if (!data) return null;
    let points = null;
    if (data.points && Array.isArray(data.points)) points = data.points.map(p => ({ x: p.x, z: p.z }));
    else if (data.type === "FeatureCollection") {
        for (const feat of data.features || []) {
            if (feat.geometry?.type === "LineString") {
                points = feat.geometry.coordinates.map(c => ({ x: c[0], z: c[1] }));
                break;
            }
        }
    } else if (data.type === "LineString" && data.coordinates) points = data.coordinates.map(c => ({ x: c[0], z: c[1] }));
    if (points && points.length) { circuitPointsCache[circuitName] = points; return points; }
    return null;
}

let _lastWheelSrc = '';
function updateSteeringWheel(vehicleName, steerVal) {
    const steerAngle = steerVal * 180;
    const imgEl = dom.steeringImg;
    const svgEl = dom.steeringSvg;

    const wheelSrc = getSteeringWheelImage(vehicleName);
    if (wheelSrc && wheelSrc !== _lastWheelSrc) {
        _lastWheelSrc = wheelSrc;
        imgEl.src = wheelSrc;
        imgEl.style.display = '';
        svgEl.style.display = 'none';
    } else if (!wheelSrc && _lastWheelSrc !== '') {
        _lastWheelSrc = '';
        imgEl.style.display = 'none';
        svgEl.style.display = '';
    }

    if (wheelSrc) {
        imgEl.style.transform = `rotate(${steerAngle}deg)`;
    } else {
        svgEl.style.transform = `rotate(${steerAngle}deg)`;
    }
    dom.steeringVal.textContent = `${Math.round(Math.abs(steerVal) * 100)}%`;
}

const TRACK_FLAGS = {
    'sarthe':'fr', 'mans':'fr', 'hunaudieres':'fr', 'paul ricard':'fr', 'ricard':'fr',
    'spa':'be', 'francorchamps':'be', 'belgium':'be',
    'monza':'it', 'imola':'it', 'mugello':'it',
    'portim':'pt', 'algarve':'pt',
    'fuji':'jp', 'suzuka':'jp',
    'sebring':'us', 'daytona':'us', 'road atlanta':'us', 'atlanta':'us',
    'michelin raceway':'us', 'watkins':'us', 'glen':'us',
    'laguna':'us', 'cota':'us', 'americas':'us', 'texas':'us',
    'lime rock':'us', 'limerock':'us', 'ohio':'us',
    'bahrain':'bh',
    'losail':'qa', 'lusail':'qa', 'qatar':'qa',
    'barcelona':'es', 'cataluny':'es',
    'interlagos':'br', 'pace':'br',
    'nurburgring':'de', 'nuerburgring':'de', 'nordschleife':'de', 'hockenheim':'de',
    'silverstone':'gb', 'brands hatch':'gb', 'donington':'gb', 'oulton':'gb',
};

const trackFlag = (name, cls = 'flag') => {
    if (!name) return '';
    const low = name.toLowerCase();
    for (const [k, code] of Object.entries(TRACK_FLAGS)) {
        if (low.includes(k)) return `<img class="${cls}" src="flags/${code}.png" alt="${code.toUpperCase()}">`;
    }
    return '';
};
let _lastTrackName = '';
const updateMapTab = track => {
    if (!track || track === _lastTrackName) return;
    _lastTrackName = track;
    const el = $('map-title');
    el.innerHTML = `${trackFlag(track)} ${track}`;
};

const updateUI = async (data) => {
    const { telemetry: t, scoring: sc, session, standings, weather, flags, trackLayout, trackPoints } = data;

    updateFlags(flags, sc.playerFlag);

    dom.speed.textContent = Math.round(t.speed_kmh);
    dom.gear.textContent = t.gear===0?'N':t.gear===-1?'R':t.gear;

    const maxR = t.mEngineMaxRPM>0?t.mEngineMaxRPM:10000;
    dom.maxRpm.textContent = Math.round(maxR);
    dom.rpm.textContent = Math.round(t.rpm);
    const rpmR = Math.min(t.rpm/maxR,1);
    rpmR > 0.95 ? dom.f1GaugeCard.classList.add('shift-active') : dom.f1GaugeCard.classList.remove('shift-active');

    const speedPct = Math.min(t.speed_kmh / 350, 1);
    dom.arcSpeed.style.strokeDashoffset = 408 * (1 - speedPct);
    dom.arcSpeed.style.stroke = rpmR>0.9?'#ef4444':rpmR>0.75?'#f59e0b':'#00aaff';
    dom.gear.style.color = rpmR>0.9?'#ef4444':rpmR>0.75?'#f59e0b':'#00aaff';

    const thrPct = Math.max(0, Math.min(1, (t.throttle ?? 0)));
    const brkPct = Math.max(0, Math.min(1, (t.brake ?? 0)));
    dom.pedalThrottle.style.height = `${thrPct * 100}%`;
    dom.pedalBrake.style.height = `${brkPct * 100}%`;
    dom.pedalThrottleVal.textContent = `${Math.round(thrPct * 100)}%`;
    dom.pedalBrakeVal.textContent = `${Math.round(brkPct * 100)}%`;

    _sparklineHistory.throttle.push(thrPct * 100);
    _sparklineHistory.brake.push(brkPct * 100);
    if (_sparklineHistory.throttle.length > _SPARKLINE_MAX) {
        _sparklineHistory.throttle.shift();
        _sparklineHistory.brake.shift();
    }
    drawSparkline();

	const steerVal = t.steering ?? 0;
    
    // On cherche le vrai nom de la voiture du joueur dans le classement
    let realCarName = sc.vehicle;
    if (standings && standings.length > 0) {
        const player = standings.find(d => d.isPlayer);
        if (player && player.vehicleName) {
            realCarName = player.vehicleName;
        }
    }
    
    updateSteeringWheel(realCarName, steerVal);

    if (t.fuelCapacity>0) fuelCap=t.fuelCapacity;
    const fp = fuelCap>0?Math.min(t.fuel/fuelCap*100,100):0;
    dom.fuel.style.width = `${fp}%`;
    dom.fuelText.textContent = t.fuel.toFixed(1);

    _fuelHistory.push(t.fuel);
    if (_fuelHistory.length > _FUEL_HIST_MAX) _fuelHistory.shift();

    dom.damageTotal.textContent = Math.round(t.damage.total);
    const dc=['rgba(0,255,0,0.3)','rgba(255,255,0,0.5)','rgba(255,0,0,0.7)'];
    const dz=t.damage.zones;
    Object.entries(dom.dz).forEach(([k,el],i)=> { if(el) el.style.fill=dc[dz[i]]||dc[0]; });

    dom.driver.textContent = sc.driver||'N/A';
    dom.vehicle.textContent = sc.vehicle||'N/A';

    if (standings && standings.length > 0) {
        const playerSt = standings.find(d => d.isPlayer);
        if (playerSt && playerSt.vehicleClass) {
            const cs = getClassStyle(playerSt.vehicleClass);
            dom.classBadge.textContent = playerSt.vehicleClass.replace(' ELMS', '');
            dom.classBadge.style.background = cs.bg;
            dom.classBadge.style.color = cs.col;
            dom.classBadge.style.border = `1px solid ${cs.col}`;
            dom.classBadge.style.display = '';
        } else {
            dom.classBadge.style.display = 'none';
        }

        const classes = [...new Set(standings.map(d => d.vehicleClass).filter(Boolean))];
        if (classes.length > 1 && playerSt) {
            const clsTotal = standings.filter(d => d.vehicleClass === playerSt.vehicleClass).length;
            dom.classPosVal.textContent = `P${playerSt.classPosition} ${playerSt.vehicleClass} (/${clsTotal})`;
            dom.classPosVal.style.color = classCol(playerSt.vehicleClass) || 'var(--text-sec)';
            dom.classPosWrap.style.display = '';
        } else dom.classPosWrap.style.display = 'none';

        const sorted4gaps = [...standings].sort((a,b) => a.position - b.position);
        const playerIdx   = sorted4gaps.findIndex(d => d.isPlayer);
        if (playerIdx > 0) {
            const player = sorted4gaps[playerIdx];
            dom.gapToLeader.textContent = player.lapsBehindLeader > 0
                ? `+${player.lapsBehindLeader} t.`
                : fmtGap(player.timeBehindLeader);
            const ahead = sorted4gaps[playerIdx - 1];
            dom.gapToAhead.textContent = (player.lapsBehindLeader === ahead.lapsBehindLeader)
                ? fmtGap(player.timeBehindLeader - ahead.timeBehindLeader)
                : `+${player.lapsBehindLeader - ahead.lapsBehindLeader} t.`;
            dom.posGaps.style.display = '';
        } else {
            dom.posGaps.style.display = 'none';
        }
    }

    dom.position.textContent = sc.position||'0';

    dom.hudLap.textContent = t.lap ?? '—';
    dom.hudTime.textContent = fmtTime(session.sessionTime, true);
    if (session.track) {
        dom.hudTrackName.textContent = session.track;
        dom.hudFlag.innerHTML = trackFlag(session.track, 'flag-hud');
    }
    const phaseNames = {0:'Practice',1:'Qualifying',2:'Warm Up',3:'Race',4:'Race',5:'Race',6:'Race',7:'Race',8:'Race',9:'Race'};
    dom.hudSessionBadge.textContent = phaseNames[flags?.gamePhase ?? -1] ?? 'LIVE';

    dom.lapTime.textContent = fmtTime(t.lapTime);
    dom.lapTime.style.color = sc.lapDelta<-0.01?'#4ade80':sc.lapDelta>0.01?'#f87171':'';
    const delta = sc.lapDelta || 0;
    if (Math.abs(delta) > 0.005) {
        const sign = delta < 0 ? '' : '+';
        dom.deltaVal.textContent = `${sign}${delta.toFixed(3)}`;
        dom.deltaVal.style.color = delta < 0 ? '#22c55e' : '#ef4444';
        const barPct = Math.min(Math.abs(delta) / 3 * 50, 48);
        if (delta < 0) {
            dom.deltaBarFill.style.left = `${50 - barPct}%`;
            dom.deltaBarFill.style.width = `${barPct}%`;
            dom.deltaBarFill.className = 'delta-bar-fill green';
        } else {
            dom.deltaBarFill.style.left = '50%';
            dom.deltaBarFill.style.width = `${barPct}%`;
            dom.deltaBarFill.className = 'delta-bar-fill red';
        }
    } else {
        dom.deltaVal.textContent = '— 0.000';
        dom.deltaVal.style.color = 'var(--text-sec)';
        dom.deltaBarFill.style.width = '0';
    }

    dom.lastLap.textContent = fmtTime(sc.lastLapTime);
    dom.bestLap.textContent = fmtTime(sc.bestLapTime);
    [dom.pS1,dom.pS2,dom.pS3].forEach((el,i)=>{
        el.textContent = fmtSec(sc.lastSectors[i]);
        el.style.color = (sc.lastSectors[i]>0&&sc.lastSectors[i]===sc.bestSectors[i])?'#28a745':'';
    });

    updateStint(t);

    if (session.track) updateMapTab(session.track);

    let finalTrackPoints = null;
    if (session.track) {
        const geojsonPoints = await loadTrackPointsForCircuit(session.track);
        if (geojsonPoints) finalTrackPoints = geojsonPoints;
        else if (trackPoints && trackPoints.length) finalTrackPoints = trackPoints;
    }
    lastTrackPoints = finalTrackPoints;
    lastStandings = standings;
    lastLayout = trackLayout;

    if (standings) {
        const player = standings.find(d => d.isPlayer);
        if (player && player.pos && thrPct + brkPct > 0.01) {
            _trackHeatmap.push({ x: player.pos.x, z: player.pos.z, throttle: thrPct, brake: brkPct });
            if (_trackHeatmap.length > _HEATMAP_MAX) _trackHeatmap.shift();
        }
    }

    dom.timestamp.textContent = new Date(data._ts*1000).toLocaleTimeString();

    dom.waterTemp.textContent = `${Math.round(t.engineWaterTemp)}°C`;
    dom.oilTemp.textContent = `${Math.round(t.engineOilTemp)}°C`;
    dom.airTemp.textContent = `${Math.round(weather.airTemp)}°C`;
    dom.trackTemp.textContent = `${Math.round(weather.trackTemp)}°C`;
    dom.windSpeed.textContent = `${Math.round(weather.windSpeed)} km/h`;
    dom.trackStatus.textContent = weather.rain<0.1?CFG.lang.dry:weather.rain<0.5?CFG.lang.wet:CFG.lang.rain;
    dom.trackStatus.style.color = weather.rain<0.1?'':weather.rain<0.5?'#38bdf8':'#60a5fa';

    const tireOrder = [dom.tires.fl,dom.tires.fr,dom.tires.rl,dom.tires.rr];
    t.wheels.forEach((w,i)=>{
        const td = tireOrder[i];
        td.temp.textContent = `${Math.round(w.temp)}°C`;
        td.wear.textContent = `${Math.round(w.wear)}%`;
        td.pres.textContent = `${w.pressure.toFixed(1)} kPa`;
        td.card.className = `tire-card ${tireClass(w.temp)}`;
        if (w.brakeTemp<0) { td.bt.textContent='—'; td.bt.style.color='var(--text-muted)'; }
        else { td.bt.textContent=`${Math.round(w.brakeTemp)}°C`; td.bt.style.color=brakeColor(w.brakeTemp); }
    });

    drawMap(lastStandings, lastLayout, lastTrackPoints);
    updateStandings(standings);
};

const updateStandings = (data) => {
    const sorted = [...data].sort((a,b) => a.position - b.position);
    let html='';
    for (let i = 0; i < sorted.length; i++) {
        const d = sorted[i];
        const gap = d.lapsBehindLeader>0 ? `+${d.lapsBehindLeader} t.` : d.position===1 ? '—' : fmtGap(d.timeBehindLeader);
        let delta = '—';
        if (i > 0) {
            const prev = sorted[i-1];
            if (d.lapsBehindLeader === prev.lapsBehindLeader) {
                delta = fmtGap(d.timeBehindLeader - prev.timeBehindLeader);
            } else {
                delta = `+${d.lapsBehindLeader - prev.lapsBehindLeader} t.`;
            }
        }
        const sc=[d.currentSector===1?'cur-sector':'',d.currentSector===2?'cur-sector':'',d.currentSector===0?'cur-sector':''];
        const cc=classCol(d.vehicleClass);
        const rowCls=d.isPlayer?'player-row':'';
        html+=`<tr class="${rowCls}">
            <td>${d.position}</td>
            <td style="color:${cc};font-weight:${d.isPlayer?700:400};">${d.driver}${d.inPits?` <small style="color:#fbbf24;">(${CFG.lang.pits})</small>`:''}</td>
            <td style="color:${cc};">${d.classPosition}</td>
            <td style="color:var(--text-sec);">${d.vehicleName}</td>
            <td>${fmtTime(d.lastLapTime)}</td>
            <td><span class="${d.isClassBestLap?'best-class':''}">${fmtTime(d.bestLapTime)}</span></td>
            <td style="color:${d.position===1?'#e5a00d':d.lapsBehindLeader>0?'#f87171':'var(--text-sec)'};">${gap}</td>
            <td style="color:var(--text-muted);">${delta}</td>
            <td style="text-align:center;"><span class="${sc[0]} ${d.isClassBestS1?'best-class':''}">${fmtSec(d.lastS1)}</span></td>
            <td style="text-align:center;"><span class="${sc[1]} ${d.isClassBestS2?'best-class':''}">${fmtSec(d.lastS2)}</span></td>
            <td style="text-align:center;"><span class="${sc[2]} ${d.isClassBestS3?'best-class':''}">${fmtSec(d.lastS3)}</span></td>
        </tr>`;
    }
    dom.standingsBody.innerHTML=html;
};

let _demoT0 = Date.now();
function getDemoData() {
    const dt   = (Date.now() - _demoT0) / 1000;
    const LAP  = 203.5;
    const lapT = dt % LAP;
    const lapN = 8 + Math.floor(dt / LAP);
    const ph   = lapT / LAP;
    const spd = Math.max(55, Math.min(316,
        185 + Math.sin(ph * 2 * Math.PI) * 98
            + Math.sin(ph * 6 * Math.PI) * 27));
    const gear = spd < 80 ? 1 : spd < 125 ? 2 : spd < 168 ? 3
               : spd < 218 ? 4 : spd < 268 ? 5 : 6;
    const rpm  = Math.round(2900 + (spd / 316) * 7100);
    const fuel = Math.max(0, 62.5 - (lapN - 8) * 2.85 - lapT * 2.85 / LAP);
    const bk   = Math.max(0, 260 + spd * 0.75);
    const thr  = Math.max(0, Math.min(1, 0.5 + Math.sin(ph * 4 * Math.PI) * 0.5));
    const brk  = Math.max(0, Math.min(1, Math.max(0, -Math.sin(ph * 4 * Math.PI) * 0.7)));
    const steer = Math.sin(dt * 0.15) * 0.7;
    return {
        _ts: Date.now() / 1000,
        sessionId: 42,
        session: { track: 'Circuit de la Sarthe', sessionTime: 5025.3 + dt },
        telemetry: {
            speed_kmh: spd, gear, rpm, mEngineMaxRPM: 10500,
            throttle: thr, brake: brk, steering: steer,
            fuel, fuelCapacity: 75, fuelConsumption: 2.85,
            fuelLapsRemaining: fuel / 2.85,
            lapTime: lapT, lap: lapN,
            engineWaterTemp: 84 + Math.sin(dt * 0.08) * 2,
            engineOilTemp:   102 + Math.sin(dt * 0.06) * 3,
            damage: { total: 12, zones: [0,1,0,0,0,0,0,0] },
            wheels: [
                { temp: 91 + Math.sin(dt*.05)*4, wear: 94.2, pressure: 180.5, brakeTemp: bk },
                { temp: 89 + Math.sin(dt*.05)*4, wear: 95.1, pressure: 181.2, brakeTemp: bk * .93 },
                { temp: 87 + Math.sin(dt*.05)*4, wear: 95.8, pressure: 175.8, brakeTemp: bk * .88 },
                { temp: 88 + Math.sin(dt*.05)*4, wear: 96.3, pressure: 176.1, brakeTemp: bk * .86 },
            ]
        },
        scoring: {
            driver: 'Jean Dupont', vehicle: 'Ferrari 499P #50',
            position: 3, classPosition: 3,
            lapDelta: Math.sin(dt * 0.12) * 0.85,
            lastLapTime: 203.847, bestLapTime: 203.203,
            lastSectors: [64.21, 80.15, 58.87],
            bestSectors: [63.89, 79.87, 58.87],
            playerFlag: 0
        },
        weather: { airTemp: 22, trackTemp: 31, windSpeed: 14, rain: 0.0 },
        flags: { gamePhase: 3, yellowFlagState: 0, sectorFlags: [0,0,0], playerFlag: 0 },
        trackLayout: null,
        trackPoints: [
            [0,0],[200,0],[400,0],[600,0],[800,0],[1000,5],[1200,10],
            [1300,20],[1400,50],[1430,90],[1420,140],[1380,175],[1300,200],
            [1200,215],[1100,222],[1020,228],[980,240],[960,260],[980,285],[1000,300],
            [980,325],[940,345],[880,360],
            [750,375],[600,388],[450,395],[300,400],[150,402],[0,400],[-100,395],
            [-180,380],[-220,355],[-240,320],[-230,282],[-205,255],
            [-160,238],[-120,228],[-80,232],[-50,248],
            [0,272],[40,300],[60,330],[40,360],[0,378],
            [-30,360],[-50,300],[-50,220],[-30,150],[-10,80],[0,0]
        ],
        standings: [
            { position:1,  classPosition:1, vehicleClass:'Hypercar', driver:'K. Kobayashi',  vehicleName:'Toyota GR010 HYBRID #7', lastLapTime:202.567, bestLapTime:202.134, timeBehindLeader:0,    lapsBehindLeader:0, isPlayer:false, isClassBestLap:true,  isClassBestS1:true,  isClassBestS2:false, isClassBestS3:false, lastS1:63.21, lastS2:78.93, lastS3:60.07, currentSector:2, inPits:false, pos:{x:1000,z:262} },
            { position:2,  classPosition:2, vehicleClass:'Hypercar', driver:'K. Estre',       vehicleName:'Porsche 963 #6',          lastLapTime:202.891, bestLapTime:202.678, timeBehindLeader:8.4,  lapsBehindLeader:0, isPlayer:false, isClassBestLap:false, isClassBestS1:false, isClassBestS2:true,  isClassBestS3:false, lastS1:63.95, lastS2:78.12, lastS3:60.78, currentSector:0, inPits:false, pos:{x:880,z:360}  },
            { position:3,  classPosition:3, vehicleClass:'Hypercar', driver:'Jean Dupont',    vehicleName:'Ferrari 499P #50',        lastLapTime:203.847, bestLapTime:203.203, timeBehindLeader:15.2, lapsBehindLeader:0, isPlayer:true,  isClassBestLap:false, isClassBestS1:false, isClassBestS2:false, isClassBestS3:true,  lastS1:64.21, lastS2:80.15, lastS3:58.87, currentSector:0, inPits:false, pos:{x:300,z:400}  },
            { position:4,  classPosition:4, vehicleClass:'Hypercar', driver:'A. Farfus',      vehicleName:'BMW M Hybrid V8 #15',     lastLapTime:203.891, bestLapTime:203.891, timeBehindLeader:22.7, lapsBehindLeader:0, isPlayer:false, isClassBestLap:false, isClassBestS1:false, isClassBestS2:false, isClassBestS3:false, lastS1:64.78, lastS2:80.32, lastS3:58.78, currentSector:0, inPits:false, pos:{x:100,z:402}  },
            { position:5,  classPosition:5, vehicleClass:'Hypercar', driver:'L. di Grassi',   vehicleName:'Peugeot 9X8 #93',         lastLapTime:204.234, bestLapTime:204.234, timeBehindLeader:31.4, lapsBehindLeader:0, isPlayer:false, isClassBestLap:false, isClassBestS1:false, isClassBestS2:false, isClassBestS3:false, lastS1:65.12, lastS2:80.89, lastS3:58.23, currentSector:1, inPits:true,  pos:{x:50,z:50}    },
            { position:6,  classPosition:6, vehicleClass:'Hypercar', driver:'E. Bamber',      vehicleName:'Cadillac V-Series.R #2',  lastLapTime:204.678, bestLapTime:204.678, timeBehindLeader:45.8, lapsBehindLeader:0, isPlayer:false, isClassBestLap:false, isClassBestS1:false, isClassBestS2:false, isClassBestS3:false, lastS1:65.34, lastS2:81.12, lastS3:58.22, currentSector:1, inPits:false, pos:{x:1350,z:100} },
            { position:7,  classPosition:1, vehicleClass:'GT3',      driver:'R. Lietz',        vehicleName:'Porsche 911 GT3 R #91',   lastLapTime:232.234, bestLapTime:232.234, timeBehindLeader:0,    lapsBehindLeader:3, isPlayer:false, isClassBestLap:true,  isClassBestS1:true,  isClassBestS2:false, isClassBestS3:false, lastS1:72.45, lastS2:92.34, lastS3:67.45, currentSector:1, inPits:false, pos:{x:700,z:5}    },
            { position:8,  classPosition:2, vehicleClass:'GT3',      driver:'A. Pier Guidi',   vehicleName:'Ferrari 296 GT3 #51',     lastLapTime:232.891, bestLapTime:232.891, timeBehindLeader:0,    lapsBehindLeader:3, isPlayer:false, isClassBestLap:false, isClassBestS1:false, isClassBestS2:true,  isClassBestS3:false, lastS1:72.89, lastS2:91.87, lastS3:68.15, currentSector:1, inPits:false, pos:{x:450,z:2}    },
            { position:9,  classPosition:3, vehicleClass:'GT3',      driver:'A. Sims',          vehicleName:'BMW M4 GT3 #46',          lastLapTime:233.445, bestLapTime:233.445, timeBehindLeader:0,    lapsBehindLeader:3, isPlayer:false, isClassBestLap:false, isClassBestS1:false, isClassBestS2:false, isClassBestS3:true,  lastS1:73.12, lastS2:92.78, lastS3:67.55, currentSector:2, inPits:false, pos:{x:1200,z:250} },
            { position:10, classPosition:4, vehicleClass:'GT3',      driver:'S. Priaulx',       vehicleName:'Ford Mustang GT3 #77',    lastLapTime:234.123, bestLapTime:234.123, timeBehindLeader:0,    lapsBehindLeader:3, isPlayer:false, isClassBestLap:false, isClassBestS1:false, isClassBestS2:false, isClassBestS3:false, lastS1:73.45, lastS2:93.12, lastS3:67.56, currentSector:0, inPits:false, pos:{x:-205,z:270} },
        ]
    };
}

let consecutiveFails = 0;
const FAIL_RESET_AFTER = 3;

const fetchData = async () => {
    if (CFG.demoMode) {
        consecutiveFails = 0;
        noDataSince = null;
        showContent(true);
        dom.connLabel.textContent = 'DEMO';
        await updateUI(getDemoData());
        return;
    }
    try {
        const r = await fetch('telemetrie.json?t='+Date.now());
        if (!r.ok) throw new Error('404');
        const data = await r.json();
        const now = Date.now() / 1000;
        const fresh = (now - data._ts) < 2;
        const active = data.session && data.session.sessionTime > 0;
        if (fresh && active) {
            consecutiveFails = 0;
            showContent(true);
            dom.connDot.classList.add('online');
            dom.connLabel.textContent = '🟢';
            noDataSince = null;
            if (data.sessionId && data.sessionId !== 0) {
                if (!sessionId) sessionId = data.sessionId;
                else if (data.sessionId !== sessionId) {
                    sessionId = data.sessionId;
                    _trackHeatmap.length = 0;
                    _stintStartLap = 0;
                    _prevLap = 0;
                    _fuelHistory.length = 0;
                    _sparklineHistory.throttle.length = 0;
                    _sparklineHistory.brake.length = 0;
                }
            }
            lastTs = data._ts;
            await updateUI(data);
        } else {
            throw new Error('no_active_session');
        }
    } catch (err) {
        consecutiveFails++;
        dom.connDot.classList.remove('online');
        if (!noDataSince) noDataSince = Date.now();
        const elapsed = Math.round((Date.now()-noDataSince)/1000);
        if (consecutiveFails >= FAIL_RESET_AFTER) sessionId = null;
        dom.connLabel.textContent = '🔴';
        const msg = elapsed < 5 ? CFG.lang.waiting : `${CFG.lang.no_data} (${elapsed}s)`;
        showContent(false, msg);
        lastTrackPoints = null;
        lastStandings = null;
        drawMap(null, null, null);
    }
};

const mainContent = document.querySelector('.main-content');
const statusOverlay = document.getElementById('status-overlay');

const showContent = (active, msg = '') => {
    if (active) {
        mainContent.style.display = 'block';
        statusOverlay.style.display = 'none';
        dom.connDot.classList.add('online');
        dom.connLabel.textContent = '🟢';
        activateTab(currentTab);
    } else {
        mainContent.style.display = 'none';
        statusOverlay.style.display = 'flex';
        dom.statusMsg.textContent = msg || CFG.lang.waiting;
        dom.connDot.classList.remove('online');
        dom.connLabel.textContent = '🔴';
        resetDisplay();
    }
};

function resetDisplay() {
    dom.speed.textContent = '0';
    dom.gear.textContent = 'N';
    dom.rpm.textContent = '0';
    dom.position.textContent = '0';
    dom.damageTotal.textContent = '0';
    dom.driver.textContent = '…';
    dom.vehicle.textContent = '…';
    dom.classBadge.style.display = 'none';
    dom.lapTime.textContent = '0:00.000';
    dom.lastLap.textContent = '—:——.———';
    dom.bestLap.textContent = '—:——.———';
    dom.timestamp.textContent = '…';
    dom.flagBanner.style.display = 'none';
    dom.flagOverlay.className = '';
    for (const t of Object.values(dom.tires)) {
        t.temp.textContent = '0°C';
        t.wear.textContent = '100%';
        t.pres.textContent = '0.0 kPa';
        t.bt.textContent = '0°C';
        t.card.className = 'tire-card';
    }
    dom.waterTemp.textContent = '0°C';
    dom.oilTemp.textContent = '0°C';
    dom.airTemp.textContent = '0°C';
    dom.trackTemp.textContent = '0°C';
    dom.windSpeed.textContent = '0 km/h';
    dom.trackStatus.textContent = '…';
    dom.fuelText.textContent = '0.0';
    dom.fuel.style.width = '0%';
    dom.arcSpeed.style.strokeDashoffset = '408';
    dom.deltaVal.textContent = '—';
    dom.deltaBarFill.style.width = '0';
    dom.pedalThrottle.style.height = '0%';
    dom.pedalBrake.style.height = '0%';
    dom.pedalThrottleVal.textContent = '0%';
    dom.pedalBrakeVal.textContent = '0%';
    dom.steeringSvg.style.transform = 'rotate(0deg)';
    dom.steeringVal.textContent = '0%';
    dom.stintLap.textContent = '0';
    dom.stintConso.textContent = '0.00 L';
    dom.stintRemaining.textContent = '0 t.';
    dom.stintPit.textContent = '—';
    dom.hudLap.textContent = '—';
    dom.hudTime.textContent = '—:——:——';
    dom.hudTrackName.textContent = '—';
    dom.hudFlag.innerHTML = '';
    _lastTrackName = '';
    _lastWheelSrc = '';
    _stintStartLap = 0;
    _prevLap = 0;
    _sparklineHistory.throttle.length = 0;
    _sparklineHistory.brake.length = 0;
    _fuelHistory.length = 0;
    _trackHeatmap.length = 0;
    dom.posGaps.style.display = 'none';
    dom.gapToLeader.textContent = '—';
    dom.gapToAhead.textContent = '—';
}

let currentTab = 'live';
const panesMap = { live:'pane-live', standings:'pane-standings', map:'pane-map', '3d':'pane-3d' };
const btnsMap  = { live:'tab-live', standings:'tab-standings', map:'tab-map', '3d':'tab-3d' };
const activateTab = (name) => {
    currentTab = name;
    Object.entries(panesMap).forEach(([k,id])=>{ $(id).style.display = (k===name) ? 'block' : 'none'; });
    Object.entries(btnsMap).forEach(([k,id]) =>{ $(id).classList.toggle('active', k===name); });
    if (name === 'map' && lastStandings) drawMap(lastStandings, lastLayout, lastTrackPoints);
    if (name === '3d') initThreeScene();
};
$('tab-live').addEventListener('click', ()=>activateTab('live'));
$('tab-standings').addEventListener('click', ()=>activateTab('standings'));
$('tab-map').addEventListener('click', ()=>activateTab('map'));
$('tab-3d').addEventListener('click', ()=>activateTab('3d'));

const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen().catch(()=>{});
};
document.addEventListener('fullscreenchange', () => {
    const inFs = !!document.fullscreenElement;
    $('fs-icon-enter').style.display = inFs ? 'none' : '';
    $('fs-icon-exit').style.display = inFs ? '' : 'none';
});
document.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') toggleFullscreen(); });

window.addEventListener('resize', () => {
    if (currentTab === 'map' && lastStandings) drawMap(lastStandings, lastLayout, lastTrackPoints);
});

const popOutToScreen = () => {
    if (window.opener) { alert("Cette page est déjà détachée !"); return; }
    window.open(window.location.href, 'TelemetryDashboard', 'menubar=no,toolbar=no,location=no,status=no,width=1280,height=720');
};

showContent(false, CFG.lang.waiting);
setInterval(fetchData, 200);
