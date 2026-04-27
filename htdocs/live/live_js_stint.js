function updateStint(t) {
    if (t.lap !== _prevLap) {
        if (t.lap < _prevLap || _prevLap === 0) _stintStartLap = t.lap;
        _prevLap = t.lap;
    }
    const stintLap = t.lap - _stintStartLap + 1;
    dom.stintLap.textContent = stintLap;
    dom.stintConso.textContent = `${t.fuelConsumption.toFixed(2)} L`;
    const lapsRem = Math.floor(t.fuelLapsRemaining);
    dom.stintRemaining.textContent = `${lapsRem} t.`;
    dom.stintRemaining.style.color = lapsRem > 5 ? '#22c55e' : lapsRem > 2 ? '#f59e0b' : '#ef4444';
    if (t.fuelConsumption > 0 && lapsRem > 0) {
        dom.stintPit.textContent = `~${lapsRem} t.`;
        dom.stintPit.style.color = lapsRem <= 3 ? '#f59e0b' : 'var(--text-sec)';
    } else {
        dom.stintPit.textContent = '—';
    }
    drawFuelSparkline();
}

function drawFuelSparkline() {
    const canvas = dom.fuelSparkline;
    if (!canvas || _fuelHistory.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const maxF = Math.max(..._fuelHistory, 1);
    const minF = Math.min(..._fuelHistory, 0);
    const range = maxF - minF || 1;
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    for (let i = 0; i < _fuelHistory.length; i++) {
        const x = (i / (_FUEL_HIST_MAX - 1)) * w;
        const y = h - ((_fuelHistory[i] - minF) / range) * (h - 4) - 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineTo((_fuelHistory.length - 1) / (_FUEL_HIST_MAX - 1) * w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(59,130,246,0.1)';
    ctx.fill();
}
