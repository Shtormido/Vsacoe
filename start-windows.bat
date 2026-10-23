@echo off
rem Нефритовое Го: запуск сервера на Windows 10/11 двойным щелчком.
rem Порт можно передать параметром:  start-windows.bat 8000
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PORT=8080
if not "%~1"=="" set PORT=%~1

rem py - официальный запуск Python с python.org; python - если он добавлен в PATH
set PY=
py -3 --version >nul 2>&1 && set PY=py -3
if not defined PY python --version >nul 2>&1 && set PY=python
if not defined PY goto nopython

echo Нефритовое Го: сервер запускается. Окно не закрывайте - это и есть сервер.
echo Если Windows спросит про брандмауэр, разрешите доступ для "Частных сетей".
start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%/"
%PY% server\serve.py --port %PORT%
pause
goto :eof

:nopython
echo.
echo Python 3 не найден.
echo Скачайте его с https://www.python.org/downloads/windows/
echo и при установке отметьте "Add python.exe to PATH", затем запустите этот файл снова.
echo.
pause
