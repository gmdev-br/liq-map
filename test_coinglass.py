"""
Script de teste para a aplicacao Coinglass
Testa a aplicacao rodando em http://localhost:5173
"""
import asyncio
import json
import sys
from playwright.async_api import async_playwright

# URL base da aplicacao
BASE_URL = "http://localhost:5173"

# Armazenar erros do console
console_errors = []
console_warnings = []
console_logs = []

async def test_app():
    """Testa a aplicacao Coinglass"""
    print("=" * 60)
    print("TESTE DA APLICACAO COINGLASS")
    print("=" * 60)
    print(f"\n[1] Conectando ao servidor em {BASE_URL}...")
    
    async with async_playwright() as p:
        # Launch browser in headless mode
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Configurar captura de logs do console (sem emojis para evitar encoding issues)
        def handle_console(msg):
            msg_type = msg.type
            text = msg.text
            
            if msg_type == "error":
                console_errors.append(text)
                print(f"   [ERROR] {text[:200]}")
            elif msg_type == "warning":
                console_warnings.append(text)
                print(f"   [WARNING] {text[:200]}")
            else:
                console_logs.append(text)
        
        page.on("console", handle_console)
        
        # Capturar erros de pagina
        page_errors = []
        def handle_page_error(err):
            page_errors.append(str(err))
            print(f"   [PAGE ERROR] {err}")
        
        page.on("pageerror", handle_page_error)
        
        response = None
        title = ""
        
        try:
            # Teste 1: Acessar pagina principal
            print(f"\n[2] Acessando pagina principal...")
            response = await page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
            
            if response:
                status = response.status
                print(f"   Status HTTP: {status}")
                
                if status == 200:
                    print("   [OK] Pagina carregada com sucesso!")
                else:
                    print(f"   [WARN] Status diferente de 200: {status}")
            else:
                print("   [ERROR] Nao foi possivel obter resposta HTTP")
            
            # Teste 2: Verificar titulo da pagina
            print(f"\n[3] Verificando titulo da pagina...")
            title = await page.title()
            print(f"   Titulo: {title}")
            
            # Teste 3: Verificar elementos principais
            print(f"\n[4] Verificando elementos principais...")
            
            # Verificar se existe header
            header = await page.locator("header").count()
            print(f"   Header encontrado: {'Sim' if header > 0 else 'Nao'}")
            
            # Verificar se existe conteudo principal
            main = await page.locator("main").count()
            print(f"   Main encontrado: {'Sim' if main > 0 else 'Nao'}")
            
            # Teste 4: Tirar screenshot
            print(f"\n[5] Tirando screenshot...")
            await page.screenshot(path="test_result.png", full_page=True)
            print("   [OK] Screenshot salvo em test_result.png")
            
            # Teste 5: Verificar erros no console
            print(f"\n[6] Verificando erros no console...")
            print(f"   Total de erros: {len(console_errors)}")
            print(f"   Total de warnings: {len(console_warnings)}")
            print(f"   Total de logs: {len(console_logs)}")
            
            if console_errors:
                print("\n   Erros capturados:")
                for err in console_errors[:5]:  # Mostrar ate 5 erros
                    print(f"      - {err[:150]}")
            
            if page_errors:
                print("\n   Erros de pagina:")
                for err in page_errors[:5]:
                    print(f"      - {err[:150]}")
            
            # Teste 6: Testar APIs disponiveis
            print(f"\n[7] Testando APIs disponiveis...")
            await test_apis(page)
            
            # Teste 7: Verificar estrutura DOM
            print(f"\n[8] Verificando estrutura DOM...")
            body_html = await page.locator("body").inner_html()
            body_length = len(body_html)
            print(f"   Tamanho do body HTML: {body_length} caracteres")
            
            if body_length > 100:
                print("   [OK] Pagina tem conteudo")
            else:
                print("   [WARN] Pagina parece estar vazia")
            
        except Exception as e:
            print(f"\n   [ERROR] Erro durante o teste: {e}")
        
        finally:
            try:
                await browser.close()
            except:
                pass
    
    # Resultado final
    print("\n" + "=" * 60)
    print("RESULTADO DO TESTE")
    print("=" * 60)
    
    has_errors = len(console_errors) > 0 or len(page_errors) > 0
    
    if not has_errors and response and response.status == 200:
        print("[PASS] TESTE PASSOU - Aplicacao carregou corretamente!")
        print(f"   - Titulo: {title}")
        print(f"   - Erros no console: {len(console_errors)}")
        print(f"   - Warnings: {len(console_warnings)}")
    else:
        print("[FAIL] TESTE TEVE PROBLEMAS")
        if response and response.status != 200:
            print(f"   - Status HTTP: {response.status}")
        if console_errors:
            print(f"   - Erros no console: {len(console_errors)}")
        if page_errors:
            print(f"   - Erros de pagina: {len(page_errors)}")
    
    return {
        "success": not has_errors and response and response.status == 200,
        "status": response.status if response else None,
        "title": title,
        "console_errors": console_errors,
        "console_warnings": console_warnings,
        "page_errors": page_errors
    }

async def test_apis(page):
    """Testa as APIs disponiveis na aplicacao"""
    apis_to_test = [
        "/api/prices",
        "/api/liquidations", 
        "/api/alerts"
    ]
    
    for api_path in apis_to_test:
        try:
            print(f"\n   Testando API: {api_path}")
            
            # Fazer requisicao usando fetch do JavaScript
            result = await page.evaluate(f"""
                async () => {{
                    try {{
                        const response = await fetch('{api_path}', {{ 
                            method: 'GET',
                            headers: {{ 'Content-Type': 'application/json' }}
                        }});
                        return {{
                            status: response.status,
                            ok: response.ok,
                            statusText: response.statusText
                        }};
                    }} catch (e) {{
                        return {{ error: e.message }};
                    }}
                }}
            """)
            
            if "error" in result:
                print(f"      [ERROR] Erro: {result['error']}")
            else:
                print(f"      Status: {result.get('status')} - {result.get('statusText')}")
                print(f"      OK: {result.get('ok')}")
                
        except Exception as e:
            print(f"      [ERROR] Excecao: {str(e)[:50]}")

if __name__ == "__main__":
    # Configurar encoding para UTF-8
    if sys.platform == 'win32':
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')
    
    result = asyncio.run(test_app())
    print("\n" + json.dumps(result, indent=2, ensure_ascii=False))
