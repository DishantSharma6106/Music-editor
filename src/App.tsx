import { useState, useRef, useEffect, ChangeEvent } from 'react';
import './index.css';

// Utility to generate a synthetic impulse response for the ConvolverNode
function createImpulseResponse(audioContext: AudioContext, duration: number, decay: number) {
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * duration;
  const impulse = audioContext.createBuffer(2, length, sampleRate);
  
  for (let i = 0; i < 2; i++) {
    const channel = impulse.getChannelData(i);
    for (let j = 0; j < length; j++) {
      channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, decay);
    }
  }
  return impulse;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  // Effects parameters
  const [speed, setSpeed] = useState(0.85); // 0.5 to 1.5
  const [reverb, setReverb] = useState(0.6); // 0 to 1
  const [filterFreq, setFilterFreq] = useState(2500); // 500 to 20000

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);

  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);

  // Initialize Audio Context and Nodes
  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    
    const convolver = ctx.createConvolver();
    // Create a 3 second reverb with decay 2.0
    convolver.buffer = createImpulseResponse(ctx, 3.0, 2.0);

    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();

    // Routing
    filter.connect(dryGain);
    filter.connect(convolver);
    convolver.connect(wetGain);
    
    dryGain.connect(ctx.destination);
    wetGain.connect(ctx.destination);

    filterNodeRef.current = filter;
    convolverRef.current = convolver;
    dryGainRef.current = dryGain;
    wetGainRef.current = wetGain;

    return () => {
      ctx.close();
    };
  }, []);

  // Update effect parameters in real-time
  useEffect(() => {
    if (sourceRef.current) {
      sourceRef.current.playbackRate.setTargetAtTime(speed, audioCtxRef.current!.currentTime, 0.1);
    }
    if (filterNodeRef.current) {
      filterNodeRef.current.frequency.setTargetAtTime(filterFreq, audioCtxRef.current!.currentTime, 0.1);
    }
    if (dryGainRef.current && wetGainRef.current) {
      // Equal power crossfade
      const dryVal = Math.cos(reverb * 0.5 * Math.PI);
      const wetVal = Math.cos((1.0 - reverb) * 0.5 * Math.PI);
      dryGainRef.current.gain.setTargetAtTime(dryVal, audioCtxRef.current!.currentTime, 0.1);
      wetGainRef.current.gain.setTargetAtTime(wetVal, audioCtxRef.current!.currentTime, 0.1);
    }
  }, [speed, reverb, filterFreq]);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    
    setFile(uploadedFile);
    setIsReady(false);
    setIsPlaying(false);
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
    }
    pausedAtRef.current = 0;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const arrayBuffer = ev.target?.result as ArrayBuffer;
      if (audioCtxRef.current) {
        const decodedBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
        bufferRef.current = decodedBuffer;
        setIsReady(true);
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const togglePlay = () => {
    if (!audioCtxRef.current || !bufferRef.current || !filterNodeRef.current) return;
    const ctx = audioCtxRef.current;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    if (isPlaying) {
      // Pause
      sourceRef.current?.stop();
      pausedAtRef.current += (ctx.currentTime - startTimeRef.current) * speed;
      setIsPlaying(false);
    } else {
      // Play
      const source = ctx.createBufferSource();
      source.buffer = bufferRef.current;
      source.playbackRate.value = speed;
      source.connect(filterNodeRef.current);
      
      const offset = pausedAtRef.current % bufferRef.current.duration;
      source.start(0, offset);
      
      startTimeRef.current = ctx.currentTime;
      sourceRef.current = source;
      
      source.onended = () => {
        if (sourceRef.current === source) {
           setIsPlaying(false);
           pausedAtRef.current = 0;
        }
      };

      setIsPlaying(true);
    }
  };

  const handleExport = async () => {
    if (!bufferRef.current || !audioCtxRef.current) return;
    
    const duration = bufferRef.current.duration / speed + 3.0; // add tail for reverb
    const offlineCtx = new OfflineAudioContext(2, 44100 * duration, 44100);

    // Setup offline nodes
    const source = offlineCtx.createBufferSource();
    source.buffer = bufferRef.current;
    source.playbackRate.value = speed;

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;

    const convolver = offlineCtx.createConvolver();
    convolver.buffer = createImpulseResponse(offlineCtx, 3.0, 2.0);

    const dryGain = offlineCtx.createGain();
    const wetGain = offlineCtx.createGain();
    
    const dryVal = Math.cos(reverb * 0.5 * Math.PI);
    const wetVal = Math.cos((1.0 - reverb) * 0.5 * Math.PI);
    dryGain.gain.value = dryVal;
    wetGain.gain.value = wetVal;

    // Routing
    source.connect(filter);
    filter.connect(dryGain);
    filter.connect(convolver);
    convolver.connect(wetGain);
    
    dryGain.connect(offlineCtx.destination);
    wetGain.connect(offlineCtx.destination);

    source.start(0);

    try {
      const renderedBuffer = await offlineCtx.startRendering();
      // Convert AudioBuffer to WAV
      const wavData = encodeWAV(renderedBuffer);
      const blob = new Blob([new DataView(wavData)], { type: 'audio/wav' });
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${file?.name.split('.')[0]}_slowed_reverb.wav`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch(e) {
      console.error("Export failed", e);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Slowed + Reverb</h1>
        <p className="subtitle">Transform any track into a late-night vibe</p>
      </header>

      {!file ? (
        <label className="upload-area">
          <input type="file" accept="audio/*" className="hidden-input" onChange={handleFileUpload} />
          <div className="upload-icon">🎧</div>
          <div className="upload-text">Click or Drop audio file here</div>
          <div className="upload-subtext">Supports MP3, WAV, FLAC</div>
        </label>
      ) : (
        <>
          <div className="track-info">
            <div className="track-icon">🎵</div>
            <div className="track-details">
              <div className="track-name">{file.name}</div>
              <div className="track-time">{isReady ? 'Ready to play' : 'Processing audio...'}</div>
            </div>
            <label style={{cursor: 'pointer', color: 'var(--accent)', fontSize: '0.9rem'}}>
              Change Track
              <input type="file" accept="audio/*" className="hidden-input" onChange={handleFileUpload} />
            </label>
          </div>

          <div className="controls-section">
            <div className="control-group">
              <div className="control-header">
                <span>Speed / Pitch</span>
                <span className="control-value">{speed.toFixed(2)}x</span>
              </div>
              <input 
                type="range" min="0.5" max="1.5" step="0.01" 
                value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} 
                disabled={!isReady}
              />
            </div>

            <div className="control-group">
              <div className="control-header">
                <span>Reverb Intensity</span>
                <span className="control-value">{Math.round(reverb * 100)}%</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.01" 
                value={reverb} onChange={e => setReverb(parseFloat(e.target.value))}
                disabled={!isReady}
              />
            </div>

            <div className="control-group">
              <div className="control-header">
                <span>Low-pass Filter (Muffle)</span>
                <span className="control-value">{filterFreq} Hz</span>
              </div>
              <input 
                type="range" min="500" max="20000" step="100" 
                value={filterFreq} onChange={e => setFilterFreq(parseFloat(e.target.value))}
                disabled={!isReady}
              />
            </div>
          </div>

          <div className="action-buttons">
            <button className="btn-play" onClick={togglePlay} disabled={!isReady}>
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <button className="btn-export" onClick={handleExport} disabled={!isReady}>
              ⬇ Export WAV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Helper to encode AudioBuffer to WAV format
function encodeWAV(samples: AudioBuffer) {
  const numChannels = samples.numberOfChannels;
  const sampleRate = samples.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let interleaved;
  if (numChannels === 2) {
    const left = samples.getChannelData(0);
    const right = samples.getChannelData(1);
    interleaved = new Float32Array(left.length + right.length);
    for (let i = 0, j = 0; i < left.length; i++) {
      interleaved[j++] = left[i];
      interleaved[j++] = right[i];
    }
  } else {
    interleaved = samples.getChannelData(0);
  }

  const dataLength = interleaved.length * (bitDepth / 8);
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  
  // FMT sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  
  // Data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < interleaved.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export default App;
