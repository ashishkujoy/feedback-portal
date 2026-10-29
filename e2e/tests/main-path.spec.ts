import { expect, test } from '@playwright/test';
import { adminEmail, type Batch, intern, mentor, pm, setUpBatch } from './setup.ts';
import { signIn, signInAs } from './sign-in.ts';

const feedback = 'Shipped the **ledger export** with tests first.';
const notes = 'Talked it through in the weekly 1:1.';
const comment = 'Agreed: the tests made the review quick.';

// Each step builds on the one before; every test signs in afresh, in its own browser context.
test.describe.configure({ mode: 'serial' });

// nginx's Content-Security-Policy must let the app work: Chromium reports each blocked load or
// inline style as a console error.
let violations: string[] = [];
test.beforeEach(({ page }) => {
  violations = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
});
test.afterEach(() => {
  expect(violations).toEqual([]);
});

let batch: Batch;
const profilePath = () => `/batches/${batch.batchId}/interns/${batch.internId}`;

test('turns back an email with no account', async ({ page }) => {
  await signIn(page, 'nobody@e2e.test');
  await expect(page).toHaveURL(/\/login\?error=sign_in_failed$/);
  await expect(page.getByText("We couldn't sign you in")).toBeVisible();
});

test('the admin signs in and sets up a batch', async ({ page, baseURL }) => {
  await signInAs(page, adminEmail);
  await expect(page.getByRole('heading', { level: 1, name: 'Batches' })).toBeVisible();
  batch = await setUpBatch(page.request, baseURL ?? '');
  await page.reload();
  await expect(page.getByRole('link', { name: 'Batch E2E' })).toBeVisible();
});

test('the mentor gives feedback from My pending', async ({ page }) => {
  await signInAs(page, mentor.email);
  await page.getByRole('link', { name: 'My pending (1)' }).click();
  const table = page.getByRole('table', { name: 'Interns needing your feedback' });
  await expect(table.getByRole('link', { name: intern.name })).toBeVisible();

  await page.getByRole('button', { name: `Give feedback to ${intern.name}` }).click();
  const dialog = page.getByRole('dialog', { name: `Give feedback to ${intern.name}` });
  await dialog.getByRole('textbox', { name: 'Feedback' }).fill(feedback);
  // The radio sits under its label, as on the page: click the label's text.
  await dialog
    .getByRole('group', { name: 'Colour code' })
    .getByText('Green', { exact: true })
    .click();
  await expect(dialog.getByRole('radio', { name: 'Green' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Submit feedback' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("You're up to date")).toBeVisible();
  await expect(page.getByRole('link', { name: /^My pending/ })).toHaveAccessibleName('My pending');

  await page.goto(profilePath());
  const card = page.getByRole('article', { name: `Feedback from ${mentor.name}` });
  await expect(card.getByText('Shipped the ledger export with tests first.')).toBeVisible();
});

test('the PM records the conversation that delivers it', async ({ page }) => {
  await signInAs(page, pm.email);
  await page.getByRole('link', { name: 'My pending (1)' }).click();
  await expect(page.getByRole('tab', { name: /To deliver/, selected: true })).toBeVisible();

  await page
    .getByRole('button', {
      name: `Record conversation for ${intern.name}, feedback by ${mentor.name}`,
    })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Record conversation' });
  await expect(dialog.getByRole('radio', { name: new RegExp(mentor.name) })).toBeChecked();
  await dialog.getByRole('textbox', { name: /Conversation notes/ }).fill(notes);
  await dialog.getByRole('button', { name: 'Save conversation' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('No feedback is waiting to be delivered.')).toBeVisible();

  await page.goto(profilePath());
  const conversation = page.getByRole('article', { name: `Conversation recorded by ${pm.name}` });
  await expect(conversation.getByText(notes)).toBeVisible();
  await expect(
    page.getByRole('article', { name: `Feedback from ${mentor.name}` }).getByText(/^Delivered/),
  ).toBeVisible();
});

test('the mentor comments on the feedback, and the PM sees it', async ({ page, browser }) => {
  await signInAs(page, mentor.email);
  await page.goto(profilePath());
  const card = page.getByRole('article', { name: `Feedback from ${mentor.name}` });
  await card.getByRole('button', { name: 'Comment', expanded: false }).click();
  await card.getByRole('textbox', { name: 'Add a comment' }).fill(comment);
  await card.getByRole('button', { name: 'Comment' }).last().click();
  await expect(card.getByRole('textbox', { name: 'Add a comment' })).toBeHidden();
  await expect(page.getByText(comment)).toBeVisible();

  const pmContext = await browser.newContext();
  const pmPage = await pmContext.newPage();
  await signInAs(pmPage, pm.email);
  await pmPage.goto(profilePath());
  await expect(pmPage.getByText(comment)).toBeVisible();
  await pmContext.close();
});

test('signing out returns to the login page', async ({ page }) => {
  await signInAs(page, mentor.email);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/pending');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});
