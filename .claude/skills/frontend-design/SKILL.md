---
name: frontend-design
description: Load when building or reviewing UI. Covers typography, color/contrast, spatial design, motion, interaction patterns, responsive design, and UX writing. Prevents generic "AI look" with concrete anti-patterns. Sources — Impeccable (impeccable.style, Apache 2.0), WCAG 2.1, MDN Web Docs.
---

# Frontend Design

## The AI Slop Test

Before anything else — would someone immediately recognize this as AI-generated? Common tells:

- Inter/system font with no personality
- Purple/blue gradient accents, cyan-on-dark palettes
- Cards nested in cards nested in cards
- Gray text on colored backgrounds (fails contrast)
- Every section is a centered card grid
- Glassmorphism, glow effects, gradient text
- Pure black backgrounds with neon accents
- Uniform spacing everywhere — no visual rhythm
- Bounce/elastic animations
- "Welcome to [App]" hero with generic tagline

If your UI has 3+ of these, rethink the aesthetic direction.

---

## Typography

### Modular Scale

Use a ratio-based type scale (5 sizes max). Pick a ratio — 1.25 (minor third) for compact UIs, 1.333 (perfect fourth) for editorial:

```css
:root {
  --text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --text-sm: clamp(0.875rem, 0.8rem + 0.35vw, 1rem);
  --text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --text-lg: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
  --text-xl: clamp(1.563rem, 1.3rem + 1.3vw, 2rem);
}
```

### Font Selection

Avoid overused defaults: Inter, Roboto, Open Sans. Distinctive alternatives:
- **Sans-serif**: Instrument Sans, Plus Jakarta Sans, General Sans, Satoshi
- **Serif**: Fraunces, Literata, Source Serif 4
- **Mono**: JetBrains Mono, Fira Code, IBM Plex Mono

One well-chosen typeface in multiple weights beats two competing fonts. If pairing, contrast structurally (serif + sans-serif), don't pair fonts that are similar.

### Technical

- `font-display: swap` on all `@font-face` declarations
- Body text minimum 16px (1rem) — never smaller
- Line height: 1.5 for body, 1.2 for headings, 1.8 for long-form
- Use `rem` for font sizes, `em` for component-relative spacing
- Enable OpenType features when available: `font-variant-numeric: tabular-nums` for data tables

---

## Color & Contrast

### Use OKLCH

OKLCH produces perceptually uniform colors — equal lightness steps actually look equal (unlike HSL):

```css
:root {
  --brand-primary: oklch(55% 0.25 250);     /* vivid blue */
  --brand-light: oklch(85% 0.08 250);       /* tinted surface */
  --brand-dark: oklch(30% 0.12 250);        /* deep variant */
}
```

Reduce chroma as you approach white or black to avoid garish results.

### Palette Structure

| Role | Count | Purpose |
|------|-------|---------|
| Primary | 3-5 shades | Brand, CTAs |
| Neutral | 9-11 shades | Text, backgrounds, borders |
| Semantic | 4 colors × 2-3 shades | Success, error, warning, info |
| Surface | 2-3 variants | Elevation levels |

**Tinted neutrals**: Never use pure gray. Add subtle brand hue — even `oklch(95% 0.01 250)` creates subconscious cohesion vs pure `oklch(95% 0 0)`.

### WCAG Contrast Requirements

| Element | Minimum ratio |
|---------|--------------|
| Body text | 4.5:1 |
| Large text (18px+ bold, 24px+ regular) | 3:1 |
| UI components and borders | 3:1 |

