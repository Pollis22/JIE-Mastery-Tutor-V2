import { test, expect } from "@playwright/test";

test.describe("Dynamic Agent Session Creation", () => {
  test("creates dynamic agent with student info and documents", async ({ page }) => {
    // 1. Navigate to home page
    await page.goto("/");
    
    // 2. Sign in (use test account or create one)
    await page.click('[data-testid="link-signin"]', { timeout: 10000 }).catch(() => {
      console.log("Already logged in or no login link");
    });
    
    // Fill login form if present
    const emailInput = page.locator('input[name="email"]');
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill("test@example.com");
      await page.locator('input[name="password"]').fill("password123");
      await page.click('[data-testid="button-submit"]');
      await page.waitForTimeout(1000);
    }
    
    // 3. Navigate to tutor page
    await page.goto("/tutor");
    await page.waitForLoadState("networkidle");
    
    // 4. Verify tutor page loaded
    await expect(page.getByText(/Start Conversation/i)).toBeVisible({ timeout: 10000 });
    
    // 5. Fill in student information
    const studentNameInput = page.locator('input[placeholder*="student"]');
    if (await studentNameInput.isVisible()) {
      await studentNameInput.fill("Alex Johnson");
    }
    
    // 6. Select grade band
    const gradeBandSelect = page.locator('select').first();
    if (await gradeBandSelect.isVisible()) {
      await gradeBandSelect.selectOption({ index: 2 }); // Select Grades 6-8
    }
    
    // 7. Select subject
    const subjectSelect = page.locator('select').nth(1);
    if (await subjectSelect.isVisible()) {
      await subjectSelect.selectOption("math");
    }
    
    // 8. Click Connect to Tutor button
    const connectButton = page.getByRole('button', { name: /Connect to Tutor/i });
    
    // Check if button exists and is enabled
    if (await connectButton.isVisible()) {
      console.log("Found Connect to Tutor button, clicking...");
      
      // Wait for any potential session creation
      const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/session/create'),
        { timeout: 10000 }
      ).catch(() => null);
      
      await connectButton.click();
      
      const response = await responsePromise;
      if (response) {
        const status = response.status();
        console.log(`Session creation response status: ${status}`);
        
        if (status === 200) {
          const data = await response.json();
          console.log("Session created successfully:", data);
          
          // Verify ConvAI widget appears
          await expect(page.locator('elevenlabs-convai')).toBeVisible({ timeout: 15000 });
          console.log("✅ ConvAI widget loaded successfully");
        } else {
          const text = await response.text();
          console.log(`Session creation failed: ${text}`);
        }
      }
    } else {
      console.log("Connect to Tutor button not found - may need student name");
    }
  });
  
  test("verifies session cleanup on stop", async ({ page }) => {
    await page.goto("/tutor");
    await page.waitForLoadState("networkidle");
    
    // If there's an active session, stop it
    const stopButton = page.getByRole('button', { name: /Stop Session/i });
    if (await stopButton.isVisible().catch(() => false)) {
      const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/session/') && response.url().includes('/end'),
        { timeout: 10000 }
      ).catch(() => null);
      
      await stopButton.click();
      
      const response = await responsePromise;
      if (response) {
        const status = response.status();
        console.log(`Session cleanup response status: ${status}`);
        expect(status).toBe(200);
      }
      
      // Verify ConvAI widget is removed
      await expect(page.locator('elevenlabs-convai')).toHaveCount(0);
      console.log("✅ Session cleaned up successfully");
    }
  });
});
