# German Bridge Explainer Generator

This folder contains the reproducible source for the generated German Bridge rules explainer videos.

## Outputs

- `Project Assets/Voiceovers/German Bridge Explainer Narration Original.mp3`
  - Original ElevenLabs narration file supplied by Khoi.
- `Project Assets/Voiceovers/German Bridge Explainer Narration 90s.mp3`
  - Working narration, gently sped up with FFmpeg `atempo=1.15` to fit the requested 60-90 second target.
- `Project Assets/Videos/German Bridge Rules Explainer Landscape.mp4`
  - 1920x1080 landscape video.
- `Project Assets/Videos/German Bridge Rules Explainer Vertical.mp4`
  - 1080x1920 vertical video.

## Script Mapping

- `build-video.mjs`
  - Renders animated PNG frames with `sharp`.
  - Composes frames with the narration using FFmpeg.
  - Produces both landscape and vertical MP4 files.
- `narration-script.md`
  - The narration text used to generate the ElevenLabs voice.
- `package.json`
  - Local generator dependency manifest. The app itself does not need these dependencies.

## Re-run Instructions

From the project root:

```bash
cd "Generation Scripts/German Bridge Explainer"
npm install
npm run render
```

To re-render only one format while iterating:

```bash
node build-video.mjs --format=landscape
node build-video.mjs --format=vertical
```

The script expects this audio file to exist:

```text
../../Project Assets/Voiceovers/German Bridge Explainer Narration 90s.mp3
```

## Tooling

This generator uses local open-source tools only:

- FFmpeg for audio speed adjustment and MP4 assembly.
- `sharp` / libvips for rendering SVG animation frames to PNG.

No third-party video-generation service is required. ElevenLabs was only used to create the narration audio supplied by the user.
