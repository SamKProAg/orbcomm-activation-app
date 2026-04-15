const { chromium } = require("playwright");

async function activateOrbcommDevice(dsn) {
  console.log("Starting ORBCOMM automation for:", dsn);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  try {
    const response = await page.goto("https://partner-support.orbcomm.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    console.log("Opened page:", page.url());
    console.log("Page title:", await page.title());
    console.log("HTTP status:", response ? response.status() : "no response");

    const bodyText = (await page.textContent("body").catch(() => "")) || "";
    console.log("Page body preview:", bodyText.slice(0, 500));

    if (response && response.status() === 403) {
      throw new Error(
        "ORBCOMM returned 403 Forbidden before login page loaded."
      );
    }

    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });

    await page.fill('input[type="email"]', process.env.ORBCOMM_USER);
    await page.fill('input[type="password"]', process.env.ORBCOMM_PASS);
    await page.click('button[type="submit"]');

    console.log("Submitted login form");

    await page.waitForTimeout(3000);

    const providerText =
      "SP: 123253: Professional Ag Services 25KB individual IDP";
    const providerOption = page.getByText(providerText, { exact: true });

    if (await providerOption.count()) {
      console.log("Found solution provider picker, selecting correct provider");
      await providerOption.click();
      await page.locator("#btnModal_Login").click();
      await page.waitForTimeout(4000);
    }

    await page.screenshot({
      path: "debug-after-provider-login.png",
      fullPage: true
    });
    console.log("Saved screenshot: debug-after-provider-login.png");
    console.log("URL after provider selection:", await page.url());
    console.log("Title after provider selection:", await page.title());

    await page
      .locator('a.side-nav-link.supportMenu[href="/Terminals/Index"]')
      .click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "debug-gateways-page.png", fullPage: true });
    console.log("Saved screenshot: debug-gateways-page.png");

    await page.getByRole("button", { name: /Device Provisioning/i }).click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: "debug-provisioning-modal.png",
      fullPage: true
    });
    console.log("Saved screenshot: debug-provisioning-modal.png");

    await page.getByLabel(/Device Activations/i).check();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: /^Next$/i }).click();
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: "debug-device-activations-page.png",
      fullPage: true
    });
    console.log("Saved screenshot: debug-device-activations-page.png");
    console.log("Activation page URL:", await page.url());
    console.log("Activation page title:", await page.title());

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

    const gatewaySelect = page.locator("select").first();
    if (await gatewaySelect.count()) {
      const options = await gatewaySelect.locator("option").count();
      if (options > 1) {
        const value = await gatewaySelect
          .locator("option")
          .nth(1)
          .getAttribute("value");
        if (value) {
          await gatewaySelect.selectOption(value);
          console.log("Selected gateway account");
          await page.waitForTimeout(1000);
        }
      }
    }

    const addDeviceButton = page.getByRole("button", { name: /Add Device/i });
    if (await addDeviceButton.count()) {
      await addDeviceButton.click();
      console.log("Clicked Add Device");
      await page.waitForTimeout(2000);
    }

    const emailInputs = page.locator('input[type="text"], input[type="email"]');
    const emailInputCount = await emailInputs.count();
    if (emailInputCount > 0) {
      const lastInput = emailInputs.nth(emailInputCount - 1);
      await lastInput.fill(process.env.ORBCOMM_USER);
      console.log("Filled notification email");
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: "debug-before-submit.png", fullPage: true });
    console.log("Saved screenshot: debug-before-submit.png");

    await page.locator("#btnSubmit").click();
    console.log("Clicked final Submit button");

    await page.waitForTimeout(5000);

    await page.screenshot({ path: "debug-after-submit.png", fullPage: true });
    console.log("Saved screenshot: debug-after-submit.png");

    const pageTextAfterSubmit =
      ((await page.textContent("body").catch(() => "")) || "").toLowerCase();

    console.log(
      "Post-submit page preview:",
      pageTextAfterSubmit.slice(0, 1000)
    );

    const failurePhrases = [
      "error",
      "failed",
      "invalid",
      "unable",
      "not allowed",
      "already active",
      "required",
      "please select",
      "could not",
      "warning"
    ];

    const matchedFailure = failurePhrases.find((phrase) =>
      pageTextAfterSubmit.includes(phrase)
    );

    if (matchedFailure) {
      throw new Error(
        `ORBCOMM showed a possible failure after activation submit: "${matchedFailure}"`
      );
    }

    const successPhrases = [
      "success",
      "submitted",
      "activation request submitted",
      "request submitted",
      "completed",
      "device activated",
      "terminal activated"
    ];

    const matchedSuccess = successPhrases.find((phrase) =>
      pageTextAfterSubmit.includes(phrase)
    );

    if (!matchedSuccess) {
      throw new Error(
        "Submit was clicked, but no clear ORBCOMM activation success confirmation was found."
      );
    }

    console.log("Activation confirmed by page text:", matchedSuccess);
    console.log("Activation submitted:", dsn);
  } catch (err) {
    console.error("Activation failed:", err);
    await page
      .screenshot({ path: "debug-error.png", fullPage: true })
      .catch(() => {});
    throw err;
  } finally {
    await context.close().catch(() => {});
    await browser.close();
  }
}

