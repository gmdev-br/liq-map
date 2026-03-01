"""
Teste da aplicação Coinglass rodando localmente em http://localhost:5173
"""
import json
import traceback
import sys
import os

# Fix UTF-8 output on Windows
if sys.platform == 'win32':
    os.system('chcp 65001 >nul')

# Set UTF-8 encoding for stdout
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from playwright.sync_api import sync_playwright

def test_coinglass_app():
    results = {
        "page_load": {"status": "pending", "details": ""},
        "binance_api": {"status": "pending", "details": ""},
        "coinalyze_api": {"status": "pending", "details": ""},
        "console_errors": {"status": "pending", "details": ""},
        "screenshot": {"status": "pending", "details": ""}
    }
    
    console_messages = []
    console_errors = []
    
    with sync_playwright() as p:
        print("🚀 Iniciando teste da aplicação Coinglass...")
        
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_page()
        
        # Capture console messages
        def handle_console(msg):
            msg_text = f"[{msg.type}] {msg.text}"
            console_messages.append(msg_text)
            if msg.type == "error":
                console_errors.append(msg_text)
        
        context.on("console", handle_console)
        
        # Test 1: Page Load
        print("\n📄 Testando carregamento da página...")
        try:
            response = context.goto("http://localhost:5173", wait_until="networkidle", timeout=30000)
            if response:
                results["page_load"]["status"] = "✅ SUCCESS"
                results["page_load"]["details"] = f"Status: {response.status}, URL: {response.url}"
                print(f"   ✓ Página carregada: {response.status}")
            else:
                results["page_load"]["status"] = "❌ FAILED"
                results["page_load"]["details"] = "Sem resposta do servidor"
        except Exception as e:
            results["page_load"]["status"] = "❌ FAILED"
            results["page_load"]["details"] = str(e)
            print(f"   ✗ Erro ao carregar página: {e}")
        
        # Test 2: Binance API
        print("\n🔷 Testando API da Binance...")
        try:
            binance_response = context.evaluate("""async () => {
                try {
                    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
                    return { status: response.status, data: await response.json() };
                } catch (e) {
                    return { error: e.message };
                }
            }""")
            
            if "error" in binance_response:
                results["binance_api"]["status"] = "❌ FAILED"
                results["binance_api"]["details"] = binance_response["error"]
            else:
                results["binance_api"]["status"] = "✅ SUCCESS"
                results["binance_api"]["details"] = f"Status: {binance_response['status']}, Preço BTC: ${binance_response['data']['price']}"
                print(f"   ✓ Binance API: ${binance_response['data']['price']}")
        except Exception as e:
            results["binance_api"]["status"] = "❌ FAILED"
            results["binance_api"]["details"] = str(e)
            print(f"   ✗ Erro na API Binance: {e}")
        
        # Test 3: Coinalyze API
        print("\n🔶 Testando API da Coinalyze...")
        try:
            coinalyze_response = context.evaluate("""async () => {
                try {
                    const response = await fetch('https://api.coinalyze.net/api/v1/long-short-ratios?symbols=BTC');
                    const data = await response.json();
                    return { status: response.status, data: data };
                } catch (e) {
                    return { error: e.message };
                }
            }""")
            
            if "error" in coinalyze_response:
                results["coinalyze_api"]["status"] = "❌ FAILED"
                results["coinalyze_api"]["details"] = coinalyze_response["error"]
            else:
                results["coinalyze_api"]["status"] = "✅ SUCCESS"
                data_str = str(coinalyze_response.get('data', {}))[:100]
                results["coinalyze_api"]["details"] = f"Status: {coinalyze_response['status']}, Dados: {data_str}..."
                print(f"   ✓ Coinalyze API: {coinalyze_response['status']}")
        except Exception as e:
            results["coinalyze_api"]["status"] = "❌ FAILED"
            results["coinalyze_api"]["details"] = str(e)
            print(f"   ✗ Erro na API Coinalyze: {e}")
        
        # Test 4: Console Errors
        print("\n📋 Verificando erros no console...")
        if console_errors:
            results["console_errors"]["status"] = "⚠️ WARNINGS"
            results["console_errors"]["details"] = f"{len(console_errors)} erro(s) encontrado(s):\n" + "\n".join(console_errors[:5])
            print(f"   ⚠️ {len(console_errors)} erro(s) no console")
        else:
            results["console_errors"]["status"] = "✅ SUCCESS"
            results["console_errors"]["details"] = "Nenhum erro no console"
            print(f"   ✓ Sem erros no console")
        
        # Test 5: Screenshot
        print("\n📸 Capturando screenshot...")
        try:
            context.screenshot(path="coinglass_test_screenshot.png", full_page=True)
            results["screenshot"]["status"] = "✅ SUCCESS"
            results["screenshot"]["details"] = "Screenshot salva em: coinglass_test_screenshot.png"
            print(f"   ✓ Screenshot capturada")
        except Exception as e:
            results["screenshot"]["status"] = "❌ FAILED"
            results["screenshot"]["details"] = str(e)
            print(f"   ✗ Erro ao capturar screenshot: {e}")
        
        browser.close()
    
    return results, console_messages

if __name__ == "__main__":
    try:
        results, console_messages = test_coinglass_app()
        
        print("\n" + "="*60)
        print("📊 RELATÓRIO DE TESTE - COINGLASS")
        print("="*60)
        
        for test_name, result in results.items():
            status = result["status"]
            details = result["details"]
            print(f"\n{status} {test_name.upper().replace('_', ' ')}")
            print(f"   {details}")
        
        print("\n" + "="*60)
        print("📝 MENSAGENS DO CONSOLE (primeiras 10)")
        print("="*60)
        for msg in console_messages[:10]:
            print(msg)
        
        # Save results to JSON
        with open("test_results.json", "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        print("\n✅ Resultados salvos em test_results.json")
        print("✅ Screenshot salva em coinglass_test_screenshot.png")
        
    except Exception as e:
        print(f"\n❌ Erro fatal: {e}")
        traceback.print_exc()
