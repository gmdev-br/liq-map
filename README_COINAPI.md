# CoinAPI Liquidation Data Tools

Tools for fetching and testing aggregated liquidation data from CoinAPI using the Metrics v1 API.

## Files

### 1. coinapi_test.html
Interactive web page for testing CoinAPI liquidation data via Metrics v1 API.

**Features:**
- API key input
- Exchange selector (Binance Futures, Deribit, BitMEX, Kraken Futures, Bitfinex)
- Symbol selector (BTC, ETH, SOL, XRP, ADA)
- Time period selector (1, 3, 6, 12 months)
- Metrics v1 API integration
- Multiple metric fetching (LIQUIDATION_PRICE, LIQUIDATION_QUANTITY, LIQUIDATION_SIDE, etc.)
- Data merging by timestamp
- Statistics display (total, avg, max volume)
- Data table with date, volume, price, side
- Error handling and loading states

**Usage:**
1. Open http://localhost:8000/coinapi_test.html
2. Enter your CoinAPI key
3. Select exchange, symbol, and time period
4. Click "Fetch Liquidation Data"

### 2. coinapi_fetcher.py
Python script for programmatic data fetching.

**Features:**
- Command-line interface
- Multiple endpoint fallback
- Data analysis and statistics
- JSON export
- Error handling

**Usage:**
```bash
python coinapi_fetcher.py
```

**Requirements:**
```bash
pip install requests
```

## Getting CoinAPI Key

1. Go to https://console.coinapi.io/
2. Sign up for free account
3. Navigate to API Keys section
4. Create new API key
5. Copy key for use in tools

## CoinAPI Metrics v1 API

CoinAPI provides liquidation data through the **Market Data Metrics v1** API, not through simple liquidation endpoints.

### API Format
```
/v1/metrics/{exchange_id}/{metric_id}/{symbol}
```

### Available Metrics
- LIQUIDATION_PRICE
- LIQUIDATION_QUANTITY
- LIQUIDATION_SIDE
- LIQUIDATION_TIME
- LIQUIDATION_SYMBOL

### Supported Exchanges
- Binance Futures (USDT-margined)
- Deribit
- BitMEX
- Kraken Futures
- Bitfinex

### Example Request
```
GET https://rest.coinapi.io/v1/metrics/BINANCE_FUTURES/LIQUIDATION_PRICE/BTCUSDT?time_start=2025-02-26T00:00:00Z&time_end=2026-02-26T23:59:59Z&limit=1000
```

## Notes

- CoinAPI has rate limits (free tier: 100 requests/day)
- Not all exchanges support all liquidation metrics
- Check CoinAPI documentation for available metrics
- Error messages help identify issues (401=auth, 429=rate limit, 404=metric not available)

## Troubleshooting

**401 Unauthorized**: Check your API key is correct

**429 Too Many Requests**: You've hit the rate limit, wait before retrying

**404 Not Found**: The exchange or metric may not support liquidation data for that symbol

**No Data Found**: Try different exchanges, symbols, or time periods

**Empty Response**: Try different symbols or time periods
