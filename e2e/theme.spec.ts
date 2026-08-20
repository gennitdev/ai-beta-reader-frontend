import { test, expect } from './fixtures/network'

test('theme choice applies immediately and survives reloads and navigation', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')

  const root = page.locator('html')
  const headerLogo = page.locator('header img[alt="beta bot"]').first()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(headerLogo).toHaveAttribute('src', /logo-horizontal-light\.png/)
  await expect(page.getByTestId('header-theme-toggle')).toHaveAttribute('aria-label', 'Switch to dark theme')

  await page.getByTestId('header-theme-toggle').click()
  await expect(root).toHaveClass(/dark/)
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(headerLogo).toHaveAttribute('src', /logo-horizontal\.png/)
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

test('markdown uses the high-contrast dark reading palette', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('beta-bot-theme', 'dark'))
  await page.goto('/terms')

  const prose = page.locator('.prose').first()
  await expect(prose).toBeVisible()
  const palette = await prose.evaluate((element) => {
    const styles = getComputedStyle(element)
    return {
      body: styles.getPropertyValue('--tw-prose-body').trim(),
      headings: styles.getPropertyValue('--tw-prose-headings').trim(),
      links: styles.getPropertyValue('--tw-prose-links').trim(),
      code: styles.getPropertyValue('--tw-prose-code').trim(),
    }
  })

  expect(palette).toEqual({
    body: '#e5e7eb',
    headings: '#ffffff',
    links: '#f0ca81',
    code: '#fae8cd',
  })
})
