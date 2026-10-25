@echo off
title SmartCell — Battery Monitoring Dashboard
echo ==========================================================
echo Starting SmartCell Local Web Server...
echo ==========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
