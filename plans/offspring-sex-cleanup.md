# Offspring Sex Cleanup

> Remove calf_sex/tag/weight from birth event form. Sex is captured per-offspring
> during registration in CowFormView, not at the birth event level.

## Core Design Decision

Birth events (calving/lambing) only record `offspring_count`. The sex, tag, and weight
of each offspring are captured individually when the farmer registers each animal via
the existing CowFormView loop. This is especially important for sheep where twins/triplets
are common and each lamb can be a different sex.

---

## Phase 1 — Remove birth detail fields and unify flow

**Goal:** Remove calf_sex, calf_tag_number, calf_weight from the birth event form.
All birth events (single or multiple offspring) use the same post-save flow: show
offspring registration prompt.

- [ ] **1.1: Remove birth detail fields from LogBreedingView UI** — S
  - Remove calf_sex toggle buttons (lines ~151-173)
  - Remove calf_tag_number input ("Nageslag Oornommer")
  - Remove calf_weight input ("Geboortegewig")
  - Keep offspring_count input and the offspring prompt modal
  - Remove `calving_details` from form initialization (line ~319: `calving_details: { calf_sex: null, calf_tag_number: '', calf_weight: null }`)
  - Files: `client/src/views/LogBreedingView.vue`
  - Depends on: nothing
  - Verify: birth event form only shows date, offspring count, cost, notes

- [ ] **1.2: Unify post-save flow for all birth events** — S
  - Remove the single-offspring special case (lines ~550-565) that checks `form.calving_details.calf_sex` and auto-redirects to CowFormView with sex pre-filled
  - Instead, ALL birth events (count >= 1) show the offspring registration prompt
  - The prompt lets farmer choose "Register Now" → CowFormView loop, or "Skip" → navigate away
  - Update payload construction: `calving_details` should be `null` (no longer populated)
  - Files: `client/src/views/LogBreedingView.vue`
  - Depends on: 1.1
  - Verify: saving a birth event with offspring_count=1 shows prompt (not auto-redirect)

- [ ] **1.3: Update Joi schema** — S
  - Remove `calf_sex`, `calf_tag_number`, `calf_weight` from calving_details in both create and update schemas
  - Keep calving_details as `Joi.object({ complications: Joi.string().max(2000).allow(null, '') }).allow(null).default(null)` for future use
  - Files: `server/helpers/breedingSchemas.js`
  - Depends on: nothing
  - Verify: `npm test` passes, old data with calf_sex in DB is harmless (server just stores/returns JSON blob)

- [ ] **1.4: Update tests** — S
  - Update LogBreedingView tests if any reference calf_sex fields (currently none do)
  - Add test: birth event with offspring_count=1 shows offspring prompt (not auto-redirect)
  - Add test: birth event with offspring_count=2 shows offspring prompt
  - Files: `client/src/tests/LogBreedingView.test.js`
  - Depends on: 1.1, 1.2
  - Verify: `cd client && npm run test:run` passes

- [ ] **1.5: Remove unused i18n keys** — S
  - Remove `breeding.form.calfSex` key from en.json and af.json (if it exists)
  - Remove `breeding.form.calfTagNumber` and `breeding.form.calfWeight` keys (if they exist)
  - Files: `client/src/i18n/en.json`, `client/src/i18n/af.json`
  - Depends on: 1.1
  - Verify: no missing i18n warnings in console
