@echo off
rem Policy Manager launcher (UAC prompt will appear)
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Zapreshatel3000.ps1"
