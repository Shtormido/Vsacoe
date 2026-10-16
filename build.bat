@echo off
rem Сборка одного exe-файла (нужен .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0)
dotnet publish JivieOboi\JivieOboi.csproj -c Release -r win-x64 --self-contained true ^
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true ^
  -o publish
if errorlevel 1 exit /b 1
echo.
echo Готово: publish\JivieOboi.exe
