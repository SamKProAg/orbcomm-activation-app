const { chromium } = require("playwright");

async function activateOrbcommDevice(dsn) {
  console.log("Starting ORBCOMM automation for:", dsn);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto("https://partner-support.orbcomm.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    console.log("Opened page:", await page.url());
    console.log("Page title:", await page.title());

    await page.fill('input[type="email"]', process.env.ORBCOMM_USER);
    await page.fill('input[type="password"]', process.env.ORBCOMM_PASS);
    await page.click('button[type="submit"]');

    console.log("Submitted login form");

    await page.waitForTimeout(3000);

    // Handle the Solution Provider popup if it appears
    const providerText = "SP: 123253: Professional Ag Services 25KB individual IDP";
    const providerOption = page.getByText(providerText, { exact: true });

    if (await providerOption.count()) {
      console.log("Found solution provider picker, selecting correct provider");
      await providerOption.click();

     await page.locator("#btnModal_Login").click();

      await page.waitForTimeout(4000);
    }

    await page.screenshot({ path: "debug-after-provider-login.png", fullPage: true });
    console.log("Saved screenshot: debug-after-provider-login.png");
    console.log("URL after provider selection:", await page.url());
    console.log("Title after provider selection:", await page.title());

    // Step 1: open Gateways & Devices
await page.locator('a.side-nav-link.supportMenu[href="/Terminals/Index"]').click();
await page.waitForTimeout(3000);

await page.screenshot({ path: "debug-gateways-page.png", fullPage: true });
console.log("Saved screenshot: debug-gateways-page.png");

// Step 2: click Device Provisioning button
await page.getByRole("button", { name: /Device Provisioning/i }).click();
await page.waitForTimeout(2000);

await page.screenshot({ path: "debug-provisioning-modal.png", fullPage: true });
console.log("Saved screenshot: debug-provisioning-modal.png");

// Step 3: choose Device Activations radio button
await page.getByLabel(/Device Activations/i).check();
await page.waitForTimeout(500);

// Step 4: click Next
await page.getByRole("button", { name: /^Next$/i }).click();
await page.waitForTimeout(3000);

await page.screenshot({ path: "debug-device-activations-page.png", fullPage: true });
console.log("Saved screenshot: debug-device-activations-page.png");
console.log("Activation page URL:", await page.url());
console.log("Activation page title:", await page.title());

// Step 5: fill Device Serial #s
let filled = false;

const textareaCount = await page.locator("textarea").count();
if (textareaCount > 0) {
  await page.locator("textarea").first().fill(dsn);
  filled = true;
}

if (!filled) {
  const textInputCount = await page.locator('input[type="text"]').count();
  if (textInputCount > 0) {
    await page.locator('input[type="text"]').first().fill(dsn);
    filled = true;
  }
}

if (!filled) {
  throw new Error("Could not find DSN input field on activation page.");
}

console.log("Filled DSN:", dsn);

// Try selecting Gateway Account if a dropdown is present
const gatewaySelect = page.locator("select").first();
if (await gatewaySelect.count()) {
  const options = await gatewaySelect.locator("option").count();
  if (options > 1) {
    // choose the first non-empty option
    const value = await gatewaySelect.locator("option").nth(1).getAttribute("value");
    if (value) {
      await gatewaySelect.selectOption(value);
      console.log("Selected gateway account");
      await page.waitForTimeout(1000);
    }
  }
}

// Click Add Device if present
const addDeviceButton = page.getByRole("button", { name: /Add Device/i });
if (await addDeviceButton.count()) {
  await addDeviceButton.click();
  console.log("Clicked Add Device");
  await page.waitForTimeout(2000);
}

// Optional: make sure notification email is filled
const emailInputs = page.locator('input[type="text"], input[type="email"]');
const count = await emailInputs.count();
if (count > 0) {
  const lastInput = emailInputs.nth(count - 1);
  await lastInput.fill(process.env.ORBCOMM_USER);
  console.log("Filled notification email");
  await page.waitForTimeout(500);
}

await page.screenshot({ path: "debug-before-submit.png", fullPage: true });
console.log("Saved screenshot: debug-before-submit.png");

// Submit activation
await page.locator("#btnSubmit").click();    await page.waitForTimeout(4000);

    await page.screenshot({ path: "debug-after-submit.png", fullPage: true });
    console.log("Activation submitted:", dsn);
  } catch (err) {
    console.error("Activation failed:", err);
    await page.screenshot({ path: "debug-error.png", fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = { activateOrbcommDevice, deactivateOrbcommDevice };

async function deactivateOrbcommDevice(dsn) {
  console.log("Starting ORBCOMM deactivation for:", dsn);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto("https://partner-support.orbcomm.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    console.log("Opened page:", await page.url());
    console.log("Page title:", await page.title());

    await page.fill('input[type="email"]', process.env.ORBCOMM_USER);
    await page.fill('input[type="password"]', process.env.ORBCOMM_PASS);
    await page.click('button[type="submit"]');

    console.log("Submitted login form");

    await page.waitForTimeout(3000);

    const providerText = "SP: 123253: Professional Ag Services 25KB individual IDP";
    const providerOption = page.getByText(providerText, { exact: true });

    if (await providerOption.count()) {
      console.log("Found solution provider picker, selecting correct provider");
      await providerOption.click();
      await page.locator("#btnModal_Login").click();
      await page.waitForTimeout(4000);
    }

    await page.screenshot({ path: "debug-after-provider-login-deactivate.png", fullPage: true });
    console.log("Saved screenshot: debug-after-provider-login-deactivate.png");
    console.log("URL after provider selection:", await page.url());
    console.log("Title after provider selection:", await page.title());

    await page.locator('a.side-nav-link.supportMenu[href="/Terminals/Index"]').click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "debug-gateways-page-deactivate.png", fullPage: true });
    console.log("Saved screenshot: debug-gateways-page-deactivate.png");

    await page.getByRole("button", { name: /Device Provisioning/i }).click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "debug-provisioning-modal-deactivate.png", fullPage: true });
    console.log("Saved screenshot: debug-provisioning-modal-deactivate.png");

    await page.getByLabel(/Device De-Activations/i).check();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: /^Next$/i }).click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "debug-device-deactivations-page.png", fullPage: true });
    console.log("Saved screenshot: debug-device-deactivations-page.png");
    console.log("Deactivation page URL:", await page.url());
    console.log("Deactivation page title:", await page.title());

    let filled = false;

    const textareaCount = await page.locator("textarea").count();
    if (textareaCount > 0) {
      await page.locator("textarea").first().fill(dsn);
      filled = true;
    }

    if (!filled) {
      const textInputCount = await page.locator('input[type="text"]').count();
      if (textInputCount > 0) {
        await page.locator('input[type="text"]').first().fill(dsn);
        filled = true;
      }
    }

    if (!filled) {
      throw new Error("Could not find DSN input field on deactivation page.");
    }

    console.log("Filled DSN for deactivation:", dsn);

    const addDeviceButton = page.getByRole("button", { name: /Add Device/i });
    if (await addDeviceButton.count()) {
      await addDeviceButton.click();
      console.log("Clicked Add Device");
      await page.waitForTimeout(2000);
    }

    const emailInputs = page.locator('input[type="email"], input[type="text"]');
    const count = await emailInputs.count();
    if (count > 0) {
      const lastInput = emailInputs.nth(count - 1);
      await lastInput.fill(process.env.ORBCOMM_USER);
      console.log("Filled notification email");
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: "debug-before-submit-deactivate.png", fullPage: true });
    console.log("Saved screenshot: debug-before-submit-deactivate.png");

    await page.locator("#btnSubmit").click();
    await page.waitForTimeout(4000);

    await page.screenshot({ path: "debug-after-submit-deactivate.png", fullPage: true });
    console.log("Deactivation submitted:", dsn);
  } catch (err) {
    console.error("Deactivation failed:", err);
    await page.screenshot({ path: "debug-error-deactivate.png", fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}