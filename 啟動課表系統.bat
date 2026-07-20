@echo off
:: What this file is (see docs/00_STATUS.md for the Traditional Chinese version):
:: One-click launcher for the timetable query system. Double-click to:
:: 1. Start a local web server in this folder (python -m http.server)
:: 2. Open the browser to the timetable system
:: This is a static site, so double-clicking index.html directly will NOT work
:: (the browser blocks it from loading the CSV/JSON data) -- it must be opened
:: through a local server.
:: To stop the system: just close this black window (the server runs inside it).
::
:: Note: everything shown in THIS console window is in English on purpose --
:: the Windows console has unreliable Chinese font/codepage support, so plain
:: ASCII text is used here to avoid garbled output. The website itself (opened
:: in the browser) is unaffected and displays Chinese normally.

cd /d "%~dp0"
title Timetable System - Server Running (close this window to stop)

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Python not found. Please install Python first:
    echo https://www.python.org/downloads/
    echo.
    pause
    exit /b
)

echo ============================================
echo   Timetable Query System
echo   URL: http://localhost:8080/index.html
echo   Close this window to stop the system.
echo ============================================
echo.

start "" http://localhost:8080/index.html
python -m http.server 8080
