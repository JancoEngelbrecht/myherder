/**
 * Shared helpers for myHerder Sheep Argo demo scripts.
 * Login, logout, tour suppression, navigation, and animal search functions.
 *
 * Unlike the cattle demo, the sheep farm uses random UUIDs from the seed script.
 * IDs are extracted dynamically after login from the JWT token in localStorage.
 */

// Module-level state populated by login functions
let _farmId = ''
let _adminUserId = ''
let _workerUserId = ''

const TOUR_IDS = [
  'analytics',
  'audit-log',
  'breed-type-management',
  'breeding-hub',
  'cow-list',
  'dashboard',
  'health-issues',
  'issue-type-management',
  'medication-management',
  'milk-history',
  'milk-recording',
  'reports',
  'settings',
  'treatments',
  'user-management',
]

/**
 * Extract farm_id and user id from localStorage after login.
 */
async function extractIds(page: any): Promise<{ farmId: string; userId: string }> {
  return page.evaluate(() => {
    const farmId = localStorage.getItem('farm_id') || ''
    const token = localStorage.getItem('token') || ''
    let userId = ''
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      userId = payload.id
    } catch {
      /* token not available */
    }
    return { farmId, userId }
  })
}

/**
 * Sets all 4 localStorage key patterns per tour ID to suppress every driver.js tour.
 * Covers all combinations of userId (real|anon) and farmId (real|default).
 */
async function suppressAllTours(page: any, userId: string) {
  const farmId = _farmId || 'default'
  await page.evaluate(
    ({ tourIds, fId, uid }: { tourIds: string[]; fId: string; uid: string }) => {
      localStorage.setItem('farm_id', fId)
      for (const id of tourIds) {
        localStorage.setItem(`tour_completed_${id}_${uid}_${fId}`, '1')
        localStorage.setItem(`tour_completed_${id}_${uid}_default`, '1')
        localStorage.setItem(`tour_completed_${id}_anon_${fId}`, '1')
        localStorage.setItem(`tour_completed_${id}_anon_default`, '1')
      }
    },
    { tourIds: TOUR_IDS, fId: farmId, uid: userId }
  )
}

/**
 * Presses Escape up to 3 times if the driver.js overlay is visible.
 */
async function dismissTour(page: any) {
  for (let i = 0; i < 3; i++) {
    const overlay = page.locator('.driver-overlay')
    const visible = await overlay.isVisible({ timeout: 400 }).catch(() => false)
    if (!visible) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
}

/**
 * Navigate to a path, suppress all tours, dismiss any active tour overlay, then wait.
 */
export async function nav(page: any, path: string, waitMs = 2000) {
  await page.evaluate((p: string) => {
    const app = (document.querySelector('#app') as any).__vue_app__
    const router = app.config.globalProperties.$router
    router.push(p)
  }, path)
  await page.waitForTimeout(500)
  await page.waitForSelector('.spinner', { state: 'hidden', timeout: 10000 }).catch(() => {})
  if (_adminUserId) await suppressAllTours(page, _adminUserId)
  if (_workerUserId) await suppressAllTours(page, _workerUserId)
  await page.waitForTimeout(600)
  await dismissTour(page)
  await page.waitForTimeout(waitMs)
}

/**
 * Search for an animal by name using the search dropdown and select the first result.
 * The input has a 1000ms debounce so we wait after typing.
 */
export async function searchAndSelectAnimal(page: any, name: string) {
  await page.fill('.search-dropdown .form-input', name)
  await page.waitForTimeout(1200)
  await page.click('.dropdown-item', { timeout: 5000 })
  await page.waitForTimeout(500)
}

/**
 * Log out via the profile page logout button + confirm dialog.
 */
export async function logout(page: any) {
  await page.goto('/profile')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
  await page.click('.logout-item', { force: true })
  await page.waitForTimeout(400)
  await page.click('.btn-danger', { force: true })
  await page.waitForURL('/login')
  await page.waitForTimeout(500)
}

/**
 * Log in as the sheep farm admin (SKAAP / admin / admin123) and suppress all tours.
 */
export async function loginSheepAdmin(page: any) {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
  await page.click('button.lang-btn:has-text("AF")', { force: true })
  await page.waitForTimeout(300)
  await page.fill('input.farm-code-input', 'SKAAP')
  await page.waitForTimeout(300)
  await page.fill('input[autocomplete="username"]', 'admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button[type="submit"]', { force: true })
  await page.waitForURL('/')
  await page.waitForLoadState('domcontentloaded')

  // Extract IDs dynamically (sheep farm uses random UUIDs)
  const { farmId, userId } = await extractIds(page)
  _farmId = farmId
  _adminUserId = userId

  await suppressAllTours(page, _adminUserId)
  if (_workerUserId) await suppressAllTours(page, _workerUserId)
  await page.waitForTimeout(600)
  await dismissTour(page)
  await page.waitForTimeout(1000)
}

/**
 * Log in as the sheep farm worker (SKAAP / sipho / PIN 1234) and suppress all tours.
 */
export async function loginSheepWorker(page: any) {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
  await page.fill('input.farm-code-input', 'SKAAP')
  await page.waitForTimeout(400)
  await page.click('button.login-tab:nth-child(2)', { force: true })
  await page.waitForTimeout(300)
  await page.fill('input[autocomplete="username"]', 'sipho')
  await page.waitForTimeout(300)
  for (const key of ['1', '2', '3', '4']) {
    await page.click(`.pin-key:has-text("${key}")`, { force: true })
    await page.waitForTimeout(150)
  }
  await page.click('button[type="submit"]', { force: true })
  await page.waitForURL('/')
  await page.waitForLoadState('domcontentloaded')

  // Extract IDs dynamically
  const { farmId, userId } = await extractIds(page)
  _farmId = farmId
  _workerUserId = userId

  if (_adminUserId) await suppressAllTours(page, _adminUserId)
  await suppressAllTours(page, _workerUserId)
  await page.waitForTimeout(600)
  await dismissTour(page)
  await page.waitForTimeout(1000)
}
