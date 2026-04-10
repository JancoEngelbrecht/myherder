import { defineConfig, engines } from '@argo-video/cli';

export default defineConfig({
  baseURL: 'https://myherder.co.za',
  demosDir: 'demos',
  outputDir: 'videos',
  tts: {
    engine: engines.edgeTts({ voice: 'af-ZA-AdriNeural' }),
    defaultVoice: 'af-ZA-AdriNeural',
    defaultSpeed: 1.0,
  },
  video: {
    width: 1920,
    height: 1080,
    fps: 30,
    browser: 'chromium',
  },
  export: {
    transition: { type: 'fade-through-black', durationMs: 500 },
    crf: 18,
  },
});
