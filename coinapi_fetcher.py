"""
CoinAPI Liquidation Data Fetcher
Fetches aggregated liquidation data from CoinAPI for a specified time period.
"""

import requests
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional


class CoinAPILiquidationFetcher:
    """Fetch liquidation data from CoinAPI"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://rest.coinapi.io/v1"
        self.headers = {
            'X-CoinAPI-Key': api_key,
            'Accept': 'application/json'
        }
    
    def calculate_date_range(self, months: int) -> tuple:
        """Calculate start and end dates for the specified number of months"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30 * months)
        
        return {
            'start': start_date.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'end': end_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        }
    
    def fetch_liquidation_data(
        self, 
        symbol: str = "BTC", 
        months: int = 12,
        limit: int = 1000
    ) -> Optional[List[Dict]]:
        """
        Fetch liquidation data from CoinAPI
        
        Args:
            symbol: Crypto symbol (BTC, ETH, etc.)
            months: Number of months to fetch data for
            limit: Maximum number of records to fetch
        
        Returns:
            List of liquidation records or None if failed
        """
        date_range = self.calculate_date_range(months)
        
        # Try multiple endpoint formats
        endpoints = [
            f"{self.base_url}/derivatives/futures/liquidation?symbol_id=BINANCE_SPOT_{symbol}_USDT&time_start={date_range['start']}&time_end={date_range['end']}&limit={limit}",
            f"{self.base_url}/derivatives/futures/liquidation?symbol_id=BINANCE_FUTURES_{symbol}_USDT&time_start={date_range['start']}&time_end={date_range['end']}&limit={limit}",
            f"{self.base_url}/derivatives/futures/liquidation?time_start={date_range['start']}&time_end={date_range['end']}&limit={limit}"
        ]
        
        for url in endpoints:
            try:
                print(f"Trying endpoint: {url[:80]}...")
                response = requests.get(url, headers=self.headers)
                
                print(f"Status: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Handle different response formats
                    if isinstance(data, list):
                        if len(data) > 0:
                            print(f"✓ Success! Fetched {len(data)} records")
                            return data
                    elif isinstance(data, dict) and 'data' in data:
                        if len(data['data']) > 0:
                            print(f"✓ Success! Fetched {len(data['data'])} records")
                            return data['data']
                
                elif response.status_code == 401:
                    print("✗ Authentication failed. Check your API key.")
                    return None
                elif response.status_code == 429:
                    print("✗ Rate limit exceeded. Please wait before trying again.")
                    return None
                else:
                    print(f"✗ Endpoint returned status {response.status_code}")
                    print(f"Response: {response.text[:200]}")
                    
            except requests.exceptions.RequestException as e:
                print(f"✗ Request error: {e}")
                continue
        
        print("✗ All endpoints failed. No liquidation data found.")
        return None
    
    def analyze_data(self, data: List[Dict]) -> Dict:
        """Analyze liquidation data and calculate statistics"""
        if not data:
            return {}
        
        volumes = []
        prices = []
        
        for item in data:
            if 'volume' in item:
                volumes.append(float(item['volume']))
            if 'price' in item:
                prices.append(float(item['price']))
        
        stats = {
            'total_records': len(data),
            'total_volume': sum(volumes) if volumes else 0,
            'avg_volume': sum(volumes) / len(volumes) if volumes else 0,
            'max_volume': max(volumes) if volumes else 0,
            'min_volume': min(volumes) if volumes else 0,
            'avg_price': sum(prices) / len(prices) if prices else 0,
            'max_price': max(prices) if prices else 0,
            'min_price': min(prices) if prices else 0
        }
        
        return stats
    
    def save_to_json(self, data: List[Dict], filename: str):
        """Save data to JSON file"""
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, default=str)
        print(f"✓ Data saved to {filename}")


def main():
    """Main function to test the fetcher"""
    print("=" * 60)
    print("CoinAPI Liquidation Data Fetcher")
    print("=" * 60)
    
    # Get API key from user
    api_key = input("Enter your CoinAPI key: ").strip()
    
    if not api_key:
        print("✗ API key is required!")
        return
    
    # Get symbol
    symbol = input("Enter symbol (default: BTC): ").strip() or "BTC"
    
    # Get time period
    months = int(input("Enter months to fetch (default: 12): ").strip() or "12")
    
    # Initialize fetcher
    fetcher = CoinAPILiquidationFetcher(api_key)
    
    # Fetch data
    print(f"\nFetching liquidation data for {symbol} (last {months} months)...")
    data = fetcher.fetch_liquidation_data(symbol=symbol, months=months)
    
    if data:
        # Analyze data
        print("\n" + "=" * 60)
        print("ANALYSIS")
        print("=" * 60)
        stats = fetcher.analyze_data(data)
        
        print(f"Total Records: {stats['total_records']}")
        print(f"Total Volume: ${stats['total_volume']:,.2f}")
        print(f"Average Volume: ${stats['avg_volume']:,.2f}")
        print(f"Max Volume: ${stats['max_volume']:,.2f}")
        print(f"Min Volume: ${stats['min_volume']:,.2f}")
        print(f"Average Price: ${stats['avg_price']:,.2f}")
        print(f"Max Price: ${stats['max_price']:,.2f}")
        print(f"Min Price: ${stats['min_price']:,.2f}")
        
        # Save to file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"liquidation_data_{symbol}_{timestamp}.json"
        fetcher.save_to_json(data, filename)
        
        # Show sample data
        print("\n" + "=" * 60)
        print("SAMPLE DATA")
        print("=" * 60)
        for i, item in enumerate(data[:5]):
            print(f"\nRecord {i+1}:")
            for key, value in item.items():
                print(f"  {key}: {value}")
    else:
        print("\n✗ Failed to fetch liquidation data.")
        print("\nPossible reasons:")
        print("- Invalid API key")
        print("- API endpoint not available")
        print("- Rate limit exceeded")
        print("- No liquidation data for the specified period")


if __name__ == "__main__":
    main()
