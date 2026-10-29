// Generates TapBlast's sound effects and music loops as WAV files in
// public/sounds/. Everything is synthesized here (no samples), so the audio is
// ours to use with no licensing questions. Re-run after tweaking:
//
//   node scripts/make-sounds.mjs
//
// Short effects are converted to MP3 (needs ffmpeg) to keep phones' downloads
// small. Music loops stay WAV: MP3 adds a short gap that breaks a seamless loop.
import { execFileSync } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const OUT = new URL('../public/sounds/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const note = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
};

const waves = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  triangle: (p) => 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5),
  square: (p) => (p % 1 < 0.5 ? 1 : -1),
  saw: (p) => 2 * (p % 1) - 1,
};

/** Adds one note into `buf` starting at `t` seconds. */
function tone(buf, { t = 0, dur, freq, freqEnd = freq, wave = 'sine', vol = 0.3, attack = 0.005, release = 0.08, decay = 0, lowpass = 0 }) {
  const start = Math.floor(t * RATE);
  const n = Math.floor((dur + release) * RATE);
  let phase = 0;
  let lp = 0;
  const alpha = lowpass ? 1 - Math.exp((-2 * Math.PI * lowpass) / RATE) : 1;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const s = i / RATE;
    const f = freq + (freqEnd - freq) * Math.min(1, s / dur);
    phase += f / RATE;
    let env = s < attack ? s / attack : s < dur ? 1 : Math.max(0, 1 - (s - dur) / release);
    if (decay) env *= Math.exp(-s / decay);
    let v = waves[wave](phase);
    lp += alpha * (v - lp);
    v = lowpass ? lp : v;
    buf[start + i] += v * env * vol;
  }
}

function noise(buf, { t, dur, vol = 0.2, decay = 0.03, highpass = true }) {
  const start = Math.floor(t * RATE);
  let prev = 0;
  for (let i = 0; i < dur * RATE && start + i < buf.length; i++) {
    const r = Math.random() * 2 - 1;
    const v = highpass ? r - prev : r;
    prev = r;
    buf[start + i] += v * vol * Math.exp(-i / RATE / decay);
  }
}

function save(name, buf, { loop = false } = {}) {
  // Gentle limiter, then 16-bit PCM WAV.
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0.0001);
  const gain = Math.min(1, 0.9 / peak);
  if (!loop) {
    const fade = Math.floor(0.01 * RATE);
    for (let i = 0; i < fade; i++) buf[buf.length - 1 - i] *= i / fade;
  }
  const data = Buffer.alloc(buf.length * 2);
  buf.forEach((v, i) => data.writeInt16LE(Math.round(Math.tanh(v * gain) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  const wav = fileURLToPath(new URL(name + '.wav', OUT));
  writeFileSync(wav, Buffer.concat([header, data]));
  if (loop) {
    console.log(`${name}.wav  ${(buf.length / RATE).toFixed(2)}s`);
    return;
  }
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '64k', wav.replace(/\.wav$/, '.mp3')]);
  unlinkSync(wav);
  console.log(`${name}.mp3  ${(buf.length / RATE).toFixed(2)}s`);
}

const buffer = (seconds) => new Float32Array(Math.ceil(seconds * RATE));

