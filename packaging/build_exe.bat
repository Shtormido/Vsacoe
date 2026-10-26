@echo off
rem Build blockscan.exe on Windows. Requires Python 3.9+ in PATH.
cd /d "%~dp0\.."
python -m pip install --upgrade pyinstaller || exit /b 1
python -m PyInstaller --noconfirm --clean --onefile --console --name blockscan ^
  --icon packaging\blockscan.ico ^
  --add-data "blockscan\data;blockscan\data" ^
  --paths . packaging\blockscan_entry.py || exit /b 1
echo.
echo Done: dist\blockscan.exe
