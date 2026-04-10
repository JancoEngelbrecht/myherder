import { test } from '@argo-video/cli'
import { showOverlay } from '@argo-video/cli'
import { loginSheepAdmin, nav, searchAndSelectAnimal } from './helpers'

test.setTimeout(300_000)

test('lifecycle', async ({ page, narration }) => {
  console.log('[LIFECYCLE] logging in...')
  await loginSheepAdmin(page)
  console.log('[LIFECYCLE] login complete')

  // ── Scene 1: intro — dashboard overview ──
  console.log('[LIFECYCLE] 1/8: intro')
  await nav(page, '/', 2000)
  narration.mark('intro')
  await showOverlay(page, 'intro', narration.durationFor('intro'))

  // ── Scene 2: create-animal — /animals/new, fill form, submit ──
  console.log('[LIFECYCLE] 2/8: create-animal')
  await nav(page, '/animals/new', 1500)

  // Wait for the form to render
  await page.waitForSelector('form.animal-form', { timeout: 10_000 })
  await page.waitForTimeout(500)

  // Tag number (1st text input in form)
  try {
    await page.locator('form.animal-form input[type="text"].form-input').first().fill('S099')
    console.log('[LIFECYCLE] filled tag number')
    await page.waitForTimeout(400)
  } catch (e) {
    console.log('[LIFECYCLE] FAILED: tag number', e)
  }

  // Name (2nd text input in form)
  try {
    await page.locator('form.animal-form input[type="text"].form-input').nth(1).fill('Stertjie')
    console.log('[LIFECYCLE] filled name')
    await page.waitForTimeout(400)
  } catch (e) {
    console.log('[LIFECYCLE] FAILED: name', e)
  }

  // Sex — click the female button
  try {
    await page.locator('button.sex-btn').first().click({ force: true })
    console.log('[LIFECYCLE] selected sex')
    await page.waitForTimeout(300)
  } catch (e) {
    console.log('[LIFECYCLE] FAILED: sex', e)
  }

  // Breed — select Dorper (1st select.form-select is breed_type_id)
  try {
    const breedSelect = page.locator('form.animal-form select.form-select').first()
    await breedSelect.selectOption({ label: 'Dorper' })
    console.log('[LIFECYCLE] selected breed')
    await page.waitForTimeout(400)
  } catch (e) {
    console.log('[LIFECYCLE] FAILED: breed — available options:')
    const opts = await page
      .locator('form.animal-form select.form-select')
      .first()
      .locator('option')
      .allTextContents()
    console.log(opts)
  }

  // DOB
  try {
    await page.fill('form.animal-form input[type="date"]', '2024-06-15')
    console.log('[LIFECYCLE] filled DOB')
    await page.waitForTimeout(400)
  } catch (e) {
    console.log('[LIFECYCLE] FAILED: DOB', e)
  }

  narration.mark('create-animal')
  await showOverlay(page, 'create-animal', narration.durationFor('create-animal'))

  // Submit the animal form
  try {
    await page.locator('form.animal-form button[type="submit"].btn-primary').click({ force: true })
    console.log('[LIFECYCLE] clicked submit')
    // Wait for navigation to the new animal's detail page
    await page.waitForURL(
      (url) => url.pathname.startsWith('/animals/') && url.pathname !== '/animals/new',
      { timeout: 15_000 }
    )
    console.log('[LIFECYCLE] navigated to animal detail:', page.url())
    await page.waitForTimeout(2000)
  } catch (e) {
    console.log('[LIFECYCLE] FAILED: submit/navigation', e)
    // Check for validation errors on the page
    const errorBox = await page
      .locator('.error-box')
      .textContent()
      .catch(() => 'none')
    const formErrors = await page
      .locator('.form-error')
      .allTextContents()
      .catch(() => [])
    console.log('[LIFECYCLE] API error:', errorBox, 'Form errors:', formErrors)
    await page.waitForTimeout(2000)
  }

  // ── Scene 3: animal-created — show the new animal detail page ──
  console.log('[LIFECYCLE] 3/8: animal-created')
  narration.mark('animal-created')
  await showOverlay(page, 'animal-created', narration.durationFor('animal-created'))

  // ── Scene 4: log-issue — search Stertjie, pick issue type, Medium severity ──
  // NOTE: Issue type names come from the database (not i18n).
  // The :has-text("Parasites") selector uses a partial match to work regardless of
  // whether the farm has English or Afrikaans issue type names.
  // UNVERIFIED: confirm exact issue type name in the SKAAP farm's seed data.
  console.log('[LIFECYCLE] 4/8: log-issue')
  await nav(page, '/log/issue', 1500)
  try {
    await searchAndSelectAnimal(page, 'Stertjie')
    await page.waitForTimeout(500)

    // Select an issue type — try Internal Parasites (DB name, not i18n)
    // Fallback: click first issue button if text match fails
    const parasiteBtn = page.locator('.issue-btn:has-text("Parasit")')
    if (await parasiteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await parasiteBtn.first().click({ force: true })
    } else {
      await page.click('.issue-btn', { force: true })
    }
    await page.waitForTimeout(400)

    // Select Medium severity (AF: "Matig")
    await page.click('.severity-btn.sev-medium', { force: true })
    await page.waitForTimeout(400)

    // Add a note
    await page.fill('textarea#description', 'Maer en swak eetlus')
    await page.waitForTimeout(300)
  } catch {
    /* form interaction failed — show form as-is */
  }
  narration.mark('log-issue')
  await showOverlay(page, 'log-issue', narration.durationFor('log-issue'))

  // Submit the issue
  try {
    await page.click('[data-tour="issue-save"]', { force: true })
    await page.waitForTimeout(2000)
  } catch {
    /* submit failed — continue */
  }

  // ── Scene 5: log-treatment — search Stertjie, Dectomax, dosage 2, cost 45 ──
  console.log('[LIFECYCLE] 5/8: log-treatment')
  await nav(page, '/log/treatment', 1500)
  try {
    await searchAndSelectAnimal(page, 'Stertjie')
    await page.waitForTimeout(800)

    // Select Dectomax Injectable from medication dropdown
    // UNVERIFIED: confirm exact medication name in SKAAP farm seed data
    await page.selectOption('.med-select', { label: 'Dectomax Injectable' })
    await page.waitForTimeout(600)

    // Fill dosage
    await page.fill('.dosage-input', '2')
    await page.waitForTimeout(300)

    // Fill cost
    await page.fill('#cost', '45')
    await page.waitForTimeout(300)
  } catch {
    /* form interaction failed — show form as-is */
  }
  narration.mark('log-treatment')
  await showOverlay(page, 'log-treatment', narration.durationFor('log-treatment'))

  // Submit the treatment
  try {
    await page.click('[data-tour="treat-save"]', { force: true })
    await page.waitForTimeout(2000)
  } catch {
    /* submit failed — continue */
  }

  // ── Scene 6: log-ram-service — search Stertjie, select Ramdiens, pick sire ──
  console.log('[LIFECYCLE] 6/8: log-ram-service')
  await nav(page, '/breed/log', 1500)
  try {
    await searchAndSelectAnimal(page, 'Stertjie')
    await page.waitForTimeout(500)

    // Select "Ramdiens" event type button (AF label for ram_service)
    await page.click('.event-type-btn:has-text("Ramdiens")', { force: true })
    await page.waitForTimeout(800)

    // Select a sire from the male animal search dropdown (2nd search-dropdown on page)
    // UNVERIFIED: confirm a ram name exists in SKAAP farm seed data
    const sireDropdowns = page.locator('.search-dropdown .form-input')
    await sireDropdowns.nth(1).fill('Groot')
    await page.waitForTimeout(1200)
    const sireItem = page.locator('.dropdown-item').first()
    if (await sireItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sireItem.click({ force: true })
    }
    await page.waitForTimeout(500)
  } catch {
    /* form interaction failed — show form as-is */
  }
  narration.mark('log-ram-service')
  await showOverlay(page, 'log-ram-service', narration.durationFor('log-ram-service'))

  // Submit the ram service event
  try {
    await page.click('button[type="submit"].btn-primary', { force: true })
    await page.waitForTimeout(2000)
  } catch {
    /* submit failed — continue */
  }

  // ── Scene 7: log-lambing — search Stertjie, select Lamtyd, offspring 2 ──
  console.log('[LIFECYCLE] 7/8: log-lambing')
  await nav(page, '/breed/log', 1500)
  try {
    await searchAndSelectAnimal(page, 'Stertjie')
    await page.waitForTimeout(500)

    // Select "Lamtyd" event type button (AF label for lambing)
    await page.click('.event-type-btn:has-text("Lamtyd")', { force: true })
    await page.waitForTimeout(800)

    // Fill offspring count
    await page.fill('input[type="number"].form-input', '2')
    await page.waitForTimeout(400)
  } catch {
    /* form interaction failed — show form as-is */
  }
  narration.mark('log-lambing')
  await showOverlay(page, 'log-lambing', narration.durationFor('log-lambing'))

  // Submit the lambing event
  try {
    await page.click('button[type="submit"].btn-primary', { force: true })
    await page.waitForTimeout(2000)
  } catch {
    /* submit failed — continue */
  }

  // Skip offspring registration if prompt appears
  try {
    const skipBtn = page.locator('.offspring-prompt button.btn-secondary')
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click({ force: true })
      await page.waitForTimeout(500)
    }
  } catch {
    /* no prompt — continue */
  }

  // ── Scene 8: summary — animal detail with full history ──
  console.log('[LIFECYCLE] 8/8: summary')
  await nav(page, '/cows', 2000)
  try {
    await page.fill('.search-bar input', 'Stertjie')
    await page.waitForTimeout(800)
    await page.click('.cow-card', { force: true, timeout: 5000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
  } catch {
    /* search or click failed — show list */
  }
  narration.mark('summary')
  await showOverlay(page, 'summary', narration.durationFor('summary'))

  console.log('[LIFECYCLE] complete')
})
