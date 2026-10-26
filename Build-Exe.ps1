#Requires -Version 5.1
<#
    Собирает PolicyManager.ps1 в один файл PolicyManager.exe с помощью модуля ps2exe.
    Запустите Build-Exe.bat (или этот скрипт) на Windows с доступом в интернет — модуль
    установится автоматически в профиль пользователя. Полученный .exe работает без распаковки.
#>
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $here 'PolicyManager.ps1'
$out  = Join-Path $here 'PolicyManager.exe'
$icon = Join-Path $env:windir 'System32\shell32.dll'   # запасной значок

if (-not (Test-Path -LiteralPath $src)) { throw "Не найден $src" }

Write-Host 'Проверяю модуль ps2exe...'
if (-not (Get-Module -ListAvailable -Name ps2exe)) {
    Write-Host 'Устанавливаю ps2exe (в профиль текущего пользователя)...'
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
    try { Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser -ErrorAction SilentlyContinue | Out-Null } catch { }
    try { Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue } catch { }
    Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
}
Import-Module ps2exe -Force

Write-Host 'Собираю PolicyManager.exe...'
$params = @{
    inputFile    = $src
    outputFile   = $out
    noConsole    = $true          # без чёрного окна консоли
    requireAdmin = $true          # сразу запрос прав администратора при запуске
    title        = 'Policy Manager'
    product      = 'Policy Manager'
    company      = 'Лига Не Безопасного Интернета'
    version      = '2.0.0.0'
    copyright    = 'Лига Не Безопасного Интернета'
}
if (Test-Path -LiteralPath $icon) { $params.iconFile = $icon }
Invoke-ps2exe @params

if (Test-Path -LiteralPath $out) {
    Write-Host ''
    Write-Host "Готово: $out" -ForegroundColor Green
    Write-Host 'Этот файл можно запускать без распаковки и копировать на другие компьютеры.'
} else {
    throw 'Не удалось создать .exe'
}
Write-Host 'Нажмите Enter для выхода...'
[void][Console]::ReadLine()
