# LLM Speed Test Application

A web application that allows you to compare the speed of different Large Language Models (LLMs) by running the same prompt across multiple models simultaneously.

## Features

- Compare response times of up to 3 different LLMs at once
- Support for multiple providers (starting with OpenRouter)
- ChatGPT-like user interface with dark/light theme support
- SQLite database for storing test results
- Hot reload for both frontend and backend development

## Tech Stack

### Frontend
- React + Vite
- TypeScript
- ShadCn UI components
- Tailwind CSS
- Dark mode by default

### Backend
- Deno
- Oak web framework
- SQLite database
- OpenRouter API integration

## Prerequisites

- Node.js (for frontend)
- Deno (for backend)
- OpenRouter API key

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/marvijo-code/CodingWithGLM.git
cd CodingWithGLM
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

### 3. Backend Setup

The backend uses Deno, so no additional dependencies need to be installed.

### 4. Environment Configuration

#### Backend

Create a `.env.local` file in the `backend` directory:

```
# OpenRouter API Configuration
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Database Configuration
DATABASE_PATH=./llm_speed_test.db

# Server Configuration
PORT=8000
CORS_ORIGIN=http://localhost:5173
```

Replace `your_openrouter_api_key_here` with your actual OpenRouter API key.

#### Frontend

Create a `.env.local` file in the `frontend` directory:

```
# API Configuration
VITE_API_BASE_URL=http://localhost:8000
```

## Running the Application

### Option 1: Using the provided scripts

#### For Windows (PowerShell)

```powershell
.\run.ps1
```

#### For Linux/Mac (Bash)

```bash
chmod +x run.sh
./run.sh
```

### Option 2: Running manually

#### Start the backend

```bash
cd backend
deno task dev
```

#### Start the frontend (in a separate terminal)

```bash
cd frontend
npm run dev
```

### Accessing the application

- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## Usage

1. Open the application in your browser
2. If you haven't set up your API key, you'll be prompted to enter it
3. Enter a prompt you want to test
4. Select up to 3 models to compare
5. Click "Run Speed Test"
6. View the results, including response times and model outputs

## API Endpoints

### OpenRouter Routes
- `GET /api/openrouter/models` - Get available models
- `POST /api/openrouter/test-connection` - Test API connection
- `POST /api/openrouter/generate` - Generate completion
- `POST /api/openrouter/api-key` - Save API key
- `GET /api/openrouter/api-key/status` - Check API key status

### Speed Test Routes
- `POST /api/speed-test/run` - Run speed test
- `GET /api/speed-test/history` - Get test history
- `GET /api/speed-test/models` - Get available models
- `GET /api/speed-test/popular-models` - Get popular models

### Other Routes
- `GET /api/test-results` - Get test results
- `GET /health` - Health check

## Development

### Hot Reload

Both the frontend and backend support hot reload during development:

- Frontend: Vite provides hot reload out of the box
- Backend: Deno's `--watch` flag enables hot reload

### Project Structure

```
CodingWithGLM/
├── backend/
│   ├── db.ts                 # Database setup
│   ├── deno.json            # Deno configuration
│   ├── main.ts              # Main server file
│   ├── routes/
│   │   ├── openRouter.ts    # OpenRouter API routes
│   │   └── speedTest.ts     # Speed test routes
│   ├── services/
│   │   ├── dbService.ts     # Database service
│   │   ├── openRouterService.ts  # OpenRouter service
│   │   └── speedTestService.ts   # Speed test service
│   ├── .env.example         # Environment variables example
│   └── .env.local           # Local environment variables (not tracked)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/          # ShadCn UI components
│   │   │   ├── SpeedTestInterface.tsx  # Main speed test component
│   │   │   ├── theme-provider.tsx     # Theme provider
│   │   │   └── theme-toggle.tsx        # Theme toggle
│   │   ├── lib/
│   │   │   └── utils.ts     # Utility functions
│   │   ├── services/
│   │   │   └── api.ts       # API service
│   │   ├── App.tsx          # Main App component
│   │   ├── main.tsx         # Entry point
│   │   └── index.css        # Global styles
│   ├── components.json      # ShadCn configuration
│   ├── deno.json            # Deno configuration
│   ├── package.json         # Node.js dependencies
│   ├── tailwind.config.js   # Tailwind CSS configuration
│   ├── vite.config.ts       # Vite configuration
│   ├── .env.example         # Environment variables example
│   └── .env.local           # Local environment variables (not tracked)
├── run.sh                   # Linux/Mac run script
├── run.ps1                  # Windows run script
└── README.md                # This file
```

## License

This project is open source and available under the MIT License.