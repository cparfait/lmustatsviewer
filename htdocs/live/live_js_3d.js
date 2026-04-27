let _threeInited = false, _threeScene, _threeCamera, _threeRenderer, _threeControls;
let _threeTrackMesh, _threePlayerMesh, _threeDriverMeshes = [];
let _threeAnimId, _threeZScale = 1.0;

async function initThreeScene() {
    if (_threeInited) { updateThreeScene(); return; }
    const container = $('three-container');
    if (!container) return;
    const loading = $('three-loading');

    try {
        if (typeof THREE === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
                s.onload = resolve;
                s.onerror = () => reject(new Error('Three.js CDN unavailable'));
                document.head.appendChild(s);
            });
        }
        if (typeof THREE.OrbitControls === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
                s.onload = resolve;
                s.onerror = resolve;
                document.head.appendChild(s);
            });
        }
    } catch (e) {
        if (loading) loading.textContent = CFG.lang.unavail_3d || 'Impossible de charger Three.js';
        return;
    }

    if (loading) loading.style.display = 'none';

    const w = container.clientWidth, h = container.clientHeight;
    _threeScene = new THREE.Scene();
    _threeScene.background = new THREE.Color(CFG.isDark ? 0x111827 : 0x1a1a2e);

    _threeCamera = new THREE.PerspectiveCamera(60, w / h, 1, 50000);
    _threeCamera.position.set(0, 1500, 1500);

    _threeRenderer = new THREE.WebGLRenderer({ antialias: true });
    _threeRenderer.setSize(w, h);
    _threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(_threeRenderer.domElement);

    if (typeof THREE.OrbitControls !== 'undefined') {
        _threeControls = new THREE.OrbitControls(_threeCamera, _threeRenderer.domElement);
        _threeControls.enableDamping = true;
        _threeControls.dampingFactor = 0.05;
    }

    const grid = new THREE.GridHelper(5000, 50, 0x333333, 0x222222);
    grid.position.y = -1;
    _threeScene.add(grid);

    const ambientLight = new THREE.AmbientLight(0x666666);
    _threeScene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(500, 1000, 500);
    _threeScene.add(dirLight);

    const playerGeo = new THREE.ConeGeometry(8, 20, 8);
    playerGeo.rotateX(Math.PI / 2);
    const playerMat = new THREE.MeshPhongMaterial({ color: 0x38bdf8, emissive: 0x1a6080 });
    _threePlayerMesh = new THREE.Mesh(playerGeo, playerMat);
    _threePlayerMesh.position.y = 5;
    _threeScene.add(_threePlayerMesh);

    _threeInited = true;

    const zSlider = $('z-scale-slider');
    const zVal = $('z-scale-val');
    if (zSlider) {
        zSlider.addEventListener('input', () => {
            _threeZScale = zSlider.value / 100;
            if (zVal) zVal.textContent = `${_threeZScale.toFixed(1)}x`;
            rebuildTrack3D();
        });
    }
    const resetBtn = $('three-reset-cam');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        _threeCamera.position.set(0, 1500, 1500);
        _threeCamera.lookAt(0, 0, 0);
        if (_threeControls) { _threeControls.target.set(0, 0, 0); _threeControls.update(); }
    });

    window.addEventListener('resize', () => {
        if (!_threeInited || currentTab !== '3d') return;
        const w2 = container.clientWidth, h2 = container.clientHeight;
        _threeCamera.aspect = w2 / h2;
        _threeCamera.updateProjectionMatrix();
        _threeRenderer.setSize(w2, h2);
    });

    function animate() {
        _threeAnimId = requestAnimationFrame(animate);
        if (_threeControls) _threeControls.update();
        _threeRenderer.render(_threeScene, _threeCamera);
    }
    animate();
    updateThreeScene();
}

