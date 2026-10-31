import { test, expect } from '@playwright/test'

test.describe('Stats Page', () => {
  test.beforeEach(async ({ page }) => {
    // All history, so the fixtures count whatever their dates are.
    await page.goto('/stats?range=all')
    await page.waitForSelector('text=Time with Claude', { timeout: 15_000 })
  })

  test('Given stats-cache.json exists in fixtures, When I visit /stats, Then I see the headline and totals', async ({
    page,
  }) => {
    await expect(page.getByText('Tokens, all time')).toBeVisible()
    await expect(page.getByText('At API prices')).toBeVisible()
    for (const label of ['Sessions', 'Messages', 'Time with Claude', 'Tool calls']) {
      await expect(page.getByLabel('Totals').getByText(label, { exact: true })).toBeVisible()
    }
    await page.screenshot({ path: 'e2e/screenshots/stats-overview.png', fullPage: true })
  })

  test('Given stats data exists, When I view the stats page, Then I see "3" as total sessions', async ({ page }) => {
    const sessions = page.getByLabel('Totals').locator('div').filter({ hasText: /^Sessions/ }).first()
    await expect(sessions).toContainText('3')
  })

  test('Given stats data exists, Then I see the rhythm, models and hours sections', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Your rhythm' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Models' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'When you start sessions' })).toBeVisible()
  })

  test('Given I am on the stats page, When I choose a range, Then the range is kept in the URL', async ({ page }) => {
    await page.getByRole('button', { name: '30d' }).click()
    await expect(page).toHaveURL(/range=30d/)
  })

  test('Given projects exist, Then I see them listed and can open one', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
    await page.getByLabel('Projects').locator('a').first().click()
    await expect(page).toHaveURL(/project=/)
    await expect(page.getByText('← All projects')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/stats-projects.png', fullPage: true })
  })
})
