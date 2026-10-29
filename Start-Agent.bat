@echo off
rem Zapreshatel3000 client agent. Settings are in agent-config.json next to this file.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Zapreshatel3000-Agent.ps1"
