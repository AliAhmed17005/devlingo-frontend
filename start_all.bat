@echo off
title DevLingo FYP Launcher
echo ==========================================================
echo    DEVLINGO - Full-Stack Local Launcher (FYP)
echo ==========================================================
echo.

REM 1. Start FastAPI Backend in a separate window
echo [1/2] Starting Backend Server (FastAPI + Uvicorn)...
start "DevLingo Backend (Port 8000)" cmd /k "cd /d "%~dp0..\fyp-backend" && venv\Scripts\activate && uvicorn main:app --reload --host 127.0.0.1 --port 8000"

REM 2. Start React Frontend in a separate window
echo [2/2] Starting Frontend Server (React)...
start "DevLingo Frontend (Port 3000)" cmd /k "cd /d "%~dp0" && npm start"

echo.
echo ==========================================================
echo Both servers have been launched in separate terminals!
echo.
echo Backend API Docs: http://127.0.0.1:8000/docs
echo Frontend Web App: http://localhost:3000
echo ==========================================================
