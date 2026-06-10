/**
 * Effet « radio d'équipe / talkie » autour des annonces vocales.
 *
 * La Web Speech API ne passe pas par le graphe Web Audio : on ne peut donc pas
 * filtrer la voix synthétisée elle-même. On reproduit l'impression « stand /
 * casque » comme CrewChief — par une **ambiance** générée en Web Audio autour de
 * la voix TTS (qui, elle, reste normale) :
 *   - un **bip d'ouverture** (squelch) + clic juste avant la parole ;
 *   - un lit de **souffle/static** passe-bande, en fondu sous la voix ;
 *   - un **« roger beep »** double à la fin de la transmission.
 *
 * Tout est synthétisé à la volée (oscillateurs + bruit blanc filtré) : aucun
 * fichier audio, hors-ligne.
 */

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let staticSource: AudioBufferSourceNode | null = null;
let staticGain: GainNode | null = null;
let enabled = true;
/** Gain maître : volume des annonces (voix Piper + bips) pour équilibrer avec le jeu. */
let masterGain: GainNode | null = null;
let masterVolume = 0.3;

export function setRadioEnabled(v: boolean) {
  enabled = v;
  if (!v) cancelRadio();
}

export function radioOn(): boolean {
  return enabled;
}

/** Expose l'AudioContext partagé (pour décoder/jouer la voix Piper). */
export function audioContext(): AudioContext | null {
  return ac();
}

/** Gain maître (créé à la volée), point de sortie commun → destination. */
function master(c: AudioContext): GainNode {
  if (!masterGain) {
    masterGain = c.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(c.destination);
  }
  return masterGain;
}

/** Règle le volume des annonces (0–1). */
export function setMasterVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = masterVolume;
}

/** Nœud de sortie commun (à connecter en bout de chaîne voix). */
export function audioOutput(): AudioNode | null {
  const c = ac();
  return c ? master(c) : null;
}

/**
 * Chaîne de filtre « radio » pour la **voix** (possible uniquement quand l'audio
 * passe par Web Audio, c.-à-d. avec le moteur Piper) : passe-bande ~300–3000 Hz
 * façon talkie + accent médium + légère saturation. Renvoie le nœud d'entrée (à
 * connecter à la source) et de sortie (à connecter à la destination).
 */
export function radioVoiceChain(c: AudioContext): {
  input: AudioNode;
  output: AudioNode;
} {
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 380; // coupe plus de graves → timbre « comms » plus marqué
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2700; // bande passante resserrée façon talkie
  const peak = c.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = 1700;
  peak.Q.value = 1.3;
  peak.gain.value = 4; // présence médium (sans revenir au +6 dB criard)
  const shaper = c.createWaveShaper();
  shaper.curve = saturationCurve(1.2); // saturation tanh douce, sans boost de niveau
  shaper.oversample = "2x";
  const out = c.createGain();
  out.gain.value = 0.85; // léger retrait pour compenser la coloration
  hp.connect(lp);
  lp.connect(peak);
  peak.connect(shaper);
  shaper.connect(out);
  return { input: hp, output: out };
}

/**
 * Courbe de saturation douce (tanh). `drive` ≈ 1 → effet subtil : quasi
 * transparent à bas niveau (pas d'amplification parasite), légère compression des
 * crêtes. Contrairement à l'ancienne courbe, elle n'augmente pas le volume perçu.
 */
function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x);
  }
  return curve;
}

/** AudioContext paresseux (repris si suspendu par la politique d'autoplay). */
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Tampon de bruit blanc (1 s, réutilisé en boucle pour le souffle). */
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const len = Math.floor(c.sampleRate);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/** Bip court à travers un passe-bande (timbre « radio »). */
function beep(c: AudioContext, freq: number, at: number, dur: number, vol = 0.12) {
  const osc = c.createOscillator();
  const g = c.createGain();
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.8;
  osc.type = "square";
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(bp);
  bp.connect(master(c));
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.006);
  g.gain.setValueAtTime(vol, at + dur - 0.015);
  g.gain.linearRampToValueAtTime(0, at + dur);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Brève bouffée de bruit (clic de squelch). */
function noiseBurst(c: AudioContext, at: number, dur: number, vol: number) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const g = c.createGain();
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1700;
  bp.Q.value = 0.6;
  src.connect(bp);
  bp.connect(g);
  g.connect(master(c));
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/**
 * Démarre un lit de **souffle/static** continu sous la voix (timbre « casque /
 * transmission »). Volontairement discret (`level` bas) : c'est l'indice radio
 * principal, mais il ne doit pas couvrir la voix. Bouclé, coupé par `fadeStatic`.
 */
function startStatic(c: AudioContext, at: number, level: number) {
  stopStaticNow();
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  // Filtrage : passe-bande médium-aigu → « pschhh » de radio, pas du bruit large.
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1900;
  bp.Q.value = 0.5;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 700;
  const g = c.createGain();
  src.connect(bp);
  bp.connect(hp);
  hp.connect(g);
  g.connect(master(c));
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + 0.06);
  src.start(at);
  staticSource = src;
  staticGain = g;
}

function stopStaticNow() {
  if (staticSource) {
    try {
      staticSource.stop();
    } catch {
      /* déjà arrêté */
    }
  }
  staticSource = null;
  staticGain = null;
}

/** Coupe le souffle en fondu (fin de transmission propre). */
function fadeStatic(c: AudioContext, when: number) {
  if (!staticSource || !staticGain) return;
  const g = staticGain;
  const src = staticSource;
  g.gain.cancelScheduledValues(when);
  g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), when);
  g.gain.linearRampToValueAtTime(0.0001, when + 0.18);
  try {
    src.stop(when + 0.24);
  } catch {
    /* déjà arrêté */
  }
  staticSource = null;
  staticGain = null;
}

/** Début de transmission : clic + bip d'ouverture + souffle entrant. */
export function radioStart() {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime;
  noiseBurst(c, t0, 0.05, 0.14);
  beep(c, 1500, t0 + 0.02, 0.07, 0.1);
  // Lit de souffle discret sous la voix (le « côté casque ») — niveau bas pour ne
  // pas couvrir la parole ; démarre avec la voix (~130 ms après le bip).
  startStatic(c, t0 + 0.13, 0.02);
}

/** Fin de transmission : « roger beep » double + fondu du souffle. */
export function radioEnd() {
  if (!enabled) {
    cancelRadio();
    return;
  }
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime;
  beep(c, 1700, t0, 0.05, 0.1);
  beep(c, 1250, t0 + 0.08, 0.08, 0.1);
  fadeStatic(c, t0);
}

/** Coupe le souffle sans « roger beep » (cas d'une annonce interrompue). */
export function radioInterrupt() {
  const c = ac();
  if (c) fadeStatic(c, c.currentTime);
  else stopStaticNow();
}

/** Coupe immédiatement toute l'ambiance (désactivation / changement de session). */
export function cancelRadio() {
  stopStaticNow();
}
