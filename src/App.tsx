import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import './index.css';

/* ─── Types ─── */
interface Effects {
  speed: number;
  reverb: number;
  filterFreq: number;
  bassBoost: number;
  volume: number;
}

interface Preset {
  id: string;
  name: string;
  icon: string;
  desc: string;
  settings: Effects;
}

/* ─── Constants ─── */
const DEFAULT_EFFECTS: Effects = {
  speed: 1.0, reverb: 0, filterFreq: 20000, bassBoost: 0, volume: 1.0,
};

const PRESETS: Preset[] = [
  { id: 'slowed', name: 'Slowed + Reverb', icon: '🌙', desc: 'Late night vibes',
    settings: { speed: 0.85, reverb: 0.6, filterFreq: 2500, bassBoost: 5, volume: 1.0 } },
  { id: 'lofi', name: 'Lo-Fi Chill', icon: '☕', desc: 'Study beats',
    settings: { speed: 0.92, reverb: 0.35, filterFreq: 1200, bassBoost: 3, volume: 0.9 } },
  { id: 'bass', name: 'Bass Cave', icon: '🔊', desc: 'Heavy bass',
    settings: { speed: 0.95, reverb: 0.25, filterFreq: 5000, bassBoost: 18, volume: 0.85 } },
  { id: 'night', name: 'Nightcore', icon: '⚡', desc: 'Speed up',
    settings: { speed: 1.3, reverb: 0.2, filterFreq: 18000, bassBoost: 0, volume: 1.0 } },
  { id: 'underwater', name: 'Underwater', icon: '🫧', desc: 'Deep & muffled',
    settings: { speed: 0.75, reverb: 0.8, filterFreq: 800, bassBoost: 8, volume: 0.8 } },
  { id: 'clean', name: 'Clean', icon: '✨', desc: 'No effects',
    settings: { ...DEFAULT_EFFECTS } },
];

