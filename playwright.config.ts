import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',

  /* Run global setup once to perform Microsoft SSO and save auth state */
  globalSetup: './global-setup.js',

  /*
   * Maximum time one test can run for.
   * Because we added slowMo: 1000, we need more than 30s
   */
  timeout: 300 * 1000,

  /* Run tests in files in parallel */
  fullyParallel: true,

  /*
   * Fail the build on CI if you accidentally left test.only
   * in the source code.
   */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Set workers for stable execution on Windows (3 workers locally, 1 on CI) */
  workers: process.env.CI ? 1 : (process.env.WORKERS ? parseInt(process.env.WORKERS, 10) : 3),

  /* Reporter to use */
  reporter: [
    ['list'],

    /*
     * JSON report for dashboard/data processing
     */
    ['json', {
      outputFile: 'reports/latest-results.json',
    }],

    /*
     * HTML report for viewing test results
     */
    ['html', {
      outputFolder: 'reports/html',
      open: 'never',
    }],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('')` */
    baseURL: process.env.BASE_URL,

    ignoreHTTPSErrors: true,

    /* Reuse the saved SSO session */
    storageState: '.auth/user.json',

    /*
     * Slow down Playwright operations by the specified amount
     * of milliseconds.
     */
    launchOptions: {
      slowMo: 0,
    },

    /*
     * Collect trace when retrying the failed test.
     * See https://playwright.dev/docs/trace-viewer
     */
    trace: 'retain-on-failure',

    video: 'retain-on-failure',

    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    /*
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    */

    /* Test against mobile viewports. */

    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },


    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */

    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },

    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */

  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});