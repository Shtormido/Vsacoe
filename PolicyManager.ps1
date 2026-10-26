#Requires -Version 5.1
<#
.SYNOPSIS
    Policy Manager — управление политиками Windows 10/11 (в том числе Home) через реестр.

.DESCRIPTION
    Без параметров открывает графический интерфейс. Каталог политик хранится в policies.json,
    готовые наборы настроек — в папке profiles.

.EXAMPLE
    .\PolicyManager.ps1
    .\PolicyManager.ps1 -List
    .\PolicyManager.ps1 -Backup C:\backup.json
    .\PolicyManager.ps1 -Restore C:\backup.json
    .\PolicyManager.ps1 -ApplyProfile privacy
#>
[CmdletBinding()]
param(
    [switch]$List,
    [string]$ApplyProfile,
    [string]$Backup,
    [string]$Restore,
    [switch]$NoElevate
)

$ErrorActionPreference = 'Stop'

$AppName     = 'Policy Manager'
$AppVersion  = '1.0'
$CatalogFile = Join-Path $PSScriptRoot 'policies.json'
$ProfilesDir = Join-Path $PSScriptRoot 'profiles'
$IsCli       = $List -or $ApplyProfile -or $Backup -or $Restore

$PolicyRoots = @(
    'HKLM:\SOFTWARE\Policies',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies',
    'HKCU:\Software\Policies',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies'
)

