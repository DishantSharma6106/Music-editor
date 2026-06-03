# 🎧 Reverie

**Drift into sound.** A premium browser-based music editor that transforms any audio track with real-time effects. No uploads to servers — everything runs locally in your browser using the Web Audio API.

![Built with React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

### 🔗 [**Try it live → reverie-swart.vercel.app**](https://reverie-swart.vercel.app/)

---

## ✨ Features

### 🎛️ Audio Effects
- **Speed / Pitch** — Slow down or speed up (0.5x to 1.5x)
- **Reverb** — Convolution reverb with synthetic impulse response (0–100%)
- **Low-pass Filter** — Muffle and warm your audio (200 Hz – 20 kHz)
- **Bass Boost** — Peaking EQ at 80 Hz (0–24 dB)
- **Volume** — Master gain control (0–150%)

### 🎨 Presets
| Preset | Description |
|--------|-------------|
| 🌙 Slowed + Reverb | Late-night vibes |
| ☕ Lo-Fi Chill | Study beats feel |
| 🔊 Bass Cave | Heavy sub-bass |
| ⚡ Nightcore | Sped up & bright |
| 🫧 Underwater | Deep & muffled |
| ✨ Clean | No effects applied |

### 📊 Visualizations
- **Waveform Display** — Bars-style visualization drawn from the audio buffer with a glowing playhead
- **Spectrum Analyzer** — Real-time frequency visualization with gradient bars

### 🎮 Controls
- Play / Pause / Seek by clicking waveform or progress bar
- Skip forward/back ±10 seconds
- Keyboard shortcut: `Space` to toggle play/pause
- Drag & drop audio file upload

### 📦 Export
- Offline render with all effects baked in
- Export as `.wav` file
- Loading state with spinner during render

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build Tool | Vite 8 |
| Audio Engine | Web Audio API (AudioContext, ConvolverNode, BiquadFilter, AnalyserNode) |
| Visualization | HTML5 Canvas |
| Styling | Vanilla CSS with glassmorphism, gradients & micro-animations |
| Font | Inter + JetBrains Mono |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Install & Run
```bash
# Clone the repo
git clone https://github.com/DishantSharma6106/Music-editor.git
cd Music-editor

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open **http://localhost:5173/** in your browser.

### Build for Production
```bash
npm run build
npm run preview
```

---

## 📁 Project Structure

```
Music-editor/
├── public/
│   └── favicon.svg          # Gradient music note icon
├── src/
│   ├── App.tsx              # Main app — audio engine, UI, visualizations
│   ├── index.css            # Premium design system
│   └── main.tsx             # React entry point
├── index.html               # HTML shell with SEO meta tags
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🎵 How It Works

1. **Upload** — Drop or select any audio file (MP3, WAV, FLAC, OGG)
2. **Tweak** — Adjust effects with sliders or pick a preset
3. **Preview** — Hit play and hear changes in real-time
4. **Export** — Render offline with all effects and download as WAV

The entire DSP pipeline runs client-side:

```
Source → Bass Boost (Peaking EQ) → Low-pass Filter → Reverb (Dry/Wet) → Master Gain → Analyser → Output
```

---

## 📄 License

MIT — free to use, modify, and distribute.

---

<p align="center">
  Built with 💜 by <a href="https://github.com/DishantSharma6106">Dishant Sharma</a>
</p>
