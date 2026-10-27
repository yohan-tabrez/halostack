import { test, expect } from '@playwright/test'

test('redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('role-gated routes redirect unauthenticated users to login', async ({ page }) => {
  for (const path of ['/jobs', '/commands', '/audit', '/network-scan']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/)
  }
})

test('setup page loads when no users exist', async ({ page }) => {
  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: /setup|welcome|halostack/i })).toBeVisible()
})
