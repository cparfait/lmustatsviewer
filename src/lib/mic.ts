/**
 * Capture micro pour le spotter Couche 2 (push-to-talk).
 *
 * Pendant que la touche est maintenue, on accumule les frames Float32 du micro.
 * Au relâchement, on **downsample en 16 kHz mono Int16** (format attendu par Vosk)
 * et on renvoie le PCM prêt à être envoyé au backend (`stt_recognize`).
 *
 * On utilise un `ScriptProcessorNode` (déprécié mais universellement supporté par
 * WebView2) plutôt qu'un `AudioWorklet` : pas de fichier worklet à charger, et la
 * latence n'a pas d'importance ici (on traite le buffer complet hors-ligne).
 */

const TARGET_RATE = 16000;

interface Capture {
  ctx: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
  sampleRate: number;
}

let active: Capture | null = null;

/** Démarre la capture micro. Idempotent : un appel pendant une capture la remplace. */
export async function startCapture(): Promise<void> {
  if (active) stopRaw(); // sécurité : pas de capture fantôme
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (e) => {
    // Copie nécessaire : le buffer interne est réutilisé d'une frame à l'autre.
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  // ScriptProcessor n'émet que s'il est connecté à la destination (gain 0 = muet).
  const sink = ctx.createGain();
  sink.gain.value = 0;
  processor.connect(sink);
  sink.connect(ctx.destination);
  active = { ctx, stream, source, processor, chunks, sampleRate: ctx.sampleRate };
}

/** Arrête et libère les ressources sans produire de résultat. */
function stopRaw(): Capture | null {
  const cap = active;
  active = null;
  if (!cap) return null;
  try {
    cap.processor.onaudioprocess = null;
    cap.processor.disconnect();
    cap.source.disconnect();
    cap.stream.getTracks().forEach((tk) => tk.stop());
    void cap.ctx.close();
  } catch {
    /* déjà libéré */
  }
  return cap;
}

/**
 * Arrête la capture et renvoie le PCM 16 kHz mono Int16 (vide si rien n'a été
 * capturé). À appeler au relâchement de la touche push-to-talk.
 */
export function stopCapture(): Int16Array {
  const cap = stopRaw();
  if (!cap || cap.chunks.length === 0) return new Int16Array(0);
  // Concatène toutes les frames.
  let total = 0;
  for (const c of cap.chunks) total += c.length;
  const mono = new Float32Array(total);
  let off = 0;
  for (const c of cap.chunks) {
    mono.set(c, off);
    off += c.length;
  }
  const down = downsample(mono, cap.sampleRate, TARGET_RATE);
  return floatToInt16(down);
}

/** Rééchantillonnage linéaire vers `target` Hz (mono). */
function downsample(input: Float32Array, from: number, target: number): Float32Array {
  if (from === target) return input;
  const ratio = from / target;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Float32 [-1,1] → Int16 little-endian (saturé). */
function floatToInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Int16Array (PCM little-endian) → base64, pour l'`invoke` vers Rust. */
export function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = "";
  const CHUNK = 0x8000; // évite « Maximum call stack » sur de gros buffers
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