async function deactivateOrbcommDevice(dsn) {
  console.log("Starting ORBCOMM deactivation for:", dsn);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  try {
    const response = await page.goto("https://partner-support.orbcomm.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    console.log("Opened page:", page.url());
    console.log("Page title:", await page.title());
    console.log("HTTP status:", response ? response.status() : "no response");

    const bodyText = (await page.textContent("body").catch(() => "")) || "";
    console.log("Page body preview:", bodyText.slice(0, 500));

    if (response && response.status() === 403) {
      throw new Error(
        "ORBCOMM returned 403 Forbidden before login page loaded."
      );
    }

    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });

    await page.fill('input[type="email"]', process.env.ORBCOMM_USER);
    await page.fill('input[type="password"]', process.env.ORBCOMM_PASS);
    await page.click('button[type="submit"]');

    console.log("Submitted login form");

    await page.waitForTimeout(3000);

    const providerText =
      "SP: 123253: Professional Ag Services 25KB individual IDP";
    const providerOption = page.getByText(providerText, { exact: true });

    if (await providerOption.count()) {
      console.log("Found solution provider picker, selecting correct provider");
      await providerOption.click();
      await page.locator("#btnModal_Login").click();
      await page.waitForTimeout(4000);
    }

    await page.screenshot({
      path: "debug-after-provider-login-deactivate.png",
      fullPage: true
    });
    console.log("Saved screenshot: debug-after-provider-login-deactivate.png");
    console.log("URL after provider selection:", await page.url());
    console.log("Title after provider selection:", await page.title());

    await page
      .locator('a.side-nav-link.supportMenu[href="/Terminals/Index"]')
      .click();
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: "debug-gateways-page-deactivate.png",
      fullPage: true
    });
    console.log("Saved screenshot: debug-gateways-page-deactivate.png");

    await page.getByRole("button", { name: /Device Provisioning/i }).click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: "debug-provisioning-modal-deactivate.png",
      fullPage: true
    });
    console.log("Saved screenshot: debug-provisioning-modal-deactivate.png");

    await page.getByLabel(/Device De-Activations/i).check();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: /^Next$/i }).click();
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: "debug-device-deactivations-page.png",
      fullPage: true
    });
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
    const emailInputCount = await emailInputs.count();
    if (emailInputCount > 0) {
      const lastInput = emailInputs.nth(emailInputCount - 1);
      await lastInput.fill(process.env.ORBCOMM_USER);
      console.log("Filled notification email");
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: "debug-before-submit-deactivate.png",
      fullPage: true
    });
    console.log("Saved screenshot: debug-before-submit-deactivate.png");

    await page.locator("#btnSubmit").click();
    console.log("Clicked final Deactivation Submit button");

    await page.waitForTimeout(5000);

    await page.screenshot({
      path: "debug-after-submit-deactivate.png",
      fullPage: true
    });
    console.log("Saved screenshot: debug-after-submit-deactivate.png");

    const pageTextAfterSubmit =
      ((await page.textContent("body").catch(() => "")) || "").toLowerCase();

    console.log(
      "Post-submit deactivation page preview:",
      pageTextAfterSubmit.slice(0, 1000)
    );

    const failurePhrases = [
      "error",
      "failed",
      "invalid",
      "unable",
      "not allowed",
      "already inactive",
      "required",
      "please select",
      "could not",
      "warning"
    ];

    const matchedFailure = failurePhrases.find((phrase) =>
      pageTextAfterSubmit.includes(phrase)
    );

    if (matchedFailure) {
      throw new Error(
        `ORBCOMM showed a possible failure after deactivation submit: "${matchedFailure}"`
      );
    }

    const successPhrases = [
      "success",
      "submitted",
      "de-activation request submitted",
      "deactivation request submitted",
      "request submitted",
      "completed",
      "device deactivated",
      "terminal deactivated"
    ];

    const matchedSuccess = successPhrases.find((phrase) =>
      pageTextAfterSubmit.includes(phrase)
    );

    if (!matchedSuccess) {
      throw new Error(
        "Submit was clicked, but no clear ORBCOMM deactivation success confirmation was found."
      );
    }

    console.log("Deactivation confirmed by page text:", matchedSuccess);
    console.log("Deactivation submitted:", dsn);
  } catch (err) {
    console.error("Deactivation failed:", err);
    await page
      .screenshot({ path: "debug-error-deactivate.png", fullPage: true })
      .catch(() => {});
    throw err;
  } finally {
    await context.close().catch(() => {});
    await browser.close();
  }
}

module.exports = { activateOrbcommDevice, deactivateOrbcommDevice };