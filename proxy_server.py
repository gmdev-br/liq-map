from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json

app = Flask(__name__)
CORS(app)

@app.route('/api/liquidation-history', methods=['GET'])
def proxy_liquidation_history():
    """Proxy for Coinalyze liquidation history API"""
    try:
        # Get parameters from request
        symbols = request.args.get('symbols')
        interval = request.args.get('interval', 'daily')
        from_time = request.args.get('from')
        to_time = request.args.get('to')
        api_key = request.args.get('api_key', 'FREE')

        # Build Coinalyze API URL
        coinalyze_url = 'https://api.coinalyze.net/v1/liquidation-history'
        params = {
            'symbols': symbols,
            'interval': interval,
            'from': from_time,
            'to': to_time,
            'api_key': api_key
        }

        print(f"Proxying request to Coinalyze API:")
        print(f"URL: {coinalyze_url}")
        print(f"Params: {params}")

        # Make request to Coinalyze API
        response = requests.get(coinalyze_url, params=params, timeout=30)

        print(f"Coinalyze API response status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"Got {len(data)} records from Coinalyze")
            return jsonify(data)
        else:
            print(f"Error from Coinalyze API: {response.text}")
            return jsonify({
                'error': f'Coinalyze API returned {response.status_code}',
                'message': response.text
            }), response.status_code

    except Exception as e:
        print(f"Error in proxy: {str(e)}")
        return jsonify({
            'error': 'Proxy error',
            'message': str(e)
        }), 500

@app.route('/api/price-history', methods=['GET'])
def proxy_price_history():
    """Proxy for price data - try Binance first, then GeckoTerminal, then CoinGecko"""
    try:
        # Get parameters from request
        symbols = request.args.get('symbols')
        from_time = request.args.get('from')
        to_time = request.args.get('to')

        # Calculate date range in days
        days_range = (int(to_time) - int(from_time)) / (24 * 60 * 60)
        
        print(f"Price data request: {days_range:.0f} days")

        # Convert symbol format (BTCUSDT_PERP.A -> BTCUSDT)
        symbol_map = {
            'BTCUSDT_PERP.A': 'BTCUSDT',
            'ETHUSDT_PERP.A': 'ETHUSDT',
            'SOLUSDT_PERP.A': 'SOLUSDT',
            'XRPUSDT_PERP.A': 'XRPUSDT',
            'ADAUSDT_PERP.A': 'ADAUSDT'
        }

        binance_symbol = symbol_map.get(symbols, 'BTCUSDT')

        # Try Binance API first (best historical data, no rate limits)
        print(f"Trying Binance API for price data...")
        binance_url = 'https://api.binance.com/api/v3/klines'
        
        try:
            params = {
                'symbol': binance_symbol,
                'interval': '1d',
                'startTime': int(from_time) * 1000,
                'endTime': int(to_time) * 1000,
                'limit': 1000  # Max 1000 records per request
            }
            
            print(f"Binance params: {params}")
            
            response = requests.get(binance_url, params=params, timeout=30)
            print(f"Binance response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✓ Got data from Binance")
                print(f"Binance data type: {type(data)}, Array: {isinstance(data, list)}")
                
                if isinstance(data, list) and len(data) > 0:
                    formatted_data = []
                    for item in data:
                        # Binance kline format: [timestamp, open, high, low, close, volume, ...]
                        timestamp = item[0] / 1000  # Convert ms to seconds
                        close_price = item[4]
                        formatted_data.append({
                            't': int(timestamp),
                            'c': close_price
                        })
                    print(f"✓ Formatted {len(formatted_data)} price records from Binance")
                    return jsonify(formatted_data)
                else:
                    print("Binance returned empty data")
            else:
                print(f"Binance error: {response.status_code}")
                print(f"Response: {response.text[:200]}")
        except Exception as e:
            print(f"Binance error: {str(e)}")

        # Fallback to GeckoTerminal API for short periods
        if days_range <= 180:
            print(f"\nTrying GeckoTerminal API for price data (short period)...")
            gecko_terminal_url = 'https://api.geckoterminal.com/api/v2/networks/ethereum/tokens?token_id=bitcoin'
            
            try:
                response = requests.get(gecko_terminal_url, timeout=30)
                print(f"GeckoTerminal response status: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    print(f"✓ Got data from GeckoTerminal")
                    
                    # GeckoTerminal returns pools with OHLCV data
                    if 'tokens' in data and len(data['tokens']) > 0:
                        token = data['tokens'][0]
                        if 'address' in token:
                            pool_address = token['address']
                            print(f"Found pool address: {pool_address}")
                            
                            # Get OHLCV data from GeckoTerminal
                            ohlcv_url = f'https://api.geckoterminal.com/api/v2/networks/ethereum/pools/{pool_address}/ohlcv'
                            # Aggregate: 86400 seconds = 1 day
                            params = {
                                'aggregate': 86400,
                                'from': from_time,
                                'to': to_time
                            }
                            
                            print(f"Fetching OHLCV from GeckoTerminal...")
                            ohlcv_response = requests.get(ohlcv_url, params=params, timeout=30)
                            print(f"OHLCV response status: {ohlcv_response.status_code}")
                            
                            if ohlcv_response.status_code == 200:
                                ohlcv_data = ohlcv_response.json()
                                print(f"✓ Got OHLCV data from GeckoTerminal")
                                
                                if 'ohlcv' in ohlcv_data:
                                    formatted_data = []
                                    for item in ohlcv_data['ohlcv']:
                                        formatted_data.append({
                                            't': int(item['t']),
                                            'c': item['c']
                                        })
                                    print(f"✓ Formatted {len(formatted_data)} price records from GeckoTerminal")
                                    return jsonify(formatted_data)
                                else:
                                    print("No 'ohlcv' key in GeckoTerminal response")
                            else:
                                print(f"OHLCV error: {ohlcv_response.status_code}")
                        else:
                            print("No address found in GeckoTerminal token data")
                else:
                    print(f"GeckoTerminal error: {response.status_code}")
            except Exception as e:
                print(f"GeckoTerminal error: {str(e)}")
        else:
            print(f"Period too long for GeckoTerminal ({days_range:.0f} days)")

        # Fallback to CoinGecko API
        print("\nUsing CoinGecko API for price data...")
        
        # Extract coin ID from symbol (e.g., BTCUSDT_PERP.A -> bitcoin)
        coin_map = {
            'BTCUSDT_PERP.A': 'bitcoin',
            'ETHUSDT_PERP.A': 'ethereum',
            'SOLUSDT_PERP.A': 'solana',
            'XRPUSDT_PERP.A': 'ripple',
            'ADAUSDT_PERP.A': 'cardano'
        }

        coin_id = coin_map.get(symbols, 'bitcoin')

        # Use CoinGecko API for price data
        coingecko_url = f'https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart/range'
        
        # Convert timestamps to milliseconds for CoinGecko
        from_ms = int(from_time) * 1000
        to_ms = int(to_time) * 1000

        # If date range is too large (> 365 days), split into chunks
        if days_range > 365:
            print(f"Large date range ({days_range:.0f} days), splitting into chunks")
            chunk_size_days = 90  # 90 days chunks to avoid CoinGecko limits
            chunk_size_ms = chunk_size_days * 24 * 60 * 60 * 1000
            
            all_price_data = []
            current_from = from_ms
            chunk_count = 0
            
            while current_from < to_ms:
                current_to = min(current_from + chunk_size_ms, to_ms)
                
                print(f"Fetching chunk {chunk_count + 1}: {current_from} to {current_to}")
                
                params = {
                    'vs_currency': 'usd',
                    'from': current_from,
                    'to': current_to
                }
                
                try:
                    response = requests.get(coingecko_url, params=params, timeout=30)
                    print(f"Chunk {chunk_count + 1} response status: {response.status_code}")
                    
                    if response.status_code == 200:
                        try:
                            data = response.json()
                            if 'prices' in data:
                                all_price_data.extend(data['prices'])
                                print(f"Chunk {chunk_count + 1}: Got {len(data['prices'])} price points")
                            else:
                                print(f"Chunk {chunk_count + 1}: No 'prices' key in response")
                                print(f"Response keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
                        except Exception as e:
                            print(f"Chunk {chunk_count + 1}: Error parsing JSON - {str(e)}")
                    elif response.status_code == 429:
                        print(f"Chunk {chunk_count + 1}: Rate limit exceeded, waiting 10 seconds...")
                        import time
                        time.sleep(10)  # Wait longer on rate limit
                        continue  # Retry this chunk
                    else:
                        print(f"Chunk {chunk_count + 1}: Error {response.status_code}")
                        print(f"Response: {response.text[:200]}")
                    
                    # Add delay to avoid rate limiting (increased to 2 seconds)
                    import time
                    time.sleep(2)
                    
                except Exception as e:
                    print(f"Chunk {chunk_count + 1}: Error - {str(e)}")
                
                current_from = current_to
                chunk_count += 1
                
                # Safety limit: max 40 chunks (10 years)
                if chunk_count >= 40:
                    print("Reached maximum chunk limit (40)")
                    break
            
            # Format all collected data
            formatted_data = []
            for price_point in all_price_data:
                timestamp = price_point[0] / 1000  # Convert ms to seconds
                price = price_point[1]
                formatted_data.append({
                    't': int(timestamp),
                    'c': price
                })
            
            print(f"✓ Formatted {len(formatted_data)} total price records from {chunk_count} chunks (CoinGecko)")
            return jsonify(formatted_data)
        
        # For smaller date ranges, use single request
        params = {
            'vs_currency': 'usd',
            'from': from_ms,
            'to': to_ms
        }

        try:
            response = requests.get(coingecko_url, params=params, timeout=30)
            print(f"CoinGecko response status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                print(f"✓ Got price data from CoinGecko")
                
                if 'prices' in data:
                    formatted_data = []
                    for price_point in data['prices']:
                        timestamp = price_point[0] / 1000  # Convert ms to seconds
                        price = price_point[1]
                        formatted_data.append({
                            't': int(timestamp),
                            'c': price
                        })
                    print(f"✓ Formatted {len(formatted_data)} price records")
                    return jsonify(formatted_data)
                else:
                    print("No 'prices' key in CoinGecko response")
                    print(f"Response keys: {list(data.keys())}")
                    return jsonify([])
            elif response.status_code == 429:
                print("CoinGecko rate limit exceeded")
                return jsonify([])
            elif response.status_code == 400:
                print("CoinGecko bad request - date range too large")
                return jsonify([])
            else:
                print(f"Error from CoinGecko: {response.status_code}")
                print(f"Response: {response.text[:200]}")
                return jsonify([])
        except requests.exceptions.Timeout:
            print("CoinGecko API request timed out")
            return jsonify([])
        except Exception as e:
            print(f"Error with CoinGecko: {str(e)}")
            return jsonify([])

    except Exception as e:
        print(f"Error in price proxy: {str(e)}")
        return jsonify([])

@app.route('/')
def index():
    return "Coinalyze API Proxy Server. Use /api/liquidation-history endpoint."

if __name__ == '__main__':
    print("Starting Coinalyze API Proxy Server on http://127.0.0.1:5000")
    print("Proxy endpoint: http://127.0.0.1:5000/api/liquidation-history")
    app.run(host='127.0.0.1', port=5000, debug=True)
