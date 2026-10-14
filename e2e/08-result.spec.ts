import { expect, finishQuietMatch, test } from './fixtures'

test.describe('Result screen @mobile', () => {
  test('shows score, time played, end reason and record status, and survives a refresh', async ({ page }) => {
    await finishQuietMatch(page)
    await expect(page).toHaveURL(/#\/result$/)
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.getByTestId('result-score')).toHaveText('0')
    await expect(page.getByTestId('result-duration')).toHaveText('02:00')
    await expect(page.getByTestId('result-reason')).toHaveText('Time up')
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
    await expect(page.getByTestId('play-again')).toBeVisible()
    await expect(page.getByTestId('result-menu')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('result-score')).toHaveText('0')
    await expect(page.getByTestId('result-duration')).toHaveText('02:00')
    await expect(page.getByTestId('result-reason')).toHaveText('Time up')
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
  })

  test('Main menu goes back to the menu', async ({ page }) => {
    await finishQuietMatch(page)
    await page.getByTestId('result-menu').click()
    await expect(page.getByTestId('play-button')).toBeVisible()
  })
})
