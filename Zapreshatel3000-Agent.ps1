#Requires -Version 5.1
<#
.SYNOPSIS
    Клиент Zapreshatel3000 — агент для удалённого управления по локальной сети.

.DESCRIPTION
    Принимает настройки, которые СЕРВЕР отправляет принудительно (push), и применяет их
    сразу. Дополнительно периодически связывается с сервером как подстраховка (если ПК был
    выключен в момент рассылки — догонит при следующем запуске) и сообщает свой статус.
    Требует прав администратора. Рядом должен лежать Zapreshatel3000.ps1.

.EXAMPLE
    .\Zapreshatel3000-Agent.ps1 -Server 192.168.1.10 -Port 8777 -Password секрет
#>
[CmdletBinding()]
param(
    [string]$Server,
    [int]$Port = 0,
    [string]$Password,
    [int]$IntervalSec = 0,
    [int]$ListenPort = 0,
    [switch]$InstallAutostart,
    [switch]$RemoveAutostart,
    [switch]$NoElevate
)
$ErrorActionPreference = 'Stop'
$AutostartTask = 'Zapreshatel3000 Agent'

$AgentVersion = '2.7'
$here = Split-Path -Parent $PSCommandPath

# Установка/удаление автозапуска (не требует настроек сервера). Делаем это первым делом.
if ($InstallAutostart -or $RemoveAutostart) {
    $principal0 = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal0.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -and -not $NoElevate) {
        $sw = if ($RemoveAutostart) { '-RemoveAutostart' } else { '-InstallAutostart' }
        try { Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", $sw) } catch { Write-Error 'Нужны права администратора.'; exit 1 }
        exit
    }
    if ($RemoveAutostart) {
        & schtasks /Delete /TN "$AutostartTask" /F 2>&1 | Out-Null
        Write-Host 'Агент убран из автозапуска.'
    } else {
        $tr = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $PSCommandPath
        & schtasks /Create /TN "$AutostartTask" /TR $tr /SC ONSTART /RU SYSTEM /RL HIGHEST /F 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host "Агент добавлен в автозапуск (задача «$AutostartTask»). Будет стартовать при включении ПК." }
        else { Write-Error 'Не удалось создать задачу автозапуска.' }
    }
    Start-Sleep -Seconds 1
    exit
}

# Настройки из файла, если не заданы параметрами
$cfgFile = Join-Path $here 'agent-config.json'
if (Test-Path -LiteralPath $cfgFile) {
    try {
        $c = Get-Content -LiteralPath $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $Server -and $c.server)         { $Server = [string]$c.server }
        if (-not $Password -and $c.password)     { $Password = [string]$c.password }
        if ($Port -le 0 -and $c.port)            { $Port = [int]$c.port }
        if ($IntervalSec -le 0 -and $c.interval) { $IntervalSec = [int]$c.interval }
        if ($ListenPort -le 0 -and $c.listenPort){ $ListenPort = [int]$c.listenPort }
    } catch { Write-Warning "Не удалось прочитать agent-config.json: $($_.Exception.Message)" }
}
if ($Port -le 0) { $Port = 8777 }
if ($IntervalSec -le 0) { $IntervalSec = 15 }
if ($ListenPort -le 0) { $ListenPort = 8778 }

if (-not $Server) { Write-Error 'Не задан адрес сервера. Укажите -Server или server в agent-config.json.'; exit 1 }

