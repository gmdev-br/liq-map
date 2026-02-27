"""
Simple test script to verify CoinAPI key
"""
import requests

API_KEY = "1de9d0b8-a870-4fd3-8327-72f4e6dd41b3"
url = "https://rest.coinapi.io/v1/exchangerate/BTC/USD"
headers = {"X-CoinAPI-Key": API_KEY}

print("Testing CoinAPI key...")
print(f"URL: {url}")
print(f"API Key: {API_KEY[:8]}...{API_KEY[-4:]}")
print("-" * 50)

response = requests.get(url, headers=headers)

print(f"Status Code: {response.status_code}")
print(f"Response: {response.text}")
