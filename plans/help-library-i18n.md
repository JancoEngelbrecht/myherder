# Help Library Afrikaans Translation Plan

> Status: COMPLETE

The `help` namespace in `en.json` (lines 967–1667, ~700 lines) needs full Afrikaans translation in `af.json`. Split into phases by topic group to keep each edit manageable.

## Phases

### Phase 1: Scaffolding + shared keys
> Status: COMPLETE

Add the `help` key to af.json with:
- `title`, `topicNotFound`
- `categories` (5 keys)
- `sections` (6 keys)
- `breedingCycle` (all sub-keys: mainCycleTitle, edgeCasesTitle, steps, negativePreg, abortion, repeatBreeder, missedHeat)

~55 lines of JSON.

### Phase 2: Daily Tasks topics
> Status: COMPLETE

Translate `help.topics`:
- `recording-milk` (title, what, when, flow, steps[], next, tips[])
- `milk-history` (title, what, when, flow, steps[], next, tips[])

~110 lines of JSON.

### Phase 3: Health & Treatment topics
> Status: COMPLETE

Translate `help.topics`:
- `logging-health-issue`
- `adding-treatment`
- `withdrawal-periods`
- `resolving-health-issue`

~200 lines of JSON.

### Phase 4: Breeding topics
> Status: COMPLETE

Translate `help.topics`:
- `breeding-lifecycle` (no flow, just title/what/when/next/tips)
- `logging-heat`
- `logging-insemination`
- `pregnancy-check`
- `dry-off`
- `logging-calving`
- `breeding-notifications`

~250 lines of JSON.

### Phase 5: Cow Management topics
> Status: COMPLETE

Translate `help.topics`:
- `adding-cow`
- `cow-status`
- `cow-details`

~100 lines of JSON.

### Phase 6: Admin / Settings topics
> Status: COMPLETE

Translate `help.topics`:
- `managing-users`
- `managing-breed-types`
- `managing-issue-types`
- `managing-medications`
- `feature-flags`
- `farm-settings`
- `running-reports`
- `audit-log`

~250 lines of JSON.

### Phase 7: Verification
> Status: COMPLETE

- Run `npm run dev:client` build to verify JSON is valid
- Spot-check key paths match between en.json and af.json
- Run frontend tests to catch missing keys

## Translation Guidelines

Use natural South African dairy farming Afrikaans:
| English | Afrikaans |
|---------|-----------|
| Help Library | Hulpbiblioteek |
| Recording Milk | Melkaantekening |
| Health Issue | Gesondheidskwessie |
| Treatment | Behandeling |
| Breeding | Teling |
| Cow | Koei |
| Herd | Kudde |
| Withdrawal | Onttrekking |
| Insemination | Inseminasie |
| AI (Artificial Insemination) | KI (Kunsmatige Inseminasie) |
| Heat / Estrus | Hitte / Bronstigheid |
| Calving | Kalwing |
| Dry Off | Droogmaak |
| Pregnancy Check | Dragtigheidstoets |
| Bull Service | Buldiens |
| Tag number | Oormerknommer |
| Breed type | Rastipe |
| Gestation | Dragtigheid |
| Sire | Vader |
| Dam | Moeder |
| Mastitis | Mastitis |
| Lameness | Kreupelheid |
| Severity | Erns |
| Teat | Speen |
| PIN | PIN |
| Permissions | Toestemmings |
| Reports | Verslae |
| Audit Log | Ouditlog |
| Notifications | Kennisgewings |
| Overdue | Agterstallig |
| Feature Flags | Kenmerkskakelaars |
| Settings | Instellings |
| Dashboard | Kontroleskerm |
| Save | Stoor |
| Tap | Tik |
| Select | Kies |
| Open (action) | Maak oop |
