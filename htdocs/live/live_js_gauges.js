function drawSparkline() {
    const canvas = dom.sparklineCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const len = _sparklineHistory.throttle.length;
    if (len < 2) return;
    const drawLine = (data, color) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (let i = 0; i < len; i++) {
            const x = (i / (_SPARKLINE_MAX - 1)) * w;
            const y = h - (data[i] / 100) * h;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    };
    drawLine(_sparklineHistory.throttle, 'rgba(34,197,94,0.8)');
    drawLine(_sparklineHistory.brake, 'rgba(239,68,68,0.8)');
}
