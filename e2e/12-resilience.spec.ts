import { allowConsoleErrors, expect, finishQuietMatch, openApp, saveOptions, test } from './fixtures'

const OWN_RULES = { session: 80 }

test.describe('Network resilience', () => {
  test('timeout after the server saved the match: retry recovers without duplicates', async ({ page }) => {
    await openApp(page)
    await saveOptions(page, OWN_RULES)
    // First POST is stored by the server but its response never arrives (client timeout 1 s);
    // the automatic retry gets the existing record back (200, created: false).
    await finishQuietMatch(page, { scenario: 'submit-timeout-after-save', apiTimeout: 1000 })
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 20_000 })

    await openApp(page, '/log/history', { scenario: 'normal' })
    await expect(page.getByTestId('history-row')).toHaveCount(1)
    await page.getByTestId('tab-ranking').click()
    await expect(page.getByTestId('ranking-row')).toHaveCount(1)
  })

  test('repeated Retry clicks never create duplicate records', async ({ page }) => {
    allowConsoleErrors(page, [/503/])
    await openApp(page)
    await saveOptions(page, OWN_RULES)
    await finishQuietMatch(page, { scenario: 'submit-unavailable' })
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'failed', { timeout: 20_000 })

    // Recover the API through the Network lab panel, then hammer the retry button.
    await page.getByTestId('network-lab').locator('summary').click()
    await page.getByRole('radio', { name: /^Normal/ }).check()
    // Three clicks in the same tick, faster than any request can complete.
    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="retry-save"]')!
      button.click()
      button.click()
      button.click()
    })
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 20_000 })

    await openApp(page, '/log/history')
    await expect(page.getByTestId('history-row')).toHaveCount(1)
    await page.getByTestId('tab-ranking').click()
    await expect(page.getByTestId('ranking-row')).toHaveCount(1)
  })

  test('a late response for an older page never replaces the page on screen', async ({ page }) => {
    // Odd GET requests take 2.5 s, even ones 150 ms.
    await openApp(page, '/log/ranking', { scenario: 'out-of-order', apiTimeout: 8000 })
    const indicator = page.getByTestId('page-indicator')
    await expect(indicator).toHaveText('Page 1 of 4', { timeout: 10_000 }) // GET #1 (slow)
    await page.getByTestId('next-page').click() // GET #2 (fast) -> page 2
    await expect(indicator).toHaveText('Page 2 of 4')
    await expect(page.getByTestId('ranking-row').first()).toContainText('06') // page 2 data arrived
    const page2 = await page.getByTestId('ranking-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-match-id')))

    await page.getByTestId('next-page').click() // GET #3 (slow) for page 3
    await page.getByTestId('prev-page').click() // back to page 2 (cached) before #3 answers
    await expect(indicator).toHaveText('Page 2 of 4')
    await page.waitForTimeout(3000) // GET #3 arrives late
    await expect(indicator).toHaveText('Page 2 of 4')
    await expect(page.getByTestId('ranking-row').first()).toContainText('06')
    const still = await page.getByTestId('ranking-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-match-id')))
    expect(still).toEqual(page2)
  })

  test('API failures never block the game', async ({ page }) => {
    allowConsoleErrors(page, [/500/])
    await openApp(page, '/', { scenario: 'server-error' })
    await page.getByTestId('play-button').click()
    await page.waitForFunction(() => window.__pirate?.hasSession() === true)
    await expect(page.getByTestId('hud')).toBeVisible()
  })
})
