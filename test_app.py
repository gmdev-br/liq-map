"""
Test script for Coinglass application using Playwright.
Tests:
1. Main page loads correctly
2. Check for CORS errors in console
3. Verify app renders properly
4. Check API route /api/coinalyze (if available)
"""
import asyncio
import sys
from playwright.async_api import async_playwright

async def test_coinglass():
    results = {
        "main_page": {"status": "pending", "details": ""},
        "console_errors": {"status": "pending", "details": ""},
        "app_loads": {"status": "pending", "details": ""},
        "api_coinalyze": {"status": "pending", "details": ""},
    }
    
    console_messages = []
    console_errors = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Listen to console messages
        page.on("console", lambda msg: console_messages.append({
            "type": msg.type,
            "text": msg.text
        }))
        
        page.on("pageerror", lambda err: console_errors.append(str(err)))
        
        # Test 1: Load the main page
        print("Test 1: Loading main page at http://localhost:5173/Coinglass/...")
        try:
            response = await page.goto(
                "http://localhost:5173/Coinglass/",
                wait_until="networkidle",
                timeout=30000
            )
            if response:
                results["main_page"]["status"] = "success" if response.status < 400 else "failed"
                results["main_page"]["details"] = f"HTTP {response.status}"
                print(f"  Main page status: {response.status}")
            else:
                results["main_page"]["status"] = "failed"
                results["main_page"]["details"] = "No response"
                print("  Main page: No response")
        except Exception as e:
            results["main_page"]["status"] = "failed"
            results["main_page"]["details"] = str(e)
            print(f"  Main page error: {e}")
        
        # Wait for React to render
        await asyncio.sleep(3)
        
        # Test 2: Check if app rendered
        print("\nTest 2: Checking if app rendered properly...")
        try:
            # Check for root element
            root = await page.query_selector("#root")
            if root:
                # Check if there's content in the root
                content = await root.inner_html()
                if len(content) > 100:
                    results["app_loads"]["status"] = "success"
                    results["app_loads"]["details"] = f"App rendered with {len(content)} chars of HTML"
                    print(f"  App rendered successfully ({len(content)} chars)")
                else:
                    results["app_loads"]["status"] = "warning"
                    results["app_loads"]["details"] = f"App rendered but minimal content ({len(content)} chars)"
                    print(f"  App rendered but minimal content ({len(content)} chars)")
            else:
                results["app_loads"]["status"] = "failed"
                results["app_loads"]["details"] = "Root element not found"
                print("  Root element not found")
        except Exception as e:
            results["app_loads"]["status"] = "failed"
            results["app_loads"]["details"] = str(e)
            print(f"  Error checking app: {e}")
        
        # Test 3: Check console for CORS errors - look for actual CORS errors
        print("\nTest 3: Checking console for CORS errors...")
        cors_errors = []
        cors_warnings = []
        
        for msg in console_messages:
            text_lower = str(msg["text"]).lower()
            if "cors" in text_lower or "access-control-allow-origin" in text_lower:
                if msg["type"] == "error":
                    cors_errors.append(msg["text"])
                else:
                    cors_warnings.append(msg["text"])
        
        # Also check page errors
        page_cors_errors = [err for err in console_errors if "cors" in err.lower()]
        
        all_cors_issues = cors_errors + cors_warnings + page_cors_errors
        
        if cors_errors or page_cors_errors:
            results["console_errors"]["status"] = "failed"
            results["console_errors"]["details"] = f"Found {len(cors_errors + page_cors_errors)} CORS errors"
            print(f"  Found CORS errors: {len(cors_errors + page_cors_errors)}")
            for err in cors_errors[:3]:
                print(f"    - {err[:100]}")
        elif cors_warnings:
            results["console_errors"]["status"] = "warning"
            results["console_errors"]["details"] = f"Found {len(cors_warnings)} CORS warnings (not blocking)"
            print(f"  Found {len(cors_warnings)} CORS warnings (not blocking)")
        else:
            results["console_errors"]["status"] = "success"
            results["console_errors"]["details"] = "No CORS errors found"
            print("  No CORS errors found")
        
        # Test 4: Test API route
        print("\nTest 4: Testing API route /api/coinalyze...")
        try:
            # Try both with and without base path
            api_response = await page.goto(
                "http://localhost:5173/Coinglass/api/coinalyze?symbol=BTCUSDT_PERP.A",
                wait_until="domcontentloaded",
                timeout=10000
            )
            if api_response:
                status = api_response.status
                if status == 200:
                    body = await api_response.text()
                    if "html" in body.lower() or "<!doctype" in body.lower():
                        results["api_coinalyze"]["status"] = "warning"
                        results["api_coinalyze"]["details"] = "API returns HTML instead of JSON (no backend server)"
                        print(f"  API returns HTML (no backend server configured)")
                    else:
                        results["api_coinalyze"]["status"] = "success"
                        results["api_coinalyze"]["details"] = f"HTTP {status}"
                        print(f"  API returns HTTP {status}")
                else:
                    results["api_coinalyze"]["status"] = "failed"
                    results["api_coinalyze"]["details"] = f"HTTP {status}"
                    print(f"  API returns HTTP {status}")
            else:
                results["api_coinalyze"]["status"] = "failed"
                results["api_coinalyze"]["details"] = "No response"
                print("  API: No response")
        except Exception as e:
            results["api_coinalyze"]["status"] = "failed"
            results["api_coinalyze"]["details"] = str(e)[:100]
            print(f"  API error: {str(e)[:100]}")
        
        # Print summary of console messages
        print("\n--- All Console Messages ---")
        for msg in console_messages:
            try:
                print(f"  [{msg['type']}] {str(msg['text'])[:150]}")
            except:
                pass
        
        print("\n--- Page Errors ---")
        if console_errors:
            for err in console_errors:
                print(f"  {err[:200]}")
        else:
            print("  No page errors")
        
        await browser.close()
    
    # Print final summary
    print("\n" + "="*50)
    print("TEST RESULTS SUMMARY")
    print("="*50)
    all_passed = True
    for test_name, result in results.items():
        status = result["status"]
        details = result["details"]
        print(f"{test_name}: {status} - {details}")
        if status not in ["success", "warning"]:
            all_passed = False
    
    if all_passed:
        print("\nAll tests passed!")
    else:
        print("\nSome tests failed. Please review the results above.")
    
    return results

if __name__ == "__main__":
    # Set UTF-8 encoding for Windows
    if sys.platform == "win32":
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    asyncio.run(test_coinglass())
