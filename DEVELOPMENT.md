# Development Guide

This guide will help you get started with developing WaveWarz Base using GitHub Codespaces or local development.

## Quick Start with GitHub Codespaces

GitHub Codespaces provides a fully configured development environment in the cloud. The devcontainer configuration automatically sets up everything you need.

### Opening in Codespaces

1. Navigate to the repository on GitHub
2. Click the **Code** button
3. Select the **Codespaces** tab
4. Click **Create codespace on main** (or your branch)

The devcontainer will automatically:
- Set up Node.js 20 runtime
- Install Git and GitHub CLI
- Configure VS Code extensions (ESLint, Prettier, Tailwind, Copilot)
- Forward ports 3000 (frontend) and 3001 (backend)

### Port Forwarding

Once your Codespace is running, the frontend and backend ports are automatically forwarded:

- **Port 3000**: Frontend (Next.js) - Will show as "Frontend (Next.js)" in the Ports panel
- **Port 3001**: Backend (Fastify) - Will show as "Backend (Fastify)" in the Ports panel

To access your applications:
1. Open the **Ports** panel in VS Code (View → Ports)
2. Find the forwarded port
3. Click the **globe icon** to open in browser (makes port public)
4. Or click the **link** to preview in Codespaces

### Fixing the 404 Issue

If you see a 404 error when accessing the preview:

1. **Ensure the dev server is running**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

2. **Check the port visibility**:
   - Go to the Ports panel
   - Right-click on port 3000
   - Select **Port Visibility → Public**

3. **Verify the forwarded URL**:
   - The URL should follow the pattern: `https://[codespace-name]-3000.app.github.dev`
   - Make sure you're accessing the correct port (3000 for frontend)

### Firewall Issues

If you encounter firewall blocks in Codespaces:

1. **Public vs Private Networking**:
   - Ensure ports are set to **Public** visibility (not Private)
   - Private ports require authentication and may show firewall errors

2. **Port Configuration**:
   - The devcontainer automatically forwards ports 3000 and 3001
   - These should appear in the Ports panel when Codespace starts
   - If not, manually add them: Ports panel → Forward a Port → Enter 3000

3. **Access from Browser**:
   - Use the **globe icon** in Ports panel to open public URLs
   - Local preview URLs may not work correctly

## Local Development

### Prerequisites

- Node.js 20 or higher
- npm or yarn package manager
- Git

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/CandyToyBox/wavewarz-base.git
   cd wavewarz-base
   ```

2. **Install frontend dependencies**:
   ```bash
   cd frontend
   npm install
   ```

3. **Install backend dependencies**:
   ```bash
   cd ../backend
   npm install
   ```

4. **Set up environment variables**:

   **Frontend** (`frontend/.env.local`):
   ```bash
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_WS_URL=ws://localhost:3001
   ```

   **Backend** (`backend/.env`):
   ```bash
   PORT=3001
   BASE_RPC_URL=https://mainnet.base.org
   # Add other required variables (see backend/.env.example)
   ```

5. **Run the development servers**:

   In one terminal (frontend):
   ```bash
   cd frontend
   npm run dev
   ```

   In another terminal (backend):
   ```bash
   cd backend
   npm run dev
   ```

6. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## GitHub Copilot Integration

This repository includes custom Copilot instructions in `.github/copilot-instructions.md` that help Copilot provide better code suggestions specific to WaveWarz Base.

### Features

- **Context-aware suggestions**: Copilot knows about the tech stack and architecture
- **Best practices**: Follows project coding conventions and patterns
- **Type safety**: Helps maintain TypeScript strict mode
- **Security**: Reminds about security best practices

### Using Copilot

1. **Ensure Copilot is enabled**:
   - Install the GitHub Copilot extension in VS Code
   - Sign in to your GitHub account
   - Copilot should automatically load the repository instructions

2. **Get suggestions**:
   - Start typing and Copilot will suggest completions
   - Press `Tab` to accept a suggestion
   - Press `Esc` to dismiss

3. **Ask Copilot Chat**:
   - Open Copilot Chat panel (Ctrl+Alt+I or Cmd+Alt+I)
   - Ask questions like:
     - "How do I add a new API endpoint?"
     - "What's the battle lifecycle?"
     - "Show me how to create a React component"

## Troubleshooting

### Codespaces Issues

**Problem**: Port not forwarding
- **Solution**: Manually add port in Ports panel → Forward a Port

**Problem**: 404 on preview
- **Solution**: 
  1. Ensure dev server is running
  2. Check port visibility is Public
  3. Use the correct URL from Ports panel

**Problem**: Firewall block
- **Solution**:
  1. Change port visibility to Public
  2. Use the public URL (globe icon)
  3. Clear browser cache and retry

### Build Issues

**Problem**: `npm install` fails
- **Solution**: Clear cache with `npm cache clean --force` and retry

**Problem**: TypeScript errors
- **Solution**: Run `npm run typecheck` to see all errors

**Problem**: Port already in use
- **Solution**: Kill the process using the port or use a different port

## Development Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes**:
   - Edit code
   - Test locally
   - Lint and type-check

3. **Run tests** (if applicable):
   ```bash
   npm run test
   ```

4. **Commit changes**:
   ```bash
   git add .
   git commit -m "Add your feature"
   ```

5. **Push and create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```

## Additional Resources

- [GitHub Codespaces Documentation](https://docs.github.com/en/codespaces)
- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [Next.js Documentation](https://nextjs.org/docs)
- [Fastify Documentation](https://www.fastify.io/docs)
- [Base Documentation](https://docs.base.org)

## Need Help?

- Check the main [README.md](README.md) for project overview
- Review the [Copilot instructions](.github/copilot-instructions.md) for coding guidelines
- Open an issue on GitHub for bugs or questions
