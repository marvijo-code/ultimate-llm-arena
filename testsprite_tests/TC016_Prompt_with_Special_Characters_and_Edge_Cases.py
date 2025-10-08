import asyncio
from playwright import async_api

async def run_test():
    pw = None
    browser = None
    context = None
    
    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()
        
        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )
        
        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)
        
        # Open a new page in the browser context
        page = await context.new_page()
        
        # Navigate to your target URL and wait until the network request is committed
        await page.goto("http://localhost:6001", wait_until="commit", timeout=10000)
        
        # Wait for the main page to reach DOMContentLoaded state (optional for stability)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
        except async_api.Error:
            pass
        
        # Iterate through all iframes and wait for them to load as well
        for frame in page.frames:
            try:
                await frame.wait_for_load_state("domcontentloaded", timeout=3000)
            except async_api.Error:
                pass
        
        # Interact with the page elements to simulate user flow
        # Enter a prompt with special characters and emojis in the prompt textarea.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/main/div/div/div[3]/div/div/div[2]/textarea').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('Hello! Testing special characters: ~!@#$%^&*()_+{}|:"<>? 😊🚀✨')
        

        # Select a valid model and run the speed test.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/header/div/div[2]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # Try to reload or refresh models or page to get models loaded for speed test.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/main/div/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # Click on 'Manage LLMs' to check if models can be managed or loaded from there.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/header/div/div[2]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # Open the provider dropdown to select a provider and load models.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/main/div/div[2]/div[2]/div/div/div[2]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # Try to refresh the page to attempt loading providers or check for alternative ways to add providers.
        await page.goto('http://localhost:6001/', timeout=10000)
        

        # Enter an extremely long prompt exceeding normal length limits in the prompt textarea.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/main/div/div/div[3]/div/div/div[2]/textarea').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.')
        

        # Clear the prompt textarea and enter an empty prompt.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/main/div/div/div[3]/div/div/div[2]/textarea').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('')
        

        # Attempt to run speed test with empty prompt and verify system prevents test run and shows validation error.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # Assertion: Verify streaming response completes successfully and contains expected output
        response_locator = frame.locator('xpath=html/body/div/div/main/div/div/div[4]')
        await response_locator.wait_for(state='visible', timeout=15000)
        response_text = await response_locator.inner_text()
        assert response_text and len(response_text) > 0, 'Expected streaming response to contain output but it was empty.'
        # Assertion: Confirm system handles extremely long input gracefully without crashing or shows validation errors
        error_locator = frame.locator('xpath=//div[contains(@class, "error") or contains(text(), "error") or contains(text(), "invalid")]')
        error_visible = await error_locator.is_visible()
        assert not error_visible, 'System showed validation error or crashed on extremely long input.'
        # Assertion: Verify system prevents test run and shows appropriate validation error for empty prompt
        validation_error_locator = frame.locator('xpath=//div[contains(text(), "prompt cannot be empty") or contains(text(), "Please enter a prompt") or contains(text(), "validation error")]')
        validation_error_visible = await validation_error_locator.is_visible()
        assert validation_error_visible, 'Expected validation error for empty prompt was not shown.'
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    