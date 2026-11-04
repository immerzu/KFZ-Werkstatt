const { test, expect } = require('@playwright/test');

const api = 'https://autocentrum-halle-api.immerzu.workers.dev';
const seiten = [
  'index.html',
  'leistungen.html',
  'kontakt.html',
  'impressum.html',
  'datenschutz.html',
  'leistungen/hu-au.html',
  'leistungen/reifen.html',
  'leistungen/bremsen.html',
  'leistungen/klimaservice.html',
  'leistungen/ankauf-verkauf.html',
  'leistungen/karosserie-blech.html',
  'leistungen/inspektion-wartung.html',
  'leistungen/ersatzteile-zubehoer.html',
  'leistungen/fahrzeugaufbereitung.html'
];

test.beforeEach(async ({ page }) => {
  // Keine echten Backendaufrufe, keine D1-Schreibvorgaenge und keine Besucherzaehlung.
  await page.route(api + '/**', async route => {
    const u = new URL(route.request().url());
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'Content-Type, Accept'
        }
      });
    }
    if (u.pathname === '/api/veroeffentlicht') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          ok: true, ankuendigung: null, ankuendigungen: [],
          news: [{ titel: 'CI-Pruefmeldung', text: 'Nur simulierte Testdaten.' }]
        })
      });
    }
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ ok: true })
      });
    }
    return route.abort('blockedbyclient');
  });
  await page.route('https://api.counterapi.dev/**', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data: { up_count: 1234 } })
    }));
});

for (const pfad of seiten) {
  test('Seite und gemeinsame Skripte: ' + pfad, async ({ page }) => {
    const fehler = [];
    const siteAntworten = [];
    page.on('pageerror', error => fehler.push(error.message));
    page.on('response', response => {
      if (new URL(response.url()).pathname.endsWith('/site.js')) {
        siteAntworten.push(response.status());
      }
    });

    const antwort = await page.goto(pfad, { waitUntil: 'load' });
    expect(antwort.status()).toBe(200);
    await expect(page.locator('main')).toHaveCount(1);
    expect(await page.locator('h1').count()).toBeGreaterThan(0);
    await expect(page.locator('script[src$="site.js"]')).toHaveCount(1);
    expect(siteAntworten).toContain(200);
    expect(fehler).toEqual([]);
  });
}

test('Startseite, Aktuelles und Screenshot', async ({ page }, testInfo) => {
  await page.goto('index.html');
  await expect(page.locator('#hero-titel')).toBeVisible();
  await expect(page.locator('#aktuelles')).toBeVisible();
  await expect(page.locator('#aktuelles .aktuelles-eintrag', { hasText: 'CI-Pruefmeldung' })).toHaveCount(1);
  await testInfo.attach('startseite-' + testInfo.project.name, {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
    contentType: 'image/png'
  });
});

test('Mobiles Menue laesst sich oeffnen und schliessen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobil-chromium', 'Nur Mobilansicht');
  await page.goto('index.html');
  const knopf = page.locator('#menue-schalter');
  const menue = page.locator('#mobil-menue');
  await knopf.click();
  await expect(knopf).toHaveAttribute('aria-expanded', 'true');
  await expect(menue).toBeVisible();
  await knopf.click();
  await expect(knopf).toHaveAttribute('aria-expanded', 'false');
  await expect(menue).toBeHidden();
});

test('Kontaktformular sendet nur an den simulierten Testserver', async ({ page }) => {
  let anzahl = 0;
  page.on('request', request => {
    if (request.url().includes('/api/formular') && request.method() === 'POST') anzahl++;
  });
  await page.goto('kontakt.html');
  const formular = page.locator('form[name="kontakt"]');
  await formular.locator('[name="name"]').fill('CI Test');
  await formular.locator('[name="email"]').fill('ci@example.invalid');
  await formular.locator('[name="nachricht"]').fill('Automatisierter Funktionstest ohne echte Uebermittlung.');
  await formular.locator('button[type="submit"]').click();
  await expect(formular.locator('.cloudflare-formular-status')).toContainText('erfolgreich');
  expect(anzahl).toBe(1);
});

test('Ankauf zeigt Fotovorschau ohne Datenversand', async ({ page }) => {
  await page.goto('leistungen/ankauf-verkauf.html');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=',
    'base64'
  );
  await page.locator('input[name="foto_front"]').setInputFiles({
    name: 'ci-test.png', mimeType: 'image/png', buffer: png
  });
  await expect(page.locator('[data-vorschau="foto_front"]')).toBeVisible();
});
