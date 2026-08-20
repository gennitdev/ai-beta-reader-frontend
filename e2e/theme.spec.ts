import { test, expect } from './fixtures/network'

test('theme choice applies immediately and survives reloads and navigation', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')

  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(page.getByTestId('header-theme-toggle')).toHaveAttribute('aria-label', 'Switch to dark theme')

  await page.getByTestId('header-theme-toggle').click()
  await expect(root).toHaveClass(/dark/)
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('beta-bot-theme'))).toBe('dark')

  await page.reload()
  await expect(root).toHaveClass(/dark/)
  await expect(root).toHaveAttribute('data-theme', 'dark')

  await page.goto('/settings')
  await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('theme-light').click()
  await expect(root).not.toHaveClass(/dark/)
  await expect(root).toHaveAttribute('data-theme', 'light')

  await page.goto('/')
  await expect(root).toHaveAttribute('data-theme', 'light')
})

test('theme switch is accessible in the mobile header', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')

  const toggle = page.getByTestId('mobile-theme-toggle')
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark theme')

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(toggle).toHaveAttribute('aria-label', 'Switch to light theme')
})
