@echo off
setlocal

cd /d "%~dp0"

if not exist "%~dp0run-logs" mkdir "%~dp0run-logs"

set "NODE_ENV=development"
set "API_PORT=3001"
set "DATABASE_URL=postgresql://health:health@localhost:5432/health_assistant"
set "REDIS_URL=redis://localhost:6379"
set "JWT_SECRET=change-me"
set "ENCRYPTION_KEY=change-me-32-bytes-long-at-least"
set "CORS_ORIGIN=http://localhost:5173"
set "LLM_PROVIDER=mock"
set "LLM_MODEL=mock-health-assistant"
set "LLM_HTTP_PROXY=http://127.0.0.1:7897"
set "PREVIEW_PORT=5173"
set "API_ORIGIN=http://127.0.0.1:3001"

if exist "C:\nvm4w\nodejs\node.exe" (
  set "NODE_EXE=C:\nvm4w\nodejs\node.exe"
) else (
  set "NODE_EXE=node"
)

echo Preparing HealthFlow database ...
cd /d "%~dp0apps\api"
"%NODE_EXE%" scripts\ensure-prisma-client.mjs
if errorlevel 1 (
  echo Failed to prepare Prisma Client.
  exit /b 1
)
"%NODE_EXE%" scripts\ensure-prisma-migrations.mjs
if errorlevel 1 (
  echo Failed to apply database migrations.
  exit /b 1
)
cd /d "%~dp0"

echo Starting HealthFlow API on http://127.0.0.1:3001 ...
start "HealthFlow API 3001" /min cmd /c ""%NODE_EXE%" apps\api\dist\main.js 1>"%~dp0run-logs\api3001.out.log" 2>"%~dp0run-logs\api3001.err.log""

echo Starting HealthFlow web on http://127.0.0.1:5173 ...
cd /d "%~dp0apps\web"
"%NODE_EXE%" scripts\serve-dist.mjs 1>"%~dp0run-logs\web5173.out.log" 2>"%~dp0run-logs\web5173.err.log"
