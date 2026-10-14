import { allowConsoleErrors, expect, finishQuietMatch, openApp, saveOptions, test } from './fixtures'

/** A rule set without fixture captains, so the ranking only contains this test's matches. */
const OWN_RULES = { session: 70 }

test.describe('Recording matches @mobile', () => {
  test('a completed match is recorded once and shows up in both tabs', async ({ page }) => {
    await openApp(page)
    await saveOptions(page, { ...OWN_RULES, name: 'Captain Test' })
    await finishQuietMatch(page)
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')

    await page.getByTestId('result-menu').click()
    await page.getByTestId('history-button').click()
    await expect(page.getByTestId('history-row')).toHaveCount(1)
    await expect(page.getByTestId('history-row')).toContainText('Time up')
    await expect(page.getByTestId('history-row')).toContainText('01:10')

    await page.getByTestId('tab-ranking').click()
    await expect(page.getByTestId('ranking-rules')).toContainText('70 second battles')
    const rows = page.getByTestId('ranking-row')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Captain Test')
    await expect(rows.first()).toContainText('YOU')
  })

  test('a match that could not be sent survives a refresh and is sent after recovery', async ({ page }) => {
    allowConsoleErrors(page, [/503/])
    await openApp(page)
    await saveOptions(page, OWN_RULES)
    await finishQuietMatch(page, { scenario: 'submit-unavailable' })
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'failed', { timeout: 20_000 })
    await expect(page.getByTestId('save-status')).toContainText('kept on this device')

    // Refresh while the API is still down: the record is still pending.
    await openApp(page, '/log/history', { scenario: 'submit-unavailable' })
    await expect(page.getByTestId('pending-submissions')).toBeVisible()
    await expect(page.getByTestId('history-row')).toHaveCount(0)

    // The API recovers: on the next load the pending record is sent automatically.
    await openApp(page, '/log/history', { scenario: 'normal' })
    await expect(page.getByTestId('pending-submissions')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.getByTestId('history-row')).toHaveCount(1)
    await page.getByTestId('tab-ranking').click()
    await expect(page.getByTestId('ranking-row')).toHaveCount(1)
  })

  test('the player can start another match while a record is pending', async ({ page }) => {
    allowConsoleErrors(page, [/503/])
    await openApp(page)
    await saveOptions(page, OWN_RULES)
    await finishQuietMatch(page, { scenario: 'submit-unavailable' })
    await page.getByTestId('play-again').click()
    await page.waitForFunction(() => window.__pirate?.hasSession() === true)
    await expect(page.getByTestId('hud')).toBeVisible()
  })
})
