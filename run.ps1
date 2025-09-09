# LLM Speed Test - PowerShell Development Runner
# This script starts both the backend (Deno) and frontend (Vite) with hot reload

Write-Host "🚀 Starting LLM Speed Test Development Environment" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green

# Check if required tools are installed
try {
    $null = Get-Command deno -ErrorAction Stop
} catch {
    Write-Host "❌ Deno is not installed. Please install Deno first:" -ForegroundColor Red
    Write-Host "   irm https://deno.land/install.ps1 | iex" -ForegroundColor Yellow
    exit 1
}

try {
    $null = Get-Command node -ErrorAction Stop
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Set environment variables
$env:OPENROUTER_API_KEY = $env:OPENROUTER_API_KEY ?? ""

# Create logs directory if it doesn't exist
if (!(Test-Path -Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
}

# Function to cleanup background processes
function Cleanup {
    Write-Host ""
    Write-Host "🛑 Shutting down development servers..." -ForegroundColor Yellow
    Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue
    exit 0
}

# Register cleanup on script exit
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Cleanup } | Out-Null

# Start backend
Write-Host "🔧 Starting Deno backend on port 8000..." -ForegroundColor Blue
Start-Job -Name "Backend" -ScriptBlock {
    Set-Location $using:PWD\backend
    deno run --allow-net --allow-env --allow-read --watch main.ts *> ..\logs\backend.log
} | Out-Null

# Wait for backend to start
Write-Host "⏳ Waiting for backend to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Start frontend
Write-Host "⚡ Starting Vite frontend on port 5173..." -ForegroundColor Blue
Start-Job -Name "Frontend" -ScriptBlock {
    Set-Location $using:PWD\frontend
    npm run dev *> ..\logs\frontend.log
} | Out-Null

Write-Host ""
Write-Host "✅ Development servers started!" -ForegroundColor Green
Write-Host "📊 Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "🎨 Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Logs are being written to:" -ForegroundColor Gray
Write-Host "   - logs\backend.log" -ForegroundColor Gray
Write-Host "   - logs\frontend.log" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop all servers" -ForegroundColor Yellow

# Wait for user input to stop
Write-Host "Running..." -ForegroundColor Green
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Cleanup
}