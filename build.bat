@echo off
rem Сборка одного exe-файла (нужен .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0)
rem   build.bat         - для обычных ПК (x64)
rem   build.bat arm64   - для ноутбуков на ARM (Snapdragon и т.п.)
set RID=win-x64
if /I "%1"=="arm64" set RID=win-arm64
dotnet publish JivieOboi\JivieOboi.csproj -c Release -r %RID% --self-contained true ^
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true ^
  -o publish\%RID%
if errorlevel 1 exit /b 1
echo.
echo Готово: publish\%RID%\JivieOboi.exe
