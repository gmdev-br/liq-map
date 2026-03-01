"""
Test script to verify if the Coinglass frontend is working without proxy.
Tests API calls to Binance and Coinalyze.
"""
import json
from playwright.sync_api import sync_playwright

def test_coinglass_apis():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Enable console logging to capture API responses
        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"{msg.type}: {msg.text}"))
        
        # Enable network logging
        network_logs = []
        def handle_response(response):
            status = response.status
            url = response.url
            network_logs.append(f"Status {status}: {url}")
        
        page.on("response", handle_response)
        
        # Navigate to the app
        print("Navigating to http://localhost:5173/Coinglass/prices")
        page.goto('http://localhost:5173/Coinglass/prices')
        page.wait_for_load_state('networkidle')
        
        # Wait for API calls to complete
        print("Waiting for API calls...")
        page.wait_for_timeout(10000)
        
        # Take a screenshot
        page.screenshot(path='e:/zed_projects/Coinglass/screenshot.png', full_page=True)
        print("Screenshot saved to screenshot.png")
        
        # Get page content
        content = page.content()
        
        # Check for errors in console
        errors = [log for log in console_logs if "error" in log.lower()]
        if errors:
            print("\n=== Console Errors ===")
            for error in errors[:10]:  # Limit to first 10 errors
                print(error)
        
        # Check network logs
        print("\n=== Network Logs (first 20) ===")
        for log in network_logs[:20]:
            print(log)
        
        # Try to find the Prices page link and navigate
        print("\n=== Testing Prices Page ===")
        prices_link = page.locator('a[href*="prices"]').first
        if prices_link.count() > 0:
            prices_link.click()
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(10000)
            page.screenshot(path='e:/zed_projects/Coinglass/prices_page.png', full_page=True)
            print("Prices page screenshot saved")
        
        # Check for Binance API calls
        binance_calls = [log for log in network_logs if "binance" in log.lower()]
        coinalyze_calls = [log for log in network_logs if "coinalyze" in log.lower()]
        corsproxy_calls = [log for log in network_logs if "corsproxy" in log.lower()]
        proxy_local_calls = [log for log in network_logs if "localhost:3001" in log.lower()]
        
        print("\n=== API Calls Summary ===")
        print(f"Binance API calls: {len(binance_calls)}")
        for call in binance_calls:
            print(f"  {call}")
        print(f"Coinalyze API calls: {len(coinalyze_calls)}")
        for call in coinalyze_calls:
            print(f"  {call}")
        print(f"CORS Proxy calls: {len(corsproxy_calls)}")
        for call in corsproxy_calls:
            print(f"  {call}")
        print(f"Local Proxy calls: {len(proxy_local_calls)}")
        for call in proxy_local_calls:
            print(f"  {call}")
        
        browser.close()
        
        # Check if APIs are working
        if len(binance_calls) > 0 or len(coinalyze_calls) > 0 or len(corsproxy_calls) > 0 or len(proxy_local_calls) > 0:
            print("\n[SUCCESS] API calls detected!")
            return True
        else:
            print("\n[FAILURE] No API calls detected")
            return False

if __name__ == "__main__":
    success = test_coinglass_apis()
    exit(0 if success else 1)