/* ─── Utilities ─── */
function createImpulse(ctx: BaseAudioContext, dur: number, decay: number) {
  const len = ctx.sampleRate * dur;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function encodeWAV(buf: AudioBuffer) {
  const nCh = buf.numberOfChannels, sr = buf.sampleRate, bits = 16;
  let inter: Float32Array;
  if (nCh === 2) {
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    inter = new Float32Array(L.length * 2);
    for (let i = 0, j = 0; i < L.length; i++) { inter[j++] = L[i]; inter[j++] = R[i]; }
  } else { inter = buf.getChannelData(0); }
  const dLen = inter.length * 2;
  const ab = new ArrayBuffer(44 + dLen);
  const v = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + dLen, true); ws(8, 'WAVE');
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, nCh, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * nCh * 2, true); v.setUint16(32, nCh * 2, true); v.setUint16(34, bits, true);
  ws(36, 'data'); v.setUint32(40, dLen, true);
  let off = 44;
  for (let i = 0; i < inter.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, inter[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return ab;
}

/* ─── App ─── */
export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [fx, setFx] = useState<Effects>({ ...DEFAULT_EFFECTS });

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const bassRef = useRef<BiquadFilterNode | null>(null);
  const convRef = useRef<ConvolverNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTRef = useRef(0);
  const pausedRef = useRef(0);
  const rafRef = useRef(0);

  // Canvas refs
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const specCanvasRef = useRef<HTMLCanvasElement>(null);

  // Init audio context
  useEffect(() => {
    const ctx = new AudioContext();
    const bass = ctx.createBiquadFilter(); bass.type = 'peaking'; bass.frequency.value = 80; bass.Q.value = 1.2; bass.gain.value = 0;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 20000;
    const conv = ctx.createConvolver(); conv.buffer = createImpulse(ctx, 3.0, 2.0);
    const dry = ctx.createGain(); const wet = ctx.createGain(); wet.gain.value = 0;
    const master = ctx.createGain();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.8;

    bass.connect(filt);
    filt.connect(dry); filt.connect(conv);
    conv.connect(wet);
    dry.connect(master); wet.connect(master);
    master.connect(analyser); analyser.connect(ctx.destination);

    ctxRef.current = ctx; bassRef.current = bass; filterRef.current = filt;
    convRef.current = conv; dryRef.current = dry; wetRef.current = wet;
    masterRef.current = master; analyserRef.current = analyser;

    return () => { ctx.close(); };
  }, []);

  // Update FX params live
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (srcRef.current) srcRef.current.playbackRate.setTargetAtTime(fx.speed, t, 0.08);
    if (filterRef.current) filterRef.current.frequency.setTargetAtTime(fx.filterFreq, t, 0.08);
    if (bassRef.current) bassRef.current.gain.setTargetAtTime(fx.bassBoost, t, 0.08);
    if (masterRef.current) masterRef.current.gain.setTargetAtTime(fx.volume, t, 0.08);
    if (dryRef.current && wetRef.current) {
      dryRef.current.gain.setTargetAtTime(Math.cos(fx.reverb * 0.5 * Math.PI), t, 0.08);
      wetRef.current.gain.setTargetAtTime(Math.cos((1 - fx.reverb) * 0.5 * Math.PI), t, 0.08);
    }
  }, [fx]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isReady && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Draw waveform
  const drawWaveform = useCallback(() => {
    const canvas = waveCanvasRef.current;
    const buffer = bufRef.current;
    if (!canvas || !buffer) return;
    const c = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    c.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    c.clearRect(0, 0, W, H);

    const data = buffer.getChannelData(0);
    const barW = 3, gap = 1.5;
    const bars = Math.floor(W / (barW + gap));
    const samplesPerBar = Math.floor(data.length / bars);
    const progress = duration > 0 ? currentTime / duration : 0;
    const half = H / 2;

    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < samplesPerBar; j++) { const s = data[i * samplesPerBar + j] || 0; sum += s * s; }
      const rms = Math.sqrt(sum / samplesPerBar);
      const h = Math.max(2, rms * H * 2.5);
      const x = i * (barW + gap);
      const frac = i / bars;
      if (frac <= progress) {
        c.fillStyle = `rgba(139, 92, 246, ${0.6 + rms * 0.8})`;
      } else {
        c.fillStyle = `rgba(255, 255, 255, ${0.08 + rms * 0.15})`;
      }
      c.beginPath();
      c.roundRect(x, half - h / 2, barW, h, 1.5);
      c.fill();
    }

    if (progress > 0 && progress < 1) {
      const px = progress * W;
      c.save();
      c.shadowColor = '#8b5cf6'; c.shadowBlur = 8;
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px, 4); c.lineTo(px, H - 4); c.stroke();
      c.restore();
    }
  }, [currentTime, duration]);

  // Draw spectrum
  const drawSpectrum = useCallback(() => {
    const canvas = specCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const c = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    c.scale(dpr, dpr);
    const W = rect.width, H = rect.height;

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
    c.clearRect(0, 0, W, H);

    const bars = 48;
    const barW = W / bars - 2;
    for (let i = 0; i < bars; i++) {
      const idx = Math.floor(i * freqData.length / bars);
      const v = freqData[idx] / 255;
      const h = Math.max(1, v * H * 0.9);
      const x = i * (barW + 2) + 1;
      const grad = c.createLinearGradient(0, H, 0, H - h);
      grad.addColorStop(0, 'rgba(139,92,246,0.7)');
      grad.addColorStop(1, `rgba(236,72,153,${0.3 + v * 0.5})`);
      c.fillStyle = grad;
      c.beginPath();
      c.roundRect(x, H - h, barW, h, 2);
      c.fill();
    }
  }, []);

  // Animation loop
  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      if (isPlaying && ctxRef.current && bufRef.current) {
        const elapsed = (ctxRef.current.currentTime - startTRef.current) * fx.speed;
        const pos = pausedRef.current + elapsed;
        if (pos < bufRef.current.duration) {
          setCurTime(pos);
        }
      }
      drawWaveform();
      if (isPlaying) drawSpectrum();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, drawWaveform, drawSpectrum, fx.speed]);

  // File loading
  const loadFile = async (f: File) => {
    setFile(f); setIsReady(false); setIsPlaying(false); setActivePreset(null);
    if (srcRef.current) { try { srcRef.current.stop(); } catch {} srcRef.current.disconnect(); }
    pausedRef.current = 0; setCurTime(0);

    const ab = await f.arrayBuffer();
    const ctx = ctxRef.current!;
    if (ctx.state === 'suspended') await ctx.resume();
    const decoded = await ctx.decodeAudioData(ab);
    bufRef.current = decoded;
    setDuration(decoded.duration);
    setIsReady(true);
  };

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) loadFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('audio/')) loadFile(f);
  };

  // Playback
  const startPlayback = useCallback((offset: number) => {
    const ctx = ctxRef.current, buf = bufRef.current, bass = bassRef.current;
    if (!ctx || !buf || !bass) return;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = fx.speed;
    src.connect(bass);
    src.start(0, offset);
    startTRef.current = ctx.currentTime;
    pausedRef.current = offset;
    srcRef.current = src;
    src.onended = () => { if (srcRef.current === src) { setIsPlaying(false); pausedRef.current = 0; setCurTime(0); } };
    setIsPlaying(true);
  }, [fx.speed]);

  const togglePlay = useCallback(() => {
    if (!ctxRef.current || !bufRef.current || !isReady) return;
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    if (isPlaying) {
      srcRef.current?.stop();
      const elapsed = (ctxRef.current.currentTime - startTRef.current) * fx.speed;
      pausedRef.current += elapsed;
      setIsPlaying(false);
    } else {
      const off = pausedRef.current % bufRef.current.duration;
      startPlayback(off);
    }
  }, [isPlaying, isReady, fx.speed, startPlayback]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!bufRef.current || !isReady) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = frac * bufRef.current.duration;
    const wasPlaying = isPlaying;
    if (isPlaying) { try { srcRef.current?.stop(); } catch {} setIsPlaying(false); }
    pausedRef.current = t; setCurTime(t);
    if (wasPlaying) startPlayback(t);
  };

  const handleWaveSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!bufRef.current || !isReady) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = frac * bufRef.current.duration;
    const wasPlaying = isPlaying;
    if (isPlaying) { try { srcRef.current?.stop(); } catch {} setIsPlaying(false); }
    pausedRef.current = t; setCurTime(t);
    if (wasPlaying) startPlayback(t);
  };

  const skipBy = (sec: number) => {
    if (!bufRef.current) return;
    const wasPlaying = isPlaying;
    if (isPlaying) { try { srcRef.current?.stop(); } catch {} setIsPlaying(false); }
    const elapsed = isPlaying && ctxRef.current
      ? (ctxRef.current.currentTime - startTRef.current) * fx.speed
      : 0;
    const cur = pausedRef.current + elapsed;
    const next = Math.max(0, Math.min(bufRef.current.duration, cur + sec));
    pausedRef.current = next; setCurTime(next);
    if (wasPlaying) startPlayback(next);
  };

  // Presets
  const applyPreset = (p: Preset) => {
    setFx({ ...p.settings }); setActivePreset(p.id);
  };

  // Export
  const handleExport = async () => {
    if (!bufRef.current) return;
    setIsExporting(true);
    try {
      const dur = bufRef.current.duration / fx.speed + 3;
      const off = new OfflineAudioContext(2, 44100 * dur, 44100);
      const src = off.createBufferSource(); src.buffer = bufRef.current; src.playbackRate.value = fx.speed;
      const bass = off.createBiquadFilter(); bass.type = 'peaking'; bass.frequency.value = 80; bass.Q.value = 1.2; bass.gain.value = fx.bassBoost;
      const filt = off.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = fx.filterFreq;
      const conv = off.createConvolver(); conv.buffer = createImpulse(off, 3, 2);
      const dry = off.createGain(); dry.gain.value = Math.cos(fx.reverb * 0.5 * Math.PI);
      const wet = off.createGain(); wet.gain.value = Math.cos((1 - fx.reverb) * 0.5 * Math.PI);
      const master = off.createGain(); master.gain.value = fx.volume;
      src.connect(bass); bass.connect(filt);
      filt.connect(dry); filt.connect(conv);
      conv.connect(wet);
      dry.connect(master); wet.connect(master);
      master.connect(off.destination);
      src.start(0);
      const rendered = await off.startRendering();
      const wav = encodeWAV(rendered);
      const blob = new Blob([new DataView(wav)], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${file?.name.split('.')[0] || 'track'}_edited.wav`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err) { console.error('Export failed', err); }
    setIsExporting(false);
  };

  const setEffect = (key: keyof Effects, val: number) => {
    setFx(prev => ({ ...prev, [key]: val }));
    setActivePreset(null);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  /* ─── Render ─── */
  return (
    <>
      <div className="bg-orbs">
        <div className="bg-orb bg-orb--1" />
        <div className="bg-orb bg-orb--2" />
        <div className="bg-orb bg-orb--3" />
      </div>

      <div className="app">
        <div className="main-panel">
          {/* Header */}
          <header className="app-header">
            <div className="app-logo">
              <div className="logo-icon">🎧</div>
              <h1 className="app-title">Reverie</h1>
            </div>
            <p className="app-subtitle">Drift into sound</p>
          </header>

          {!file ? (
            /* Upload Zone */
            <label
              className={`upload-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input type="file" accept="audio/*" className="hidden-input" onChange={handleUpload} />
              <div className="upload-icon">🎵</div>
              <div className="upload-title">Drop your track here</div>
              <div className="upload-subtitle">or click to browse · <span>MP3, WAV, FLAC, OGG</span></div>
            </label>
          ) : (
            <>
              {/* Track Bar */}
              <div className="track-bar">
                <div className="track-art">🎵</div>
                <div className="track-meta">
                  <div className="track-name">{file.name}</div>
                  <div className={`track-status ${isReady ? 'ready' : ''}`}>
                    {isReady ? `Ready · ${formatTime(duration)}` : 'Decoding audio...'}
                  </div>
                </div>
                <label className="change-track-btn">
                  Change
                  <input type="file" accept="audio/*" className="hidden-input" onChange={handleUpload} />
                </label>
              </div>

              {/* Visualizer */}
              <div className="visualizer-section">
                <div className="waveform-container">
                  <canvas ref={waveCanvasRef} className="waveform-canvas" onClick={handleWaveSeek} />
                </div>
                <canvas ref={specCanvasRef} className="spectrum-canvas" />
              </div>

              {/* Transport */}
              <div className="transport">
                <div className="time-row">
                  <span className="time-current">{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="progress-bar-wrapper" onClick={handleSeek}>
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="transport-buttons">
                  <button className="btn-transport" onClick={() => skipBy(-10)} disabled={!isReady} title="Back 10s">⏪</button>
                  <button className="btn-transport btn-play-main" onClick={togglePlay} disabled={!isReady}>
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                  <button className="btn-transport" onClick={() => skipBy(10)} disabled={!isReady} title="Forward 10s">⏩</button>
                </div>
              </div>

              {/* Presets */}
              <div className="presets-section">
                <div className="section-label">Presets</div>
                <div className="presets-grid">
                  {PRESETS.map(p => (
                    <button key={p.id} className={`preset-card ${activePreset === p.id ? 'active' : ''}`} onClick={() => applyPreset(p)}>
                      <div className="preset-icon">{p.icon}</div>
                      <div className="preset-name">{p.name}</div>
                      <div className="preset-desc">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Effects */}
              <div className="effects-section">
                <div className="section-label">Effects</div>

                <div className="effect-row">
                  <div className="effect-header">
                    <span className="effect-label"><span className="effect-label-icon">🐌</span> Speed / Pitch</span>
                    <span className="effect-value">{fx.speed.toFixed(2)}x</span>
                  </div>
                  <input type="range" min="0.5" max="1.5" step="0.01" value={fx.speed}
                    onChange={e => setEffect('speed', +e.target.value)} disabled={!isReady} />
                </div>

                <div className="effect-row">
                  <div className="effect-header">
                    <span className="effect-label"><span className="effect-label-icon">🌊</span> Reverb</span>
                    <span className="effect-value">{Math.round(fx.reverb * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={fx.reverb}
                    onChange={e => setEffect('reverb', +e.target.value)} disabled={!isReady} />
                </div>

                <div className="effect-row">
                  <div className="effect-header">
                    <span className="effect-label"><span className="effect-label-icon">🎚️</span> Low-pass Filter</span>
                    <span className="effect-value">{fx.filterFreq >= 1000 ? `${(fx.filterFreq / 1000).toFixed(1)}k` : fx.filterFreq} Hz</span>
                  </div>
                  <input type="range" min="200" max="20000" step="100" value={fx.filterFreq}
                    onChange={e => setEffect('filterFreq', +e.target.value)} disabled={!isReady} />
                </div>

                <div className="effect-row">
                  <div className="effect-header">
                    <span className="effect-label"><span className="effect-label-icon">💥</span> Bass Boost</span>
                    <span className="effect-value">{fx.bassBoost} dB</span>
                  </div>
                  <input type="range" min="0" max="24" step="1" value={fx.bassBoost}
                    onChange={e => setEffect('bassBoost', +e.target.value)} disabled={!isReady} />
                </div>

                <div className="effect-row">
                  <div className="effect-header">
                    <span className="effect-label"><span className="effect-label-icon">🔉</span> Volume</span>
                    <span className="effect-value">{Math.round(fx.volume * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="1.5" step="0.01" value={fx.volume}
                    onChange={e => setEffect('volume', +e.target.value)} disabled={!isReady} />
                </div>
              </div>

              {/* Actions */}
              <div className="actions-row">
                <button className={`btn-export ${isExporting ? 'exporting' : ''}`}
                  onClick={handleExport} disabled={!isReady || isExporting}>
                  {isExporting ? <><div className="spinner" /> Rendering...</> : <>⬇ Export WAV</>}
                </button>
                <button className="btn-reset" onClick={() => { setFx({ ...DEFAULT_EFFECTS }); setActivePreset(null); }}>
                  Reset
                </button>
              </div>

              <div className="keyboard-hint">
                Press <kbd>Space</kbd> to play/pause
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
