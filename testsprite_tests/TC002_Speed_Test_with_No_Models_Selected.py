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
        # Click the 'Run Test' button to attempt running the speed test without selecting any LLM models and observe the error message.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/div/ol/li').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # Check if the 'Run Test' button is present and clickable or if there is any other element to trigger the speed test run without model selection.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/main/div/div/div[3]/div/div/div[2]/textarea').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # Confirm that the 'Run Test' button is disabled and no error message is shown when no models are selected, then complete the task.
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/main/div/div/div[3]/div/div/div[2]/textarea').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # Assert that an error message is displayed when attempting to run the speed test without selecting any LLM models
        frame = context.pages[-1]
        error_locator = frame.locator('text=at least one model must be selected')
        assert await error_locator.is_visible(), "Error message for no model selection is not visible"
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    