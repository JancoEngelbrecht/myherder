---
name: vite-config
description: Load when configuring Vite, debugging build issues, or working with env variables, proxies, static assets, or CSS. Covers config patterns, environment variables, build optimization, and features. Sources — Vite official docs (vite.dev).
---

# Vite Configuration & Patterns

Official documentation references:
- Config: https://vite.dev/config/
- Env & Mode: https://vite.dev/guide/env-and-mode
- Build: https://vite.dev/guide/build
- Features: https://vite.dev/guide/features

---

## 1. Config File Structure

Use `defineConfig` for type safety and intellisense:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // ...
})
```

### Conditional config (dev vs build)

```js
export default defineConfig(({ command, mode }) => {
  if (command === 'serve') {
    return { /* dev-specific config */ }
  }
  return { /* build-specific config */ }
})
```

### Loading env in config

`.env` files are NOT available in `vite.config.js` by default. Use `loadEnv`:

```js
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    server: {
      port: env.PORT ? parseInt(env.PORT) : 5173
    }
  }
})
```

---

## 2. Environment Variables

### .env file priority (highest to lowest)

```
.env.[mode].local   # mode-specific local (git-ignored)
.env.[mode]         # mode-specific
.env.local          # local overrides (git-ignored)
.env                # baseline
```

### VITE_ prefix requirement

Only variables prefixed with `VITE_` are exposed to client code. This prevents leaking secrets:

```bash
# .env
VITE_API_URL=https://api.example.com   # accessible in client
DB_PASSWORD=secret                      # NOT accessible in client
```

```js
// In application code
console.log(import.meta.env.VITE_API_URL)  // "https://api.example.com"
console.log(import.meta.env.DB_PASSWORD)   // undefined
```

### Built-in variables

- `import.meta.env.MODE` — current mode string
- `import.meta.env.BASE_URL` — base URL from config
- `import.meta.env.PROD` — boolean, true in production
- `import.meta.env.DEV` — boolean, true in development

### TypeScript support

Create `src/vite-env.d.ts` (no imports in this file — imports break type augmentation):

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_APP_TITLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

### Gotchas

- All env vars are strings — booleans/numbers need explicit conversion
- Restart dev server after changing `.env` files
- `VITE_*` vars end up in the client bundle — never put secrets in them
- Use `--mode staging` to load `.env.staging`

### HTML replacement

```html
<title>%VITE_APP_TITLE%</title>
```

---

## 3. Dev Server

### Proxy configuration

```js
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
```

---

## 4. Build Configuration

### Browser targets

Default targets Baseline Widely Available browsers (Chrome 107+, Firefox 104+, Safari 16+). Vite handles syntax transforms only — not polyfills.

For legacy browser support:
```js
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [legacy()]
})
```

### Multi-page apps

```js
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html'
      }
    }
  }
})
```

### Chunk splitting

```js
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia']
        }
      }
    }
  }
})
```

### Base path for deployment

```js
export default defineConfig({
  base: '/my-app/'  // for nested deployment paths
})
```

Use `import.meta.env.BASE_URL` in code for dynamic asset references.

---

## 5. CSS Handling

### CSS Modules

Files ending in `.module.css` return a module object:

```js
import styles from './component.module.css'
```

### Preprocessors

Built-in support — just install the preprocessor:

```bash
npm install -D sass
```

No Vite plugin needed. PostCSS config is auto-detected and applied to all CSS.

---

## 6. Static Assets

```js
import imgUrl from './img.png'          // resolved URL
import rawText from './file.txt?raw'    // raw string content
import workerUrl from './worker?worker' // web worker
```

### JSON imports (tree-shakeable)

```js
import { field } from './data.json'  // named import — only imports `field`
```

### Glob imports

```js
const modules = import.meta.glob('./modules/*.js')        // lazy (default)
const modules = import.meta.glob('./modules/*.js', { eager: true }) // eager
```

---

## 7. Common Pitfalls

- `index.html` must be at project root — it's the entry point, not in `public/`
- `public/` files are served as-is, not processed — reference with absolute `/` paths
- Don't use `process.env` in client code — use `import.meta.env`
- `vite preview` is for local preview only, not a production server
- Node.js 20.19+ or 22.12+ required
