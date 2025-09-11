#!/bin/bash

# LLM Speed Test Application Runner

echo "Starting LLM Speed Test Application..."

# Function to cleanup background processes
cleanup() {
    echo "Stopping all processes..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
    fi
    exit
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start backend
echo "Starting backend on port 6100..."
cd backend
export PORT=6100
deno task dev &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Start frontend
echo "Starting frontend on port 6001..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "================================================"
echo "LLM Speed Test is now running!"
echo "Frontend: http://localhost:6001"
echo "Backend:  http://localhost:6100"
echo "================================================"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for all background processes
wait