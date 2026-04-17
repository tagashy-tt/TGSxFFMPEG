# FFmpeg Studio — Browser Extension

Advanced in-browser video processor powered by **FFmpeg.wasm**.
All processing runs **100% locally** — no file is ever uploaded.

---

## Installation (Chrome / Edge)

1. **Download / extract** this folder.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer Mode** (top-right toggle).
4. Click **"Load unpacked"** and select this folder.
5. The extension icon appears in your toolbar.

> **Firefox:** Go to `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `manifest.json`.

---

## Folder Structure

```
ffmpeg-extension/
├── manifest.json       ← Chrome MV3 manifest
├── popup.html          ← Extension popup UI
├── popup.css           ← Industrial dark theme
├── popup.js            ← FFmpeg.wasm processing logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

> **Note:** The icons folder needs PNG files. You can use any 16×16, 48×48, 128×128 PNGs — or remove the `icons` field from `manifest.json` temporarily.

---

## Features

| Feature | Details |
|---|---|
| **Source Media** | Drop file or click to browse — MP4, MOV, AVI, MKV, WEBM |
| **Scale Factor** | 0.1× to 2.0× with live resolution preview |
| **Codec** | H.264, H.265/HEVC, VP9, or stream copy |
| **Bitrate** | Manual (kbps) or automatic CRF quality mode |
| **CRF Quality** | 0–51 slider (0 = lossless, 23 = default balanced) |
| **Output Format** | MP4, WEBM, MKV, MOV |
| **Frame Interpolation** | 60 / 120 / 240 FPS via `minterpolate` (MCI, Blend, Duplicate) |
| **Live Terminal** | Real-time FFmpeg log output in popup |
| **Progress Bar** | Animated percent fill with glow |
| **Download** | Direct download of processed file |
| **Cancel** | Terminates FFmpeg mid-encode and reinitialises engine |

---

## How FFmpeg.wasm Works Here

The extension loads **@ffmpeg/ffmpeg v0.12.x** (single-thread core) via jsDelivr CDN at popup open time. The WASM core is fetched once and cached in the browser. Files are written to an **in-memory virtual filesystem (MEMFS)** — nothing touches your disk except the final download.

### Frame Interpolation (120 FPS)

Uses the `minterpolate` filter with Motion-Compensated Interpolation (MCI):

```
minterpolate='mi_mode=mci:mc_mode=aobmc:me_mode=bidir:fps=120'
```

⚠️ MCI is CPU-intensive. A 1-minute 1080p clip can take 5–15 minutes in WASM.
Use **Blend** or **Duplicate** mode for faster (lower quality) results.

---

## Requirements

- Chrome 90+ / Edge 90+ / Firefox 90+
- **Internet connection** on first load (to fetch FFmpeg.wasm from CDN)
- Sufficient RAM: ~300MB+ for large video files (WASM loads into memory)

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "Engine load failed" | Check internet connection; CDN may be blocked |
| Processing hangs | Use Cancel and retry with lower scale or no interpolation |
| Output is huge | Lower scale factor or increase CRF value |
| No sound in output | Ensure codec ≠ "Copy" if changing format |
