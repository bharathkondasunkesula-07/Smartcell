@echo off
title SmartCell — Arduino USB Serial Bridge
echo ==========================================================
echo Starting SmartCell Arduino Serial WebSocket Bridge...
echo ==========================================================
echo Target: ws://localhost:8765
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in system PATH.
    echo Please install Python 3.9+ from python.org and add to PATH.
    pause
    exit /b 1
)

echo Checking dependencies (pyserial, websockets)...
python -c "import serial, websockets" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing missing requirements...
    pip install -r "%~dp0requirements.txt"
)

python "%~dp0serial_bridge.py" %*
pause
