import { expect, openApp, saveOptions, startMatch, test } from './fixtures'

test.describe('Options @mobile', () => {
  test('navigates from the menu and back with the keyboard', async ({ page }) => {
    await openApp(page)
    await expect(page.getByAltText('Pirate Battle')).toBeVisible()
    await expect(page.getByTestId('controls-help')).toBeVisible()
    await page.getByTestId('options-button').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Options' })).toBeFocused()
    await expect(page).toHaveURL(/#\/options$/)
    await page.getByTestId('back-to-menu').click()
    await expect(page).toHaveURL(/#\/$/)
  })

  test('validates values and shows accessible errors', async ({ page }) => {
    await openApp(page, '/options')
    const session = page.getByLabel('Game session time', { exact: true })
    const spawn = page.getByLabel('Enemy spawn time', { exact: true })

    await session.fill('30')
    await spawn.fill('0.3')
    await page.getByLabel('Captain name').fill('X')
    await page.getByTestId('save-options').click()

    await expect(page.getByText('Minimum is 60 seconds.')).toBeVisible()
    await expect(page.getByText('Minimum is 1 second.')).toBeVisible()
    await expect(page.getByText('Use at least 2 characters.')).toBeVisible()
    await expect(session).toHaveAttribute('aria-invalid', 'true')
    await expect(session).toBeFocused() // focus moves to the first invalid field
    await expect(page.getByTestId('options-status')).toHaveText('')

    await session.fill('200')
    await expect(page.getByText('Maximum is 180 seconds.')).toBeVisible()
    await spawn.fill('2.3')
    await expect(page.getByText('Use steps of 0.5 seconds.')).toBeVisible()
    await spawn.fill('abc')
    await expect(page.getByText('Enter a number of seconds.')).toBeVisible()
  })

  test('steppers respect limits', async ({ page }) => {
    await openApp(page, '/options')
    const session = page.getByLabel('Game session time', { exact: true })
    await expect(session).toHaveValue('120')
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Increase game session time' }).click({ force: true })
    await expect(session).toHaveValue('180')
    await expect(page.getByRole('button', { name: 'Increase game session time' })).toBeDisabled()
  })

  test('saves, persists after refresh and applies to the next match only', async ({ page }) => {
    await openApp(page)
    await saveOptions(page, { session: 90, spawn: 2.5, name: 'Captain Jack' })
    await page.reload()
    await page.getByTestId('options-button').click()
    await expect(page.getByLabel('Game session time', { exact: true })).toHaveValue('90')
    await expect(page.getByLabel('Enemy spawn time', { exact: true })).toHaveValue('2.5')
    await expect(page.getByLabel('Captain name')).toHaveValue('Captain Jack')
    await page.getByTestId('back-to-menu').click()

    const s = await startMatch(page)
    expect(s.duration).toBe(90)
    expect(s.spawnInterval).toBe(2.5)
    await expect(page.getByTestId('hud-time')).toContainText('01:30')
  })
})
