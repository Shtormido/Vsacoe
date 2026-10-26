@echo off
rem Build PolicyManager.exe from PolicyManager.ps1 (needs internet on first run)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-Exe.ps1"
pause
