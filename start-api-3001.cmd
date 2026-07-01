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

if exist "C:\nvm4w\nodejs\node.exe" (
  set "NODE_EXE=C:\nvm4w\nodejs\node.exe"
) else (
  set "NODE_EXE=node"
)

cd /d "%~dp0apps\api"
"%NODE_EXE%" scripts\ensure-prisma-client.mjs
if errorlevel 1 exit /b 1
"%NODE_EXE%" scripts\ensure-prisma-migrations.mjs
if errorlevel 1 exit /b 1

cd /d "%~dp0"
echo Starting HealthFlow API on http://127.0.0.1:3001 ...
"%NODE_EXE%" apps\api\dist\main.js 1>"%~dp0run-logs\api3001.out.log" 2>"%~dp0run-logs\api3001.err.log"
