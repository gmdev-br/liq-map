module.exports = async function handler(request, response) {
  // Enable CORS
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  try {
    // Extract all query parameters from the request
    const queryParams = request.query;
    
    // Build the Coinalyze API URL
    // Default endpoint is liquidation-history
    const baseUrl = 'https://api.coinalyze.net';
    const endpoint = queryParams.endpoint || '/v1/liquidation-history';
    
    // Remove 'endpoint' from params before forwarding
    const { endpoint: _endpoint, ...apiParams } = queryParams;
    
    // Build URL with query string
    const url = new URL(`${baseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(apiParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    }
    
    console.log('Proxying to Coinalyze:', url.toString());
    
    // Make the request using native fetch
    const coinalyzeResponse = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    const data = await coinalyzeResponse.json();
    
    return response.status(200).json(data);
  } catch (error) {
    console.error('Coinalyze API proxy error:', error.message);
    
    // Return a proper error response
    return response.status(500).json({
      error: error.message || 'Failed to fetch from Coinalyze API'
    });
  }
};
