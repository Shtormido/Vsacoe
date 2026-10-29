#Requires -Version 5.1
<#
.SYNOPSIS
    Клиент Zapreshatel3000 — агент для удалённого управления по локальной сети.

.DESCRIPTION
    Периодически связывается с главным приложением (сервером), сообщает свой статус
    (имя ПК, пользователь, версия, применённая версия настроек) и автоматически
    применяет присланные ограничения. Требует прав администратора (для применения).

    Настройки берутся из параметров или из файла agent-config.json рядом со скриптом.
    Рядом должен лежать основной файл Zapreshatel3000.ps1 — через него применяются ограничения.

.EXAMPLE
    .\Zapreshatel3000-Agent.ps1 -Server 192.168.1.10 -Port 8777 -Password секрет
#>
[CmdletBinding()]
param(
    [string]$Server,
    [int]$Port = 0,
    [string]$Password,
    [int]$IntervalSec = 0,
    [switch]$NoElevate
)
$ErrorActionPreference = 'Stop'

$AgentVersion = '2.1'
$here = Split-Path -Parent $PSCommandPath

# Настройки из файла, если не заданы параметрами
$cfgFile = Join-Path $here 'agent-config.json'
if (Test-Path -LiteralPath $cfgFile) {
    try {
        $c = Get-Content -LiteralPath $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $Server -and $c.server)      { $Server = [string]$c.server }
        if (-not $Password -and $c.password)  { $Password = [string]$c.password }
        if ($Port -le 0 -and $c.port)         { $Port = [int]$c.port }
        if ($IntervalSec -le 0 -and $c.interval) { $IntervalSec = [int]$c.interval }
    } catch { Write-Warning "Не удалось прочитать agent-config.json: $($_.Exception.Message)" }
}
if ($Port -le 0) { $Port = 8777 }
if ($IntervalSec -le 0) { $IntervalSec = 30 }

if (-not $Server) { Write-Error 'Не задан адрес сервера. Укажите -Server или server в agent-config.json.'; exit 1 }

# Самоповышение до администратора — применение ограничений требует прав админа
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$IsAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin -and -not $NoElevate) {
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"",
           '-Server', $Server, '-Port', "$Port", '-Password', "`"$Password`"", '-IntervalSec', "$IntervalSec")
    try { Start-Process powershell.exe -Verb RunAs -ArgumentList $a } catch { Write-Error 'Не удалось получить права администратора.'; exit 1 }
    exit
}

$main = Join-Path $here 'Zapreshatel3000.ps1'
if (-not (Test-Path -LiteralPath $main)) { Write-Error "Рядом нет Zapreshatel3000.ps1 — он нужен для применения настроек ($main)."; exit 1 }

# Запоминаем, какая версия настроек уже применена (чтобы не применять одно и то же)
$stateDir = Join-Path $env:LOCALAPPDATA 'Zapreshatel3000'
$stateFile = Join-Path $stateDir 'agent_state.json'
$appliedId = ''
if (Test-Path -LiteralPath $stateFile) { try { $appliedId = [string]((Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json).appliedId) } catch { } }

$uri = "http://{0}:{1}/heartbeat" -f $Server, $Port
Write-Host "Агент Zapreshatel3000 $AgentVersion. Сервер: $uri. Интервал: $IntervalSec с. Ctrl+C для выхода."

while ($true) {
    try {
        $body = @{ name = $env:COMPUTERNAME; user = $env:USERNAME; clientVersion = $AgentVersion; appliedId = $appliedId; password = $Password } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType 'application/json; charset=utf-8' -TimeoutSec 15
        if ($resp.ok -and $resp.id -and $resp.id -ne $appliedId -and $resp.config) {
            $tmp = Join-Path $env:TEMP ('zap_remote_{0}.json' -f ([guid]::NewGuid().ToString('N')))
            ($resp.config | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $tmp -Encoding UTF8
            Write-Host ("[{0:HH:mm:ss}] Получены новые настройки ({1}) — применяю..." -f (Get-Date), $resp.id)
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $main -ImportRestrictions $tmp -NoElevate 2>&1 | Out-Null
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
            $appliedId = [string]$resp.id
            try {
                New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
                @{ appliedId = $appliedId; appliedAt = (Get-Date).ToString('s') } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
            } catch { }
            Write-Host ("[{0:HH:mm:ss}] Применено." -f (Get-Date))
        }
    } catch {
        Write-Host ("[{0:HH:mm:ss}] Нет связи с сервером: {1}" -f (Get-Date), $_.Exception.Message)
    }
    Start-Sleep -Seconds $IntervalSec
}
