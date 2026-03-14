---
description: Review UI for design quality, accessibility, and modern styling — then suggest and apply improvements.
---

Load the `frontend-design` skill first, then review and improve the user's UI.

## Step 1: REVIEW

1. **Identify scope** — which files/components to review. If the user said "review the design", look at:
   - Recently changed `.vue`, `.tsx`, `.jsx`, `.html`, or `.css` files (`git diff`)
   - The file/component they're viewing or mentioned
   - If ambiguous, ask.

2. **Read each file in full context** — understand the complete component, not just snippets.

3. **Evaluate across 7 dimensions** (in priority order):

   **1. AI Slop Detection** — The most important check. Run the anti-pattern checklist from the skill. Would someone immediately recognize this as AI-generated?

   **2. Visual Hierarchy** — Is the primary action obvious? Can you tell what's important by squinting? Are there competing focal points?

   **3. Color & Contrast** — Does it meet WCAG AA? Are neutrals tinted? Is the palette cohesive or random? Dark mode done correctly?

   **4. Typography** — Is there a clear type scale? Appropriate font choice? Proper line height and spacing?

   **5. Spatial Design** — Consistent spacing from a defined scale? Appropriate use of whitespace vs card wrapping? Touch targets adequate?

   **6. Interaction & Accessibility** — All 8 states covered? Focus styles present? Semantic HTML? Forms labeled properly? `prefers-reduced-motion` respected?

   **7. Responsive & UX Writing** — Mobile-first? Container queries where appropriate? Button labels specific? Error messages actionable?

## Step 2: REPORT

Present findings in this format:

```
# Design Review

## Scope
[What was reviewed — files, components]

## AI Slop Check
[PASS / DETECTED — list specific tells found]

## Findings

### Critical (broken accessibility or unusable)
- **[file:line]** — Description. Impact: [what breaks]. Fix: [concrete change].

### Important (degrades quality)
- **[file:line]** — Description. Impact: [what suffers]. Fix: [concrete change].

### Minor (polish)
- **[file:line]** — Description. Fix: [improvement].

## Suggestions for a Modern, Polished Feel
- [Specific, concrete suggestions to elevate the design — better spacing, refined typography, subtle animations, improved color usage, cleaner layout, etc.]
- [Each suggestion should reference the specific file/component and describe the exact change]

## Strengths
[What's done well — be specific]

## Verdict
[PASS / PASS WITH CONDITIONS / NEEDS WORK]
```

## Step 3: FIX

After presenting the report, ask the user:

> "Would you like me to apply these improvements? I can fix all Critical and Important findings, and optionally apply the styling suggestions too."

If the user agrees:
1. Load `vue-patterns` skill (or relevant frontend skill)
2. Fix Critical findings first (accessibility, broken interactions)
3. Fix Important findings (quality degradation)
4. Apply approved styling suggestions (modern feel, better spacing, cleaner typography, refined colors)
5. Run tests and lint after changes
6. Show a before/after summary of what changed

If the user wants to pick specific fixes, apply only what they approve.

## Step 4: VERIFY

After applying fixes:
1. Check that the component still renders correctly (no broken layouts, missing styles)
2. Verify accessibility fixes (contrast, focus states, semantic HTML)
3. Run tests + lint
4. Offer `/ship` when done

## Rules

- **Be concrete** — reference specific files, lines, CSS properties, HTML elements
- **Don't invent issues** — if the design is solid, say so
- **Prioritize accessibility** — contrast failures and missing focus states are Critical, not Minor
- **Show, don't just tell** — include code snippets showing the fix when possible
- **Modern ≠ trendy** — suggest timeless improvements (whitespace, typography, contrast), not fleeting trends
- **Respect the existing design language** — enhance what's there, don't redesign from scratch
- **Ask before applying styling suggestions** — Critical/Important fixes are clear-cut, but styling is subjective
