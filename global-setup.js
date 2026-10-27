const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const AUTH_FILE = path.resolve(__dirname, '.auth', 'user.json');

function syncToken(token) {
  if (token) {
    process.env.API_TOKEN = token;
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.includes('API_TOKEN=')) {
        envContent = envContent.replace(/API_TOKEN=.*/, `API_TOKEN=${token}`);
      } else {
        envContent += `\nAPI_TOKEN=${token}\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('[GlobalSetup] Synchronized fresh API_TOKEN into .env');
    }
  }
}

function isTokenExpired() {
  try {
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/API_TOKEN=([^\r\n]+)/);
      if (match && match[1]) {
        const payload = JSON.parse(Buffer.from(match[1].split('.')[1], 'base64').toString());
        if (payload.exp && Date.now() >= (payload.exp - 60) * 1000) {
          return true;
        }
      }
    }
  } catch (e) {}
  return false;
}

async function globalSetup() {
  const expired = isTokenExpired();
  if (fs.existsSync(AUTH_FILE) && !expired && !process.env.FORCE_LOGIN) {
    try {
      const stats = fs.statSync(AUTH_FILE);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs < 8 * 60 * 60 * 1000) {
        console.log(`[GlobalSetup] Reusing existing fresh auth state (${Math.round(ageMs / 1000)}s old)`);
        return;
      }
    } catch (e) {}
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const baseUrl = (process.env.UI_BASE_URL || (process.env.BASE_URL && !process.env.BASE_URL.includes('13.61.179.149') ? process.env.BASE_URL : 'http://localhost:4200/'));
  const email = process.env.USER_EMAIL;
  const password = process.env.USER_PASSWORD;

  if (!email || !password) {
    await browser.close();
    throw new Error('USER_EMAIL and USER_PASSWORD must be set in .env');
  }

  const loginUrl = baseUrl.endsWith('/') ? baseUrl + 'login' : baseUrl + '/login';
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // If already logged in (redirected to /home)
  await page.waitForTimeout(2000);
  if (page.url().includes('/home')) {
    console.log('[GlobalSetup] Browser already authenticated at /home');
    const existingToken = await page.evaluate(() => localStorage.getItem('token'));
    if (existingToken) {
      const authDir = path.dirname(AUTH_FILE);
      if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
      await context.storageState({ path: AUTH_FILE });
      syncToken(existingToken);
      await browser.close();
      return;
    }
  }

  // Click Microsoft SSO – this opens a POPUP (new tab) using MSAL popup flow
  const microsoftSSOLogo = page.locator('img.micro-logo, img[alt*="Microsoft" i], .micro-logo').first();
  const logoVisible = await microsoftSSOLogo.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  if (!logoVisible) {
    console.log('[GlobalSetup] Microsoft logo not visible, reloading login page...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await microsoftSSOLogo.waitFor({ state: 'visible', timeout: 25000 });
  }

  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
    microsoftSSOLogo.click(),
  ]);

  const msPage = popup || page;
  await msPage.waitForLoadState('domcontentloaded', { timeout: 60000 });

  // Fill email
  const msEmailInput = msPage.locator('input[type="email"], input[name="loginfmt"], #i0116, [placeholder*="Email" i]');
  await msEmailInput.first().waitFor({ state: 'visible', timeout: 90000 });
  await msEmailInput.first().fill(email);
  await msPage.locator('input[type="submit"], input[value="Next"], #idSIButton9').first().click();

  // Fill password (Microsoft uses type="password", name="passwd", #i0118 with empty placeholder)
  const msPasswordInput = msPage.locator('input[type="password"], input[name="passwd"], #i0118');
  await msPasswordInput.first().waitFor({ state: 'visible', timeout: 90000 });
  await msPasswordInput.first().fill(password);
  await msPage.locator('input[type="submit"], input[value="Sign in"], #idSIButton9').first().click();

  // Handle "Stay signed in?" if it appears
  try {
    const stayNo = msPage.locator('input[type="button"][value="No"], #idBtn_Back, button:has-text("No")');
    await stayNo.first().waitFor({ state: 'visible', timeout: 8000 });
    await stayNo.first().click();
  } catch (e) {}

  // MSAL popup flow: the popup processes the auth code and sends it back
  // to the ORIGINAL PAGE via postMessage, then closes itself.
  // We must wait for the ORIGINAL PAGE to receive the token and redirect.
  console.log('[GlobalSetup] Waiting for original page to process MSAL popup response...');

  if (popup) {
    // Wait for the popup to close (MSAL closes it after sending token to opener)
    await popup.waitForEvent('close', { timeout: 90000 }).catch(() => {
      console.log('[GlobalSetup] Popup did not close within 30s');
    });
    console.log('[GlobalSetup] Popup closed');
  }

  // After the popup closes, the original page should have received the auth token via postMessage.
  // Poll localStorage until it is populated (up to 15s)
  console.log('[GlobalSetup] Waiting for localStorage to populate...');
  let storageKeys = [];
  for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      storageKeys = await page.evaluate(() => Object.keys(localStorage));
      if (storageKeys.length > 0) break;
  }

  if (storageKeys.length === 0) {
      console.log('[GlobalSetup] Warning: localStorage still empty after 15s!');
  } else {
      console.log('[GlobalSetup] localStorage keys populated: ' + storageKeys.join(', '));
  }

  // Finally, navigate to the base URL (dashboard) to ensure we are on the app home.
  // baseUrl already defined above
  await page.goto(baseUrl, { waitUntil: 'networkidle' }).catch(() => {});

  // Wait for redirect away from /login.
  await page.waitForURL(url => !url.includes('/login'), { timeout: 90000 }).catch(() => {
    console.log('[GlobalSetup] Warning: still on /login after final navigation');
  });

  const finalUrl = page.url();
  console.log('[GlobalSetup] Final page URL: ' + finalUrl);

  if (finalUrl.includes('/login')) {
    await browser.close();
    throw new Error('[GlobalSetup] Still on login page after token processing. URL: ' + finalUrl);
  }

  // Save the auth state (includes cookies and localStorage)
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  await context.storageState({ path: AUTH_FILE });

  // Ensure both remote and localhost origins are populated so tests work against either
  try {
    const rawAuth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    if (rawAuth && rawAuth.origins && rawAuth.origins.length > 0) {
      const existingOrigin = rawAuth.origins[0];
      const hasLocalhost = rawAuth.origins.some(o => o.origin.includes('localhost:4200'));
      const hasRemote = rawAuth.origins.some(o => o.origin.includes('13.61.179.149'));
      if (!hasLocalhost) {
        rawAuth.origins.push({
          origin: 'http://localhost:4200',
          localStorage: existingOrigin.localStorage
        });
      }
      if (!hasRemote) {
        rawAuth.origins.push({
          origin: 'https://13.61.179.149',
          localStorage: existingOrigin.localStorage
        });
      }
      fs.writeFileSync(AUTH_FILE, JSON.stringify(rawAuth, null, 2), 'utf8');
      console.log('[GlobalSetup] Mirrored auth localStorage to both localhost:4200 and 13.61.179.149');
    }
  } catch (err) {
    console.log('[GlobalSetup] Warning mirroring origins: ' + err.message);
  }

  console.log('[GlobalSetup] Auth state saved to ' + AUTH_FILE);

  // Sync fresh token into process.env and .env for API tests
  const token = await page.evaluate(() => localStorage.getItem('token'));
  syncToken(token);

  await browser.close();
}

module.exports = globalSetup;
