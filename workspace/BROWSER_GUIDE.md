# BROWSER AUTOMATION GUIDE

You have `playwright` installed locally in the `openclaw-control` directory.
If you need to login, navigate, scrape or understand a website, you MUST write and execute Node.js scripts using Playwright and run them via `bash`.

## CRITICAL RULES FOR THIS ENVIRONMENT:

1. ALWAYS use `headless: true`. This environment does not have a graphical display (X11/Wayland). Using `headless: false` will result in a crash.
2. DO NOT use Python playwright, use Node.js `playwright`.
3. ALWAYS pass `--no-sandbox` to the browser launch arguments to avoid permissions issues.

### Example Autonomy Script

Create a script like `workspace/scrape_task.js` and run it with `node workspace/scrape_task.js`:

```javascript
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  // 1. MUST use headless: true and --no-sandbox
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("Navigating to site...");
    await page.goto("https://moti-auto-care.com"); // Replace with target URL

    // 2. Autonomous Login (No human input needed)
    // Adjust selectors as per the website
    // await page.fill('input[name="email"]', 'customer@motiautocare.com');
    // await page.fill('input[name="password"]', '12345678');
    // await page.click('button[type="submit"]');
    // await page.waitForLoadState('networkidle');

    // 3. Extract text to understand the roles/views
    const textContent = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync("workspace/page_content.txt", textContent);

    // 4. Take screenshot for marketing posters
    await page.screenshot({
      path: "workspace/landing_page.png",
      fullPage: true,
    });

    console.log("SUCCESS: Captured text and screenshot.");
  } catch (e) {
    console.error("Browser error:", e);
  } finally {
    await browser.close();
  }
})();
```

4. Once the script runs successfully, read the output files (`page_content.txt` etc.) into your context, and analyze them to complete the user's task.
5. This fulfills the requirement to "autonomously log in and interact... without requiring input."
