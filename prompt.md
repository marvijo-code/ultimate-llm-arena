An LLM speed test application

- Should be able to compare the speed of 3 LLMs at the same time
- Should be able to support multiple providers, starting with OpenRouter

Frontend:
- React + Vite
- Should use ShadCn and should be a UI like ChatGPT
- add support for a dark and light theme, dark by default

Backend:
- use deno
- Should use sqlite for the database
- Should store the API keys like OPENROUTER_API_KEY in a .env file
- I'll store them in a .env.local file


- create scripts to run the backend and frontend, .sh and .ps1 scripts
- hot reload must be on by default
