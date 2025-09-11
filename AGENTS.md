Ultimate LLM Arena – Development Servers

- Frontend: http://localhost:6001
- Backend (API): http://localhost:6100

Hot reload is enabled for both servers:
- Frontend uses Vite dev server (HMR) – edits in frontend/ reflect instantly.
- Backend (Deno + Oak) runs with --watch – edits in backend/ auto‑reload the server.

How to run locally
- Windows: run .\run.ps1
- macOS/Linux: run ./run.sh

Notes
- Ports are fixed: frontend on 6001 and backend on 6100 (strict for the frontend).
- No need to re-run npm run ... or deno commands on each change; hot reload will pick up edits.
- The frontend will call the backend at http://localhost:6100 by default. You can override with VITE_API_BASE_URL if needed.

Troubleshooting
- If a port is already in use, stop the conflicting process. The frontend is configured with strictPort so it won’t auto-switch to a different port.
- Backend respects the PORT environment variable; our scripts and defaults use 6100.
