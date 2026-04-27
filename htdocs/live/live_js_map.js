const drawMap = (standings, layout, trackPoints) => {
    const canvas = dom.trackMap;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    ctx.fillStyle = CFG.isDark ? '#1f2937' : '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let points = [];
    if (trackPoints && Array.isArray(trackPoints) && trackPoints.length > 2) {
        points = trackPoints.map(p => ({ x: (typeof p.x === 'number') ? p.x : p[0], z: (typeof p.z === 'number') ? p.z : p[1] }));
    } else if (layout && layout.points && layout.points.length > 2) {
        points = layout.points.map(p => ({ x: p.x, z: p.z }));
    }

    if (points.length === 0) {
        ctx.font = "14px monospace";
        ctx.fillStyle = CFG.isDark ? '#6b7280' : '#94a3b8';
        ctx.textAlign = "center";
        ctx.fillText("Aucune session active", canvas.width/2, canvas.height/2);
        return;
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    points.forEach(p => {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    });
    if (standings && standings.length) {
        standings.forEach(d => {
            if (!d.pos || typeof d.pos.x !== 'number') return;
            if (d.pos.x < minX) minX = d.pos.x; if (d.pos.x > maxX) maxX = d.pos.x;
            if (d.pos.z < minZ) minZ = d.pos.z; if (d.pos.z > maxZ) maxZ = d.pos.z;
        });
    }
    if (_trackHeatmap.length) {
        _trackHeatmap.forEach(p => {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
        });
    }
    const rangeX = maxX - minX;
    const rangeZ = maxZ - minZ;
    if (rangeX === 0 || rangeZ === 0) return;

    const scale = Math.min(canvas.width / rangeX, canvas.height / rangeZ) * 0.85;
    const offsetX = (canvas.width - rangeX * scale) / 2;
    const offsetZ = (canvas.height - rangeZ * scale) / 2;
    const project = (x, z) => ({ x: (x - minX) * scale + offsetX, y: (z - minZ) * scale + offsetZ });

    ctx.beginPath();
    let first = project(points[0].x, points[0].z);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
        const p = project(points[i].x, points[i].z);
        ctx.lineTo(p.x, p.y);
    }
    const last = project(points[points.length - 1].x, points[points.length - 1].z);
    const closeThresh = Math.min(canvas.width, canvas.height) * 0.05;
    if (Math.hypot(first.x - last.x, first.y - last.y) < closeThresh) ctx.closePath();
    ctx.strokeStyle = CFG.isDark ? '#374151' : '#cbd5e1';
    ctx.lineWidth = 12;
    ctx.stroke();

    if (_trackHeatmap.length > 1) {
        for (let i = 1; i < _trackHeatmap.length; i++) {
            const h0 = _trackHeatmap[i - 1], h1 = _trackHeatmap[i];
            const p0 = project(h0.x, h0.z), p1 = project(h1.x, h1.z);
            if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 50) continue;
            let color;
            if (h1.brake > 0.1) color = `rgba(239,68,68,${Math.min(h1.brake, 1)})`;
            else if (h1.throttle > 0.1) color = `rgba(34,197,94,${Math.min(h1.throttle, 1)})`;
            else color = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.strokeStyle = color;
            ctx.lineWidth = 6;
            ctx.stroke();
        }
    }

    ctx.beginPath();
    first = project(points[0].x, points[0].z);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
        const p = project(points[i].x, points[i].z);
        ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = CFG.isDark ? '#4b5563' : '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (points.length > 1) {
        const p0 = project(points[0].x, points[0].z);
        const p1 = project(points[1].x, points[1].z);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 10]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (standings && standings.length) {
        const classSet = new Set();
        standings.forEach(driver => {
            if (driver.vehicleClass) classSet.add(driver.vehicleClass);
        });

        standings.forEach(driver => {
            if (!driver.pos || typeof driver.pos.x !== 'number') return;
            const pos = project(driver.pos.x, driver.pos.z);
            const cc = driver.isPlayer ? '#38bdf8' : (classCol(driver.vehicleClass) || '#f97316');

            let angle = 0;
            if (points.length > 1) {
                let minDist = Infinity, nearestIdx = 0;
                for (let i = 0; i < points.length; i++) {
                    const pp = project(points[i].x, points[i].z);
                    const d = Math.hypot(pp.x - pos.x, pp.y - pos.y);
                    if (d < minDist) { minDist = d; nearestIdx = i; }
                }
                const nextIdx = (nearestIdx + 1) % points.length;
                const pA = project(points[nearestIdx].x, points[nearestIdx].z);
                const pB = project(points[nextIdx].x, points[nextIdx].z);
                angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
            }

            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-6, -6);
            ctx.lineTo(-3, 0);
            ctx.lineTo(-6, 6);
            ctx.closePath();
            ctx.fillStyle = cc;
            ctx.fill();
            ctx.strokeStyle = driver.isPlayer ? '#fff' : 'rgba(255,255,255,0.5)';
            ctx.lineWidth = driver.isPlayer ? 2 : 1;
            ctx.stroke();
            ctx.restore();

            ctx.fillStyle = driver.isPlayer ? '#fff' : (CFG.isDark ? '#d1d5db' : '#1e293b');
            ctx.font = `bold ${driver.isPlayer ? 11 : 9}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(driver.position, pos.x, pos.y - 10);
        });

        if (dom.mapLegend) {
            let legendHtml = '<div class="map-legend-item"><div class="map-legend-dot" style="background:rgba(34,197,94,0.8);"></div> '+CFG.lang.throttle+'</div>';
            legendHtml += '<div class="map-legend-item"><div class="map-legend-dot" style="background:rgba(239,68,68,0.8);"></div> '+CFG.lang.brake+'</div>';
            legendHtml += '<div class="map-legend-item"><div class="map-legend-dot" style="background:rgba(255,255,255,0.5);"></div> '+CFG.lang.coasting+'</div>';
            [...classSet].sort().forEach(cls => {
                const cs = getClassStyle(cls);
                legendHtml += `<div class="map-legend-item"><div class="map-legend-dot" style="background:${cs.col};"></div> ${cls.replace(' ELMS','')}</div>`;
            });
            legendHtml += '<div class="map-legend-item"><div class="map-legend-dot" style="background:#38bdf8;border-color:#fff;"></div> '+CFG.lang.you+'</div>';
            dom.mapLegend.innerHTML = legendHtml;
        }
    }
};
