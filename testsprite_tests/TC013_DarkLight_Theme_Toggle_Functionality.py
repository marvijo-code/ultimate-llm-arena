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
        # Click the 'Toggle theme' button to switch the UI theme
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/header/div/div[2]/button[3]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # Refresh the page to verify if the theme preference persists
        await page.goto('http://localhost:6001/', timeout=10000)
        

        # Assert the theme toggle button exists
        assert await elem.is_visible(), "Theme toggle button should be visible"
        # Check the theme attribute or class to verify the theme switched to dark mode
        theme_class = await frame.locator('html').get_attribute('class')
        assert 'dark' in theme_class or 'dark-theme' in theme_class, "Theme should switch to dark mode"
        # Check readability by verifying text color contrast or visibility of key UI elements
        header_text_color = await frame.locator('header').evaluate("el => window.getComputedStyle(el).color")
        assert header_text_color is not None and header_text_color != '', "Header text color should be set for readability"
        # Toggle back to light theme
        await elem.click(timeout=5000)
        await page.wait_for_timeout(1000)
        theme_class_light = await frame.locator('html').get_attribute('class')
        assert 'light' in theme_class_light or 'light-theme' in theme_class_light, "Theme should switch back to light mode"
        # Check readability again in light mode
        header_text_color_light = await frame.locator('header').evaluate("el => window.getComputedStyle(el).color")
        assert header_text_color_light is not None and header_text_color_light != '', "Header text color should be set for readability in light mode"
        # Refresh the page to confirm theme preference persists
        await page.goto('http://localhost:6001/', timeout=10000)
        await page.wait_for_timeout(2000)
        theme_class_after_refresh = await frame.locator('html').get_attribute('class')
        assert theme_class_after_refresh == theme_class_light, "Theme preference should persist after page refresh"
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    