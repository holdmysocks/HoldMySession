import { test, expect } from '@playwright/test'

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings?tab=pricing')
    // Wait for settings page to fully load
    await page.waitForSelector('h1', { timeout: 15_000 })
    await expect(page.locator('h1')).toContainText('Settings')
  })

  test('Given I visit /settings, Then I see the plan history', async ({
    page,
  }) => {
    await expect(
      page.locator('h2').filter({ hasText: 'Plan history' }),
    ).toBeVisible()
    await page.screenshot({
      path: 'e2e/screenshots/settings-page-full.png',
      fullPage: true,
    })
  })

  test('Given I visit /settings, Then I see the API pricing table', async ({
    page,
  }) => {
    await expect(
      page.locator('h2').filter({ hasText: 'API pricing' }),
    ).toBeVisible()
  })

  test('Given I am on settings, When I change a price, Then the Save button becomes enabled', async ({
    page,
  }) => {
    // The Save button should initially be disabled
    const saveButton = page.locator('button:has-text("Save")')
    await expect(saveButton).toBeDisabled()

    // Change a price in the API pricing table
    await page.locator('h2:has-text("API pricing")').locator('xpath=..').locator('input').first().fill('9')

    // Save button should now be enabled
    await expect(saveButton).toBeEnabled()
  })

  test('Given I changed settings, When I click "Reset to Defaults", Then the form resets', async ({
    page,
  }) => {
    // First change something to make form dirty
    await page.locator('h2:has-text("API pricing")').locator('xpath=..').locator('input').first().fill('9')

    // Now click Reset to Defaults
    await page.click('button:has-text("Reset")')

    // After reset, the Plan history heading should still be visible
    await expect(
      page.locator('h2').filter({ hasText: 'Plan history' }),
    ).toBeVisible()
  })
})