# Самоповышение до администратора — применение ограничений и приёмник требуют прав админа
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$IsAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin -and -not $NoElevate) {
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"",
           '-Server', $Server, '-Port', "$Port", '-Password', "`"$Password`"", '-IntervalSec', "$IntervalSec", '-ListenPort', "$ListenPort")
    try { Start-Process powershell.exe -Verb RunAs -ArgumentList $a } catch { Write-Error 'Не удалось получить права администратора.'; exit 1 }
    exit
}

$main = Join-Path $here 'Zapreshatel3000.ps1'
if (-not (Test-Path -LiteralPath $main)) { Write-Error "Рядом нет Zapreshatel3000.ps1 — он нужен для применения настроек ($main)."; exit 1 }

# Разрешаем входящий порт приёмника в брандмауэре (мы админ — можем сами)
try {
    & netsh advfirewall firewall delete rule name="Zapreshatel3000 Agent" 2>&1 | Out-Null
    & netsh advfirewall firewall add rule name="Zapreshatel3000 Agent" dir=in action=allow protocol=TCP localport=$ListenPort 2>&1 | Out-Null
} catch { }

# Запоминаем, какая версия настроек уже применена
$stateDir = Join-Path $env:LOCALAPPDATA 'Zapreshatel3000'
$stateFile = Join-Path $stateDir 'agent_state.json'
$appliedId = ''
if (Test-Path -LiteralPath $stateFile) { try { $appliedId = [string]((Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json).appliedId) } catch { } }

# Общее состояние (делится между приёмником и циклом-подстраховкой)
$S = [hashtable]::Synchronized(@{
    AppliedId = $appliedId; Lock = (New-Object object); Main = $main
    StateFile = $stateFile; StateDir = $stateDir; Password = $Password
    ListenPort = $ListenPort; Running = $true; Listener = $null
    Log = [System.Collections.Queue]::Synchronized((New-Object System.Collections.Queue))
    ReportNow = $false
})

# Единая логика применения конфигурации (используется и приёмником, и циклом)
$applyScript = {
    param($S, $configObj, $id)
    if (-not $id) { return $false }
    [System.Threading.Monitor]::Enter($S.Lock)
    try {
        if ([string]$id -eq [string]$S.AppliedId) { return $false }
        $tmp = Join-Path $env:TEMP ('zap_remote_{0}.json' -f ([guid]::NewGuid().ToString('N')))
        ($configObj | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $tmp -Encoding UTF8
        $S.Log.Enqueue(("[{0:HH:mm:ss}] Получены новые ограничения (версия {1}). Применяю:" -f (Get-Date), $id))
        # Вывод применения (в т.ч. сводку «какие ограничения вводятся») показываем в окне агента
        $outp = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $S.Main -ImportRestrictions $tmp -NoElevate 2>&1
        foreach ($line in $outp) { $t = [string]$line; if ($t.Trim()) { $S.Log.Enqueue('    ' + $t) } }
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        $S.AppliedId = [string]$id
        try {
            New-Item -ItemType Directory -Path $S.StateDir -Force | Out-Null
            @{ appliedId = $S.AppliedId; appliedAt = (Get-Date).ToString('s') } | ConvertTo-Json | Set-Content -LiteralPath $S.StateFile -Encoding UTF8
        } catch { }
        $S.Log.Enqueue(("[{0:HH:mm:ss}] Ограничения применены." -f (Get-Date)))
        $S.ReportNow = $true   # сообщить серверу о применении немедленно, не ждать цикла
        return $true
    } finally { [System.Threading.Monitor]::Exit($S.Lock) }
}
$applyText = $applyScript.ToString()

# Приёмник push от сервера (фоновый поток)
$listenerScript = {
    param($S, $ApplyText)
    $apply = [scriptblock]::Create($ApplyText)
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://+:$($S.ListenPort)/")
    try { $listener.Start() } catch { return }
    $S.Listener = $listener
    while ($S.Running) {
        $ctx = $null
        try { $ctx = $listener.GetContext() } catch { break }
        try {
            $req = $ctx.Request
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $raw = $reader.ReadToEnd(); $reader.Close()
            $data = $null; try { $data = $raw | ConvertFrom-Json } catch { }
            $resp = @{ ok = $false }
            if ($data -and ([string]$data.password -eq [string]$S.Password) -and $req.Url.AbsolutePath -eq '/push') {
                $applied = & $apply $S $data.config ([string]$data.id)
                $resp = @{ ok = $true; applied = [bool]$applied }
            }
            $out = [System.Text.Encoding]::UTF8.GetBytes(($resp | ConvertTo-Json))
            $ctx.Response.ContentType = 'application/json; charset=utf-8'
            $ctx.Response.OutputStream.Write($out, 0, $out.Length)
        } catch { } finally { try { $ctx.Response.Close() } catch { } }
    }
    try { $listener.Stop(); $listener.Close() } catch { }
}

$rs = [runspacefactory]::CreateRunspace(); $rs.ApartmentState = 'MTA'; $rs.ThreadOptions = 'ReuseThread'; $rs.Open()
$psListener = [powershell]::Create(); $psListener.Runspace = $rs
[void]$psListener.AddScript($listenerScript.ToString()).AddArgument($S).AddArgument($applyText)
[void]$psListener.BeginInvoke()

$uri = "http://{0}:{1}/heartbeat" -f $Server, $Port
Write-Host "Агент Zapreshatel3000 $AgentVersion. Сервер: $uri. Приём push на порту $ListenPort. Ctrl+C для выхода."

# Цикл-подстраховка: регистрируемся на сервере, сообщаем статус, догоняем настройки если push не дошёл
$connected = $false
try {
    while ($true) {
        try {
            $body = @{ name = $env:COMPUTERNAME; user = $env:USERNAME; clientVersion = $AgentVersion; appliedId = $S.AppliedId; listenPort = $ListenPort; password = $Password } | ConvertTo-Json
            $resp = Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType 'application/json; charset=utf-8' -TimeoutSec 15
            if (-not $connected) {
                Write-Host ("[{0:HH:mm:ss}] Подключился к серверу {1}" -f (Get-Date), $uri) -ForegroundColor Green
                $connected = $true
            }
            if ($resp.ok -and $resp.id -and $resp.id -ne $S.AppliedId -and $resp.config) {
                [void](& $applyScript $S $resp.config ([string]$resp.id))
            }
        } catch {
            if ($connected) { Write-Host ("[{0:HH:mm:ss}] Потеряна связь с сервером." -f (Get-Date)) -ForegroundColor Yellow }
            else { Write-Host ("[{0:HH:mm:ss}] Нет связи с сервером: {1}" -f (Get-Date), $_.Exception.Message) }
            $connected = $false
        }
        # Ждём до следующей проверки, попутно выводим журнал и сразу отчитываемся после применения push
        for ($i = 0; $i -lt $IntervalSec; $i++) {
            while ($S.Log.Count -gt 0) { Write-Host ([string]$S.Log.Dequeue()) }
            if ($S.ReportNow) { $S.ReportNow = $false; break }   # push применён — сразу сообщить серверу статус
            Start-Sleep -Seconds 1
        }
    }
} finally {
    $S.Running = $false
    try { if ($S.Listener) { $S.Listener.Stop() } } catch { }
}
