# Vercel Deployment Configuration

This document explains the Vercel deployment setup for the WaveWarz Base frontend.

## Configuration Files

### `frontend/vercel.json`
The `vercel.json` file in the frontend directory contains minimal configuration:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

This tells Vercel that this is a Next.js project and allows Vercel to automatically configure the build process.

## Vercel Dashboard Settings

When deploying to Vercel, configure the following settings in the Vercel dashboard:

### Project Settings
- **Framework Preset**: Next.js (auto-detected)
- **Root Directory**: `frontend`
- **Build Command**: `npm run build` (auto-detected)
- **Output Directory**: `.next` (auto-detected)
- **Install Command**: `npm ci` (auto-detected)

### Environment Variables

Set these in the Vercel dashboard under **Settings → Environment Variables**:

#### Required
- `NEXT_PUBLIC_API_URL` - Backend API URL (e.g., `https://api.wavewarz.com` or your Railway URL)
- `NEXT_PUBLIC_WS_URL` - WebSocket URL (e.g., `wss://api.wavewarz.com`)

#### Optional
- `NEXT_PUBLIC_CHAIN_ID` - Blockchain network ID (84532 for Base Sepolia)
- `NEXT_PUBLIC_WAVEWARZ_CONTRACT` - Smart contract address
- `NEXT_PUBLIC_ONCHAINKIT_API_KEY` - Coinbase OnchainKit API key

## Monorepo Structure

This project uses a monorepo structure with the frontend in a subdirectory:

```
wavewarz-base/
├── frontend/          # Next.js application
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vercel.json    # Vercel configuration
├── backend/           # Node.js API
└── contracts/         # Solidity contracts
```

The **Root Directory** setting in Vercel points to `frontend` so that Vercel builds and deploys only the frontend application.

## Static Assets

### Favicon/Icon
The application uses Next.js 14's built-in icon generation via `src/app/icon.tsx`. This automatically generates a favicon at `/icon` which browsers will request.

### Public Directory
Static files should be placed in `frontend/public/` and will be served from the root path.

## Build Process

The build process:
1. Vercel navigates to the `frontend` directory (based on Root Directory setting)
2. Runs `npm ci` to install dependencies
3. Runs `npm run build` to build the Next.js application
4. Deploys the generated `.next` directory to Vercel's edge network

## Troubleshooting

### 404 Errors
- **Missing favicon**: Ensure `src/app/icon.tsx` exists and exports a valid ImageResponse
- **API not found**: Check that `NEXT_PUBLIC_API_URL` environment variable is set correctly
- **Static assets**: Ensure files are in the `public/` directory

### Build Failures
- **Missing dependencies**: Check that all required packages are in `package.json`
- **Environment variables**: API calls during build time will fail if the backend isn't accessible; this is expected for pages that fetch data at build time

### Runtime Issues
- **API connection errors**: Verify the backend is running and accessible at `NEXT_PUBLIC_API_URL`
- **WebSocket errors**: Check that `NEXT_PUBLIC_WS_URL` is set and the backend supports WebSocket connections

## Local Development

To run the frontend locally:

```bash
cd frontend
npm install
npm run dev
```

The development server will start on `http://localhost:3000`.

Make sure to set up your `.env.local` file based on `.env.local.example`:

```bash
cp .env.local.example .env.local
# Edit .env.local with your local configuration
```
