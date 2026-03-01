# Coinglass - Deploy Guide

## Vercel Deployment

### Prerequisites
- Node.js 18+
- Vercel CLI (optional, can use web UI)

### Quick Deploy

#### Option 1: Vercel CLI
```bash
cd frontend
npm install -g vercel
vercel
```

#### Option 2: Vercel Web UI
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Configure:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Deploy

### Project Structure

```
frontend/
├── api/                    # Vercel Serverless Functions
│   └── coinalyze.js       # Coinalyze API proxy
├── vercel.json            # Vercel configuration
├── src/                   # Frontend source
│   ├── services/
│   │   └── api.ts        # Updated to use Vercel API in production
│   └── ...
└── package.json
```

### Environment Variables

No environment variables required for basic deployment. The Coinalyze API key is stored in the user's browser localStorage.

### API Route: `/api/coinalyze`

The serverless function handles:
- `GET` requests with query parameters
- CORS headers for cross-origin requests
- Proxy to Coinalyze API

#### Query Parameters
- `symbols`: Trading pair (default: `BTCUSDT_PERP.A`)
- `interval`: Time interval (default: `daily`)
- `from`: Start timestamp
- `to`: End timestamp
- `api_key`: Coinalyze API key

#### Example Request
```bash
GET /api/coinalyze?symbols=BTCUSDT_PERP.A&interval=daily&api_key=FREE
```

### Development

For local development with Vercel API routes:

```bash
# Install Vercel CLI
npm install -g vercel

# Run local development server with API routes
cd frontend
vercel dev
```

This will start the frontend at `http://localhost:3000` with API routes available at `/api/*`.

### How It Works

1. **Production (Vercel)**: The frontend makes requests to `/api/coinalyze`, which is handled by the serverless function that proxies to the Coinalyze API.

2. **Development**: The frontend makes direct API calls (with CORS handled by the browser for supported APIs).

### Troubleshooting

#### CORS Issues
If you encounter CORS errors in production, verify that:
- The `vercel.json` file is in the `frontend/` directory
- The `api/` folder is at the same level as `vercel.json`

#### API Key Issues
The Coinalyze API key can be configured in the app Settings page. Default key is `FREE`.

### Build for Production

```bash
cd frontend
npm run build
```

The built files will be in the `dist/` directory, ready for deployment.