function rebuildTrack3D() {
    if (!_threeScene || !lastTrackPoints || lastTrackPoints.length < 2) return;
    if (_threeTrackMesh) { _threeScene.remove(_threeTrackMesh); _threeTrackMesh = null; }

    const pts = lastTrackPoints;
    const vec3Arr = pts.map(p => {
        const x = (typeof p.x === 'number') ? p.x : p[0];
        const z = (typeof p.z === 'number') ? p.z : p[1];
        return new THREE.Vector3(x, 0, z);
    });

    let cx = 0, cz = 0;
    vec3Arr.forEach(v => { cx += v.x; cz += v.z; });
    cx /= vec3Arr.length; cz /= vec3Arr.length;
    vec3Arr.forEach(v => { v.x -= cx; v.z -= cz; });

    if (_trackHeatmap.length > 1) {
        const colors = [];
        const positions = [];
        for (let i = 0; i < vec3Arr.length - 1; i++) {
            positions.push(vec3Arr[i].x, vec3Arr[i].y, vec3Arr[i].z);
            positions.push(vec3Arr[i + 1].x, vec3Arr[i + 1].y, vec3Arr[i + 1].z);
            let nearH = null, minD = Infinity;
            for (const h of _trackHeatmap) {
                const dx = (h.x - cx) - vec3Arr[i].x;
                const dz = (h.z - cz) - vec3Arr[i].z;
                const d = dx * dx + dz * dz;
                if (d < minD) { minD = d; nearH = h; }
            }
            const thr = nearH ? nearH.throttle : 0;
            const brk = nearH ? nearH.brake : 0;
            const r = brk > 0.1 ? brk : 0.2;
            const g = thr > 0.1 ? thr : 0.2;
            const b = 0.2;
            colors.push(r, g, b);
            colors.push(r, g, b);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const mat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 3 });
        _threeTrackMesh = new THREE.LineSegments(geo, mat);
    } else {
        const geo = new THREE.BufferGeometry().setFromPoints(vec3Arr);
        const mat = new THREE.LineBasicMaterial({ color: 0x4488ff, linewidth: 3 });
        _threeTrackMesh = new THREE.Line(geo, mat);
    }
    _threeScene.add(_threeTrackMesh);

    const maxDist = Math.max(...vec3Arr.map(v => Math.max(Math.abs(v.x), Math.abs(v.z))), 500);
    _threeCamera.position.set(0, maxDist * 1.2, maxDist * 1.2);
    _threeCamera.lookAt(0, 0, 0);
    if (_threeControls) { _threeControls.target.set(0, 0, 0); _threeControls.update(); }
}

function updateThreeScene() {
    if (!_threeInited) return;
    rebuildTrack3D();

    _threeDriverMeshes.forEach(m => _threeScene.remove(m));
    _threeDriverMeshes = [];

    if (lastStandings && lastTrackPoints && lastTrackPoints.length > 2) {
        const pts = lastTrackPoints;
        let cx = 0, cz = 0;
        pts.forEach(p => {
            const x = (typeof p.x === 'number') ? p.x : p[0];
            const z = (typeof p.z === 'number') ? p.z : p[1];
            cx += x; cz += z;
        });
        cx /= pts.length; cz /= pts.length;

        lastStandings.forEach(driver => {
            if (!driver.pos || typeof driver.pos.x !== 'number') return;
            const color = driver.isPlayer ? 0x38bdf8 : (classCol(driver.vehicleClass) === '#60a5fa' ? 0x60a5fa :
                classCol(driver.vehicleClass) === '#4ade80' ? 0x4ade80 :
                classCol(driver.vehicleClass) === '#fb923c' ? 0xfb923c :
                classCol(driver.vehicleClass) === '#f87171' ? 0xf87171 : 0xf97316);
            const geo = new THREE.SphereGeometry(driver.isPlayer ? 10 : 6, 8, 8);
            const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(driver.pos.x - cx, 5, driver.pos.z - cz);
            _threeScene.add(mesh);
            _threeDriverMeshes.push(mesh);
        });

        if (_threePlayerMesh && lastStandings) {
            const player = lastStandings.find(d => d.isPlayer);
            if (player && player.pos) {
                _threePlayerMesh.position.set(player.pos.x - cx, 10, player.pos.z - cz);
            }
        }
    }
}