**Common failures**: Light gray on white, gray text on colored backgrounds, red/green only distinction, pure black (#000) for large text areas.

### Dark Mode

Dark mode is not inverted light mode — it requires distinct decisions:
- Background: `oklch(12-18% lightness)`, never pure black
- Use lighter surfaces for elevation (not shadows)
- Desaturate accent colors slightly
- Test contrast ratios separately — they shift in dark mode

---

## Spatial Design

### Spacing System

Use a 4pt base unit: `4, 8, 12, 16, 24, 32, 48, 64, 96px`. Name tokens by purpose, not value:

```css
:root {
  --space-xs: 4px;    /* tight: icon-to-label */
  --space-sm: 8px;    /* compact: related items */
  --space-md: 16px;   /* default: form fields, list items */
  --space-lg: 24px;   /* sections within a group */
  --space-xl: 48px;   /* major section breaks */
  --space-2xl: 96px;  /* page-level separation */
}
```

Use `gap` over margins for adjacent elements. Never use arbitrary spacing values — stick to the scale.

### Layout

```css
/* Responsive grid without breakpoints */
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-lg); }
```

Don't wrap everything in cards — not everything needs a container. Use whitespace and grouping instead.

### Visual Hierarchy

The squint test: blur your eyes — can you still tell what's primary, secondary, tertiary? Layer multiple cues: size + weight + color + position + space. Don't rely on size alone.

### Touch Targets

Minimum 44×44px tap area, even if the visible element is smaller. Use padding, not just visual size.

---

## Motion Design

### Timing Rules

| Action | Duration | Example |
|--------|----------|---------|
| Instant feedback | 100-150ms | Button press, toggle |
| State change | 200-300ms | Menu open, tab switch |
| Layout shift | 300-500ms | Modal, accordion |
| Entrance animation | 500-800ms | Page section reveal |

Exit animations: use ~75% of entrance duration. Below 80ms feels instantaneous to humans.

### Easing

- **Entries**: `ease-out` (fast start, gentle stop)
- **Exits**: `ease-in` (gentle start, fast exit)
- **Toggles**: `ease-in-out`
- **Micro-interactions**: Exponential curves (quart/quint) for physics-like feel

**Never use**: `linear` for UI motion, bounce/elastic effects (dated), `ease` (generic).

### Performance

Only animate `transform` and `opacity` — these skip layout recalculation. For height animations, use `grid-template-rows: 0fr → 1fr` instead of animating `height`.

### Accessibility

`prefers-reduced-motion` is not optional:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Interaction Design

### Required States

Every interactive element needs 8 states: **default, hover, focus, active, disabled, loading, error, success**. Keyboard users never see hover states — design focus states independently.

### Focus Management

Never use `outline: none` without a replacement. Use `:focus-visible` for keyboard-only focus rings:

```css
:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}
```

Minimum 3:1 contrast for focus indicators, 2-3px thickness.

### Forms

- Always use visible `<label>` elements — never rely on placeholder alone
- Validate on blur, not on keystroke
- Show format with examples: "MM/DD/YYYY" not "Enter valid date"
- Group related fields with `<fieldset>` and `<legend>`

### Native HTML First

- `<dialog>` for modals — built-in focus trapping, Escape to close
- Popover API for tooltips/dropdowns — light-dismiss and accessibility by default
- `inert` attribute to disable background content behind modals
- Prefer undo over confirmation dialogs

### Skip Links

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```

Essential for keyboard navigation — visually hidden until focused.

---

## Responsive Design

### Mobile-First

Start with base styles for smallest screens, layer complexity with `min-width` queries. Find breakpoints by stretching your layout until it breaks — don't target specific devices.

### Input Detection Over Screen Size

```css
@media (pointer: coarse) { /* touch device — larger targets */ }
@media (hover: none) { /* no hover — show actions directly */ }
```

This matters more than viewport width for interaction design.

### Container Queries

Components should respond to their container, not the viewport:

```css
.card-container { container-type: inline-size; }
@container (min-width: 400px) { .card { /* wider layout */ } }
```

### Safe Areas

```css
padding-bottom: env(safe-area-inset-bottom);
```

Required for notched devices and home indicators.

### Images

Use `srcset` with width descriptors + `sizes` for resolution-aware loading. Use `<picture>` for art direction (different crops at different sizes). Always set explicit `width` and `height` to prevent layout shift.

### Test on Real Devices

DevTools emulation misses touch feel, real performance (especially budget Android), and rendering differences. Test on actual hardware.

---

## UX Writing

### Button Labels

Never use "OK", "Submit", or "Yes/No". Use verb + object:

| Bad | Good |
|-----|------|
| OK | Save changes |
| Submit | Create account |
| Yes | Delete message |
| Cancel | Keep editing |

For destructive actions, name the destruction: "Delete 5 items" not "Remove selected".

### Error Messages

Every error answers: (1) What happened? (2) Why? (3) How to fix it?

| Situation | Template |
|-----------|----------|
| Format error | "[Field] needs to be [format]. Example: [example]" |
| Missing required | "Please enter [what's missing]" |
| Permission denied | "You don't have access to [thing]. [What to do instead]" |
| Network error | "Couldn't reach [thing]. Check your connection and [action]." |
| Server error | "Something went wrong on our end. [Alternative action]" |

Never blame the user: "Please enter a date in MM/DD/YYYY format" not "You entered an invalid date".

### Empty States

Empty states are onboarding moments: (1) Acknowledge briefly, (2) Explain value, (3) Clear action. "No projects yet. Create your first one to get started." — not just "No items".

### Terminology Consistency

Pick one term and enforce it:

| Inconsistent | Pick one |
|-------------|----------|
| Delete / Remove / Trash | Delete |
| Settings / Preferences / Options | Settings |
| Sign in / Log in | Sign in |
| Create / Add / New | Create |

### Loading States

Be specific: "Saving your draft..." not "Loading...". For long waits, set expectations or show progress.

### Writing for Accessibility

- Link text must stand alone: "View pricing plans" not "Click here"
- Alt text describes information: "Revenue increased 40% in Q4" not "Chart"
- `alt=""` for decorative images
- Icon buttons need `aria-label`

### Translation Planning

| Language | Text expansion vs English |
|----------|--------------------------|
| German | +30% |
| French | +20% |
| Finnish | +30-40% |
| Chinese | -30% (fewer chars, same width) |

Keep numbers separate from strings. Use full sentences as single translation units.
