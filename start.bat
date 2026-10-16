@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8737
set URL=http://127.0.0.1:%PORT%

where py >nul 2>nul
if %errorlevel%==0 (
  start "MP3UP server" /min py -m http.server %PORT% --bind 127.0.0.1
  goto open
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "MP3UP server" /min python -m http.server %PORT% --bind 127.0.0.1
  goto open
)
echo.
echo  Для запуска нужен Python 3: https://www.python.org/downloads/
echo  Либо откройте MP3UP по ссылке на сайт.
echo.
pause
exit /b

:open
timeout /t 2 /nobreak >nul
start "" %URL%
echo  MP3UP открыт: %URL%
echo  Нажмите «Установить» вверху страницы, чтобы установить приложение.
