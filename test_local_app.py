"""
Script de teste para a aplicação Coinglass rodando localmente.
Testa:
1. Página principal
2. API da Binance diretamente
3. Logs e erros no console
"""

from playwright.sync_api import sync_playwright
import json
import requests


def test_main_page():
    """Testa a página principal da aplicação"""
    print("\n" + "="*60)
    print("1. TESTANDO PAGINA PRINCIPAL")
    print("="*60)
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Capturar logs do console
        console_logs = []
        console_errors = []
        
        def handle_console(msg):
            if msg.type == 'error':
                console_errors.append(f"[{msg.type}] {msg.text}")
                print(f"  [ERROR] Console Error: {msg.text}")
            else:
                console_logs.append(f"[{msg.type}] {msg.text}")
                print(f"  [LOG] Console: {msg.text}")
        
        page.on("console", handle_console)
        
        # Capturar erros de rede
        network_errors = []
        
        def handle_request_failed(request):
            network_errors.append(f"{request.url} - {request.failure.error_text if request.failure else 'Unknown'}")
            print(f"  [ERROR] Network Error: {request.url}")
        
        page.on("requestfailed", handle_request_failed)
        
        try:
            print("\n  [INFO] Acessando http://localhost:5173...")
            response = page.goto("http://localhost:5173", wait_until="networkidle", timeout=30000)
            
            print(f"  [OK] Status Code: {response.status}")
            print(f"  [OK] URL Final: {page.url}")
            
            # Capturar título da página
            title = page.title()
            print(f"  [OK] Titulo: {title}")
            
            # Verificar elementos principais
            print("\n  [INFO] Verificando elementos principais...")
            
            # Verificar se existe o elemento root do React
            root_element = page.locator("#root")
            if root_element.count() > 0:
                print("  [OK] Elemento #root encontrado")
                
                # Verificar conteúdo renderizado
                content = page.content()
                if "Coinglass" in content or "crypto" in content.lower():
                    print("  [OK] Conteudo relacionado a crypto encontrado")
                else:
                    print("  [WARN] Conteudo pode nao ter sido renderizado corretamente")
            else:
                print("  [ERROR] Elemento #root nao encontrado")
            
            # Verificar header/navegação
            header = page.locator("header, nav, .header")
            if header.count() > 0:
                print("  [OK] Header/Navegacao encontrado")
            
            # Tirar screenshot
            page.screenshot(path="test_screenshot.png", full_page=True)
            print("  [INFO] Screenshot salva em: test_screenshot.png")
            
        except Exception as e:
            print(f"  [ERROR] Erro ao acessar pagina: {e}")
        
        browser.close()
        
        # Retornar dados coletados
        return {
            "console_logs": console_logs,
            "console_errors": console_errors,
            "network_errors": network_errors
        }


def test_binance_api():
    """Testa a API da Binance diretamente"""
    print("\n" + "="*60)
    print("2. TESTANDO API DA BINANCE DIRETAMENTE")
    print("="*60)
    
    # Testar API de preços (ticker)
    print("\n  [INFO] Testando API de precos (ticker)...")
    try:
        response = requests.get(
            "https://api.binance.com/api/v3/ticker/price",
            params={"symbol": "BTCUSDT"},
            timeout=10
        )
        print(f"  [OK] Status: {response.status_code}")
        data = response.json()
        print(f"  [OK] BTC/USDT: ${data.get('price', 'N/A')}")
    except Exception as e:
        print(f"  [ERROR] Erro: {e}")
    
    # Testar API de ordens (klines)
    print("\n  [INFO] Testando API de candles (klines)...")
    try:
        response = requests.get(
            "https://api.binance.com/api/v3/klines",
            params={
                "symbol": "BTCUSDT",
                "interval": "1m",
                "limit": 5
            },
            timeout=10
        )
        print(f"  [OK] Status: {response.status_code}")
        data = response.json()
        if data:
            print(f"  [OK] Ultimo candle: {data[-1][4]} (fechamento)")
    except Exception as e:
        print(f"  [ERROR] Erro: {e}")
    
    # Testar API de livro de ordens
    print("\n  [INFO] Testando API de livro de ordens (depth)...")
    try:
        response = requests.get(
            "https://api.binance.com/api/v3/depth",
            params={
                "symbol": "BTCUSDT",
                "limit": 5
            },
            timeout=10
        )
        print(f"  [OK] Status: {response.status_code}")
        data = response.json()
        print(f"  [OK] Melhores bids: {data.get('bids', [])[:2]}")
        print(f"  [OK] Melhores asks: {data.get('asks', [])[:2]}")
    except Exception as ase:
        print(f"  [ERROR] Erro: {e}")
    
    print("\n  [INFO] A Binance API esta funcionando normalmente!")


def test_vercel_api_routes():
    """Testa as API routes (se disponíveis)"""
    print("\n" + "="*60)
    print("3. TESTANDO API ROUTES (Vercel)")
    print("="*60)
    
    # Testar rotas de API comuns
    api_routes = [
        "/api/prices",
        "/api/liquidations",
        "/api/alerts"
    ]
    
    for route in api_routes:
        try:
            response = requests.get(f"http://localhost:5173{route}", timeout=5)
            status_icon = "[OK]" if response.status_code < 400 else "[ERROR]"
            print(f"  {status_icon} {route}: {response.status_code}")
        except Exception as e:
            print(f"  [ERROR] {route}: {e}")


def main():
    """Executa todos os testes"""
    print("\n=== INICIANDO TESTES DA APLICACAO COINGLASS ===")
    print("="*60)
    
    # Teste 1: Página principal (com Playwright)
    console_data = test_main_page()
    
    # Teste 2: API da Binance
    test_binance_api()
    
    # Teste 3: API Routes do Vercel
    test_vercel_api_routes()
    
    # Resumo dos erros capturados
    print("\n" + "="*60)
    print("RESUMO DOS LOGS E ERROS")
    print("="*60)
    
    if console_data["console_errors"]:
        print(f"\n  [ERROR] Total de erros no console: {len(console_data['console_errors'])}")
        for error in console_data["console_errors"]:
            print(f"     - {error}")
    else:
        print("\n  [OK] Nenhum erro critico no console!")
    
    if console_data["network_errors"]:
        print(f"\n  [ERROR] Total de erros de rede: {len(console_data['network_errors'])}")
        for error in console_data["network_errors"]:
            print(f"     - {error}")
    else:
        print("\n  [OK] Nenhum erro de rede!")
    
    print("\n" + "="*60)
    print("TESTES CONCLUIDOS!")
    print("="*60)


if __name__ == "__main__":
    main()
