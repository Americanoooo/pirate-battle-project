import { expect, openApp, test } from './fixtures'

test.describe('Ranking and Match History tabs @mobile', () => {
  test('ranking lists the captains for the current rules with pagination', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('ranking-button').click()
    await expect(page.getByTestId('tab-ranking')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('ranking-rules')).toContainText('120 second battles · 3 second spawn interval')
    const rows = page.getByTestId('ranking-row')
    await expect(rows).toHaveCount(5)
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 1 of 4')
    await expect(rows.first()).toContainText('01')

    const firstPageIds = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-match-id')))
    await page.getByTestId('next-page').click()
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 2 of 4')
    await expect(rows.first()).toContainText('06')
    const secondPageIds = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-match-id')))
    expect(secondPageIds.some((id) => firstPageIds.includes(id))).toBe(false)

    await page.getByTestId('prev-page').click()
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 1 of 4')
  })

  test('ranking is sorted by score with a deterministic tie-break', async ({ page }) => {
    await openApp(page, '/log/ranking')
    const rows = page.getByTestId('ranking-row')
    await expect(rows).toHaveCount(5)
    const scores = await rows.evaluateAll((els) => els.map((e) => Number(e.querySelectorAll('td')[2]?.textContent)))
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
    const before = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-match-id')))
    await page.reload()
    await expect(rows).toHaveCount(5)
    const again = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-match-id')))
    expect(again).toEqual(before)
  })

  test('shows a loading state while fetching', async ({ page }) => {
    await openApp(page, '/log/ranking', { scenario: 'slow', apiTimeout: 8000 })
    await expect(page.getByTestId('list-loading')).toBeVisible()
    await expect(page.getByTestId('ranking-row')).toHaveCount(5, { timeout: 15_000 })
  })

  test('shows empty states', async ({ page }) => {
    await openApp(page, '/log/ranking', { scenario: 'empty' })
    await expect(page.getByTestId('list-empty')).toContainText('No battles recorded')
    await page.getByTestId('tab-history').click()
    await expect(page.getByTestId('list-empty')).toContainText('No battles yet')
  })

  test('shows accessible errors with retry for each tab independently', async ({ page }) => {
    await openApp(page, '/log/ranking', { scenario: 'ranking-down' })
    const error = page.getByTestId('list-error')
    await expect(error).toBeVisible({ timeout: 15_000 })
    await expect(error.getByRole('alert')).toContainText('Ranking is temporarily unavailable')
    await expect(page.getByTestId('list-retry')).toBeVisible()

    // History still works while the ranking is down.
    await page.getByTestId('tab-history').click()
    await expect(page.getByTestId('list-empty')).toBeVisible()
  })

  test('history endpoint failure is reported on its tab', async ({ page }) => {
    await openApp(page, '/log/history', { scenario: 'history-down' })
    await expect(page.getByTestId('list-error')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('tab-ranking').click()
    await expect(page.getByTestId('ranking-row')).toHaveCount(5)
  })

  test('many pages and keyboard tab navigation', async ({ page }) => {
    await openApp(page, '/log/ranking', { scenario: 'many-pages' })
    await expect(page.getByTestId('page-indicator')).toContainText('of 28')
    await page.getByTestId('tab-ranking').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('tab-history')).toBeFocused()
    await expect(page.getByTestId('tab-history')).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/#\/log\/history$/)
  })
})