#region Права администратора

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Start-Elevated {
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$PSCommandPath`"")
    Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $argList -Verb RunAs
}

$IsAdmin = Test-IsAdmin

# GUI перезапускается с правами администратора; CLI работает с текущими правами
if (-not $IsAdmin -and -not $NoElevate -and -not $IsCli) {
    try {
        Start-Elevated
        exit
    } catch {
        # Пользователь отказался в окне UAC — продолжаем без прав (доступны только политики HKCU)
    }
}

#endregion

#region Папка данных и журнал

function Initialize-DataDir {
    $candidates = @((Join-Path $PSScriptRoot 'data'), (Join-Path $env:LOCALAPPDATA 'PolicyManager'))
    foreach ($dir in $candidates) {
        try {
            New-Item -ItemType Directory -Path (Join-Path $dir 'backups') -Force | Out-Null
            $test = Join-Path $dir '.write_test'
            [IO.File]::WriteAllText($test, 'x')
            Remove-Item -LiteralPath $test -Force
            return $dir
        } catch { }
    }
    return $env:TEMP
}

$DataDir   = Initialize-DataDir
$BackupDir = Join-Path $DataDir 'backups'
$LogFile   = Join-Path $DataDir 'PolicyManager.log'

function Write-Log([string]$Message) {
    try {
        $line = '[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $Message
        Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
    } catch { }
}

#endregion

#region Работа с реестром

function Resolve-RegPath([string]$Path) {
    if ($Path -match '^(HKLM|HKCU):\\(.+)$') {
        $hive = if ($Matches[1] -eq 'HKLM') { [Microsoft.Win32.RegistryHive]::LocalMachine } else { [Microsoft.Win32.RegistryHive]::CurrentUser }
        return [pscustomobject]@{ Hive = $hive; SubKey = $Matches[2].TrimEnd('\') }
    }
    throw "Неверный путь реестра: $Path"
}

function ConvertTo-NativeRegPath([string]$Path) {
    $Path -replace '^HKLM:', 'HKEY_LOCAL_MACHINE' -replace '^HKCU:', 'HKEY_CURRENT_USER'
}

# Всегда 64-битное представление реестра, даже если запущен 32-битный PowerShell
function Open-RegKey([string]$Path, [switch]$Writable, [switch]$Create) {
    $r = Resolve-RegPath $Path
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($r.Hive, [Microsoft.Win32.RegistryView]::Registry64)
    try {
        if ($Create) { return $base.CreateSubKey($r.SubKey) }
        return $base.OpenSubKey($r.SubKey, [bool]$Writable)
    } finally {
        $base.Close()
    }
}

function Get-RegValue([string]$Path, [string]$Name) {
    $k = Open-RegKey $Path
    if (-not $k) { return $null }
    try {
        if ($k.GetValueNames() -notcontains $Name) { return $null }
        return [pscustomobject]@{
            Kind = $k.GetValueKind($Name)
            Data = $k.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        }
    } finally {
        $k.Close()
    }
}

function Format-RegData($Kind, $Data) {
    switch ([string]$Kind) {
        'DWord'       { return [string][BitConverter]::ToUInt32([BitConverter]::GetBytes([int32]$Data), 0) }
        'QWord'       { return [string][BitConverter]::ToUInt64([BitConverter]::GetBytes([int64]$Data), 0) }
        'Binary'      { return ((@($Data) | ForEach-Object { ([byte]$_).ToString('X2') }) -join ' ') }
        'MultiString' { return (@($Data) -join '; ') }
        default       { return [string]$Data }
    }
}

function ConvertTo-RegData([string]$Type, $Value) {
    switch ($Type) {
        'DWord' {
            $n = [int64]$Value
            if ($n -lt 0 -or $n -gt [uint32]::MaxValue) { throw "Значение $Value не помещается в DWORD" }
            return [BitConverter]::ToInt32([BitConverter]::GetBytes([uint32]$n), 0)
        }
        'QWord' { return [BitConverter]::ToInt64([BitConverter]::GetBytes([uint64]$Value), 0) }
        'MultiString' { return , ([string[]]@($Value)) }
        'Binary' {
            $hex = ([string]$Value) -replace '[^0-9A-Fa-f]', ''
            $bytes = New-Object byte[] ($hex.Length -shr 1)
            for ($i = 0; $i -lt $bytes.Length; $i++) { $bytes[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16) }
            return , $bytes
        }
        default { return [string]$Value }
    }
}

function Set-RegValue([string]$Path, [string]$Name, [string]$Type, $Value) {
    $kind = [Microsoft.Win32.RegistryValueKind]$Type
    $data = ConvertTo-RegData $Type $Value
    $k = Open-RegKey $Path -Create
    if (-not $k) { throw "Не удалось открыть раздел $Path" }
    try { $k.SetValue($Name, $data, $kind) } finally { $k.Close() }
}

# Удаляет параметр; опустевший раздел внутри SOFTWARE\Policies тоже удаляется
function Remove-RegValue([string]$Path, [string]$Name) {
    $k = Open-RegKey $Path -Writable
    if (-not $k) { return }
    try {
        if ($k.GetValueNames() -contains $Name) { $k.DeleteValue($Name, $false) }
        $empty = ($k.ValueCount -eq 0 -and $k.SubKeyCount -eq 0)
    } finally {
        $k.Close()
    }
    if ($empty -and $Path -match '\\SOFTWARE\\Policies\\') {
        $cut = $Path.LastIndexOf('\')
        $parent = Open-RegKey $Path.Substring(0, $cut) -Writable
        if ($parent) {
            try { $parent.DeleteSubKey($Path.Substring($cut + 1), $false) } finally { $parent.Close() }
        }
    }
}

function Get-AllRegistryPolicies {
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($root in $PolicyRoots) {
        $stack = New-Object System.Collections.Generic.Stack[string]
        $stack.Push($root)
        while ($stack.Count -gt 0) {
            $path = $stack.Pop()
            try { $k = Open-RegKey $path } catch { continue }
            if (-not $k) { continue }
            try {
                foreach ($n in $k.GetValueNames()) {
                    try {
                        $kind = $k.GetValueKind($n)
                        $data = $k.GetValue($n, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                    } catch { continue }
                    $out.Add([pscustomobject]@{ Path = $path; Name = $n; Kind = [string]$kind; Data = (Format-RegData $kind $data) })
                }
                foreach ($s in $k.GetSubKeyNames()) { $stack.Push("$path\$s") }
            } finally {
                $k.Close()
            }
        }
    }
    return @($out | Sort-Object Path, Name)
}

#endregion

#region Каталог политик

function Import-Catalog {
    if (-not (Test-Path -LiteralPath $CatalogFile)) { throw "Не найден каталог политик: $CatalogFile" }
    $items = Get-Content -LiteralPath $CatalogFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $list = New-Object System.Collections.Generic.List[object]
    $ids = @{}
    foreach ($p in $items) {
        if ($ids.ContainsKey($p.id)) { throw "policies.json: повторяющийся id '$($p.id)'" }
        $ids[$p.id] = $true
        $values = @(foreach ($v in @($p.values)) {
            $vp = if ($v.path) { $v.path } else { $p.path }
            [pscustomobject]@{ Path = $vp; Name = $v.name; Type = $v.type }
        })
        $options = @(foreach ($o in @($p.options)) {
            $data = @($o.data)
            if ($data.Count -ne $values.Count) { throw "policies.json: у '$($p.id)' вариант '$($o.key)' содержит $($data.Count) значений вместо $($values.Count)" }
            [pscustomobject]@{ Key = [string]$o.key; Label = $o.label; Data = $data }
        })
        $list.Add([pscustomobject]@{
            Id          = $p.id
            Category    = $p.category
            Name        = $p.name
            Description = $p.description
            Values      = $values
            Options     = $options
            NoUnset     = [bool]$p.noUnset
            Reboot      = [bool]$p.reboot
        })
    }
    return $list.ToArray()
}

function Find-Policy([string]$Id) {
    foreach ($p in $script:Catalog) { if ($p.Id -eq $Id) { return $p } }
    return $null
}

function Get-PolicyScope($p) {
    $scopes = @($p.Values | ForEach-Object { $_.Path.Substring(0, 4) } | Select-Object -Unique)
    return ($scopes -join '+')
}

function Get-PolicyState($p) {
    $count = $p.Values.Count
    $cur = New-Object object[] $count
    $anySet = $false
    for ($i = 0; $i -lt $count; $i++) {
        $cur[$i] = Get-RegValue $p.Values[$i].Path $p.Values[$i].Name
        if ($null -ne $cur[$i]) { $anySet = $true }
    }
    if (-not $anySet) {
        $label = if ($p.NoUnset) { 'Не задано (по умолчанию Windows)' } else { 'Не задано' }
        return [pscustomobject]@{ Key = '_unset'; Label = $label }
    }
    # null в варианте означает «параметр удаляется» и при сравнении не учитывается
    foreach ($o in $p.Options) {
        $match = $true
        for ($i = 0; $i -lt $count; $i++) {
            $expected = $o.Data[$i]
            if ($null -eq $expected) { continue }
            if ($null -eq $cur[$i] -or ([string]$expected -ne (Format-RegData $cur[$i].Kind $cur[$i].Data))) { $match = $false; break }
        }
        if ($match) { return [pscustomobject]@{ Key = $o.Key; Label = $o.Label } }
    }
    $parts = for ($i = 0; $i -lt $count; $i++) {
        if ($null -ne $cur[$i]) { '{0}={1}' -f $p.Values[$i].Name, (Format-RegData $cur[$i].Kind $cur[$i].Data) }
    }
    return [pscustomobject]@{ Key = '_other'; Label = 'Другое: ' + ($parts -join ', ') }
}

function Get-SafePolicyState($p) {
    try { return Get-PolicyState $p }
    catch { return [pscustomobject]@{ Key = '_error'; Label = 'Ошибка чтения: ' + $_.Exception.Message } }
}

$script:AutoBackupDone = $false

# Перед первым изменением за сеанс автоматически сохраняется резервная копия
function Invoke-AutoBackup {
    if ($script:AutoBackupDone) { return }
    $script:AutoBackupDone = $true
    try {
        $file = Join-Path $BackupDir ('auto_{0:yyyyMMdd_HHmmss}.json' -f (Get-Date))
        Export-PolicyBackup $file
        Write-Log "Автоматическая резервная копия: $file"
    } catch {
        Write-Log "Не удалось создать автоматическую резервную копию: $($_.Exception.Message)"
    }
}

function Set-PolicyOption($p, [string]$Key) {
    Invoke-AutoBackup
    $before = (Get-SafePolicyState $p).Label
    if ($Key -eq '_unset') {
        foreach ($v in $p.Values) { Remove-RegValue $v.Path $v.Name }
    } else {
        $o = $p.Options | Where-Object { $_.Key -eq $Key } | Select-Object -First 1
        if (-not $o) { throw "У политики '$($p.Id)' нет варианта '$Key'" }
        for ($i = 0; $i -lt $p.Values.Count; $i++) {
            $v = $p.Values[$i]
            if ($null -eq $o.Data[$i]) { Remove-RegValue $v.Path $v.Name }
            else { Set-RegValue $v.Path $v.Name $v.Type $o.Data[$i] }
        }
    }
    $after = (Get-SafePolicyState $p).Label
    Write-Log "[$($p.Id)] $($p.Name): '$before' -> '$after'"
}

#endregion

#region Резервные копии и профили

function Export-PolicyBackup([string]$File) {
    $records = foreach ($p in $script:Catalog) {
        foreach ($v in $p.Values) {
            $c = Get-RegValue $v.Path $v.Name
            $kind = $null; $data = $null
            if ($c) {
                $kind = [string]$c.Kind
                $data = if ($kind -eq 'MultiString') { @($c.Data) } else { Format-RegData $c.Kind $c.Data }
            }
            [pscustomobject]@{ policy = $p.Id; path = $v.Path; name = $v.Name; exists = [bool]$c; kind = $kind; data = $data }
        }
    }
    $obj = [pscustomobject]@{
        app      = "$AppName $AppVersion"
        created  = (Get-Date).ToString('s')
        computer = $env:COMPUTERNAME
        user     = $env:USERNAME
        values   = @($records)
    }
    $dir = Split-Path -Parent $File
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $obj | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $File -Encoding UTF8
}

function Import-PolicyBackup([string]$File) {
    $obj = Get-Content -LiteralPath $File -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $obj.values) { throw 'Файл не является резервной копией Policy Manager' }
    Invoke-AutoBackup
    $errors = 0
    foreach ($r in @($obj.values)) {
        try {
            if ($r.exists) { Set-RegValue $r.path $r.name $r.kind $r.data }
            else { Remove-RegValue $r.path $r.name }
        } catch {
            $errors++
            Write-Log "ОШИБКА восстановления $($r.path)\$($r.name): $($_.Exception.Message)"
        }
    }
    Write-Log "Восстановлено из $File (ошибок: $errors)"
    return $errors
}

function Resolve-ProfileFile([string]$NameOrPath) {
    if (Test-Path -LiteralPath $NameOrPath) { return (Resolve-Path -LiteralPath $NameOrPath).ProviderPath }
    $candidate = (Join-Path $ProfilesDir ($NameOrPath -replace '\.json$', '')) + '.json'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    throw "Профиль не найден: $NameOrPath"
}

function Invoke-PolicyProfile([string]$File) {
    $obj = Get-Content -LiteralPath $File -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $obj.policies) { throw 'В файле профиля нет раздела "policies"' }
    $ok = 0
    $messages = New-Object System.Collections.Generic.List[string]
    $reboot = $false
    foreach ($prop in $obj.policies.PSObject.Properties) {
        $p = Find-Policy $prop.Name
        if (-not $p) { $messages.Add("Неизвестная политика: $($prop.Name)"); continue }
        try {
            Set-PolicyOption $p ([string]$prop.Value)
            $ok++
            if ($p.Reboot) { $reboot = $true }
        } catch {
            $messages.Add("$($p.Name): $($_.Exception.Message)")
        }
    }
    Write-Log "Применён профиль $File (успешно: $ok, ошибок: $($messages.Count))"
    return [pscustomobject]@{ Name = $obj.name; Ok = $ok; Errors = $messages.ToArray(); Reboot = $reboot }
}

function Export-CurrentAsProfile([string]$File, [string]$Name) {
    $policies = [ordered]@{}
    foreach ($p in $script:Catalog) {
        $st = Get-SafePolicyState $p
        if ($st.Key -notin @('_unset', '_other', '_error')) { $policies[$p.Id] = $st.Key }
    }
    [pscustomobject]@{
        name        = $Name
        description = 'Сохранено {0:dd.MM.yyyy HH:mm} на {1}' -f (Get-Date), $env:COMPUTERNAME
        policies    = $policies
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $File -Encoding UTF8
}

function Reset-AllPolicies {
    $count = 0
    foreach ($p in $script:Catalog) {
        if ($p.NoUnset) { continue }
        if ((Get-SafePolicyState $p).Key -eq '_unset') { continue }
        Set-PolicyOption $p '_unset'
        $count++
    }
    return $count
}

#endregion

#region Сведения о системе

function Get-OSInfo {
    $cv = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $build = [int]$cv.CurrentBuild
    $name = [string]$cv.ProductName
    if ($build -ge 22000) { $name = $name -replace 'Windows 10', 'Windows 11' }
    $ver = if ($cv.DisplayVersion) { $cv.DisplayVersion } else { $cv.ReleaseId }
    [pscustomobject]@{
        Text   = "$name $ver (сборка $build.$($cv.UBR))"
        IsHome = ([string]$cv.EditionID) -like 'Core*'
    }
}

#endregion

#region Режим командной строки

function Invoke-Cli {
    if (-not $IsAdmin) { Write-Warning 'Нет прав администратора: изменить можно только политики HKCU.' }

    if ($List) {
        $script:Catalog | ForEach-Object {
            [pscustomobject]@{ Id = $_.Id; Категория = $_.Category; Политика = $_.Name; Состояние = (Get-SafePolicyState $_).Label }
        } | Format-Table -AutoSize | Out-String -Width 250 | Write-Host
    }
    if ($Backup) {
        $file = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Backup)
        Export-PolicyBackup $file
        Write-Host "Резервная копия сохранена: $file"
    }
    if ($Restore) {
        $file = (Resolve-Path -LiteralPath $Restore).ProviderPath
        $errors = Import-PolicyBackup $file
        Write-Host "Восстановлено из $file, ошибок: $errors"
    }
    if ($ApplyProfile) {
        $r = Invoke-PolicyProfile (Resolve-ProfileFile $ApplyProfile)
        Write-Host "Профиль «$($r.Name)»: применено $($r.Ok), ошибок $($r.Errors.Count)"
        $r.Errors | ForEach-Object { Write-Warning $_ }
        if ($r.Reboot) { Write-Host 'Для части изменений нужна перезагрузка.' }
    }
}

#endregion

#region Графический интерфейс

function Show-MainWindow {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()

    $os = Get-OSInfo
    $script:States = @{}
    $script:CurrentPolicy = $null
    $script:ComboKeys = New-Object System.Collections.Generic.List[string]

    $colorSet   = [System.Drawing.Color]::FromArgb(226, 242, 227)
    $colorOther = [System.Drawing.Color]::FromArgb(255, 239, 213)
    $colorError = [System.Drawing.Color]::FromArgb(255, 222, 222)
    $colorSys   = [System.Drawing.Color]::FromArgb(240, 240, 240)

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "$AppName $AppVersion — управление политиками Windows"
    $form.Size = New-Object System.Drawing.Size(1200, 780)
    $form.MinimumSize = New-Object System.Drawing.Size(900, 600)
    $form.StartPosition = 'CenterScreen'
    $form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
    try { $form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Join-Path $env:windir 'System32\gpedit.dll')) } catch { }

    #region Вспомогательные функции интерфейса

    function Show-Info([string]$Text) {
        [void][System.Windows.Forms.MessageBox]::Show($form, $Text, $AppName, 'OK', 'Information')
    }
    function Show-Error([string]$Text) {
        [void][System.Windows.Forms.MessageBox]::Show($form, $Text, $AppName, 'OK', 'Error')
    }
    function Confirm-Action([string]$Text) {
        return ([System.Windows.Forms.MessageBox]::Show($form, $Text, $AppName, 'YesNo', 'Warning') -eq 'Yes')
    }
    function Invoke-Safe([scriptblock]$Action) {
        try { & $Action }
        catch {
            $msg = $_.Exception.Message
            if ($_.Exception.InnerException) { $msg = $_.Exception.InnerException.Message }
            if (-not $IsAdmin) { $msg += "`r`n`r`nПрограмма запущена без прав администратора — политики HKLM изменить нельзя." }
            Write-Log "ОШИБКА: $msg"
            Show-Error $msg
        }
    }
    function New-ToolButton([string]$Text, [string]$Tip, [scriptblock]$OnClick) {
        $b = New-Object System.Windows.Forms.ToolStripButton
        $b.Text = $Text
        $b.ToolTipText = $Tip
        $b.add_Click($OnClick)
        [void]$tool.Items.Add($b)
        return $b
    }
    function Open-InRegedit([string]$Path) {
        $native = ConvertTo-NativeRegPath $Path
        $applet = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Applets\Regedit'
        $prefix = 'Computer\'
        $last = (Get-ItemProperty -LiteralPath $applet -Name LastKey -ErrorAction SilentlyContinue).LastKey
        if ($last -and $last -match '^([^\\]+\\)HKEY_') { $prefix = $Matches[1] }
        if (-not (Test-Path -LiteralPath $applet)) { New-Item -Path $applet -Force | Out-Null }
        Set-ItemProperty -LiteralPath $applet -Name LastKey -Value ($prefix + $native)
        Get-Process regedit -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Process regedit.exe
    }
    function Set-RowColor($Item, $State) {
        switch ($State.Key) {
            '_unset' { $Item.BackColor = [System.Drawing.SystemColors]::Window }
            '_other' { $Item.BackColor = $colorOther }
            '_error' { $Item.BackColor = $colorError }
            default  { $Item.BackColor = $colorSet }
        }
    }

    #endregion

    #region Панель инструментов

    $tool = New-Object System.Windows.Forms.ToolStrip
    $tool.GripStyle = 'Hidden'
    $tool.Padding = New-Object System.Windows.Forms.Padding(4, 2, 4, 2)

    [void](New-ToolButton 'Обновить' 'Перечитать состояние политик из реестра (F5)' { Invoke-Safe { Update-Everything } })
    [void]$tool.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

    [void](New-ToolButton 'Резервная копия' 'Сохранить текущие значения всех политик каталога в файл' {
        Invoke-Safe {
            $dlg = New-Object System.Windows.Forms.SaveFileDialog
            $dlg.Filter = 'Резервная копия (*.json)|*.json'
            $dlg.InitialDirectory = $BackupDir
            $dlg.FileName = 'backup_{0:yyyyMMdd_HHmmss}.json' -f (Get-Date)
            if ($dlg.ShowDialog($form) -eq 'OK') {
                Export-PolicyBackup $dlg.FileName
                Write-Log "Резервная копия: $($dlg.FileName)"
                Show-Info "Резервная копия сохранена:`r`n$($dlg.FileName)"
            }
        }
    })

    [void](New-ToolButton 'Восстановить' 'Вернуть значения политик из резервной копии' {
        Invoke-Safe {
            $dlg = New-Object System.Windows.Forms.OpenFileDialog
            $dlg.Filter = 'Резервная копия (*.json)|*.json'
            $dlg.InitialDirectory = $BackupDir
            if ($dlg.ShowDialog($form) -eq 'OK' -and (Confirm-Action "Восстановить политики из файла?`r`n$($dlg.FileName)")) {
                $errors = Import-PolicyBackup $dlg.FileName
                Update-Everything
                if ($errors) { Show-Error "Восстановлено с ошибками: $errors. Подробности в журнале." }
                else { Show-Info 'Политики восстановлены.' }
            }
        }
    })

    $ddProfiles = New-Object System.Windows.Forms.ToolStripDropDownButton
    $ddProfiles.Text = 'Профили'
    $ddProfiles.ToolTipText = 'Применить готовый набор настроек'
    [void]$ddProfiles.DropDownItems.Add('...')
    [void]$tool.Items.Add($ddProfiles)
    $ddProfiles.add_DropDownOpening({
        $ddProfiles.DropDownItems.Clear()
        if (Test-Path -LiteralPath $ProfilesDir) {
            foreach ($f in Get-ChildItem -LiteralPath $ProfilesDir -Filter *.json | Sort-Object Name) {
                $title = $f.BaseName
                try {
                    $pj = Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                    if ($pj.name) { $title = $pj.name }
                    if ($pj.description) { $title += ' — ' + $pj.description }
                } catch { }
                $mi = New-Object System.Windows.Forms.ToolStripMenuItem($title)
                $mi.Tag = $f.FullName
                $mi.add_Click({
                    param($s, $e)
                    Invoke-Safe {
                        if (Confirm-Action "Применить профиль?`r`n$($s.Text)`r`n`r`nПеред изменениями будет создана резервная копия.") {
                            $r = Invoke-PolicyProfile $s.Tag
                            Update-Everything
                            $msg = "Профиль «$($r.Name)»: применено политик — $($r.Ok)."
                            if ($r.Errors.Count) { $msg += "`r`n`r`nОшибки:`r`n" + ($r.Errors -join "`r`n") }
                            if ($r.Reboot) { $msg += "`r`n`r`nДля части изменений нужна перезагрузка." }
                            Show-Info $msg
                        }
                    }
                })
                [void]$ddProfiles.DropDownItems.Add($mi)
            }
        }
        [void]$ddProfiles.DropDownItems.Add((New-Object System.Windows.Forms.ToolStripSeparator))
        $miOpen = New-Object System.Windows.Forms.ToolStripMenuItem('Применить профиль из файла...')
        $miOpen.add_Click({
            Invoke-Safe {
                $dlg = New-Object System.Windows.Forms.OpenFileDialog
                $dlg.Filter = 'Профиль (*.json)|*.json'
                if ($dlg.ShowDialog($form) -eq 'OK') {
                    $r = Invoke-PolicyProfile $dlg.FileName
                    Update-Everything
                    $msg = "Применено политик — $($r.Ok)."
                    if ($r.Errors.Count) { $msg += "`r`n`r`nОшибки:`r`n" + ($r.Errors -join "`r`n") }
                    Show-Info $msg
                }
            }
        })
        [void]$ddProfiles.DropDownItems.Add($miOpen)
        $miSave = New-Object System.Windows.Forms.ToolStripMenuItem('Сохранить текущие настройки как профиль...')
        $miSave.add_Click({
            Invoke-Safe {
                $dlg = New-Object System.Windows.Forms.SaveFileDialog
                $dlg.Filter = 'Профиль (*.json)|*.json'
                $dlg.InitialDirectory = $ProfilesDir
                $dlg.FileName = 'my-profile.json'
                if ($dlg.ShowDialog($form) -eq 'OK') {
                    Export-CurrentAsProfile $dlg.FileName ([IO.Path]::GetFileNameWithoutExtension($dlg.FileName))
                    Show-Info "Профиль сохранён:`r`n$($dlg.FileName)"
                }
            }
        })
        [void]$ddProfiles.DropDownItems.Add($miSave)
    })

    [void](New-ToolButton 'Сбросить всё' 'Вернуть все политики каталога в состояние «Не задано»' {
        Invoke-Safe {
            if (Confirm-Action "Сбросить все политики каталога в «Не задано»?`r`n(UAC, подпись SMB и длинные пути не затрагиваются.)`r`n`r`nПеред изменениями будет создана резервная копия.") {
                $n = Reset-AllPolicies
                Update-Everything
                Show-Info "Сброшено политик: $n"
            }
        }
    })
    [void]$tool.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

    [void](New-ToolButton 'gpupdate /force' 'Принудительно применить групповые политики' {
        Invoke-Safe { Start-Process cmd.exe -ArgumentList '/c', 'gpupdate /force & pause' }
    })
    [void](New-ToolButton 'Отчёт gpresult' 'HTML-отчёт о применённых групповых политиках' {
        Invoke-Safe {
            $file = Join-Path $env:TEMP ('gpresult_{0:yyyyMMdd_HHmmss}.html' -f (Get-Date))
            $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
            try {
                $proc = Start-Process gpresult.exe -ArgumentList '/h', "`"$file`"", '/f' -Wait -PassThru -WindowStyle Hidden
            } finally { $form.Cursor = [System.Windows.Forms.Cursors]::Default }
            if ($proc.ExitCode -eq 0 -and (Test-Path -LiteralPath $file)) { Start-Process $file }
            else { Show-Error "gpresult завершился с кодом $($proc.ExitCode)." }
        }
    })
    [void](New-ToolButton 'gpedit.msc' 'Открыть редактор локальной групповой политики' {
        Invoke-Safe {
            if (Test-Path -LiteralPath (Join-Path $env:windir 'System32\gpedit.msc')) { Start-Process mmc.exe -ArgumentList 'gpedit.msc' }
            else { Show-Info 'gpedit.msc отсутствует (редакция Home). Эта программа работает с политиками напрямую через реестр.' }
        }
    })
    [void](New-ToolButton 'Перезапуск Проводника' 'Применить изменения интерфейса без выхода из системы' {
        Invoke-Safe {
            Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force
            # Windows перезапускает Проводник сама; запускаем вручную, только если этого не произошло
            for ($i = 0; $i -lt 10 -and -not (Get-Process explorer -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
            if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }
        }
    })
    [void]$tool.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
    [void](New-ToolButton 'Журнал' 'Открыть журнал изменений' {
        Invoke-Safe {
            if (-not (Test-Path -LiteralPath $LogFile)) { Write-Log 'Журнал создан' }
            Start-Process notepad.exe -ArgumentList "`"$LogFile`""
        }
    })
    [void](New-ToolButton 'Папка данных' 'Резервные копии и журнал' { Invoke-Safe { Start-Process explorer.exe -ArgumentList "`"$DataDir`"" } })

    if (-not $IsAdmin) {
        $btnElevate = New-ToolButton 'Запустить от администратора' 'Перезапустить программу с правами администратора' {
            Invoke-Safe { Start-Elevated; $form.Close() }
        }
        $btnElevate.ForeColor = [System.Drawing.Color]::DarkRed
        $btnElevate.Alignment = 'Right'
    }

    #endregion

    #region Вкладка «Каталог политик»

    $tabs = New-Object System.Windows.Forms.TabControl
    $tabs.Dock = 'Fill'
    $tabCatalog = New-Object System.Windows.Forms.TabPage('Каталог политик')
    $tabRegistry = New-Object System.Windows.Forms.TabPage('Все политики в реестре')
    $tabs.TabPages.Add($tabCatalog)
    $tabs.TabPages.Add($tabRegistry)

    $split = New-Object System.Windows.Forms.SplitContainer
    $split.Dock = 'Fill'
    $split.FixedPanel = 'Panel1'
    $tabCatalog.Controls.Add($split)

    # Левая панель: поиск и категории
    $left = New-Object System.Windows.Forms.TableLayoutPanel
    $left.Dock = 'Fill'
    $left.ColumnCount = 1
    $left.RowCount = 4
    [void]$left.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))
    [void]$left.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))
    [void]$left.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))
    [void]$left.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 100)))
    $split.Panel1.Controls.Add($left)

    $lblSearch = New-Object System.Windows.Forms.Label
    $lblSearch.Text = 'Поиск:'
    $lblSearch.AutoSize = $true
    $lblSearch.Margin = New-Object System.Windows.Forms.Padding(3, 6, 3, 0)
    $left.Controls.Add($lblSearch, 0, 0)

    $txtSearch = New-Object System.Windows.Forms.TextBox
    $txtSearch.Dock = 'Fill'
    $left.Controls.Add($txtSearch, 0, 1)

    $lblCat = New-Object System.Windows.Forms.Label
    $lblCat.Text = 'Категории:'
    $lblCat.AutoSize = $true
    $lblCat.Margin = New-Object System.Windows.Forms.Padding(3, 8, 3, 0)
    $left.Controls.Add($lblCat, 0, 2)

    $lbCat = New-Object System.Windows.Forms.ListBox
    $lbCat.Dock = 'Fill'
    $lbCat.IntegralHeight = $false
    $lbCat.ItemHeight = 20
    $left.Controls.Add($lbCat, 0, 3)

    $script:CategoryKeys = New-Object System.Collections.Generic.List[string]
    [void]$lbCat.Items.Add('Все политики');  $script:CategoryKeys.Add('_all')
    [void]$lbCat.Items.Add('Настроенные');   $script:CategoryKeys.Add('_configured')
    foreach ($c in ($script:Catalog | ForEach-Object { $_.Category } | Select-Object -Unique)) {
        [void]$lbCat.Items.Add($c); $script:CategoryKeys.Add($c)
    }

    # Правая часть: список и подробности
    $split2 = New-Object System.Windows.Forms.SplitContainer
    $split2.Dock = 'Fill'
    $split2.Orientation = 'Horizontal'
    $split2.FixedPanel = 'Panel2'
    $split.Panel2.Controls.Add($split2)

    $lv = New-Object System.Windows.Forms.ListView
    $lv.Dock = 'Fill'
    $lv.View = 'Details'
    $lv.FullRowSelect = $true
    $lv.MultiSelect = $false
    $lv.HideSelection = $false
    $lv.ShowGroups = $true
    [void]$lv.Columns.Add('Политика', 430)
    [void]$lv.Columns.Add('Текущее состояние', 330)
    [void]$lv.Columns.Add('Область', 90)
    $split2.Panel1.Controls.Add($lv)

    $ctx = New-Object System.Windows.Forms.ContextMenuStrip
    $miReg = New-Object System.Windows.Forms.ToolStripMenuItem('Открыть раздел в regedit')
    $miCopy = New-Object System.Windows.Forms.ToolStripMenuItem('Копировать пути реестра')
    [void]$ctx.Items.Add($miReg)
    [void]$ctx.Items.Add($miCopy)
    $lv.ContextMenuStrip = $ctx
    $miReg.add_Click({ Invoke-Safe { if ($script:CurrentPolicy) { Open-InRegedit $script:CurrentPolicy.Values[0].Path } } })
    $miCopy.add_Click({
        Invoke-Safe {
            if ($script:CurrentPolicy) {
                $text = ($script:CurrentPolicy.Values | ForEach-Object { (ConvertTo-NativeRegPath $_.Path) + '\' + $_.Name }) -join "`r`n"
                [System.Windows.Forms.Clipboard]::SetText($text)
            }
        }
    })

    $det = New-Object System.Windows.Forms.TableLayoutPanel
    $det.Dock = 'Fill'
    $det.ColumnCount = 1
    $det.RowCount = 4
    $det.Padding = New-Object System.Windows.Forms.Padding(4)
    [void]$det.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))
    [void]$det.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 50)))
    [void]$det.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 50)))
    [void]$det.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))
    $split2.Panel2.Controls.Add($det)

    $lblName = New-Object System.Windows.Forms.Label
    $lblName.AutoSize = $true
    $lblName.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
    $lblName.Text = 'Выберите политику в списке'
    $det.Controls.Add($lblName, 0, 0)

    $txtDesc = New-Object System.Windows.Forms.TextBox
    $txtDesc.Multiline = $true
    $txtDesc.ReadOnly = $true
    $txtDesc.ScrollBars = 'Vertical'
    $txtDesc.Dock = 'Fill'
    $txtDesc.BackColor = [System.Drawing.SystemColors]::Window
    $det.Controls.Add($txtDesc, 0, 1)

    $txtReg = New-Object System.Windows.Forms.TextBox
    $txtReg.Multiline = $true
    $txtReg.ReadOnly = $true
    $txtReg.ScrollBars = 'Both'
    $txtReg.WordWrap = $false
    $txtReg.Dock = 'Fill'
    $txtReg.Font = New-Object System.Drawing.Font('Consolas', 9)
    $det.Controls.Add($txtReg, 0, 2)

    $flow = New-Object System.Windows.Forms.FlowLayoutPanel
    $flow.AutoSize = $true
    $flow.Dock = 'Fill'
    $flow.WrapContents = $true
    $det.Controls.Add($flow, 0, 3)

    $lblValue = New-Object System.Windows.Forms.Label
    $lblValue.Text = 'Значение:'
    $lblValue.AutoSize = $true
    $lblValue.Margin = New-Object System.Windows.Forms.Padding(3, 8, 3, 3)
    $flow.Controls.Add($lblValue)

    $cmb = New-Object System.Windows.Forms.ComboBox
    $cmb.DropDownStyle = 'DropDownList'
    $cmb.Width = 460
    $cmb.Margin = New-Object System.Windows.Forms.Padding(3, 4, 3, 3)
    $flow.Controls.Add($cmb)

    $btnApply = New-Object System.Windows.Forms.Button
    $btnApply.Text = 'Применить'
    $btnApply.AutoSize = $true
    $flow.Controls.Add($btnApply)

    $btnUnset = New-Object System.Windows.Forms.Button
    $btnUnset.Text = 'Не задано'
    $btnUnset.AutoSize = $true
    $flow.Controls.Add($btnUnset)

    $lblHint = New-Object System.Windows.Forms.Label
    $lblHint.AutoSize = $true
    $lblHint.ForeColor = [System.Drawing.Color]::DarkRed
    $lblHint.Margin = New-Object System.Windows.Forms.Padding(8, 8, 3, 3)
    $flow.Controls.Add($lblHint)

    $cmb.Enabled = $false; $btnApply.Enabled = $false; $btnUnset.Enabled = $false

    #endregion

    #region Вкладка «Все политики в реестре»

    $regLayout = New-Object System.Windows.Forms.TableLayoutPanel
    $regLayout.Dock = 'Fill'
    $regLayout.ColumnCount = 1
    $regLayout.RowCount = 2
    [void]$regLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))
    [void]$regLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 100)))
    $tabRegistry.Controls.Add($regLayout)

    $regBar = New-Object System.Windows.Forms.FlowLayoutPanel
    $regBar.AutoSize = $true
    $regBar.Dock = 'Fill'
    $regLayout.Controls.Add($regBar, 0, 0)

    $btnScan = New-Object System.Windows.Forms.Button
    $btnScan.Text = 'Сканировать'
    $btnScan.AutoSize = $true
    $regBar.Controls.Add($btnScan)

    $btnRegDelete = New-Object System.Windows.Forms.Button
    $btnRegDelete.Text = 'Удалить выбранные'
    $btnRegDelete.AutoSize = $true
    $regBar.Controls.Add($btnRegDelete)

    $btnRegOpen = New-Object System.Windows.Forms.Button
    $btnRegOpen.Text = 'Открыть в regedit'
    $btnRegOpen.AutoSize = $true
    $regBar.Controls.Add($btnRegOpen)

    $btnRegExport = New-Object System.Windows.Forms.Button
    $btnRegExport.Text = 'Экспорт в .reg'
    $btnRegExport.AutoSize = $true
    $regBar.Controls.Add($btnRegExport)

    $lblRegFilter = New-Object System.Windows.Forms.Label
    $lblRegFilter.Text = 'Фильтр:'
    $lblRegFilter.AutoSize = $true
    $lblRegFilter.Margin = New-Object System.Windows.Forms.Padding(12, 8, 3, 3)
    $regBar.Controls.Add($lblRegFilter)

    $txtRegFilter = New-Object System.Windows.Forms.TextBox
    $txtRegFilter.Width = 300
    $txtRegFilter.Margin = New-Object System.Windows.Forms.Padding(3, 5, 3, 3)
    $regBar.Controls.Add($txtRegFilter)

    $lblRegInfo = New-Object System.Windows.Forms.Label
    $lblRegInfo.AutoSize = $true
    $lblRegInfo.ForeColor = [System.Drawing.Color]::DimGray
    $lblRegInfo.Margin = New-Object System.Windows.Forms.Padding(12, 8, 3, 3)
    $lblRegInfo.Text = 'Серым — системные значения (CurrentVersion\Policies), их удаление может нарушить работу Windows.'
    $regBar.Controls.Add($lblRegInfo)

    $lv2 = New-Object System.Windows.Forms.ListView
    $lv2.Dock = 'Fill'
    $lv2.View = 'Details'
    $lv2.FullRowSelect = $true
    $lv2.MultiSelect = $true
    $lv2.HideSelection = $false
    [void]$lv2.Columns.Add('Раздел', 560)
    [void]$lv2.Columns.Add('Параметр', 240)
    [void]$lv2.Columns.Add('Тип', 90)
    [void]$lv2.Columns.Add('Значение', 180)
    [void]$lv2.Columns.Add('В каталоге', 80)
    $regLayout.Controls.Add($lv2, 0, 1)

    $script:RegScan = @()

    #endregion

    #region Строка состояния

    $status = New-Object System.Windows.Forms.StatusStrip
    $stOS = New-Object System.Windows.Forms.ToolStripStatusLabel
    $stOS.Text = $os.Text
    $stAdmin = New-Object System.Windows.Forms.ToolStripStatusLabel
    if ($IsAdmin) { $stAdmin.Text = 'Администратор' }
    else { $stAdmin.Text = 'Без прав администратора: доступны только политики HKCU'; $stAdmin.ForeColor = [System.Drawing.Color]::DarkRed }
    $stCount = New-Object System.Windows.Forms.ToolStripStatusLabel
    $stCount.Spring = $true
    $stCount.TextAlign = 'MiddleRight'
    [void]$status.Items.Add($stOS)
    [void]$status.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
    [void]$status.Items.Add($stAdmin)
    if ($os.IsHome) {
        $stHome = New-Object System.Windows.Forms.ToolStripStatusLabel
        $stHome.Text = 'Home: часть политик Pro/Enterprise игнорируется'
        $stHome.ForeColor = [System.Drawing.Color]::DarkOrange
        [void]$status.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
        [void]$status.Items.Add($stHome)
    }
    [void]$status.Items.Add($stCount)

    #endregion

    #region Логика интерфейса

    function Update-StatusCount {
        $configured = @($script:Catalog | Where-Object { $script:States[$_.Id].Key -ne '_unset' }).Count
        $stCount.Text = "Политик в каталоге: $($script:Catalog.Count), настроено: $configured, показано: $($lv.Items.Count)"
    }

    function Update-PolicyList {
        $sel = $lbCat.SelectedIndex
        $filter = if ($sel -ge 0) { $script:CategoryKeys[$sel] } else { '_all' }
        $q = $txtSearch.Text.Trim()
        $selectedId = if ($script:CurrentPolicy) { $script:CurrentPolicy.Id } else { $null }

        $lv.BeginUpdate()
        $lv.Items.Clear()
        $lv.Groups.Clear()
        $groups = @{}
        foreach ($p in $script:Catalog) {
            $st = $script:States[$p.Id]
            if ($filter -eq '_configured') { if ($st.Key -eq '_unset') { continue } }
            elseif ($filter -ne '_all' -and $p.Category -ne $filter) { continue }
            if ($q) {
                $hay = '{0} {1} {2} {3}' -f $p.Name, $p.Description, $p.Id, (($p.Values | ForEach-Object { $_.Name }) -join ' ')
                if ($hay.IndexOf($q, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
            }
            if (-not $groups.ContainsKey($p.Category)) {
                $g = New-Object System.Windows.Forms.ListViewGroup($p.Category, $p.Category)
                [void]$lv.Groups.Add($g)
                $groups[$p.Category] = $g
            }
            $item = New-Object System.Windows.Forms.ListViewItem($p.Name)
            [void]$item.SubItems.Add($st.Label)
            [void]$item.SubItems.Add((Get-PolicyScope $p))
            $item.Tag = $p
            $item.Group = $groups[$p.Category]
            $item.ToolTipText = $p.Description
            Set-RowColor $item $st
            [void]$lv.Items.Add($item)
            if ($p.Id -eq $selectedId) { $item.Selected = $true }
        }
        $lv.EndUpdate()
        Update-StatusCount
    }

    function Show-Details($p) {
        $script:CurrentPolicy = $p
        $lblName.Text = $p.Name
        $txtDesc.Text = $p.Description
        $lines = foreach ($v in $p.Values) {
            $c = Get-RegValue $v.Path $v.Name
            $cur = if ($c) { '= ' + (Format-RegData $c.Kind $c.Data) } else { '(отсутствует)' }
            '{0}\{1}  [{2}]  {3}' -f (ConvertTo-NativeRegPath $v.Path), $v.Name, $v.Type, $cur
        }
        $txtReg.Text = ($lines -join "`r`n")

        $cmb.Items.Clear()
        $script:ComboKeys.Clear()
        if (-not $p.NoUnset) { [void]$cmb.Items.Add('Не задано (удалить параметры)'); $script:ComboKeys.Add('_unset') }
        foreach ($o in $p.Options) { [void]$cmb.Items.Add($o.Label); $script:ComboKeys.Add($o.Key) }
        $cmb.SelectedIndex = $script:ComboKeys.IndexOf($script:States[$p.Id].Key)

        $hints = @()
        if ($p.Reboot) { $hints += 'Требуется перезагрузка' }
        if ((Get-PolicyScope $p) -like '*HKCU*') { $hints += 'Действует для текущего пользователя' }
        if (-not $IsAdmin -and (Get-PolicyScope $p) -like '*HKLM*') { $hints += 'Нужны права администратора' }
        $lblHint.Text = $hints -join ' · '

        $cmb.Enabled = $true
        $btnApply.Enabled = $true
        $btnUnset.Enabled = -not $p.NoUnset
    }

    function Update-CurrentItem {
        $p = $script:CurrentPolicy
        $st = Get-SafePolicyState $p
        $script:States[$p.Id] = $st
        foreach ($item in $lv.Items) {
            if ($item.Tag.Id -eq $p.Id) {
                $item.SubItems[1].Text = $st.Label
                Set-RowColor $item $st
            }
        }
        Show-Details $p
        Update-StatusCount
    }

    function Invoke-ApplyCurrent([string]$Key) {
        $p = $script:CurrentPolicy
        if (-not $p) { return }
        if ($p.Description -match 'ВНИМАНИЕ' -and $Key -ne '_unset') {
            if (-not (Confirm-Action "$($p.Description)`r`n`r`nПродолжить?")) { return }
        }
        try {
            Set-PolicyOption $p $Key
        } finally {
            Update-CurrentItem
        }
        if ($p.Reboot) { Show-Info 'Изменение вступит в силу после перезагрузки.' }
    }

    function Update-Everything {
        $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
        try {
            foreach ($p in $script:Catalog) { $script:States[$p.Id] = Get-SafePolicyState $p }
            Update-PolicyList
            if ($script:CurrentPolicy) { Show-Details $script:CurrentPolicy }
            if ($script:RegScan.Count) { Update-RegistryScan }
        } finally {
            $form.Cursor = [System.Windows.Forms.Cursors]::Default
        }
    }

    function Update-RegistryList {
        $q = $txtRegFilter.Text.Trim()
        $known = @{}
        foreach ($p in $script:Catalog) { foreach ($v in $p.Values) { $known[("$($v.Path)|$($v.Name)").ToLowerInvariant()] = $true } }
        $lv2.BeginUpdate()
        $lv2.Items.Clear()
        foreach ($r in $script:RegScan) {
            if ($q -and ("$($r.Path) $($r.Name) $($r.Data)").IndexOf($q, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
            $name = if ($r.Name -eq '') { '(По умолчанию)' } else { $r.Name }
            $item = New-Object System.Windows.Forms.ListViewItem((ConvertTo-NativeRegPath $r.Path))
            [void]$item.SubItems.Add($name)
            [void]$item.SubItems.Add($r.Kind)
            [void]$item.SubItems.Add($r.Data)
            $inCatalog = $known.ContainsKey(("$($r.Path)|$($r.Name)").ToLowerInvariant())
            [void]$item.SubItems.Add($(if ($inCatalog) { 'да' } else { '' }))
            if ($r.Path -match 'CurrentVersion\\Policies') { $item.BackColor = $colorSys }
            $item.Tag = $r
            [void]$lv2.Items.Add($item)
        }
        $lv2.EndUpdate()
        $tabRegistry.Text = "Все политики в реестре ($($lv2.Items.Count))"
    }

    function Update-RegistryScan {
        $script:RegScan = @(Get-AllRegistryPolicies)
        Update-RegistryList
    }

    #endregion

    #region События

    $lbCat.add_SelectedIndexChanged({ Invoke-Safe { Update-PolicyList } })
    $txtSearch.add_TextChanged({ Invoke-Safe { Update-PolicyList } })
    $lv.add_SelectedIndexChanged({
        Invoke-Safe { if ($lv.SelectedItems.Count -gt 0) { Show-Details $lv.SelectedItems[0].Tag } }
    })
    $lv.ShowItemToolTips = $true

    $btnApply.add_Click({
        Invoke-Safe {
            if ($cmb.SelectedIndex -lt 0) { Show-Info 'Выберите значение.'; return }
            Invoke-ApplyCurrent $script:ComboKeys[$cmb.SelectedIndex]
        }
    })
    $btnUnset.add_Click({ Invoke-Safe { Invoke-ApplyCurrent '_unset' } })

    $btnScan.add_Click({ Invoke-Safe { $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor; try { Update-RegistryScan } finally { $form.Cursor = [System.Windows.Forms.Cursors]::Default } } })
    $txtRegFilter.add_TextChanged({ Invoke-Safe { Update-RegistryList } })

    $btnRegOpen.add_Click({
        Invoke-Safe { if ($lv2.SelectedItems.Count -gt 0) { Open-InRegedit $lv2.SelectedItems[0].Tag.Path } }
    })
    $lv2.add_DoubleClick({ Invoke-Safe { if ($lv2.SelectedItems.Count -gt 0) { Open-InRegedit $lv2.SelectedItems[0].Tag.Path } } })

    $btnRegDelete.add_Click({
        Invoke-Safe {
            $sel = @($lv2.SelectedItems | ForEach-Object { $_.Tag })
            if (-not $sel.Count) { Show-Info 'Выберите параметры для удаления.'; return }
            $msg = "Удалить выбранные параметры ($($sel.Count))?`r`n`r`n" + (($sel | Select-Object -First 15 | ForEach-Object { (ConvertTo-NativeRegPath $_.Path) + '\' + $_.Name }) -join "`r`n")
            if ($sel | Where-Object { $_.Path -match 'CurrentVersion\\Policies' }) {
                $msg += "`r`n`r`nВНИМАНИЕ: среди них есть системные значения CurrentVersion\Policies (например, настройки UAC). Удаляйте их, только если точно понимаете последствия."
            }
            if (-not (Confirm-Action $msg)) { return }
            Invoke-AutoBackup
            foreach ($r in $sel) {
                Remove-RegValue $r.Path $r.Name
                Write-Log "Удалён параметр $(ConvertTo-NativeRegPath $r.Path)\$($r.Name) (было: $($r.Data))"
            }
            Update-Everything
        }
    })

    $btnRegExport.add_Click({
        Invoke-Safe {
            $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
            $dlg.Description = 'Папка для .reg-файлов со всеми ветками политик'
            $dlg.SelectedPath = $BackupDir
            if ($dlg.ShowDialog($form) -ne 'OK') { return }
            $stamp = '{0:yyyyMMdd_HHmmss}' -f (Get-Date)
            $saved = @()
            foreach ($root in $PolicyRoots) {
                $native = ConvertTo-NativeRegPath $root
                $file = Join-Path $dlg.SelectedPath (($native -replace '^HKEY_LOCAL_MACHINE', 'HKLM' -replace '^HKEY_CURRENT_USER', 'HKCU' -replace '\\', '_') + "_$stamp.reg")
                $proc = Start-Process reg.exe -ArgumentList 'export', "`"$native`"", "`"$file`"", '/y' -Wait -PassThru -WindowStyle Hidden
                if ($proc.ExitCode -eq 0) { $saved += $file }
            }
            Show-Info ("Сохранено файлов: $($saved.Count)`r`n" + ($saved -join "`r`n"))
        }
    })

    $form.KeyPreview = $true
    $form.add_KeyDown({
        param($s, $e)
        if ($e.KeyCode -eq 'F5') { Invoke-Safe { Update-Everything } }
    })

    $form.add_Shown({
        Invoke-Safe {
            $split.SplitterDistance = 230
            $split2.SplitterDistance = [Math]::Max(200, $split2.Height - 260)
            $lbCat.SelectedIndex = 0
            Update-Everything
        }
    })

    #endregion

    $form.Controls.Add($tabs)
    $form.Controls.Add($status)
    $form.Controls.Add($tool)

    [void]$form.ShowDialog()
    $form.Dispose()
}

#endregion

#region Точка входа

try {
    $script:Catalog = @(Import-Catalog)
    if ($IsCli) {
        Invoke-Cli
    } else {
        Show-MainWindow
    }
} catch {
    if ($IsCli) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show("Ошибка запуска:`r`n$($_.Exception.Message)", $AppName, 'OK', 'Error')
}

#endregion
