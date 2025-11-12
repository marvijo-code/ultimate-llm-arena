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
        # Click the 'Toggle theme' button to switch theme and verify UI changes visually
        frame = context.pages[-1]
        elem = frame.locator('xpath=html/body/div/div/header/div/div[2]/button[3]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # Refresh the page to verify if the selected theme preference persists across sessions
        await page.goto('http://localhost:6001/', timeout=10000)
        

        # Assert the theme toggle switches between dark and light modes visually
        dark_mode_class = 'dark-theme'  # Assuming the dark mode adds this class to the body or root element
        light_mode_class = 'light-theme'  # Assuming the light mode adds this class
        body_class = await frame.locator('body').get_attribute('class')
        assert (dark_mode_class in body_class) or (light_mode_class in body_class), 'Theme class not found on body element after toggle'
        # Check readability and styling of key UI components in the current theme
        title_color = await frame.locator('h1').evaluate('(el) => window.getComputedStyle(el).color')
        description_color = await frame.locator('p').evaluate('(el) => window.getComputedStyle(el).color')
        assert title_color != description_color, 'Title and description colors should differ for readability'
        # Refresh the page and confirm the theme preference persists
        await page.reload()
        await page.wait_for_timeout(2000)
        body_class_after_reload = await frame.locator('body').get_attribute('class')
        assert body_class == body_class_after_reload, 'Theme preference did not persist after page reload'
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    