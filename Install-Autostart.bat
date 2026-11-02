@echo off
rem Add Zapreshatel3000 agent to Windows startup (scheduled task). Will ask for admin.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Zapreshatel3000-Agent.ps1" -InstallAutostart
pause