// ---------- short effects ----------
{
  const b = buffer(0.12); // countdown tick
  tone(b, { dur: 0.02, freq: 1400, wave: 'sine', vol: 0.5, release: 0.08, decay: 0.03 });
  save('tick', b);
}
{
  const b = buffer(0.35); // "3, 2, 1" beep
  tone(b, { dur: 0.14, freq: note('A5'), wave: 'triangle', vol: 0.45, release: 0.15 });
  save('count', b);
}
{
  const b = buffer(0.6); // "Go!"
  for (const f of ['C6', 'E6', 'G6']) tone(b, { dur: 0.25, freq: note(f), wave: 'triangle', vol: 0.3, release: 0.3 });
  save('go', b);
}
{
  const b = buffer(0.12); // player joined
  tone(b, { dur: 0.06, freq: 500, freqEnd: 1100, wave: 'sine', vol: 0.5, release: 0.05 });
  save('join', b);
}
{
  const b = buffer(1.3); // time's up gong
  for (const [f, v] of [[220, 0.35], [331, 0.18], [440, 0.12], [587, 0.06]]) tone(b, { dur: 0.05, freq: f, freqEnd: f * 0.98, wave: 'sine', vol: v, release: 1.2, decay: 0.6 });
  noise(b, { t: 0, dur: 0.08, vol: 0.15, decay: 0.02 });
  save('timesup', b);
}
{
  const b = buffer(0.9); // correct!
  ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => tone(b, { t: i * 0.08, dur: 0.12, freq: note(n), wave: 'triangle', vol: 0.32, release: 0.35 }));
  tone(b, { t: 0.32, dur: 0.3, freq: note('E6'), wave: 'sine', vol: 0.15, release: 0.3 });
  save('correct', b);
}
{
  const b = buffer(0.7); // wrong
  tone(b, { dur: 0.16, freq: note('D#3'), wave: 'square', vol: 0.18, release: 0.05, lowpass: 900 });
  tone(b, { t: 0.2, dur: 0.3, freq: note('C3'), freqEnd: note('B2'), wave: 'square', vol: 0.18, release: 0.12, lowpass: 900 });
  save('wrong', b);
}
{
  const b = buffer(0.8); // answers revealed
  ['G4', 'B4', 'D5', 'G5'].forEach((n, i) => tone(b, { t: i * 0.04, dur: 0.2, freq: note(n), wave: 'sine', vol: 0.18, release: 0.45 }));
  save('reveal', b);
}
{
  const b = buffer(3.2); // podium fanfare
  const seq = [['G4', 0, 0.16], ['G4', 0.18, 0.16], ['G4', 0.36, 0.16], ['C5', 0.56, 0.5], ['E5', 1.1, 0.25], ['G5', 1.4, 1.1]];
  for (const [n, t, d] of seq) {
    tone(b, { t, dur: d, freq: note(n), wave: 'saw', vol: 0.16, release: 0.25, lowpass: 2400 });
    tone(b, { t, dur: d, freq: note(n) / 2, wave: 'triangle', vol: 0.14, release: 0.25 });
  }
  for (const n of ['C5', 'E5', 'G5', 'C6']) tone(b, { t: 1.4, dur: 1.1, freq: note(n), wave: 'triangle', vol: 0.08, release: 0.6 });
  save('podium', b);
}

// ---------- music loops ----------
function loop(bpm, bars, fill) {
  const beat = 60 / bpm;
  const b = buffer(bars * 4 * beat);
  fill(b, beat);
  return b;
}

{
  // Lobby: bright and bouncy, C – Am – F – G.
  const chords = [['C', 'E', 'G'], ['A', 'C', 'E'], ['F', 'A', 'C'], ['G', 'B', 'D']];
  const roots = ['C3', 'A2', 'F2', 'G2'];
  const b = loop(118, 4, (b, beat) => {
    chords.forEach((ch, bar) => {
      const t0 = bar * 4 * beat;
      for (let i = 0; i < 4; i++) {
        tone(b, { t: t0 + i * beat, dur: beat * 0.35, freq: note(roots[bar]), wave: 'triangle', vol: 0.32, release: 0.06 });
        noise(b, { t: t0 + i * beat + beat / 2, dur: 0.05, vol: 0.05, decay: 0.012 });
      }
      for (const off of [0.5, 1.5, 2.5, 3.5]) for (const n of ch) tone(b, { t: t0 + off * beat, dur: beat * 0.22, freq: note(n + '4'), wave: 'square', vol: 0.045, release: 0.05, lowpass: 2000 });
      const arp = [ch[0] + '5', ch[1] + '5', ch[2] + '5', ch[1] + '5'];
      for (let i = 0; i < 8; i++) tone(b, { t: t0 + i * beat * 0.5, dur: beat * 0.18, freq: note(arp[i % 4]), wave: 'sine', vol: 0.09, release: 0.08 });
    });
  });
  save('lobby', b, { loop: true });
}
{
  // Question: tense ticking pulse in A minor.
  const b = loop(140, 4, (b, beat) => {
    const bass = ['A2', 'A2', 'F2', 'E2'];
    for (let bar = 0; bar < 4; bar++) {
      const t0 = bar * 4 * beat;
      for (let i = 0; i < 8; i++) {
        tone(b, { t: t0 + i * beat * 0.5, dur: beat * 0.2, freq: note(bass[bar]), wave: 'saw', vol: 0.12, release: 0.04, lowpass: 500 });
        noise(b, { t: t0 + i * beat * 0.5, dur: 0.03, vol: i % 2 ? 0.04 : 0.07, decay: 0.008 });
      }
      for (const off of [0, 2]) tone(b, { t: t0 + off * beat, dur: 0.02, freq: 1300, vol: 0.12, release: 0.05, decay: 0.03 });
      tone(b, { t: t0 + 3 * beat, dur: beat * 0.5, freq: note(bar % 2 ? 'E5' : 'C5'), wave: 'triangle', vol: 0.05, release: 0.1 });
    }
  });
  save('question', b, { loop: true });
}
