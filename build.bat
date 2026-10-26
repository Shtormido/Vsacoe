@echo off
chcp 65001 >nul
echo Установка PyInstaller...
python -m pip install --upgrade pyinstaller || goto :error
echo Сборка FileSorter.exe...
python -m PyInstaller --onefile --windowed --name FileSorter --icon icon.ico --add-data "icon.ico;." file_sorter.py || goto :error
echo.
echo Готово: dist\FileSorter.exe
pause
exit /b 0
:error
echo Ошибка сборки. Убедитесь, что установлен Python 3 (python.org) с галочкой "Add to PATH".
pause
exit /b 1
