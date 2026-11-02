@echo off
rem Remove Zapreshatel3000 agent from Windows startup. Will ask for admin.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Zapreshatel3000-Agent.ps1" -RemoveAutostart
pause
