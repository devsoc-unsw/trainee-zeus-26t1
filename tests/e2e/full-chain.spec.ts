import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * 3-context end-to-end smoke. Each context has its own cookie jar so
 * ct_player is per-player. The host (Alice) creates; Bob + Carol join.
 * After Start, all three submit each phase; the test waits for the
 * Realtime-driven navigation to land each tab on the next URL.
 *
 * If this test fails locally, check:
 *   - dev server actually running at PLAYWRIGHT_BASE_URL (defaults to localhost:3000)
 *   - SUPABASE_SERVICE_ROLE_KEY set in .env (route handlers throw without it)
 *   - All 4 tables in supabase_realtime publication (migrations 008 + 009 + 010)
 */

async function joinWizard(page: Page, nickname: string, opts: { create: true } | { join: string }) {
  await page.goto('/');
  // Step 1: nickname
  await page.getByPlaceholder('e.g. Jordan').fill(nickname);
  await page.getByRole('button', { name: /Next/ }).click();
  // Step 2: method
  if ('create' in opts) {
    await page.getByLabel(/Create a new room/).check();
  } else {
    await page.getByLabel(/Join an existing room/).check();
    await page.getByPlaceholder(/ROOM-0000/).fill(opts.join);
  }
  await page.getByRole('button', { name: /Finish/ }).click();
  // Land on /waiting-room/<CODE>
  await page.waitForURL(/\/waiting-room\/[A-Z0-9]{6}$/, { timeout: 15_000 });
}

async function pickRoomCodeFromUrl(page: Page): Promise<string> {
  const url = page.url();
  const m = url.match(/\/waiting-room\/([A-Z0-9]{6})/);
  if (!m) throw new Error(`could not extract code from ${url}`);
  return m[1];
}

async function submitInPhase(page: Page, content: string) {
  // Each phase has a Submit button at the bottom. The selector covers
  // editor (Submit), describe (Submit description), reimplement (Submit code).
  await page.getByRole('textbox').first().fill(content);
  await page.getByRole('button', { name: /^Submit/ }).click();
}

async function newPlayerContext(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

test('3-player chain reaches /reveal with judging', async ({ browser }) => {
  const alice = await newPlayerContext(browser);
  const bob = await newPlayerContext(browser);
  const carol = await newPlayerContext(browser);

  // 1. Alice creates.
  await joinWizard(alice, 'Alice', { create: true });
  const code = await pickRoomCodeFromUrl(alice);
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // 2. Bob + Carol join.
  await joinWizard(bob, 'Bob', { join: code });
  await joinWizard(carol, 'Carol', { join: code });

  // 3. All three lobbies show 3 players. Alice clicks Start.
  for (const p of [alice, bob, carol]) {
    await expect(p.getByText('Alice')).toBeVisible();
    await expect(p.getByText('Bob')).toBeVisible();
    await expect(p.getByText('Carol')).toBeVisible();
  }
  await alice.getByRole('button', { name: /Start Game/ }).click();

  // 4. All three navigate to /editor/<CODE>.
  await Promise.all([
    alice.waitForURL(`**/editor/${code}`, { timeout: 15_000 }),
    bob.waitForURL(`**/editor/${code}`, { timeout: 15_000 }),
    carol.waitForURL(`**/editor/${code}`, { timeout: 15_000 }),
  ]);

  // 5. Each writes code and submits. After the third submit, all advance.
  await submitInPhase(alice, 'def f(x):\n    return x * 2\n');
  await submitInPhase(bob,   'def g(x):\n    return x + 1\n');
  await submitInPhase(carol, 'def h(x):\n    return x * x\n');
  await Promise.all([
    alice.waitForURL(`**/describe/${code}`, { timeout: 30_000 }),
    bob.waitForURL(`**/describe/${code}`, { timeout: 30_000 }),
    carol.waitForURL(`**/describe/${code}`, { timeout: 30_000 }),
  ]);

  // 6. Describe phase.
  await submitInPhase(alice, 'doubles the input');
  await submitInPhase(bob,   'adds one to the input');
  await submitInPhase(carol, 'squares the input');
  await Promise.all([
    alice.waitForURL(`**/reimplement/${code}`, { timeout: 30_000 }),
    bob.waitForURL(`**/reimplement/${code}`, { timeout: 30_000 }),
    carol.waitForURL(`**/reimplement/${code}`, { timeout: 30_000 }),
  ]);

  // 7. Reimplement phase.
  await submitInPhase(alice, 'def f(x): return x * 2\n');
  await submitInPhase(bob,   'def g(x): return x + 1\n');
  await submitInPhase(carol, 'def h(x): return x ** 2\n');
  await Promise.all([
    alice.waitForURL(`**/reveal/${code}`, { timeout: 30_000 }),
    bob.waitForURL(`**/reveal/${code}`, { timeout: 30_000 }),
    carol.waitForURL(`**/reveal/${code}`, { timeout: 30_000 }),
  ]);

  // 8. Reveal shows the chain. Each tab should see "Scoring this chain…"
  //    that eventually transitions to a number (or "Scoring unavailable"
  //    if GEMINI is rate-limited — we accept either).
  await expect(alice.getByText(/chain 1/i)).toBeVisible({ timeout: 15_000 });

  // Wait for the score panel to leave the "Scoring this chain…" state.
  // 45s budget — Gemini sometimes takes a while.
  await alice.waitForFunction(
    () => {
      const text = document.body.innerText;
      return !text.includes('Scoring this chain…');
    },
    {},
    { timeout: 45_000 },
  );

  // Final assertion: the page shows either a numeric score OR "Scoring unavailable".
  const body = await alice.locator('body').innerText();
  expect(body).toMatch(/(\/100|Scoring unavailable)/);
});
