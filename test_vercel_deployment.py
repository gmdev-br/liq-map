"""
Test script for Coinglass Vercel deployment
Tests the production URL: https://frontend-es00iav94-wagnercgr-gmailcoms-projects.vercel.app
"""

import asyncio
import json
from playwright.async_api import async_playwright

VERCEL_URL = "https://frontend-es00iav94-wagnercgr-gmailcoms-projects.vercel.app"

async def test_main_page():
    """Test 1: Make request to main page and verify it loads"""
    print("\n=== Test 1: Main Page Request ===")
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Navigate to main page
            response = await page.goto(VERCEL_URL, wait_until="networkidle")
            
            print(f"Status: {response.status}")
            print(f"URL: {page.url}")
            
            # Wait a bit for any dynamic content
            await page.wait_for_timeout(2000)
            
            # Take screenshot
            await page.screenshot(path="vercel_main_page.png", full_page=True)
            print("Screenshot saved: vercel_main_page.png")
            
            # Get page title
            title = await page.title()
            print(f"Page title: {title}")
            
            await browser.close()
            return True, response.status
    except Exception as e:
        print(f"Error: {e}")
        return False, str(e)

async def test_console_errors():
    """Test 2: Check for console errors"""
    print("\n=== Test 2: Console Errors ===")
    console_messages = []
    console_errors = []
    
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Listen to console events
            def handle_console(msg):
                console_messages.append({
                    "type": msg.type,
                    "text": msg.text
                })
                if msg.type == "error":
                    console_errors.append(msg.text)
                    print(f"CONSOLE ERROR: {msg.text}")
            
            page.on("console", handle_console)
            
            # Navigate to main page
            await page.goto(VERCEL_URL, wait_until="networkidle")
            await page.wait_for_timeout(3000)
            
            print(f"Total console messages: {len(console_messages)}")
            print(f"Console errors: {len(console_errors)}")
            
            await browser.close()
            
            return True, {"total": len(console_messages), "errors": console_errors}
    except Exception as e:
        print(f"Error: {e}")
        return False, str(e)

async def test_api_endpoints():
    """Test 3: Test APIs (Binance and Coinalyze)"""
    print("\n=== Test 3: API Endpoints ===")
    results = {}
    
    # Test Coinalyze API
    print("\nTesting /api/coinalyze endpoint...")
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Navigate to main page first (to set context)
            await page.goto(VERCEL_URL, wait_until="networkidle")
            
            # Try to access the API endpoint
            api_url = f"{VERCEL_URL}/api/coinalyze"
            print(f"Calling: {api_url}")
            
            try:
                response = await page.goto(api_url, wait_until="networkidle", timeout=10000)
                content = await response.text() if response else "No response"
                results["coinalyze"] = {
                    "status": response.status if response else "error",
                    "content_length": len(content),
                    "content_preview": content[:500] if content else "Empty"
                }
                print(f"Coinalyze API status: {response.status if response else 'error'}")
            except Exception as e:
                results["coinalyze"] = {"error": str(e)}
                print(f"Coinalyze API error: {e}")
            
            await browser.close()
    except Exception as e:
        results["coinalyze"] = {"error": str(e)}
        print(f"Error testing Coinalyze: {e}")
    
    # Test direct API calls (Binance)
    print("\nTesting Binance API (direct)...")
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Test Binance ticker API
            binance_url = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
            response = await page.goto(binance_url, timeout=10000)
            
            if response:
                content = await response.text()
                results["binance"] = {
                    "status": response.status,
                    "content": content
                }
                print(f"Binance API status: {response.status}")
                print(f"Binance response: {content}")
            
            await browser.close()
    except Exception as e:
        results["binance"] = {"error": str(e)}
        print(f"Error testing Binance: {e}")
    
    return True, results

async def test_app_loads():
    """Test 4: Verify application loads correctly"""
    print("\n=== Test 4: Application Load Verification ===")
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Navigate to main page
            await page.goto(VERCEL_URL, wait_until="networkidle")
            await page.wait_for_timeout(3000)
            
            # Check for key elements
            checks = {}
            
            # Check if body has content
            body_content = await page.evaluate("document.body.innerText.length")
            checks["body_has_content"] = body_content > 0
            print(f"Body has content: {checks['body_has_content']} ({body_content} chars)")
            
            # Check for React root
            root = await page.query_selector("#root")
            checks["has_react_root"] = root is not None
            print(f"Has React root: {checks['has_react_root']}")
            
            # Check for any visible text
            visible_text = await page.evaluate("document.body.innerText")
            checks["visible_text_length"] = len(visible_text)
            print(f"Visible text length: {len(visible_text)}")
            
            # Check page URL
            checks["current_url"] = page.url
            print(f"Current URL: {checks['current_url']}")
            
            await browser.close()
            
            return True, checks
    except Exception as e:
        print(f"Error: {e}")
        return False, str(e)

async def main():
    """Run all tests"""
    print("=" * 60)
    print("COINGLASS VERCEL DEPLOYMENT TEST")
    print("=" * 60)
    print(f"URL: {VERCEL_URL}")
    
    results = {}
    
    # Test 1: Main page
    success, data = await test_main_page()
    results["main_page"] = {"success": success, "data": data}
    
    # Test 2: Console errors
    success, data = await test_console_errors()
    results["console_errors"] = {"success": success, "data": data}
    
    # Test 3: API endpoints
    success, data = await test_api_endpoints()
    results["api_endpoints"] = {"success": success, "data": data}
    
    # Test 4: App loads
    success, data = await test_app_loads()
    results["app_loads"] = {"success": success, "data": data}
    
    # Save results
    print("\n" + "=" * 60)
    print("TEST RESULTS SUMMARY")
    print("=" * 60)
    print(json.dumps(results, indent=2, default=str))
    
    with open("vercel_test_results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)
    
    print("\nResults saved to: vercel_test_results.json")
    
    return results

if __name__ == "__main__":
    asyncio.run(main())
