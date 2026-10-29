import { expect, type Page } from '@playwright/test';

/** Through the login page, the stand-in Google's sign-in page, and the api's callback. */
export const signIn = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Stand-in Google sign-in' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
};

/** Signed in: the shell's main navigation is showing. */
export const signInAs = async (page: Page, email: string) => {
  await signIn(page, email);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
};
