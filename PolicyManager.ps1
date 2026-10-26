#Requires -Version 5.1
<#
.SYNOPSIS
    Policy Manager — управление политиками Windows 10/11 (в том числе Home) через реестр.

.DESCRIPTION
    Без параметров открывает графический интерфейс. Каталог политик хранится в policies.json,
    готовые наборы настроек — в папке profiles.

.EXAMPLE
    .\PolicyManager.ps1
    .\PolicyManager.ps1 -ExportRestrictions D:\restrictions.json
    .\PolicyManager.ps1 -ImportRestrictions D:\restrictions.json
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
    [string]$ExportRestrictions,
    [string]$ImportRestrictions,
    [switch]$NoElevate
)

$ErrorActionPreference = 'Stop'

$AppName     = 'Policy Manager'
$AppVersion  = '2.0'
$ScriptDir   = if ($PSScriptRoot) { $PSScriptRoot } elseif ($PSCommandPath) { Split-Path -Parent $PSCommandPath } else { '' }
$CatalogFile = if ($ScriptDir) { Join-Path $ScriptDir 'policies.json' } else { $null }
$ProfilesDir = if ($ScriptDir) { Join-Path $ScriptDir 'profiles' } else { $null }
$IsCli       = $List -or $ApplyProfile -or $Backup -or $Restore -or $ExportRestrictions -or $ImportRestrictions

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

# Перезапуск с правами администратора — и для .ps1, и для скомпилированного .exe
function Start-Elevated {
    if ($PSCommandPath -and $PSCommandPath -match '\.ps1$') {
        $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$PSCommandPath`"")
        Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $argList -Verb RunAs
    } else {
        # Запущен как .exe — перезапускаем сам исполняемый файл
        $exe = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
        Start-Process -FilePath $exe -Verb RunAs
    }
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

# --- Встроенные ресурсы (чтобы программа работала как один файл или .exe) ---
$EmbeddedPoliciesJson = @'
[
  {
    "id": "telemetry",
    "category": "Конфиденциальность",
    "name": "Уровень телеметрии (диагностические данные)",
    "description": "Сколько диагностических данных Windows отправляет в Microsoft. Уровень 0 действует только в Enterprise/Education, в Home/Pro он работает как уровень 1.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection",
    "values": [ { "name": "AllowTelemetry", "type": "DWord" } ],
    "options": [
      { "key": "0", "label": "0 — Безопасность (минимум, Enterprise/Education)", "data": [0] },
      { "key": "1", "label": "1 — Обязательные данные", "data": [1] },
      { "key": "3", "label": "3 — Необязательные (полные) данные", "data": [3] }
    ]
  },
  {
    "id": "feedback_notifications",
    "category": "Конфиденциальность",
    "name": "Запросы отзывов (Feedback)",
    "description": "Отключает всплывающие уведомления с просьбой оставить отзыв о Windows.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection",
    "values": [ { "name": "DoNotShowFeedbackNotifications", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Не показывать запросы отзывов", "data": [1] },
      { "key": "on", "label": "Показывать", "data": [0] }
    ]
  },
  {
    "id": "advertising_id",
    "category": "Конфиденциальность",
    "name": "Рекламный идентификатор",
    "description": "Отключает рекламный ID, по которому приложения показывают персонализированную рекламу.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\AdvertisingInfo",
    "values": [ { "name": "DisabledByGroupPolicy", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить рекламный ID", "data": [1] }
    ]
  },
  {
    "id": "activity_history",
    "category": "Конфиденциальность",
    "name": "Журнал действий (Activity History)",
    "description": "Сбор и отправка истории действий пользователя (открытые файлы, приложения, сайты).",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System",
    "values": [
      { "name": "EnableActivityFeed", "type": "DWord" },
      { "name": "PublishUserActivities", "type": "DWord" },
      { "name": "UploadUserActivities", "type": "DWord" }
    ],
    "options": [
      { "key": "off", "label": "Отключить журнал действий", "data": [0, 0, 0] },
      { "key": "on", "label": "Разрешить", "data": [1, 1, 1] }
    ]
  },
  {
    "id": "location",
    "category": "Конфиденциальность",
    "name": "Служба определения местоположения",
    "description": "Полностью запрещает определение местоположения для системы и приложений.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors",
    "values": [ { "name": "DisableLocation", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Запретить определение местоположения", "data": [1] },
      { "key": "on", "label": "Разрешить", "data": [0] }
    ]
  },
  {
    "id": "input_personalization",
    "category": "Конфиденциальность",
    "name": "Персонализация рукописного и клавиатурного ввода",
    "description": "Запрещает Windows собирать образцы набора текста и рукописного ввода.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\InputPersonalization",
    "values": [ { "name": "AllowInputPersonalization", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Запретить", "data": [0] },
      { "key": "on", "label": "Разрешить", "data": [1] }
    ]
  },
  {
    "id": "error_reporting",
    "category": "Конфиденциальность",
    "name": "Отчёты об ошибках Windows",
    "description": "Отключает отправку отчётов об ошибках (Windows Error Reporting).",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting",
    "values": [ { "name": "Disabled", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить отчёты об ошибках", "data": [1] },
      { "key": "on", "label": "Включить", "data": [0] }
    ]
  },
  {
    "id": "cortana",
    "category": "Конфиденциальность",
    "name": "Cortana",
    "description": "Запрещает использование Cortana.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search",
    "values": [ { "name": "AllowCortana", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Запретить Cortana", "data": [0] },
      { "key": "on", "label": "Разрешить", "data": [1] }
    ]
  },
  {
    "id": "web_search",
    "category": "Конфиденциальность",
    "name": "Поиск в Интернете из меню Пуск",
    "description": "Убирает результаты Bing и веб-подсказки из поиска Windows. Последний параметр пишется в HKCU (текущий пользователь).",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search",
    "values": [
      { "name": "DisableWebSearch", "type": "DWord" },
      { "name": "ConnectedSearchUseWeb", "type": "DWord" },
      { "name": "DisableSearchBoxSuggestions", "type": "DWord", "path": "HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer" }
    ],
    "options": [
      { "key": "off", "label": "Отключить веб-поиск", "data": [1, 0, 1] },
      { "key": "on", "label": "Разрешить веб-поиск", "data": [0, 1, 0] }
    ]
  },
  {
    "id": "consumer_features",
    "category": "Конфиденциальность",
    "name": "Автоустановка рекомендуемых приложений",
    "description": "Запрещает Windows самостоятельно устанавливать «рекомендуемые» приложения и игры (Candy Crush и т.п.). Полностью действует в Enterprise/Education.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent",
    "values": [ { "name": "DisableWindowsConsumerFeatures", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить", "data": [1] }
    ]
  },
  {
    "id": "tips",
    "category": "Конфиденциальность",
    "name": "Советы и подсказки Windows",
    "description": "Отключает показ советов по использованию Windows.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent",
    "values": [ { "name": "DisableSoftLanding", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить советы", "data": [1] }
    ]
  },
  {
    "id": "spotlight",
    "category": "Конфиденциальность",
    "name": "Windows: интересное (Spotlight)",
    "description": "Отключает все функции «Windows: интересное» (фоны и реклама на экране блокировки). Для текущего пользователя.",
    "path": "HKCU:\\Software\\Policies\\Microsoft\\Windows\\CloudContent",
    "values": [ { "name": "DisableWindowsSpotlightFeatures", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить", "data": [1] }
    ]
  },
  {
    "id": "copilot",
    "category": "Конфиденциальность",
    "name": "Windows Copilot",
    "description": "Отключает встроенный Windows Copilot (для текущего пользователя и для всех). На новых сборках Copilot — отдельное приложение, его можно просто удалить.",
    "path": "HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot",
    "values": [
      { "name": "TurnOffWindowsCopilot", "type": "DWord" },
      { "name": "TurnOffWindowsCopilot", "type": "DWord", "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot" }
    ],
    "options": [
      { "key": "off", "label": "Отключить Copilot", "data": [1, 1] }
    ]
  },
  {
    "id": "recall",
    "category": "Конфиденциальность",
    "name": "Recall (снимки экрана ИИ)",
    "description": "Запрещает функции Recall сохранять снимки экрана для анализа ИИ (Windows 11, Copilot+ PC).",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI",
    "values": [ { "name": "DisableAIDataAnalysis", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить Recall", "data": [1] }
    ]
  },

  {
    "id": "wu_auto",
    "category": "Центр обновления Windows",
    "name": "Автоматическое обновление",
    "description": "Режим загрузки и установки обновлений. В Home часть режимов может игнорироваться.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU",
    "values": [
      { "name": "NoAutoUpdate", "type": "DWord" },
      { "name": "AUOptions", "type": "DWord" }
    ],
    "options": [
      { "key": "notify", "label": "Только уведомлять о загрузке и установке", "data": [0, 2] },
      { "key": "download", "label": "Загружать автоматически, уведомлять об установке", "data": [0, 3] },
      { "key": "auto", "label": "Загружать и устанавливать автоматически", "data": [0, 4] },
      { "key": "off", "label": "Отключить автоматическое обновление", "data": [1, null] }
    ]
  },
  {
    "id": "wu_no_reboot",
    "category": "Центр обновления Windows",
    "name": "Не перезагружать автоматически при вошедших пользователях",
    "description": "Windows не будет сама перезагружать ПК после установки обновлений, пока в системе есть пользователь.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU",
    "values": [ { "name": "NoAutoRebootWithLoggedOnUsers", "type": "DWord" } ],
    "options": [
      { "key": "on", "label": "Не перезагружать", "data": [1] }
    ]
  },
  {
    "id": "wu_drivers",
    "category": "Центр обновления Windows",
    "name": "Драйверы через Центр обновления",
    "description": "Запрещает установку драйверов вместе с обновлениями Windows.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate",
    "values": [ { "name": "ExcludeWUDriversInQualityUpdate", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Не устанавливать драйверы", "data": [1] },
      { "key": "on", "label": "Устанавливать", "data": [0] }
    ]
  },
  {
    "id": "wu_target",
    "category": "Центр обновления Windows",
    "name": "Зафиксировать версию Windows",
    "description": "Система останется на выбранной версии и не будет обновляться до следующего крупного выпуска. Работает в Pro/Enterprise/Education.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate",
    "values": [
      { "name": "TargetReleaseVersion", "type": "DWord" },
      { "name": "ProductVersion", "type": "String" },
      { "name": "TargetReleaseVersionInfo", "type": "String" }
    ],
    "options": [
      { "key": "w10_22h2", "label": "Windows 10 22H2", "data": [1, "Windows 10", "22H2"] },
      { "key": "w11_23h2", "label": "Windows 11 23H2", "data": [1, "Windows 11", "23H2"] },
      { "key": "w11_24h2", "label": "Windows 11 24H2", "data": [1, "Windows 11", "24H2"] },
      { "key": "w11_25h2", "label": "Windows 11 25H2", "data": [1, "Windows 11", "25H2"] }
    ]
  },
  {
    "id": "wu_defer_feature",
    "category": "Центр обновления Windows",
    "name": "Отложить обновления компонентов",
    "description": "Откладывает крупные обновления (новые версии Windows) на заданное число дней. Pro/Enterprise/Education.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate",
    "values": [
      { "name": "DeferFeatureUpdates", "type": "DWord" },
      { "name": "DeferFeatureUpdatesPeriodInDays", "type": "DWord" }
    ],
    "options": [
      { "key": "30", "label": "На 30 дней", "data": [1, 30] },
      { "key": "90", "label": "На 90 дней", "data": [1, 90] },
      { "key": "180", "label": "На 180 дней", "data": [1, 180] },
      { "key": "365", "label": "На 365 дней (максимум)", "data": [1, 365] }
    ]
  },
  {
    "id": "wu_defer_quality",
    "category": "Центр обновления Windows",
    "name": "Отложить исправления (качественные обновления)",
    "description": "Откладывает ежемесячные накопительные обновления. Pro/Enterprise/Education.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate",
    "values": [
      { "name": "DeferQualityUpdates", "type": "DWord" },
      { "name": "DeferQualityUpdatesPeriodInDays", "type": "DWord" }
    ],
    "options": [
      { "key": "7", "label": "На 7 дней", "data": [1, 7] },
      { "key": "14", "label": "На 14 дней", "data": [1, 14] },
      { "key": "30", "label": "На 30 дней (максимум)", "data": [1, 30] }
    ]
  },
  {
    "id": "delivery_optimization",
    "category": "Центр обновления Windows",
    "name": "Оптимизация доставки (P2P-раздача обновлений)",
    "description": "Откуда Windows может скачивать обновления и кому раздавать их.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization",
    "values": [ { "name": "DODownloadMode", "type": "DWord" } ],
    "options": [
      { "key": "0", "label": "Только с серверов Microsoft (без P2P)", "data": [0] },
      { "key": "1", "label": "P2P только в локальной сети", "data": [1] },
      { "key": "2", "label": "P2P в пределах группы", "data": [2] },
      { "key": "99", "label": "Простой режим (без P2P и облака)", "data": [99] }
    ]
  },
  {
    "id": "wu_msrt",
    "category": "Центр обновления Windows",
    "name": "Средство удаления вредоносных программ (MSRT)",
    "description": "Не предлагать ежемесячное средство удаления вредоносных программ через Центр обновления.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\MRT",
    "values": [ { "name": "DontOfferThroughWUAU", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Не предлагать MSRT", "data": [1] }
    ]
  },

  {
    "id": "uac_admin",
    "category": "Безопасность",
    "name": "UAC: поведение запроса для администраторов",
    "description": "Как контроль учётных записей запрашивает повышение прав у администраторов. Стандартное значение Windows — 5.",
    "path": "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
    "noUnset": true,
    "values": [ { "name": "ConsentPromptBehaviorAdmin", "type": "DWord" } ],
    "options": [
      { "key": "5", "label": "5 — Запрос согласия для сторонних программ (по умолчанию)", "data": [5] },
      { "key": "2", "label": "2 — Всегда запрашивать согласие на защищённом рабочем столе", "data": [2] },
      { "key": "1", "label": "1 — Запрашивать пароль на защищённом рабочем столе", "data": [1] },
      { "key": "0", "label": "0 — Повышать без запроса (небезопасно)", "data": [0] }
    ]
  },
  {
    "id": "uac_secure_desktop",
    "category": "Безопасность",
    "name": "UAC: затемнение экрана (защищённый рабочий стол)",
    "description": "Показывать запрос UAC на защищённом (затемнённом) рабочем столе.",
    "path": "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
    "noUnset": true,
    "values": [ { "name": "PromptOnSecureDesktop", "type": "DWord" } ],
    "options": [
      { "key": "on", "label": "Включено (по умолчанию)", "data": [1] },
      { "key": "off", "label": "Отключено", "data": [0] }
    ]
  },
  {
    "id": "uac_enable",
    "category": "Безопасность",
    "name": "UAC: контроль учётных записей целиком",
    "description": "ВНИМАНИЕ: полное отключение UAC снижает безопасность и ломает приложения Microsoft Store. Нужна перезагрузка.",
    "path": "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
    "noUnset": true,
    "reboot": true,
    "values": [ { "name": "EnableLUA", "type": "DWord" } ],
    "options": [
      { "key": "on", "label": "Включён (по умолчанию)", "data": [1] },
      { "key": "off", "label": "Отключён (не рекомендуется)", "data": [0] }
    ]
  },
  {
    "id": "last_username",
    "category": "Безопасность",
    "name": "Не показывать последнего пользователя при входе",
    "description": "На экране входа не будет отображаться имя последнего вошедшего пользователя.",
    "path": "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
    "noUnset": true,
    "values": [ { "name": "DontDisplayLastUserName", "type": "DWord" } ],
    "options": [
      { "key": "show", "label": "Показывать (по умолчанию)", "data": [0] },
      { "key": "hide", "label": "Не показывать", "data": [1] }
    ]
  },
  {
    "id": "ctrl_alt_del",
    "category": "Безопасность",
    "name": "Требовать Ctrl+Alt+Del для входа",
    "description": "Перед вводом пароля нужно нажать Ctrl+Alt+Del (защита от поддельных окон входа).",
    "path": "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
    "noUnset": true,
    "values": [ { "name": "DisableCAD", "type": "DWord" } ],
    "options": [
      { "key": "require", "label": "Требовать Ctrl+Alt+Del", "data": [0] },
      { "key": "norequire", "label": "Не требовать (по умолчанию)", "data": [1] }
    ]
  },
  {
    "id": "autorun",
    "category": "Безопасность",
    "name": "Автозапуск со съёмных носителей",
    "description": "Отключает автозапуск (AutoRun/AutoPlay) для всех типов дисков — защита от вирусов на флешках.",
    "path": "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer",
    "values": [
      { "name": "NoDriveTypeAutoRun", "type": "DWord" },
      { "name": "NoAutorun", "type": "DWord" }
    ],
    "options": [
      { "key": "off", "label": "Отключить автозапуск для всех дисков", "data": [255, 1] }
    ]
  },
  {
    "id": "smartscreen",
    "category": "Безопасность",
    "name": "SmartScreen для приложений и файлов",
    "description": "Проверка скачанных программ фильтром SmartScreen в Проводнике.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System",
    "values": [
      { "name": "EnableSmartScreen", "type": "DWord" },
      { "name": "ShellSmartScreenLevel", "type": "String" }
    ],
    "options": [
      { "key": "warn", "label": "Включить: предупреждать", "data": [1, "Warn"] },
      { "key": "block", "label": "Включить: предупреждать и блокировать", "data": [1, "Block"] },
      { "key": "off", "label": "Отключить", "data": [0, null] }
    ]
  },
  {
    "id": "defender_pua",
    "category": "Безопасность",
    "name": "Defender: защита от нежелательных программ (PUA)",
    "description": "Блокирует потенциально нежелательные приложения (рекламное ПО, тулбары, майнеры в установщиках).",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender",
    "values": [ { "name": "PUAProtection", "type": "DWord" } ],
    "options": [
      { "key": "1", "label": "Блокировать", "data": [1] },
      { "key": "2", "label": "Только аудит (журнал)", "data": [2] },
      { "key": "0", "label": "Отключить", "data": [0] }
    ]
  },
  {
    "id": "defender_samples",
    "category": "Безопасность",
    "name": "Defender: отправка образцов файлов",
    "description": "Отправлять ли подозрительные файлы в Microsoft для анализа.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Spynet",
    "values": [ { "name": "SubmitSamplesConsent", "type": "DWord" } ],
    "options": [
      { "key": "0", "label": "Всегда спрашивать", "data": [0] },
      { "key": "1", "label": "Отправлять безопасные образцы автоматически", "data": [1] },
      { "key": "2", "label": "Никогда не отправлять", "data": [2] },
      { "key": "3", "label": "Отправлять все образцы", "data": [3] }
    ]
  },
  {
    "id": "lockscreen_camera",
    "category": "Безопасность",
    "name": "Камера на экране блокировки",
    "description": "Запрещает запуск камеры с экрана блокировки.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization",
    "values": [ { "name": "NoLockScreenCamera", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Запретить камеру", "data": [1] }
    ]
  },
  {
    "id": "rdp",
    "category": "Безопасность",
    "name": "Подключения к удалённому рабочему столу (RDP)",
    "description": "Разрешает или запрещает входящие RDP-подключения к этому ПК (сервер RDP есть только в Pro и выше).",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services",
    "values": [ { "name": "fDenyTSConnections", "type": "DWord" } ],
    "options": [
      { "key": "deny", "label": "Запретить", "data": [1] },
      { "key": "allow", "label": "Разрешить", "data": [0] }
    ]
  },
  {
    "id": "remote_assistance",
    "category": "Безопасность",
    "name": "Удалённый помощник (запрос помощи)",
    "description": "Запрещает пользователям запрашивать удалённую помощь.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services",
    "values": [ { "name": "fAllowToGetHelp", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Запретить", "data": [0] },
      { "key": "on", "label": "Разрешить", "data": [1] }
    ]
  },
  {
    "id": "usb_storage",
    "category": "Безопасность",
    "name": "Съёмные носители: полный запрет",
    "description": "Запрещает доступ ко всем классам съёмных запоминающих устройств (флешки, внешние диски, CD/DVD). Может понадобиться перезагрузка.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices",
    "values": [ { "name": "Deny_All", "type": "DWord" } ],
    "options": [
      { "key": "deny", "label": "Запретить доступ", "data": [1] }
    ]
  },
  {
    "id": "usb_write",
    "category": "Безопасность",
    "name": "Съёмные диски: запрет записи",
    "description": "Флешки и внешние диски доступны только для чтения.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\RemovableStorageDevices\\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}",
    "values": [ { "name": "Deny_Write", "type": "DWord" } ],
    "options": [
      { "key": "deny", "label": "Только чтение", "data": [1] }
    ]
  },
  {
    "id": "wsh",
    "category": "Безопасность",
    "name": "Windows Script Host (.vbs, .js)",
    "description": "Отключает выполнение скриптов VBScript/JScript — частый способ заражения через вложения.",
    "path": "HKLM:\\SOFTWARE\\Microsoft\\Windows Script Host\\Settings",
    "values": [ { "name": "Enabled", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить WSH", "data": [0] },
      { "key": "on", "label": "Включить", "data": [1] }
    ]
  },
  {
    "id": "ps_execution",
    "category": "Безопасность",
    "name": "Политика выполнения скриптов PowerShell",
    "description": "ВНИМАНИЕ: значения «Запретить» и «AllSigned» имеют приоритет над -ExecutionPolicy Bypass и заблокируют запуск этой программы. Откат: reg delete \"HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\" /f",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell",
    "values": [
      { "name": "EnableScripts", "type": "DWord" },
      { "name": "ExecutionPolicy", "type": "String" }
    ],
    "options": [
      { "key": "remotesigned", "label": "RemoteSigned — локальные без подписи, скачанные с подписью", "data": [1, "RemoteSigned"] },
      { "key": "allsigned", "label": "AllSigned — только подписанные", "data": [1, "AllSigned"] },
      { "key": "unrestricted", "label": "Unrestricted — все скрипты", "data": [1, "Unrestricted"] },
      { "key": "off", "label": "Запретить выполнение скриптов", "data": [0, null] }
    ]
  },

  {
    "id": "llmnr",
    "category": "Сеть",
    "name": "LLMNR (многоадресное разрешение имён)",
    "description": "Отключение LLMNR защищает от перехвата учётных данных в локальной сети (атаки Responder).",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient",
    "values": [ { "name": "EnableMulticast", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить LLMNR", "data": [0] }
    ]
  },
  {
    "id": "insecure_guest",
    "category": "Сеть",
    "name": "Гостевой вход SMB без пароля",
    "description": "Разрешает подключение к сетевым папкам/NAS без пароля (в Windows 11 24H2 по умолчанию запрещено). Небезопасно.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\LanmanWorkstation",
    "values": [ { "name": "AllowInsecureGuestAuth", "type": "DWord" } ],
    "options": [
      { "key": "allow", "label": "Разрешить гостевой вход", "data": [1] },
      { "key": "deny", "label": "Запретить", "data": [0] }
    ]
  },
  {
    "id": "smb_signing",
    "category": "Сеть",
    "name": "Обязательная подпись SMB (клиент)",
    "description": "В Windows 11 24H2 подпись SMB обязательна, из-за чего старые NAS и роутеры перестают открываться. Отключение снижает защиту.",
    "path": "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters",
    "noUnset": true,
    "values": [ { "name": "RequireSecuritySignature", "type": "DWord" } ],
    "options": [
      { "key": "on", "label": "Требовать подпись", "data": [1] },
      { "key": "off", "label": "Не требовать", "data": [0] }
    ]
  },

  {
    "id": "task_manager",
    "category": "Ограничения пользователя",
    "name": "Запретить Диспетчер задач",
    "description": "Текущему пользователю запрещается запуск Диспетчера задач.",
    "path": "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
    "values": [ { "name": "DisableTaskMgr", "type": "DWord" } ],
    "options": [
      { "key": "deny", "label": "Запретить", "data": [1] }
    ]
  },
  {
    "id": "regedit",
    "category": "Ограничения пользователя",
    "name": "Запретить Редактор реестра",
    "description": "Запрещает запуск regedit. Эта программа продолжит работать и сможет снять запрет.",
    "path": "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
    "values": [ { "name": "DisableRegistryTools", "type": "DWord" } ],
    "options": [
      { "key": "deny", "label": "Запретить regedit", "data": [1] },
      { "key": "deny_ui", "label": "Запретить только интерфейс (regedit /s работает)", "data": [2] }
    ]
  },
  {
    "id": "cmd",
    "category": "Ограничения пользователя",
    "name": "Запретить командную строку",
    "description": "ВНИМАНИЕ: при полном запрете перестанет работать Start-PolicyManager.bat — запускайте PolicyManager.ps1 через ПКМ → «Выполнить с помощью PowerShell».",
    "path": "HKCU:\\Software\\Policies\\Microsoft\\Windows\\System",
    "values": [ { "name": "DisableCMD", "type": "DWord" } ],
    "options": [
      { "key": "deny", "label": "Запретить cmd и .bat-файлы", "data": [1] },
      { "key": "deny_ui", "label": "Запретить cmd, но разрешить .bat-файлы", "data": [2] }
    ]
  },
  {
    "id": "control_panel",
    "category": "Ограничения пользователя",
    "name": "Запретить Панель управления и Параметры",
    "description": "Блокирует доступ к Панели управления и приложению «Параметры».",
    "path": "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer",
    "values": [ { "name": "NoControlPanel", "type": "DWord" } ],
    "options": [
      { "key": "deny", "label": "Запретить", "data": [1] }
    ]
  },
  {
    "id": "run_dialog",
    "category": "Ограничения пользователя",
    "name": "Убрать «Выполнить» (Win+R)",
    "description": "Отключает диалог «Выполнить».",
    "path": "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer",
    "values": [ { "name": "NoRun", "type": "DWord" } ],
    "options": [
      { "key": "deny", "label": "Убрать", "data": [1] }
    ]
  },
  {
    "id": "no_close",
    "category": "Ограничения пользователя",
    "name": "Убрать кнопки завершения работы",
    "description": "Скрывает «Завершение работы», «Перезагрузка», «Спящий режим» в меню Пуск.",
    "path": "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer",
    "values": [ { "name": "NoClose", "type": "DWord" } ],
    "options": [
      { "key": "deny", "label": "Убрать", "data": [1] }
    ]
  },
  {
    "id": "wallpaper",
    "category": "Ограничения пользователя",
    "name": "Запретить смену обоев",
    "description": "Пользователь не сможет изменить фон рабочего стола.",
    "path": "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop",
    "values": [ { "name": "NoChangingWallPaper", "type": "DWord" } ],
    "options": [
      { "key": "deny", "label": "Запретить", "data": [1] }
    ]
  },
  {
    "id": "recent_docs",
    "category": "Ограничения пользователя",
    "name": "Не хранить список недавних документов",
    "description": "Windows не будет запоминать недавно открытые файлы.",
    "path": "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer",
    "values": [ { "name": "NoRecentDocsHistory", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Не хранить", "data": [1] }
    ]
  },

  {
    "id": "widgets",
    "category": "Интерфейс и система",
    "name": "Виджеты (Windows 11)",
    "description": "Отключает панель виджетов и кнопку на панели задач.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Dsh",
    "values": [ { "name": "AllowNewsAndInterests", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить виджеты", "data": [0] }
    ]
  },
  {
    "id": "news_feeds",
    "category": "Интерфейс и система",
    "name": "Новости и интересы (Windows 10)",
    "description": "Убирает погоду и новости с панели задач Windows 10.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Feeds",
    "values": [ { "name": "EnableFeeds", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить", "data": [0] }
    ]
  },
  {
    "id": "notification_center",
    "category": "Интерфейс и система",
    "name": "Центр уведомлений",
    "description": "Отключает центр уведомлений для текущего пользователя (нужен перезапуск Проводника или выход из системы).",
    "path": "HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer",
    "values": [ { "name": "DisableNotificationCenter", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить", "data": [1] }
    ]
  },
  {
    "id": "start_recommended",
    "category": "Интерфейс и система",
    "name": "Раздел «Рекомендуем» в меню Пуск (Windows 11)",
    "description": "Скрывает раздел «Рекомендуем». Полностью работает в Education/SE и на новых сборках Pro/Enterprise.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer",
    "values": [ { "name": "HideRecommendedSection", "type": "DWord" } ],
    "options": [
      { "key": "hide", "label": "Скрыть", "data": [1] }
    ]
  },
  {
    "id": "lock_screen",
    "category": "Интерфейс и система",
    "name": "Экран блокировки",
    "description": "Сразу показывать окно входа без экрана блокировки. Работает в Enterprise/Education.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization",
    "values": [ { "name": "NoLockScreen", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Не показывать экран блокировки", "data": [1] }
    ]
  },
  {
    "id": "game_dvr",
    "category": "Интерфейс и система",
    "name": "Запись игр (Game DVR / Xbox Game Bar)",
    "description": "Отключает фоновую запись игр, которая может снижать FPS.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR",
    "values": [ { "name": "AllowGameDVR", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить", "data": [0] }
    ]
  },
  {
    "id": "onedrive",
    "category": "Интерфейс и система",
    "name": "OneDrive",
    "description": "Запрещает использование OneDrive для хранения файлов.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\OneDrive",
    "values": [ { "name": "DisableFileSyncNGSC", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Запретить OneDrive", "data": [1] }
    ]
  },
  {
    "id": "store_autoupdate",
    "category": "Интерфейс и система",
    "name": "Автообновление приложений Microsoft Store",
    "description": "Включает или отключает автоматическое обновление приложений из Store.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\WindowsStore",
    "values": [ { "name": "AutoDownload", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить автообновление", "data": [2] },
      { "key": "on", "label": "Включить", "data": [4] }
    ]
  },
  {
    "id": "store",
    "category": "Интерфейс и система",
    "name": "Microsoft Store",
    "description": "Запрещает запуск Microsoft Store. Работает в Enterprise/Education.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\WindowsStore",
    "values": [ { "name": "RemoveWindowsStore", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Запретить Store", "data": [1] }
    ]
  },
  {
    "id": "long_paths",
    "category": "Интерфейс и система",
    "name": "Длинные пути (более 260 символов)",
    "description": "Разрешает приложениям Win32 работать с путями длиннее 260 символов.",
    "path": "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem",
    "noUnset": true,
    "values": [ { "name": "LongPathsEnabled", "type": "DWord" } ],
    "options": [
      { "key": "on", "label": "Включить", "data": [1] },
      { "key": "off", "label": "Отключить (по умолчанию)", "data": [0] }
    ]
  },

  {
    "id": "edge_first_run",
    "category": "Microsoft Edge",
    "name": "Мастер первого запуска",
    "description": "Не показывать приветственный мастер при первом запуске Edge.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    "values": [ { "name": "HideFirstRunExperience", "type": "DWord" } ],
    "options": [
      { "key": "hide", "label": "Скрыть", "data": [1] }
    ]
  },
  {
    "id": "edge_startup_boost",
    "category": "Microsoft Edge",
    "name": "Ускорение запуска (Startup Boost)",
    "description": "Edge не будет запускаться в фоне при входе в Windows.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    "values": [ { "name": "StartupBoostEnabled", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить", "data": [0] },
      { "key": "on", "label": "Включить", "data": [1] }
    ]
  },
  {
    "id": "edge_background",
    "category": "Microsoft Edge",
    "name": "Работа в фоне после закрытия",
    "description": "Запрещает Edge работать в фоне после закрытия последнего окна.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    "values": [ { "name": "BackgroundModeEnabled", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить", "data": [0] },
      { "key": "on", "label": "Включить", "data": [1] }
    ]
  },
  {
    "id": "edge_shopping",
    "category": "Microsoft Edge",
    "name": "Помощник по покупкам",
    "description": "Отключает купоны и сравнение цен в Edge.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    "values": [ { "name": "EdgeShoppingAssistantEnabled", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить", "data": [0] }
    ]
  },
  {
    "id": "edge_sidebar",
    "category": "Microsoft Edge",
    "name": "Боковая панель (и Copilot в Edge)",
    "description": "Убирает боковую панель Edge вместе с кнопкой Copilot.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    "values": [ { "name": "HubsSidebarEnabled", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Отключить", "data": [0] }
    ]
  },
  {
    "id": "edge_personalization",
    "category": "Microsoft Edge",
    "name": "Персонализация рекламы по истории браузера",
    "description": "Запрещает Edge отправлять историю просмотров для персонализации рекламы и новостей.",
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge",
    "values": [ { "name": "PersonalizationReportingEnabled", "type": "DWord" } ],
    "options": [
      { "key": "off", "label": "Запретить", "data": [0] }
    ]
  }
]
'@

$EmbeddedProfiles = @{
    'privacy.json' = @'
{
  "name": "Конфиденциальность",
  "description": "Минимум телеметрии, рекламы и ИИ-функций",
  "policies": {
    "telemetry": "1",
    "feedback_notifications": "off",
    "advertising_id": "off",
    "activity_history": "off",
    "location": "off",
    "input_personalization": "off",
    "error_reporting": "off",
    "cortana": "off",
    "web_search": "off",
    "consumer_features": "off",
    "tips": "off",
    "spotlight": "off",
    "copilot": "off",
    "recall": "off",
    "widgets": "off",
    "news_feeds": "off",
    "edge_shopping": "off",
    "edge_personalization": "off",
    "edge_startup_boost": "off",
    "edge_background": "off"
  }
}
'@
    'security.json' = @'
{
  "name": "Усиленная безопасность",
  "description": "Защита от типовых атак: флешки, скрипты, LLMNR, нежелательное ПО",
  "policies": {
    "uac_admin": "2",
    "uac_secure_desktop": "on",
    "autorun": "off",
    "smartscreen": "warn",
    "defender_pua": "1",
    "lockscreen_camera": "off",
    "remote_assistance": "off",
    "wsh": "off",
    "llmnr": "off",
    "insecure_guest": "deny",
    "smb_signing": "on",
    "ctrl_alt_del": "require",
    "last_username": "hide"
  }
}
'@
    'updates-control.json' = @'
{
  "name": "Контроль обновлений",
  "description": "Обновления скачиваются, но ставятся по согласию; без драйверов и без авто-перезагрузки",
  "policies": {
    "wu_auto": "download",
    "wu_no_reboot": "on",
    "wu_drivers": "off",
    "wu_defer_feature": "90",
    "delivery_optimization": "0"
  }
}
'@
}

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

# Если рядом с программой нет файлов ресурсов (запуск одним файлом или .exe) — распаковываем встроенные копии
if (-not ($CatalogFile -and (Test-Path -LiteralPath $CatalogFile))) {
    $CatalogFile = Join-Path $DataDir 'policies.json'
    if (-not (Test-Path -LiteralPath $CatalogFile)) { [IO.File]::WriteAllText($CatalogFile, $EmbeddedPoliciesJson, (New-Object Text.UTF8Encoding $false)) }
}
if (-not ($ProfilesDir -and (Test-Path -LiteralPath $ProfilesDir))) {
    $ProfilesDir = Join-Path $DataDir 'profiles'
    New-Item -ItemType Directory -Path $ProfilesDir -Force | Out-Null
    foreach ($name in $EmbeddedProfiles.Keys) {
        $pf = Join-Path $ProfilesDir $name
        if (-not (Test-Path -LiteralPath $pf)) { [IO.File]::WriteAllText($pf, $EmbeddedProfiles[$name], (New-Object Text.UTF8Encoding $false)) }
    }
}

function Write-Log([string]$Message) {
    try {
        $line = '[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $Message
        Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
    } catch { }
}

#endregion

#region Работа с реестром

function Resolve-RegPath([string]$Path) {
    if ($Path -match '^(HKLM|HKCU|HKU):\\(.+)$') {
        $hive = switch ($Matches[1]) {
            'HKLM' { [Microsoft.Win32.RegistryHive]::LocalMachine }
            'HKCU' { [Microsoft.Win32.RegistryHive]::CurrentUser }
            default { [Microsoft.Win32.RegistryHive]::Users }
        }
        return [pscustomobject]@{ Hive = $hive; SubKey = $Matches[2].TrimEnd('\') }
    }
    throw "Неверный путь реестра: $Path"
}

function ConvertTo-NativeRegPath([string]$Path) {
    $Path -replace '^HKLM:', 'HKEY_LOCAL_MACHINE' -replace '^HKCU:', 'HKEY_CURRENT_USER' -replace '^HKU:', 'HKEY_USERS'
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

#region Журнал запуска приложений (аудит процессов)

# Включает запись события 4688 (создание процесса) в журнал «Безопасность» и добавление в него командной строки
$AuditCmdLineKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Audit'

function Test-ProcessAuditEnabled {
    try {
        $out = & auditpol /get /subcategory:"{0CCE922B-69AE-11D9-BED3-505054503030}" /r 2>$null
        return (($out -join "`n") -match 'Success')
    } catch { return $false }
}

function Enable-ProcessAudit {
    # Аудит по GUID подкатегории — не зависит от языка Windows
    & auditpol /set /subcategory:"{0CCE922B-69AE-11D9-BED3-505054503030}" /success:enable | Out-Null
    if (-not (Test-Path -LiteralPath $AuditCmdLineKey)) { New-Item -Path $AuditCmdLineKey -Force | Out-Null }
    Set-ItemProperty -LiteralPath $AuditCmdLineKey -Name 'ProcessCreationIncludeCmdLine_Enabled' -Type DWord -Value 1
    Write-Log 'Включён аудит запуска приложений (событие 4688)'
}

function Disable-ProcessAudit {
    & auditpol /set /subcategory:"{0CCE922B-69AE-11D9-BED3-505054503030}" /success:disable | Out-Null
    Set-ItemProperty -LiteralPath $AuditCmdLineKey -Name 'ProcessCreationIncludeCmdLine_Enabled' -Type DWord -Value 0 -ErrorAction SilentlyContinue
    Write-Log 'Отключён аудит запуска приложений'
}

# Читает последние запуски приложений из журнала «Безопасность»
function Get-ProcessLog([int]$MaxEvents = 500, [string]$Filter = '') {
    $filterXml = @"
<QueryList>
  <Query Id="0" Path="Security">
    <Select Path="Security">*[System[(EventID=4688)]]</Select>
  </Query>
</QueryList>
"@
    $events = Get-WinEvent -FilterXml $filterXml -MaxEvents $MaxEvents -ErrorAction Stop
    foreach ($e in $events) {
        $x = [xml]$e.ToXml()
        $d = @{}
        foreach ($node in $x.Event.EventData.Data) { $d[$node.Name] = $node.'#text' }
        $exe = $d['NewProcessName']
        if (-not $exe) { continue }
        $name = [IO.Path]::GetFileName($exe)
        # Служебные процессы входа/аудита самой системы пропускаем, чтобы не засорять список
        $user = $d['SubjectUserName']
        if ($user -match '\$$' -or $user -in @('SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE')) { continue }
        if ($Filter) {
            $hay = "$name $exe $user"
            if ($hay.IndexOf($Filter, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
        }
        [pscustomobject]@{
            Time    = $e.TimeCreated
            Program = $name
            User    = $user
            Path    = $exe
        }
    }
}

$DnsLogName = 'Microsoft-Windows-DNS-Client/Operational'

function Test-SiteLogEnabled {
    try { return [bool](Get-WinEvent -ListLog $DnsLogName -ErrorAction Stop).IsEnabled } catch { return $false }
}

function Enable-SiteLog {
    & wevtutil set-log $DnsLogName /enabled:true /quiet:true | Out-Null
    Write-Log 'Включена запись посещённых сайтов (DNS-журнал)'
}

function Disable-SiteLog {
    & wevtutil set-log $DnsLogName /enabled:false /quiet:true | Out-Null
    Write-Log 'Отключена запись посещённых сайтов'
}

# Домены, по которым браузеры и система «фонят» постоянно — не относятся к посещениям пользователя
$DnsNoiseSuffixes = @(
    '.in-addr.arpa', '.ip6.arpa', '.local', '.lan', '.home', '.msftconnecttest.com', '.msftncsi.com',
    '.windowsupdate.com', '.update.microsoft.com', '.delivery.mp.microsoft.com', '.events.data.microsoft.com',
    '.settings-win.data.microsoft.com', '.wns.windows.com', '.dns.msftncsi.com', '.root-servers.net'
)

# Посещённые сайты из DNS-журнала, домены сворачиваются, повторы подряд считаются
function Get-SiteLog([int]$MaxEvents = 2000, [string]$Filter = '') {
    $filterXml = @"
<QueryList>
  <Query Id="0" Path="$DnsLogName">
    <Select Path="$DnsLogName">*[System[(EventID=3008)]]</Select>
  </Query>
</QueryList>
"@
    $events = Get-WinEvent -FilterXml $filterXml -MaxEvents $MaxEvents -ErrorAction Stop
    $result = New-Object System.Collections.Generic.List[object]
    $lastDomain = $null
    foreach ($e in $events) {
        $x = [xml]$e.ToXml()
        $name = $null
        foreach ($node in $x.Event.EventData.Data) { if ($node.Name -eq 'QueryName') { $name = $node.'#text' } }
        if (-not $name) { continue }
        $domain = $name.TrimEnd('.').ToLowerInvariant()
        if (-not $domain -or $domain -notmatch '\.') { continue }
        $skip = $false
        foreach ($suf in $DnsNoiseSuffixes) { if ($domain.EndsWith($suf)) { $skip = $true; break } }
        if ($skip) { continue }
        if ($Filter -and $domain.IndexOf($Filter, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
        # Браузер при открытии сайта шлёт десятки запросов к одному домену — сворачиваем подряд идущие
        if ($result.Count -gt 0 -and $result[$result.Count - 1].Domain -eq $domain) {
            $result[$result.Count - 1].Count++
            continue
        }
        $result.Add([pscustomobject]@{ Time = $e.TimeCreated; Domain = $domain; Count = 1 })
    }
    return , $result
}

#endregion

#region Ограничения для пользователей без прав администратора

# Локальная групповая политика «Не администраторы» (MLGPO, Windows Pro и выше):
# применяется ко всем учётным записям вне группы «Администраторы», включая созданные позже.

function Get-System32Dir {
    # 32-битный процесс на 64-битной Windows видит System32 как SysWOW64
    if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) { return (Join-Path $env:windir 'Sysnative') }
    return (Join-Path $env:windir 'System32')
}

$NonAdminGpoDir  = Join-Path (Get-System32Dir) 'GroupPolicyUsers\S-1-5-32-545'
$NonAdminPolFile = Join-Path $NonAdminGpoDir 'User\Registry.pol'
$HostsFile       = Join-Path $env:windir 'System32\drivers\etc\hosts'
$HostsBegin      = '# >>> Policy Manager: blocked sites'
$HostsEnd        = '# <<< Policy Manager'

$ExplorerPolicyKey = 'Software\Microsoft\Windows\CurrentVersion\Policies\Explorer'
$SystemPolicyKey   = 'Software\Microsoft\Windows\CurrentVersion\Policies\System'
$RestrictRunKey    = "$ExplorerPolicyKey\RestrictRun"
$SiteListKeys      = @(
    'Software\Policies\Microsoft\Edge\URLBlocklist',
    'Software\Policies\Google\Chrome\URLBlocklist',
    'Software\Policies\YandexBrowser\URLBlocklist'
)
$FirefoxBlockKey   = 'Software\Policies\Mozilla\Firefox\WebsiteFilter\Block'
$AllowListKeys     = @(
    'Software\Policies\Microsoft\Edge\URLAllowlist',
    'Software\Policies\Google\Chrome\URLAllowlist',
    'Software\Policies\YandexBrowser\URLAllowlist'
)
$FirefoxAllowKey   = 'Software\Policies\Mozilla\Firefox\WebsiteFilter\Exceptions'
# Служебные страницы браузеров (настройки, новая вкладка), которые в режиме белого списка остаются доступны
$BrowserInternalUrls = @('edge://*', 'chrome://*', 'browser://*')
# Файл с последними настройками ограничений; его же формат используется для переноса на другой компьютер
$RestrictionsFile  = Join-Path $DataDir 'restrictions.json'

# Системные программы, без которых у пользователя не будут работать Проводник и значки в трее
$DefaultAllowedPrograms = @('explorer.exe', 'SecurityHealthSystray.exe', 'OneDrive.exe')

# Встроенные программы Windows, которых нет среди ярлыков меню Пуск
$BuiltinPrograms = @(
    @{ Exe = 'explorer.exe'; Name = 'Проводник (обязательно)'; Path = "$env:windir\explorer.exe" }
    @{ Exe = 'SecurityHealthSystray.exe'; Name = 'Значок «Безопасность Windows» в трее'; Path = "$env:windir\System32\SecurityHealthSystray.exe" }
    @{ Exe = 'notepad.exe'; Name = 'Блокнот'; Path = "$env:windir\System32\notepad.exe" }
    @{ Exe = 'mspaint.exe'; Name = 'Paint'; Path = "$env:windir\System32\mspaint.exe" }
    @{ Exe = 'calc.exe'; Name = 'Калькулятор'; Path = "$env:windir\System32\calc.exe" }
    @{ Exe = 'SnippingTool.exe'; Name = 'Ножницы'; Path = "$env:windir\System32\SnippingTool.exe" }
    @{ Exe = 'cmd.exe'; Name = 'Командная строка (не рекомендуется)'; Path = "$env:windir\System32\cmd.exe" }
    @{ Exe = 'powershell.exe'; Name = 'PowerShell (не рекомендуется)'; Path = "$env:windir\System32\WindowsPowerShell\v1.0\powershell.exe" }
    @{ Exe = 'taskmgr.exe'; Name = 'Диспетчер задач (не рекомендуется)'; Path = "$env:windir\System32\taskmgr.exe" }
)

# Программы из ярлыков меню Пуск и рабочих столов всех пользователей
function Get-InstalledPrograms {
    $dirs = New-Object System.Collections.Generic.List[string]
    $dirs.Add("$env:ProgramData\Microsoft\Windows\Start Menu\Programs")
    $dirs.Add("$env:PUBLIC\Desktop")
    foreach ($prof in Get-ChildItem -LiteralPath "$env:SystemDrive\Users" -Directory -ErrorAction SilentlyContinue) {
        $dirs.Add((Join-Path $prof.FullName 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs'))
        $dirs.Add((Join-Path $prof.FullName 'Desktop'))
    }
    $shell = New-Object -ComObject WScript.Shell
    $seen = @{}
    foreach ($d in $dirs) {
        if (-not (Test-Path -LiteralPath $d)) { continue }
        foreach ($lnk in Get-ChildItem -LiteralPath $d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue) {
            try { $target = $shell.CreateShortcut($lnk.FullName).TargetPath } catch { continue }
            if (-not $target -or $target -notmatch '\.exe$') { continue }
            $exe = [IO.Path]::GetFileName($target)
            if ($exe -match '^(unins|uninst|setup|update)' -or $lnk.BaseName -match 'удал|uninstall') { continue }
            $key = $exe.ToLowerInvariant()
            if ($seen.ContainsKey($key)) { continue }
            $seen[$key] = $true
            [pscustomobject]@{ Name = $lnk.BaseName; Exe = $exe; Path = $target }
        }
    }
}

function New-PolValueRef([string]$Key, [string]$Name, [uint32]$Data) {
    [pscustomobject]@{ Key = $Key; Name = $Name; Data = $Data }
}

$Lockdowns = @(
    [pscustomobject]@{ Id = 'cmd'; Default = $true; Label = 'Запретить командную строку и .bat-файлы'
        Values = @((New-PolValueRef 'Software\Policies\Microsoft\Windows\System' 'DisableCMD' 1)) }
    [pscustomobject]@{ Id = 'regedit'; Default = $true; Label = 'Запретить редактор реестра'
        Values = @((New-PolValueRef $SystemPolicyKey 'DisableRegistryTools' 1)) }
    [pscustomobject]@{ Id = 'taskmgr'; Default = $true; Label = 'Запретить Диспетчер задач (через него можно запустить любую программу)'
        Values = @((New-PolValueRef $SystemPolicyKey 'DisableTaskMgr' 1)) }
    [pscustomobject]@{ Id = 'control'; Default = $true; Label = 'Запретить Панель управления и Параметры Windows'
        Values = @((New-PolValueRef $ExplorerPolicyKey 'NoControlPanel' 1)) }
    [pscustomobject]@{ Id = 'run'; Default = $false; Label = 'Убрать окно «Выполнить» (Win+R)'
        Values = @((New-PolValueRef $ExplorerPolicyKey 'NoRun' 1)) }
    [pscustomobject]@{ Id = 'incognito'; Default = $true; Label = 'Запретить режим инкогнито в браузерах'
        Values = @(
            (New-PolValueRef 'Software\Policies\Microsoft\Edge' 'InPrivateModeAvailability' 1),
            (New-PolValueRef 'Software\Policies\Google\Chrome' 'IncognitoModeAvailability' 1),
            (New-PolValueRef 'Software\Policies\YandexBrowser' 'IncognitoModeAvailability' 1),
            (New-PolValueRef 'Software\Policies\Mozilla\Firefox' 'DisablePrivateBrowsing' 1)) }
    [pscustomobject]@{ Id = 'downloads'; Default = $false; Label = 'Запретить скачивание файлов во всех браузерах на движке Chromium (Edge, Chrome, Яндекс, Brave, Vivaldi, Atom) — скачанный .exe можно запустить из браузера в обход списка программ'
        Values = @(
            (New-PolValueRef 'Software\Policies\Microsoft\Edge' 'DownloadRestrictions' 3),
            (New-PolValueRef 'Software\Policies\Google\Chrome' 'DownloadRestrictions' 3),
            (New-PolValueRef 'Software\Policies\YandexBrowser' 'DownloadRestrictions' 3),
            (New-PolValueRef 'Software\Policies\BraveSoftware\Brave' 'DownloadRestrictions' 3),
            (New-PolValueRef 'Software\Policies\Vivaldi' 'DownloadRestrictions' 3),
            (New-PolValueRef 'Software\Policies\Chromium' 'DownloadRestrictions' 3),
            (New-PolValueRef 'Software\Policies\Mail.Ru\Atom' 'DownloadRestrictions' 3)) }
)

# Какие записи Registry.pol принадлежат этой программе (остальные сохраняются без изменений)
$ManagedPolKeys = @($RestrictRunKey) + $SiteListKeys + @($FirefoxBlockKey) + $AllowListKeys + @($FirefoxAllowKey)
$ManagedPolPairs = @{ "$ExplorerPolicyKey|RestrictRun" = $true }
foreach ($l in $Lockdowns) { foreach ($v in $l.Values) { $ManagedPolPairs["$($v.Key)|$($v.Name)"] = $true } }

#region Формат Registry.pol

function Read-PolFile([string]$File) {
    $list = New-Object System.Collections.Generic.List[object]
    if (-not (Test-Path -LiteralPath $File)) { return , $list }
    $b = [IO.File]::ReadAllBytes($File)
    if ($b.Length -lt 8) { return , $list }
    if ([BitConverter]::ToUInt32($b, 0) -ne 0x67655250) { throw "Файл повреждён или имеет неизвестный формат: $File" }
    $enc = [Text.Encoding]::Unicode
    $pos = 8
    while ($pos + 1 -lt $b.Length) {
        if ([BitConverter]::ToUInt16($b, $pos) -ne 0x5B) { throw "Ошибка разбора $File (смещение $pos)" }
        $pos += 2
        $fields = @()
        foreach ($f in 1..2) {
            $start = $pos
            while ($pos + 1 -lt $b.Length -and [BitConverter]::ToUInt16($b, $pos) -notin @(0, 0x3B)) { $pos += 2 }
            $fields += $enc.GetString($b, $start, $pos - $start)
            if ([BitConverter]::ToUInt16($b, $pos) -eq 0) { $pos += 2 }
            $pos += 2
        }
        $type = [BitConverter]::ToUInt32($b, $pos); $pos += 6
        $size = [BitConverter]::ToUInt32($b, $pos); $pos += 6
        $data = New-Object byte[] $size
        [Array]::Copy($b, $pos, $data, 0, $size)
        $pos += $size + 2
        $list.Add([pscustomobject]@{ Key = $fields[0]; Value = $fields[1]; Type = $type; Data = $data })
    }
    return , $list
}

function Write-PolFile([string]$File, $Entries) {
    $enc = [Text.Encoding]::Unicode
    $ms = New-Object IO.MemoryStream
    $bw = New-Object IO.BinaryWriter($ms)
    $bw.Write([uint32]0x67655250)
    $bw.Write([uint32]1)
    foreach ($e in $Entries) {
        $bw.Write($enc.GetBytes('['))
        $bw.Write($enc.GetBytes($e.Key + [char]0))
        $bw.Write($enc.GetBytes(';'))
        $bw.Write($enc.GetBytes($e.Value + [char]0))
        $bw.Write($enc.GetBytes(';'))
        $bw.Write([uint32]$e.Type)
        $bw.Write($enc.GetBytes(';'))
        $bw.Write([uint32]$e.Data.Length)
        $bw.Write($enc.GetBytes(';'))
        $bw.Write([byte[]]$e.Data)
        $bw.Write($enc.GetBytes(']'))
    }
    $bw.Flush()
    $dir = Split-Path -Parent $File
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [IO.File]::WriteAllBytes($File, $ms.ToArray())
    $bw.Close()
}

function New-PolEntry([string]$Key, [string]$Value, [string]$Type, $Data) {
    if ($Type -eq 'DWord') { $t = 4; $bytes = [BitConverter]::GetBytes([uint32]$Data) }
    else { $t = 1; $bytes = [Text.Encoding]::Unicode.GetBytes([string]$Data + [char]0) }
    [pscustomobject]@{ Key = $Key; Value = $Value; Type = [uint32]$t; Data = $bytes }
}

function Get-PolEntryValue($Entry) {
    if ($Entry.Type -eq 4 -and $Entry.Data.Length -ge 4) { return [BitConverter]::ToUInt32($Entry.Data, 0) }
    if ($Entry.Type -eq 1 -or $Entry.Type -eq 2) { return [Text.Encoding]::Unicode.GetString($Entry.Data).TrimEnd([char]0) }
    return $null
}

function Find-PolEntry($Entries, [string]$Key, [string]$Name) {
    $found = $null
    foreach ($e in $Entries) { if ($e.Key -eq $Key -and $e.Value -eq $Name) { $found = $e } }
    return $found
}

function Get-PolList($Entries, [string]$Key) {
    $items = foreach ($e in $Entries) {
        if ($e.Key -eq $Key -and -not $e.Value.StartsWith('**')) {
            $n = 0
            [pscustomobject]@{ Order = $(if ([int]::TryParse($e.Value, [ref]$n)) { $n } else { [int]::MaxValue }); Text = (Get-PolEntryValue $e) }
        }
    }
    return @($items | Sort-Object Order | ForEach-Object { $_.Text })
}

# Список значений «1», «2», ... с предварительной очисткой раздела, как это делает gpedit
function Add-PolList($List, [string]$Key, $Items) {
    $List.Add((New-PolEntry $Key '**delvals.' 'String' ' '))
    $i = 1
    foreach ($item in $Items) { $List.Add((New-PolEntry $Key "$i" 'String' $item)); $i++ }
}

function Test-ManagedPolEntry($Entry) {
    if ($ManagedPolKeys -contains $Entry.Key) { return $true }
    $name = $Entry.Value -replace '^\*\*del\.', ''
    return $ManagedPolPairs.ContainsKey("$($Entry.Key)|$name")
}

# gpt.ini: версия пользовательской части хранится в старших 16 битах; её увеличение заставляет Windows перечитать политику
function Update-GptIni([string]$Dir) {
    $file = Join-Path $Dir 'gpt.ini'
    $regExt = '[{35378EAC-683F-11D2-A89A-00C04FBBCFA2}{D02B1F73-3407-48AE-BA88-E8213C6761F1}]'
    $lines = New-Object System.Collections.Generic.List[string]
    if (Test-Path -LiteralPath $file) { foreach ($l in [IO.File]::ReadAllLines($file)) { $lines.Add($l) } }
    if (-not ($lines | Where-Object { $_ -match '^\s*\[General\]' })) { $lines.Insert(0, '[General]') }
    $version = [int64]0
    $hasExt = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*Version\s*=\s*(\d+)') { $version = [int64]$Matches[1] }
        if ($lines[$i] -match '^\s*gPCUserExtensionNames\s*=\s*(.*)$') {
            $hasExt = $true
            if ($Matches[1] -notmatch '35378EAC-683F-11D2-A89A-00C04FBBCFA2') { $lines[$i] = 'gPCUserExtensionNames=' + $regExt + $Matches[1].Trim() }
        }
    }
    $newVersion = ([Math]::Floor($version / 65536) + 1) * 65536 + ($version % 65536)
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($l in $lines) { if ($l -notmatch '^\s*Version\s*=') { $out.Add($l) } }
    $general = [Math]::Max(0, $out.FindIndex([Predicate[string]] { param($x) $x -match '^\s*\[General\]' }))
    $out.Insert($general + 1, "Version=$newVersion")
    if (-not $hasExt) { $out.Insert($general + 1, "gPCUserExtensionNames=$regExt") }
    if (-not ($out | Where-Object { $_ -match '^\s*gPCFunctionalityVersion' })) { $out.Insert($general + 1, 'gPCFunctionalityVersion=2') }
    if (-not (Test-Path -LiteralPath $Dir)) { New-Item -ItemType Directory -Path $Dir -Force | Out-Null }
    [IO.File]::WriteAllLines($file, $out.ToArray(), [Text.Encoding]::ASCII)
}

#endregion

#region Файл hosts

function Get-HostsBlockedSites {
    if (-not (Test-Path -LiteralPath $HostsFile)) { return @() }
    $inside = $false
    $sites = foreach ($l in [IO.File]::ReadAllLines($HostsFile, [Text.Encoding]::Default)) {
        if ($l -eq $HostsBegin) { $inside = $true; continue }
        if ($l -eq $HostsEnd) { $inside = $false; continue }
        if ($inside -and $l -match '^\s*0\.0\.0\.0\s+(\S+)' -and $Matches[1] -notlike 'www.*') { $Matches[1] }
    }
    return @($sites)
}

function Set-HostsBlock([string[]]$Domains) {
    $enc = [Text.Encoding]::Default
    $lines = if (Test-Path -LiteralPath $HostsFile) { [IO.File]::ReadAllLines($HostsFile, $enc) } else { @() }
    $out = New-Object System.Collections.Generic.List[string]
    $inside = $false
    foreach ($l in $lines) {
        if ($l -eq $HostsBegin) { $inside = $true; continue }
        if ($l -eq $HostsEnd) { $inside = $false; continue }
        if (-not $inside) { $out.Add($l) }
    }
    while ($out.Count -gt 0 -and -not $out[$out.Count - 1].Trim()) { $out.RemoveAt($out.Count - 1) }
    if ($Domains.Count -gt 0) {
        $out.Add('')
        $out.Add($HostsBegin)
        foreach ($d in $Domains) {
            $out.Add("0.0.0.0 $d")
            if ($d -notlike 'www.*') { $out.Add("0.0.0.0 www.$d") }
        }
        $out.Add($HostsEnd)
    }
    $attr = (Get-Item -LiteralPath $HostsFile -ErrorAction SilentlyContinue).Attributes
    if ($attr -band [IO.FileAttributes]::ReadOnly) { Set-ItemProperty -LiteralPath $HostsFile -Name Attributes -Value ($attr -bxor [IO.FileAttributes]::ReadOnly) }
    [IO.File]::WriteAllText($HostsFile, (($out -join "`r`n") + "`r`n"), $enc)
    Start-Process ipconfig.exe -ArgumentList '/flushdns' -WindowStyle Hidden -Wait
}

#endregion

function ConvertTo-Domain([string]$Text) {
    $d = $Text.Trim().ToLowerInvariant()
    if (-not $d -or $d.StartsWith('#')) { return $null }
    $d = $d -replace '^[a-z]+://', ''
    $d = ($d -split '[?#]')[0].TrimEnd('/')
    # Можно указать раздел сайта (yandex.ru/games) — тогда остальной сайт останется доступен
    $path = ''
    $slash = $d.IndexOf('/')
    if ($slash -ge 0) { $path = $d.Substring($slash); $d = $d.Substring(0, $slash) }
    $d = ($d -split ':')[0] -replace '^\*\.', '' -replace '^www\.', ''
    if (-not $d) { return $null }
    try { $d = (New-Object Globalization.IdnMapping).GetAscii($d) } catch { throw "Некорректный адрес сайта: $Text" }
    return $d + $path
}

function ConvertTo-ExeName([string]$Text) {
    $n = $Text.Trim().Trim('"')
    if (-not $n -or $n.StartsWith('#')) { return $null }
    $n = [IO.Path]::GetFileName($n)
    if ($n -notmatch '\.exe$') { $n += '.exe' }
    return $n
}

function Get-UniqueText($Items) {
    $seen = @{}
    return @(foreach ($i in $Items) { if ($i -and -not $seen.ContainsKey($i)) { $seen[$i] = $true; $i } })
}

function Get-LocalUserInfo {
    $adminSids = @{}
    try {
        $grpName = ([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')).Translate([Security.Principal.NTAccount]).Value.Split('\')[-1]
        $grp = [ADSI]"WinNT://$env:COMPUTERNAME/$grpName,group"
        foreach ($m in @($grp.Invoke('Members'))) {
            $sidBytes = $m.GetType().InvokeMember('objectSid', 'GetProperty', $null, $m, $null)
            $adminSids[([Security.Principal.SecurityIdentifier]::new([byte[]]$sidBytes, 0)).Value] = $true
        }
    } catch { }
    $computer = [ADSI]"WinNT://$env:COMPUTERNAME,computer"
    foreach ($u in $computer.Children) {
        if ($u.SchemaClassName -ne 'User') { continue }
        if ([int]$u.UserFlags.Value -band 2) { continue }   # учётная запись отключена
        $sid = ([Security.Principal.SecurityIdentifier]::new([byte[]]$u.objectSid.Value, 0)).Value
        [pscustomobject]@{ Name = [string]$u.Name.Value; Sid = $sid; IsAdmin = $adminSids.ContainsKey($sid) }
    }
}

function Get-NonAdminRestrictions {
    $entries = Read-PolFile $NonAdminPolFile
    $applied = @($entries | Where-Object { Test-ManagedPolEntry $_ }).Count -gt 0

    # Последние сохранённые настройки хранят оба списка сайтов, даже если сейчас действует только один
    if (Test-Path -LiteralPath $RestrictionsFile) {
        try {
            $cfg = Import-RestrictionConfig $RestrictionsFile
            $cfg | Add-Member -NotePropertyName Applied -NotePropertyValue $applied
            return $cfg
        } catch {
            Write-Log "Не удалось прочитать $($RestrictionsFile): $($_.Exception.Message)"
        }
    }

    $rr = Find-PolEntry $entries $ExplorerPolicyKey 'RestrictRun'
    $lock = @{}
    foreach ($l in $Lockdowns) {
        $all = $true
        foreach ($v in $l.Values) {
            $e = Find-PolEntry $entries $v.Key $v.Name
            if (-not $e -or (Get-PolEntryValue $e) -ne $v.Data) { $all = $false }
        }
        $lock[$l.Id] = $all
    }
    $blockRaw = @(Get-PolList $entries $SiteListKeys[0])
    $allow = @(Get-PolList $entries $AllowListKeys[0] | Where-Object { $BrowserInternalUrls -notcontains $_ })
    $block = @($blockRaw | Where-Object { $_ -ne '*' })
    $hostsSites = @(Get-HostsBlockedSites)
    $mode = 'block'
    if ($blockRaw -contains '*') { $mode = 'allow' }
    if (-not $block.Count) { $block = $hostsSites }
    [pscustomobject]@{
        Applied          = $applied
        WhitelistEnabled = [bool]($rr -and (Get-PolEntryValue $rr) -eq 1)
        Programs         = @(Get-PolList $entries $RestrictRunKey)
        SitesEnabled     = ($blockRaw.Count -gt 0)
        SitesMode        = $mode
        BlockSites       = $block
        AllowSites       = $allow
        HostsEnabled     = $hostsSites.Count -gt 0
        Lockdowns        = $lock
    }
}

# Файл настроек ограничений: им можно перенести запреты на другой компьютер
function Export-RestrictionConfig($Config, [string]$File) {
    $lock = [ordered]@{}
    foreach ($l in $Lockdowns) { $lock[$l.Id] = [bool]$Config.Lockdowns[$l.Id] }
    $obj = [ordered]@{
        app       = $AppName
        type      = 'restrictions'
        version   = 1
        created   = (Get-Date).ToString('s')
        computer  = $env:COMPUTERNAME
        programs  = [ordered]@{ enabled = [bool]$Config.WhitelistEnabled; list = @($Config.Programs) }
        sites     = [ordered]@{
            enabled = [bool]$Config.SitesEnabled
            mode    = [string]$Config.SitesMode
            block   = @($Config.BlockSites)
            allow   = @($Config.AllowSites)
            hosts   = [bool]$Config.HostsEnabled
        }
        lockdowns = $lock
    }
    $dir = Split-Path -Parent $File
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $obj | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $File -Encoding UTF8
}

function Import-RestrictionConfig([string]$File) {
    $j = Get-Content -LiteralPath $File -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.type -ne 'restrictions') { throw "Файл не является файлом ограничений $AppName`: $File" }
    $lock = @{}
    foreach ($l in $Lockdowns) { $lock[$l.Id] = [bool]$j.lockdowns.($l.Id) }
    $mode = 'block'
    if ($j.sites.mode -eq 'allow') { $mode = 'allow' }
    $programs = @(Get-UniqueText @(@($j.programs.list) | ForEach-Object { ConvertTo-ExeName $_ }))
    $block = @(Get-UniqueText @(@($j.sites.block) | ForEach-Object { ConvertTo-Domain $_ }))
    $allow = @(Get-UniqueText @(@($j.sites.allow) | ForEach-Object { ConvertTo-Domain $_ }))
    $active = if ($mode -eq 'allow') { $allow } else { $block }
    [pscustomobject]@{
        WhitelistEnabled = ([bool]$j.programs.enabled -and $programs.Count -gt 0)
        Programs         = $programs
        SitesEnabled     = ([bool]$j.sites.enabled -and $active.Count -gt 0)
        SitesMode        = $mode
        BlockSites       = $block
        AllowSites       = $allow
        HostsEnabled     = [bool]$j.sites.hosts
        Lockdowns        = $lock
    }
}

function Get-RestrictionSummary($Config) {
    $lines = @()
    if ($Config.WhitelistEnabled) { $lines += "• Разрешены только программы из списка ($(@($Config.Programs).Count) шт.)" }
    else { $lines += '• Запуск программ не ограничен' }
    if (-not $Config.SitesEnabled) { $lines += '• Сайты не ограничены' }
    elseif ($Config.SitesMode -eq 'allow') { $lines += "• Белый список: открываются только $(@($Config.AllowSites).Count) сайтов, остальные запрещены" }
    else {
        $line = "• Чёрный список: заблокировано сайтов — $(@($Config.BlockSites).Count)"
        if ($Config.HostsEnabled) { $line += ' (+ файл hosts)' }
        $lines += $line
    }
    foreach ($l in $Lockdowns) { if ($Config.Lockdowns[$l.Id]) { $lines += "• $($l.Label)" } }
    return ($lines -join "`r`n")
}

function Save-NonAdminPol($Entries) {
    if (Test-Path -LiteralPath $NonAdminPolFile) {
        Copy-Item -LiteralPath $NonAdminPolFile -Destination (Join-Path $BackupDir ('nonadmins_registry_{0:yyyyMMdd_HHmmss}.pol' -f (Get-Date))) -Force
    }
    Write-PolFile $NonAdminPolFile $Entries
    Update-GptIni $NonAdminGpoDir
}

#region Запись ограничений прямо в профили пользователей

# Групповая политика «Не администраторы» применяется не всегда (и только при входе),
# поэтому те же значения дополнительно пишутся в реестр каждого существующего обычного пользователя.

function Remove-RegKeyTree([string]$Path) {
    $cut = $Path.LastIndexOf('\')
    $parent = Open-RegKey $Path.Substring(0, $cut) -Writable
    if (-not $parent) { return }
    try { $parent.DeleteSubKeyTree($Path.Substring($cut + 1), $false) } finally { $parent.Close() }
}

function Add-ValueList($Vals, [string]$Key, $Items) {
    $i = 1
    foreach ($item in $Items) { $Vals.Add([pscustomobject]@{ Key = $Key; Name = "$i"; Type = 'String'; Data = $item }); $i++ }
}

# Firefox понимает шаблоны адресов: домен с поддоменами или раздел сайта
function ConvertTo-FirefoxPatterns($Sites) {
    return @(foreach ($d in $Sites) {
        if ($d.Contains('/')) { "*://$d*"; "*://*.$d*" } else { "*://$d/*"; "*://*.$d/*" }
    })
}

# Плоский список значений реестра (относительно HKCU), которые задают выбранные ограничения
function Get-RestrictionValues($Config) {
    $vals = New-Object System.Collections.Generic.List[object]
    if ($Config.WhitelistEnabled) {
        $vals.Add([pscustomobject]@{ Key = $ExplorerPolicyKey; Name = 'RestrictRun'; Type = 'DWord'; Data = 1 })
        $i = 1
        foreach ($p in $Config.Programs) { $vals.Add([pscustomobject]@{ Key = $RestrictRunKey; Name = "$i"; Type = 'String'; Data = $p }); $i++ }
    }
    if ($Config.SitesEnabled) {
        if ($Config.SitesMode -eq 'allow') {
            # Белый список: запрещено всё, кроме перечисленных сайтов
            foreach ($k in $SiteListKeys) { Add-ValueList $vals $k @('*') }
            foreach ($k in $AllowListKeys) { Add-ValueList $vals $k (@($Config.AllowSites) + $BrowserInternalUrls) }
            Add-ValueList $vals $FirefoxBlockKey @('<all_urls>')
            Add-ValueList $vals $FirefoxAllowKey (ConvertTo-FirefoxPatterns $Config.AllowSites)
        } else {
            foreach ($k in $SiteListKeys) { Add-ValueList $vals $k $Config.BlockSites }
            Add-ValueList $vals $FirefoxBlockKey (ConvertTo-FirefoxPatterns $Config.BlockSites)
        }
    }
    foreach ($l in $Lockdowns) {
        if ($Config.Lockdowns[$l.Id]) {
            foreach ($v in $l.Values) { $vals.Add([pscustomobject]@{ Key = $v.Key; Name = $v.Name; Type = 'DWord'; Data = $v.Data }) }
        }
    }
    return , $vals
}

function Clear-HiveRestrictions([string]$Root) {
    foreach ($k in $ManagedPolKeys) { Remove-RegKeyTree "$Root\$k" }
    foreach ($pair in @($ManagedPolPairs.Keys)) {
        $key, $name = $pair.Split('|')
        Remove-RegValue "$Root\$key" $name
    }
}

function Set-HiveRestrictions([string]$Root, $Values) {
    Clear-HiveRestrictions $Root
    foreach ($v in $Values) { Set-RegValue "$Root\$($v.Key)" $v.Name $v.Type $v.Data }
}

function Test-HiveRestrictions([string]$Root) {
    if (Get-RegValue "$Root\$ExplorerPolicyKey" 'RestrictRun') { return $true }
    foreach ($k in $SiteListKeys) { if (Get-RegValue "$Root\$k" '1') { return $true } }
    foreach ($pair in @($ManagedPolPairs.Keys)) {
        $key, $name = $pair.Split('|')
        if (Get-RegValue "$Root\$key" $name) { return $true }
    }
    return $false
}

function Invoke-RegExe([string[]]$Arguments) {
    $proc = Start-Process reg.exe -ArgumentList $Arguments -Wait -PassThru -WindowStyle Hidden
    return $proc.ExitCode
}

# Выполняет действие с реестром каждого обычного пользователя.
# Если пользователь не в системе, его NTUSER.DAT временно подключается в HKEY_USERS.
function Invoke-ForStandardUsers([scriptblock]$Action) {
    $results = New-Object System.Collections.Generic.List[object]
    foreach ($u in @(Get-LocalUserInfo | Where-Object { -not $_.IsAdmin })) {
        $profileKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$($u.Sid)"
        $profilePath = (Get-ItemProperty -LiteralPath $profileKey -Name ProfileImagePath -ErrorAction SilentlyContinue).ProfileImagePath
        if (-not $profilePath) {
            $results.Add([pscustomobject]@{ User = $u.Name; Status = 'noprofile'; Value = $null; Message = 'ещё ни разу не входил в систему — ограничения применятся при первом входе' })
            continue
        }
        $profilePath = [Environment]::ExpandEnvironmentVariables($profilePath)
        $loaded = Test-Path -LiteralPath "Registry::HKEY_USERS\$($u.Sid)"
        $mount = $u.Sid
        if (-not $loaded) {
            $mount = "PolicyManager_$($u.Sid)"
            $hive = Join-Path $profilePath 'NTUSER.DAT'
            if ((Invoke-RegExe @('load', "HKU\$mount", "`"$hive`"")) -ne 0) {
                $results.Add([pscustomobject]@{ User = $u.Name; Status = 'error'; Value = $null; Message = "не удалось открыть профиль ($hive)" })
                continue
            }
        }
        try {
            $value = & $Action "HKU:\$mount"
            $results.Add([pscustomobject]@{ User = $u.Name; Status = 'ok'; Value = $value; LoggedOn = $loaded; Message = '' })
        } catch {
            $results.Add([pscustomobject]@{ User = $u.Name; Status = 'error'; Value = $null; Message = $_.Exception.Message })
        } finally {
            if (-not $loaded) {
                # Профиль можно отключить только после закрытия всех открытых разделов
                for ($try = 0; $try -lt 5; $try++) {
                    [GC]::Collect()
                    [GC]::WaitForPendingFinalizers()
                    if ((Invoke-RegExe @('unload', "HKU\$mount")) -eq 0) { break }
                    Start-Sleep -Milliseconds 500
                }
            }
        }
    }
    return , $results
}

function Format-UserResults($Results) {
    $lines = foreach ($r in $Results) {
        if ($r.Status -eq 'ok') {
            $note = if ($r.LoggedOn) { 'готово (сейчас в системе — нужно выйти и войти снова)' } else { 'готово' }
            "• $($r.User): $note"
        } else {
            "• $($r.User): $($r.Message)"
        }
    }
    return ($lines -join "`r`n")
}

#endregion

function Set-NonAdminRestrictions($Config) {
    $values = Get-RestrictionValues $Config

    # 1. Групповая политика «Не администраторы» — для новых и ещё не входивших пользователей
    $result = New-Object System.Collections.Generic.List[object]
    foreach ($e in (Read-PolFile $NonAdminPolFile)) { if (-not (Test-ManagedPolEntry $e)) { $result.Add($e) } }
    $cleared = @{}
    foreach ($v in $values) {
        if ($ManagedPolKeys -contains $v.Key -and -not $cleared.ContainsKey($v.Key)) {
            $result.Add((New-PolEntry $v.Key '**delvals.' 'String' ' '))
            $cleared[$v.Key] = $true
        }
        $result.Add((New-PolEntry $v.Key $v.Name $v.Type $v.Data))
    }
    Save-NonAdminPol $result

    # 2. Прямая запись в реестр каждого существующего обычного пользователя
    $userResults = Invoke-ForStandardUsers { param($root) Set-HiveRestrictions $root $values }

    # hosts умеет только запрещать домены целиком, поэтому работает лишь в режиме чёрного списка
    $hostsDomains = @($Config.BlockSites | Where-Object { $_ -and -not $_.Contains('/') })
    if ($Config.SitesEnabled -and $Config.SitesMode -ne 'allow' -and $Config.HostsEnabled -and $hostsDomains.Count) { Set-HostsBlock $hostsDomains }
    elseif ((Get-HostsBlockedSites).Count) { Set-HostsBlock @() }

    Export-RestrictionConfig $Config $RestrictionsFile

    $on = @($Lockdowns | Where-Object { $Config.Lockdowns[$_.Id] } | ForEach-Object { $_.Id }) -join ', '
    Write-Log ("Ограничения для не-администраторов: программы={0} [{1}]; сайты={2}, режим={3}, чёрный=[{4}], белый=[{5}]; hosts={6}; запреты=[{7}]" -f `
        $Config.WhitelistEnabled, ($Config.Programs -join ' '), $Config.SitesEnabled, $Config.SitesMode,
        (@($Config.BlockSites) -join ' '), (@($Config.AllowSites) -join ' '), $Config.HostsEnabled, $on)
    Write-Log ("Запись в профили пользователей:`r`n" + (Format-UserResults $userResults))
    return , $userResults
}

function Clear-NonAdminRestrictions {
    $result = New-Object System.Collections.Generic.List[object]
    foreach ($e in (Read-PolFile $NonAdminPolFile)) { if (-not (Test-ManagedPolEntry $e)) { $result.Add($e) } }
    Save-NonAdminPol $result
    $userResults = Invoke-ForStandardUsers { param($root) Clear-HiveRestrictions $root }
    if ((Get-HostsBlockedSites).Count) { Set-HostsBlock @() }
    Write-Log ("Ограничения для не-администраторов сняты:`r`n" + (Format-UserResults $userResults))
    return , $userResults
}

# Действуют ли ограничения у каждого обычного пользователя на самом деле (по его реестру)
function Get-UserRestrictionStatus {
    $map = @{}
    foreach ($r in (Invoke-ForStandardUsers { param($root) Test-HiveRestrictions $root })) { $map[$r.User] = $r }
    return $map
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
    if ($ExportRestrictions) {
        $file = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExportRestrictions)
        Export-RestrictionConfig (Get-NonAdminRestrictions) $file
        Write-Host "Настройки ограничений сохранены: $file"
    }
    if ($ImportRestrictions) {
        if (-not $IsAdmin) { throw 'Для применения ограничений запустите PowerShell от имени администратора.' }
        $file = (Resolve-Path -LiteralPath $ImportRestrictions).ProviderPath
        $cfg = Import-RestrictionConfig $file
        Write-Host (Get-RestrictionSummary $cfg)
        $results = Set-NonAdminRestrictions $cfg
        Write-Host "Ограничения из $file применены:"
        Write-Host (Format-UserResults $results)
    }
}

#endregion

#region Графический интерфейс (WPF)

# Класс строки для списков интерфейса: уведомляет WPF об изменениях, поддерживает группировку
$RowTypeSource = @'
using System.ComponentModel;
namespace PolicyManagerUI {
    public class Row : INotifyPropertyChanged {
        public event PropertyChangedEventHandler PropertyChanged;
        private void Set<T>(ref T field, T value, string name) {
            field = value;
            PropertyChangedEventHandler h = PropertyChanged;
            if (h != null) h(this, new PropertyChangedEventArgs(name));
        }
        private string _title, _subtitle, _badge, _c1, _c2, _c3;
        private object _badgeBg, _badgeFg, _rowBg;
        public string Id { get; set; }
        public string Group { get; set; }
        public object Tag { get; set; }
        public string Title { get { return _title; } set { Set(ref _title, value, "Title"); } }
        public string Subtitle { get { return _subtitle; } set { Set(ref _subtitle, value, "Subtitle"); } }
        public string Badge { get { return _badge; } set { Set(ref _badge, value, "Badge"); } }
        public object BadgeBg { get { return _badgeBg; } set { Set(ref _badgeBg, value, "BadgeBg"); } }
        public object BadgeFg { get { return _badgeFg; } set { Set(ref _badgeFg, value, "BadgeFg"); } }
        public object RowBg { get { return _rowBg; } set { Set(ref _rowBg, value, "RowBg"); } }
        private bool _checked;
        public bool Checked { get { return _checked; } set { Set(ref _checked, value, "Checked"); } }
        public object Icon { get; set; }
        public string C1 { get { return _c1; } set { Set(ref _c1, value, "C1"); } }
        public string C2 { get { return _c2; } set { Set(ref _c2, value, "C2"); } }
        public string C3 { get { return _c3; } set { Set(ref _c3, value, "C3"); } }
    }
}
'@

$MainWindowXaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Policy Manager" Width="1280" Height="860" MinWidth="1060" MinHeight="660"
        WindowStartupLocation="CenterScreen" Background="#F3F4F6"
        FontFamily="Segoe UI" FontSize="13" Foreground="#111827" UseLayoutRounding="True">
  <Window.Resources>
    <Style x:Key="Icon" TargetType="TextBlock">
      <Setter Property="FontFamily" Value="Segoe MDL2 Assets"/>
      <Setter Property="VerticalAlignment" Value="Center"/>
    </Style>
    <Style x:Key="H2" TargetType="TextBlock">
      <Setter Property="FontSize" Value="16"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="VerticalAlignment" Value="Center"/>
    </Style>
    <Style x:Key="Muted" TargetType="TextBlock">
      <Setter Property="Foreground" Value="#6B7280"/>
      <Setter Property="TextWrapping" Value="Wrap"/>
    </Style>
    <Style x:Key="Card" TargetType="Border">
      <Setter Property="Background" Value="White"/>
      <Setter Property="BorderBrush" Value="#E5E7EB"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="CornerRadius" Value="10"/>
      <Setter Property="Padding" Value="20"/>
      <Setter Property="Margin" Value="0,0,0,16"/>
    </Style>

    <Style x:Key="Btn" TargetType="Button">
      <Setter Property="Background" Value="White"/>
      <Setter Property="Foreground" Value="#111827"/>
      <Setter Property="BorderBrush" Value="#D1D5DB"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="Padding" Value="14,7"/>
      <Setter Property="Margin" Value="0,0,8,0"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Grid>
              <Border Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="6"/>
              <Border x:Name="overlay" Background="Black" Opacity="0" CornerRadius="6"/>
              <ContentPresenter Margin="{TemplateBinding Padding}" HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Grid>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="overlay" Property="Opacity" Value="0.06"/></Trigger>
              <Trigger Property="IsPressed" Value="True"><Setter TargetName="overlay" Property="Opacity" Value="0.14"/></Trigger>
              <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.45"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="BtnPrimary" TargetType="Button" BasedOn="{StaticResource Btn}">
      <Setter Property="Background" Value="#2563EB"/>
      <Setter Property="BorderBrush" Value="#2563EB"/>
      <Setter Property="Foreground" Value="White"/>
    </Style>
    <Style x:Key="BtnDanger" TargetType="Button" BasedOn="{StaticResource Btn}">
      <Setter Property="Foreground" Value="#DC2626"/>
      <Setter Property="BorderBrush" Value="#FCA5A5"/>
    </Style>
    <Style x:Key="BtnChip" TargetType="Button" BasedOn="{StaticResource Btn}">
      <Setter Property="Padding" Value="10,4"/>
      <Setter Property="Margin" Value="0,0,6,6"/>
      <Setter Property="FontWeight" Value="Normal"/>
      <Setter Property="Background" Value="#EFF6FF"/>
      <Setter Property="BorderBrush" Value="#BFDBFE"/>
      <Setter Property="Foreground" Value="#1D4ED8"/>
    </Style>
    <Style x:Key="BtnIcon" TargetType="Button">
      <Setter Property="FontFamily" Value="Segoe MDL2 Assets"/>
      <Setter Property="FontSize" Value="11"/>
      <Setter Property="Foreground" Value="#9CA3AF"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="bd" Background="Transparent" CornerRadius="4" Padding="7">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="bd" Property="Background" Value="#FEE2E2"/>
                <Setter Property="Foreground" Value="#DC2626"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="Tile" TargetType="Button">
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Margin" Value="0,0,16,16"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="bd" Background="White" BorderBrush="#E5E7EB" BorderThickness="1" CornerRadius="10" Padding="20">
              <ContentPresenter HorizontalAlignment="Left" VerticalAlignment="Top"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="bd" Property="BorderBrush" Value="#2563EB"/>
                <Setter TargetName="bd" Property="Background" Value="#F8FAFF"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <Style x:Key="Nav" TargetType="RadioButton">
      <Setter Property="Foreground" Value="#D1D5DB"/>
      <Setter Property="FontSize" Value="14"/>
      <Setter Property="Margin" Value="10,2"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="GroupName" Value="nav"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="RadioButton">
            <Border x:Name="bd" Background="Transparent" CornerRadius="6" Padding="12,10">
              <Grid>
                <Grid.ColumnDefinitions>
                  <ColumnDefinition Width="30"/>
                  <ColumnDefinition Width="*"/>
                </Grid.ColumnDefinitions>
                <TextBlock Text="{TemplateBinding Tag}" FontFamily="Segoe MDL2 Assets" FontSize="16" VerticalAlignment="Center"/>
                <ContentPresenter Grid.Column="1" VerticalAlignment="Center"/>
              </Grid>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="bd" Property="Background" Value="#1F2937"/>
                <Setter Property="Foreground" Value="White"/>
              </Trigger>
              <Trigger Property="IsChecked" Value="True">
                <Setter TargetName="bd" Property="Background" Value="#2563EB"/>
                <Setter Property="Foreground" Value="White"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <Style x:Key="Switch" TargetType="CheckBox">
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="VerticalAlignment" Value="Center"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="CheckBox">
            <Grid Background="Transparent">
              <Grid.ColumnDefinitions>
                <ColumnDefinition Width="Auto"/>
                <ColumnDefinition Width="*"/>
              </Grid.ColumnDefinitions>
              <Border x:Name="track" Width="40" Height="22" CornerRadius="11" Background="#D1D5DB" VerticalAlignment="Top" Margin="0,1,0,0">
                <Ellipse x:Name="knob" Width="16" Height="16" Fill="White" HorizontalAlignment="Left" Margin="3,0,0,0"/>
              </Border>
              <ContentPresenter Grid.Column="1" Margin="10,2,0,0" VerticalAlignment="Top"/>
            </Grid>
            <ControlTemplate.Triggers>
              <Trigger Property="IsChecked" Value="True">
                <Setter TargetName="track" Property="Background" Value="#2563EB"/>
                <Setter TargetName="knob" Property="HorizontalAlignment" Value="Right"/>
                <Setter TargetName="knob" Property="Margin" Value="0,0,3,0"/>
              </Trigger>
              <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.5"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <Style x:Key="Input" TargetType="TextBox">
      <Setter Property="Padding" Value="8,6"/>
      <Setter Property="BorderBrush" Value="#D1D5DB"/>
      <Setter Property="Background" Value="White"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="TextBox">
            <Border x:Name="bd" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="1" CornerRadius="6">
              <ScrollViewer x:Name="PART_ContentHost" Margin="{TemplateBinding Padding}" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="bd" Property="BorderBrush" Value="#2563EB"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="Placeholder" TargetType="TextBlock">
      <Setter Property="Foreground" Value="#9CA3AF"/>
      <Setter Property="Margin" Value="10,0,0,0"/>
      <Setter Property="VerticalAlignment" Value="Center"/>
      <Setter Property="IsHitTestVisible" Value="False"/>
    </Style>

    <Style x:Key="RowItem" TargetType="ListBoxItem">
      <Setter Property="Padding" Value="10,7"/>
      <Setter Property="HorizontalContentAlignment" Value="Stretch"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="ListBoxItem">
            <Border x:Name="bd" Background="Transparent" CornerRadius="6" Padding="{TemplateBinding Padding}" Margin="0,1">
              <ContentPresenter HorizontalAlignment="{TemplateBinding HorizontalContentAlignment}"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="bd" Property="Background" Value="#F3F4F6"/></Trigger>
              <Trigger Property="IsSelected" Value="True"><Setter TargetName="bd" Property="Background" Value="#E0EAFF"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="ChipItem" TargetType="ListBoxItem">
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Foreground" Value="#374151"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="ListBoxItem">
            <Border x:Name="bd" Background="White" BorderBrush="#D1D5DB" BorderThickness="1" CornerRadius="14" Padding="12,5" Margin="0,0,6,6">
              <ContentPresenter/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="bd" Property="Background" Value="#F3F4F6"/></Trigger>
              <Trigger Property="IsSelected" Value="True">
                <Setter TargetName="bd" Property="Background" Value="#2563EB"/>
                <Setter TargetName="bd" Property="BorderBrush" Value="#2563EB"/>
                <Setter Property="Foreground" Value="White"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <Style x:Key="Segment" TargetType="RadioButton">
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Foreground" Value="#374151"/>
      <Setter Property="Margin" Value="0,0,8,0"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="RadioButton">
            <Border x:Name="bd" Background="White" BorderBrush="#D1D5DB" BorderThickness="1" CornerRadius="8" Padding="12,8">
              <ContentPresenter/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="bd" Property="Background" Value="#F3F4F6"/></Trigger>
              <Trigger Property="IsChecked" Value="True">
                <Setter TargetName="bd" Property="Background" Value="#EFF6FF"/>
                <Setter TargetName="bd" Property="BorderBrush" Value="#2563EB"/>
                <Setter Property="Foreground" Value="#1D4ED8"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <DataTemplate x:Key="StringRow">
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <TextBlock Style="{StaticResource Icon}" Text="{Binding Tag, RelativeSource={RelativeSource AncestorType=ListBox}}" Foreground="#9CA3AF" Margin="0,0,10,0"/>
        <TextBlock Grid.Column="1" Text="{Binding}" VerticalAlignment="Center" TextTrimming="CharacterEllipsis"/>
        <Button Grid.Column="2" Style="{StaticResource BtnIcon}" Tag="{Binding}" ToolTip="Удалить" Content="&#xE711;"/>
      </Grid>
    </DataTemplate>
  </Window.Resources>

  <Grid>
    <Grid.ColumnDefinitions>
      <ColumnDefinition Width="240"/>
      <ColumnDefinition Width="*"/>
    </Grid.ColumnDefinitions>

    <!-- Боковое меню -->
    <Border Background="#111827">
      <DockPanel>
        <StackPanel DockPanel.Dock="Top" Orientation="Horizontal" Margin="20,22,20,26">
          <Border Width="38" Height="38" CornerRadius="9" Background="#2563EB">
            <TextBlock Style="{StaticResource Icon}" Text="&#xEA18;" Foreground="White" FontSize="19" HorizontalAlignment="Center"/>
          </Border>
          <StackPanel Margin="12,0,0,0" VerticalAlignment="Center">
            <TextBlock Text="Policy Manager" Foreground="White" FontSize="16" FontWeight="SemiBold"/>
            <TextBlock x:Name="txtVersion" Foreground="#9CA3AF" FontSize="11"/>
          </StackPanel>
        </StackPanel>
        <StackPanel DockPanel.Dock="Bottom" Margin="20,0,20,20">
          <Border x:Name="badgeAdmin" CornerRadius="6" Padding="10,6" Margin="0,0,0,10">
            <StackPanel Orientation="Horizontal">
              <TextBlock x:Name="badgeAdminIcon" Style="{StaticResource Icon}" FontSize="13" Margin="0,0,8,0"/>
              <TextBlock x:Name="badgeAdminText" FontSize="12" TextWrapping="Wrap" MaxWidth="160"/>
            </StackPanel>
          </Border>
          <TextBlock x:Name="txtOS" Foreground="#9CA3AF" FontSize="11" TextWrapping="Wrap"/>
        </StackPanel>
        <StackPanel>
          <RadioButton x:Name="navRestrict" Style="{StaticResource Nav}" Tag="&#xE72E;" Content="Ограничения" IsChecked="True"/>
          <RadioButton x:Name="navPolicies" Style="{StaticResource Nav}" Tag="&#xE713;" Content="Политики"/>
          <RadioButton x:Name="navRegistry" Style="{StaticResource Nav}" Tag="&#xE71D;" Content="Реестр"/>
          <RadioButton x:Name="navProfiles" Style="{StaticResource Nav}" Tag="&#xE8F1;" Content="Профили и копии"/>
          <RadioButton x:Name="navTools" Style="{StaticResource Nav}" Tag="&#xE90F;" Content="Инструменты"/>
          <RadioButton x:Name="navAudit" Style="{StaticResource Nav}" Tag="&#xE81C;" Content="Журнал"/>
          <RadioButton x:Name="navAbout" Style="{StaticResource Nav}" Tag="&#xE946;" Content="О программе"/>
        </StackPanel>
      </DockPanel>
    </Border>

    <!-- Основная область -->
    <Grid Grid.Column="1">
      <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="*"/>
      </Grid.RowDefinitions>

      <Grid Margin="32,24,32,16">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <StackPanel>
          <TextBlock x:Name="txtPageTitle" FontSize="26" FontWeight="SemiBold"/>
          <TextBlock x:Name="txtPageSubtitle" Style="{StaticResource Muted}" FontSize="14" Margin="0,4,0,0"/>
        </StackPanel>
        <Button x:Name="btnRefresh" Grid.Column="1" Style="{StaticResource Btn}" VerticalAlignment="Center" Margin="0" ToolTip="Перечитать состояние (F5)">
          <StackPanel Orientation="Horizontal">
            <TextBlock Style="{StaticResource Icon}" Text="&#xE72C;" Margin="0,0,8,0"/>
            <TextBlock Text="Обновить"/>
          </StackPanel>
        </Button>
      </Grid>

      <Border x:Name="bannerAdmin" Grid.Row="1" Margin="32,0,32,16" Background="#FEF3C7" BorderBrush="#FCD34D" BorderThickness="1" CornerRadius="8" Padding="16,10" Visibility="Collapsed">
        <Grid>
          <Grid.ColumnDefinitions>
            <ColumnDefinition Width="Auto"/>
            <ColumnDefinition Width="*"/>
            <ColumnDefinition Width="Auto"/>
          </Grid.ColumnDefinitions>
          <TextBlock Style="{StaticResource Icon}" Text="&#xE7BA;" Foreground="#B45309" FontSize="16" Margin="0,0,12,0"/>
          <TextBlock Grid.Column="1" Foreground="#92400E" TextWrapping="Wrap" VerticalAlignment="Center" Text="Программа запущена без прав администратора — изменить можно только политики текущего пользователя."/>
          <Button x:Name="btnElevate" Grid.Column="2" Style="{StaticResource BtnPrimary}" Content="Запустить от администратора" Margin="12,0,0,0"/>
        </Grid>
      </Border>

      <Grid Grid.Row="2">

        <!-- ===== Ограничения ===== -->
        <ScrollViewer x:Name="pageRestrict" VerticalScrollBarVisibility="Auto">
          <StackPanel Margin="32,0,32,24">
            <Border x:Name="warnHome" Background="#FEE2E2" BorderBrush="#FCA5A5" BorderThickness="1" CornerRadius="8" Padding="16,10" Margin="0,0,0,16" Visibility="Collapsed">
              <TextBlock Foreground="#991B1B" TextWrapping="Wrap" Text="Windows Home: локальная политика «Не администраторы» в этой редакции может не применяться. Для этой функции нужна Windows Pro или выше."/>
            </Border>

            <Border Style="{StaticResource Card}">
              <Grid>
                <Grid.ColumnDefinitions>
                  <ColumnDefinition Width="Auto"/>
                  <ColumnDefinition Width="*"/>
                  <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <Border x:Name="stateIconBg" Width="48" Height="48" CornerRadius="24" VerticalAlignment="Center">
                  <TextBlock x:Name="stateIcon" Style="{StaticResource Icon}" FontSize="22" HorizontalAlignment="Center"/>
                </Border>
                <StackPanel Grid.Column="1" Margin="16,0" VerticalAlignment="Center">
                  <TextBlock x:Name="txtRState" Style="{StaticResource H2}" FontSize="18"/>
                  <TextBlock Style="{StaticResource Muted}" Margin="0,4,0,0" Text="Запреты действуют на всех пользователей без прав администратора, в том числе на новые учётные записи. Администраторов они не касаются. Вступают в силу после повторного входа пользователя."/>
                </StackPanel>
                <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
                  <Button x:Name="btnRClear" Style="{StaticResource BtnDanger}" Content="Снять все"/>
                  <Button x:Name="btnRApply" Style="{StaticResource BtnPrimary}" Margin="0" Padding="18,9">
                    <StackPanel Orientation="Horizontal">
                      <TextBlock Style="{StaticResource Icon}" Text="&#xE73E;" Margin="0,0,8,0"/>
                      <TextBlock Text="Применить ограничения"/>
                    </StackPanel>
                  </Button>
                </StackPanel>
              </Grid>
            </Border>

            <Border Style="{StaticResource Card}">
              <StackPanel>
                <Grid Margin="0,0,0,4">
                  <StackPanel Orientation="Horizontal">
                    <TextBlock Style="{StaticResource Icon}" Text="&#xE716;" FontSize="16" Foreground="#2563EB" Margin="0,0,10,0"/>
                    <TextBlock Style="{StaticResource H2}" Text="Пользователи этого компьютера"/>
                  </StackPanel>
                  <Button x:Name="btnCheckUsers" Style="{StaticResource BtnChip}" HorizontalAlignment="Right" Margin="0" Content="Проверить, действуют ли ограничения"/>
                </Grid>
                <TextBlock Style="{StaticResource Muted}" Margin="0,0,0,12" Text="Ограничения получат только обычные учётные записи. Тип учётной записи меняется в Параметры → Учётные записи → Другие пользователи."/>
                <ItemsControl x:Name="icUsers">
                  <ItemsControl.ItemsPanel>
                    <ItemsPanelTemplate><WrapPanel/></ItemsPanelTemplate>
                  </ItemsControl.ItemsPanel>
                  <ItemsControl.ItemTemplate>
                    <DataTemplate>
                      <Border BorderBrush="#E5E7EB" BorderThickness="1" CornerRadius="8" Padding="12,8,16,8" Margin="0,0,10,10" Background="#F9FAFB">
                        <StackPanel Orientation="Horizontal">
                          <Border Width="34" Height="34" CornerRadius="17" Background="{Binding RowBg}">
                            <TextBlock Text="{Binding C1}" Foreground="White" FontWeight="Bold" FontSize="14" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                          </Border>
                          <StackPanel Margin="10,0,0,0" VerticalAlignment="Center">
                            <TextBlock Text="{Binding Title}" FontWeight="SemiBold"/>
                            <Border Background="{Binding BadgeBg}" CornerRadius="8" Padding="8,1" HorizontalAlignment="Left" Margin="0,3,0,0">
                              <TextBlock Text="{Binding Badge}" Foreground="{Binding BadgeFg}" FontSize="11"/>
                            </Border>
                          </StackPanel>
                        </StackPanel>
                      </Border>
                    </DataTemplate>
                  </ItemsControl.ItemTemplate>
                </ItemsControl>
                <TextBlock x:Name="txtUsersWarn" Foreground="#B91C1C" TextWrapping="Wrap" Visibility="Collapsed" Text="Нет ни одной обычной учётной записи — ограничения ни на кого не подействуют. Создайте пользователя или смените тип существующего на «Стандартный»."/>
              </StackPanel>
            </Border>

            <Grid>
              <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="16"/>
                <ColumnDefinition Width="*"/>
              </Grid.ColumnDefinitions>

              <Border Style="{StaticResource Card}">
                <StackPanel>
                  <Grid Margin="0,0,0,4">
                    <StackPanel Orientation="Horizontal">
                      <TextBlock Style="{StaticResource Icon}" Text="&#xE71D;" FontSize="16" Foreground="#2563EB" Margin="0,0,10,0"/>
                      <TextBlock Style="{StaticResource H2}" Text="Разрешённые программы (исключения)"/>
                    </StackPanel>
                    <CheckBox x:Name="chkWl" Style="{StaticResource Switch}" HorizontalAlignment="Right"/>
                  </Grid>
                  <TextBlock Style="{StaticResource Muted}" Margin="0,0,0,12" Text="Запускаться будут только программы из этого списка, всё остальное — запрещено. Нажмите «Выбрать из установленных» и отметьте нужные."/>
                  <StackPanel IsEnabled="{Binding IsChecked, ElementName=chkWl}">
                    <Grid Margin="0,0,0,8">
                      <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                      </Grid.ColumnDefinitions>
                      <Grid>
                        <TextBox x:Name="txtProgAdd" Style="{StaticResource Input}"/>
                        <TextBlock x:Name="phProgAdd" Style="{StaticResource Placeholder}" Text="Например: steam.exe"/>
                      </Grid>
                      <Button x:Name="btnProgAdd" Grid.Column="1" Style="{StaticResource BtnPrimary}" Margin="8,0,0,0" Content="Добавить"/>
                    </Grid>
                    <WrapPanel Margin="0,0,0,8">
                      <Button x:Name="btnProgPick" Style="{StaticResource BtnChip}" Background="#2563EB" BorderBrush="#2563EB" Foreground="White" FontWeight="SemiBold" Content="Выбрать из установленных…"/>
                      <Button x:Name="btnProgBrowse" Style="{StaticResource BtnChip}" Content="Указать файл .exe…"/>
                      <Button x:Name="btnProgClear" Style="{StaticResource BtnChip}" Content="Очистить"/>
                    </WrapPanel>
                    <Border BorderBrush="#E5E7EB" BorderThickness="1" CornerRadius="8" Padding="4">
                      <ListBox x:Name="lbProg" Height="250" BorderThickness="0" Tag="&#xE7AC;" ItemContainerStyle="{StaticResource RowItem}" ItemTemplate="{StaticResource StringRow}" ScrollViewer.HorizontalScrollBarVisibility="Disabled"/>
                    </Border>
                    <TextBlock x:Name="txtProgCount" Style="{StaticResource Muted}" FontSize="12" Margin="2,8,0,0"/>
                  </StackPanel>
                </StackPanel>
              </Border>

              <Border Grid.Column="2" Style="{StaticResource Card}">
                <StackPanel>
                  <Grid Margin="0,0,0,4">
                    <StackPanel Orientation="Horizontal">
                      <TextBlock Style="{StaticResource Icon}" Text="&#xE774;" FontSize="16" Foreground="#2563EB" Margin="0,0,10,0"/>
                      <TextBlock Style="{StaticResource H2}" Text="Сайты"/>
                    </StackPanel>
                    <CheckBox x:Name="chkSites" Style="{StaticResource Switch}" HorizontalAlignment="Right"/>
                  </Grid>
                  <StackPanel IsEnabled="{Binding IsChecked, ElementName=chkSites}">
                    <UniformGrid Columns="2" Margin="0,8,0,10">
                      <RadioButton x:Name="rbSitesBlock" Style="{StaticResource Segment}" GroupName="sitesmode" IsChecked="True">
                        <StackPanel>
                          <TextBlock FontWeight="SemiBold" Text="Чёрный список"/>
                          <TextBlock FontSize="11" Opacity="0.8" TextWrapping="Wrap" Text="Запретить указанные сайты"/>
                        </StackPanel>
                      </RadioButton>
                      <RadioButton x:Name="rbSitesAllow" Style="{StaticResource Segment}" GroupName="sitesmode" Margin="0">
                        <StackPanel>
                          <TextBlock FontWeight="SemiBold" Text="Белый список"/>
                          <TextBlock FontSize="11" Opacity="0.8" TextWrapping="Wrap" Text="Разрешить только указанные"/>
                        </StackPanel>
                      </RadioButton>
                    </UniformGrid>
                    <TextBlock x:Name="txtSitesDesc" Style="{StaticResource Muted}" Margin="0,0,0,12"/>
                    <Grid Margin="0,0,0,8">
                      <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                      </Grid.ColumnDefinitions>
                      <Grid>
                        <TextBox x:Name="txtSiteAdd" Style="{StaticResource Input}"/>
                        <TextBlock x:Name="phSiteAdd" Style="{StaticResource Placeholder}" Text="Например: youtube.com"/>
                      </Grid>
                      <Button x:Name="btnSiteAdd" Grid.Column="1" Style="{StaticResource BtnPrimary}" Margin="8,0,0,0" Content="Добавить"/>
                    </Grid>
                    <WrapPanel x:Name="pnlQuickAllow" Margin="0,0,0,8" Visibility="Collapsed">
                      <Button x:Name="btnAllowSearch" Style="{StaticResource BtnChip}" Content="+ Поисковики"/>
                      <Button x:Name="btnAllowStudy" Style="{StaticResource BtnChip}" Content="+ Учёба"/>
                      <Button x:Name="btnAllowAccounts" Style="{StaticResource BtnChip}" Content="+ Вход Microsoft/Google/Яндекс"/>
                      <Button x:Name="btnAllowMail" Style="{StaticResource BtnChip}" Content="+ Почта"/>
                      <Button x:Name="btnAllowGov" Style="{StaticResource BtnChip}" Content="+ Госуслуги"/>
                    </WrapPanel>
                    <WrapPanel x:Name="pnlQuickBlock" Margin="0,0,0,8">
                      <Button x:Name="btnQuickSocial" Style="{StaticResource BtnChip}" Content="+ Соцсети"/>
                      <Button x:Name="btnQuickVideo" Style="{StaticResource BtnChip}" Content="+ Видео"/>
                      <Button x:Name="btnQuickGames" Style="{StaticResource BtnChip}" Content="+ Игры"/>
                      <Button x:Name="btnQuickMessengers" Style="{StaticResource BtnChip}" Content="+ Мессенджеры"/>
                      <Button x:Name="btnQuickCinema" Style="{StaticResource BtnChip}" Content="+ Кино и сериалы"/>
                      <Button x:Name="btnQuickBets" Style="{StaticResource BtnChip}" Content="+ Ставки и казино"/>
                    </WrapPanel>
                    <Border BorderBrush="#E5E7EB" BorderThickness="1" CornerRadius="8" Padding="4">
                      <ListBox x:Name="lbSites" Height="250" BorderThickness="0" Tag="&#xE774;" ItemContainerStyle="{StaticResource RowItem}" ItemTemplate="{StaticResource StringRow}" ScrollViewer.HorizontalScrollBarVisibility="Disabled"/>
                    </Border>
                    <TextBlock x:Name="txtSitesCount" Style="{StaticResource Muted}" FontSize="12" Margin="2,8,0,0"/>
                    <CheckBox x:Name="chkHosts" Style="{StaticResource Switch}" Margin="0,12,0,0">
                      <TextBlock TextWrapping="Wrap" Text="Также через файл hosts — работает в любом браузере, но и для администратора тоже"/>
                    </CheckBox>
                  </StackPanel>
                </StackPanel>
              </Border>
            </Grid>

            <Border Style="{StaticResource Card}">
              <StackPanel>
                <StackPanel Orientation="Horizontal" Margin="0,0,0,4">
                  <TextBlock Style="{StaticResource Icon}" Text="&#xEA18;" FontSize="16" Foreground="#2563EB" Margin="0,0,10,0"/>
                  <TextBlock Style="{StaticResource H2}" Text="Защита от обхода"/>
                </StackPanel>
                <TextBlock Style="{StaticResource Muted}" Margin="0,0,0,14" Text="Закрывают лазейки, через которые можно снять ограничения или запустить запрещённую программу."/>
                <UniformGrid x:Name="pnlLockdowns" Columns="2"/>
              </StackPanel>
            </Border>

            <Border Style="{StaticResource Card}">
              <Grid>
                <Grid.ColumnDefinitions>
                  <ColumnDefinition Width="Auto"/>
                  <ColumnDefinition Width="*"/>
                  <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <Border Width="44" Height="44" CornerRadius="10" Background="#EFF6FF" VerticalAlignment="Top">
                  <TextBlock Style="{StaticResource Icon}" Text="&#xE8B7;" FontSize="20" Foreground="#2563EB" HorizontalAlignment="Center"/>
                </Border>
                <StackPanel Grid.Column="1" Margin="16,0">
                  <TextBlock Style="{StaticResource H2}" Text="Перенос настроек ограничений"/>
                  <TextBlock Style="{StaticResource Muted}" Margin="0,4,0,0" Text="Сохраните программы, сайты и запреты в файл .json и загрузите его в Policy Manager на другом компьютере. Без интерфейса: PolicyManager.ps1 -ImportRestrictions файл.json (от администратора)."/>
                </StackPanel>
                <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
                  <Button x:Name="btnRExport" Style="{StaticResource Btn}" Content="Сохранить в файл…"/>
                  <Button x:Name="btnRImport" Style="{StaticResource Btn}" Margin="0" Content="Загрузить из файла…"/>
                </StackPanel>
              </Grid>
            </Border>
          </StackPanel>
        </ScrollViewer>

        <!-- ===== Политики ===== -->
        <Grid x:Name="pagePolicies" Margin="32,0,32,24" Visibility="Collapsed">
          <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
          </Grid.RowDefinitions>
          <Grid Margin="0,0,0,12">
            <Grid.ColumnDefinitions>
              <ColumnDefinition Width="420"/>
              <ColumnDefinition Width="*"/>
            </Grid.ColumnDefinitions>
            <Grid>
              <TextBox x:Name="txtPolSearch" Style="{StaticResource Input}" Padding="34,8,8,8"/>
              <TextBlock Style="{StaticResource Icon}" Text="&#xE721;" Foreground="#9CA3AF" Margin="12,0,0,0" HorizontalAlignment="Left" IsHitTestVisible="False"/>
              <TextBlock x:Name="phPolSearch" Style="{StaticResource Placeholder}" Margin="36,0,0,0" Text="Поиск политики…"/>
            </Grid>
            <TextBlock x:Name="txtPolCount" Grid.Column="1" Style="{StaticResource Muted}" HorizontalAlignment="Right" VerticalAlignment="Center"/>
          </Grid>
          <ListBox x:Name="lbCats" Grid.Row="1" Background="Transparent" BorderThickness="0" Margin="0,0,0,8" ItemContainerStyle="{StaticResource ChipItem}" DisplayMemberPath="Title" ScrollViewer.HorizontalScrollBarVisibility="Disabled">
            <ListBox.ItemsPanel>
              <ItemsPanelTemplate><WrapPanel/></ItemsPanelTemplate>
            </ListBox.ItemsPanel>
          </ListBox>
          <Grid Grid.Row="2">
            <Grid.ColumnDefinitions>
              <ColumnDefinition Width="*"/>
              <ColumnDefinition Width="16"/>
              <ColumnDefinition Width="400"/>
            </Grid.ColumnDefinitions>
            <Border Style="{StaticResource Card}" Padding="8" Margin="0">
              <ListBox x:Name="lbPolicies" BorderThickness="0" ItemContainerStyle="{StaticResource RowItem}" ScrollViewer.HorizontalScrollBarVisibility="Disabled" VirtualizingPanel.IsVirtualizingWhenGrouping="True">
                <ListBox.GroupStyle>
                  <GroupStyle>
                    <GroupStyle.HeaderTemplate>
                      <DataTemplate>
                        <TextBlock Text="{Binding Name}" FontWeight="Bold" FontSize="11" Foreground="#6B7280" Margin="10,14,0,4"/>
                      </DataTemplate>
                    </GroupStyle.HeaderTemplate>
                  </GroupStyle>
                </ListBox.GroupStyle>
                <ListBox.ItemTemplate>
                  <DataTemplate>
                    <Grid>
                      <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                      </Grid.ColumnDefinitions>
                      <StackPanel Margin="0,0,12,0">
                        <TextBlock Text="{Binding Title}" FontWeight="SemiBold" TextTrimming="CharacterEllipsis"/>
                        <TextBlock Text="{Binding Subtitle}" FontSize="11" Foreground="#9CA3AF"/>
                      </StackPanel>
                      <Border Grid.Column="1" Background="{Binding BadgeBg}" CornerRadius="10" Padding="10,3" VerticalAlignment="Center" MaxWidth="280">
                        <TextBlock Text="{Binding Badge}" Foreground="{Binding BadgeFg}" FontSize="12" TextTrimming="CharacterEllipsis"/>
                      </Border>
                    </Grid>
                  </DataTemplate>
                </ListBox.ItemTemplate>
              </ListBox>
            </Border>
            <Border Grid.Column="2" Style="{StaticResource Card}" Margin="0">
              <Grid>
                <StackPanel x:Name="pnlPolEmpty" VerticalAlignment="Center" HorizontalAlignment="Center">
                  <TextBlock Style="{StaticResource Icon}" Text="&#xE713;" FontSize="40" Foreground="#D1D5DB" HorizontalAlignment="Center"/>
                  <TextBlock Style="{StaticResource Muted}" Margin="0,12,0,0" Text="Выберите политику в списке"/>
                </StackPanel>
                <ScrollViewer x:Name="pnlPolDetails" VerticalScrollBarVisibility="Auto" Visibility="Collapsed">
                  <StackPanel>
                    <TextBlock x:Name="txtPolCategory" FontSize="11" FontWeight="Bold" Foreground="#2563EB"/>
                    <TextBlock x:Name="txtPolName" FontSize="18" FontWeight="SemiBold" TextWrapping="Wrap" Margin="0,4,0,8"/>
                    <TextBlock x:Name="txtPolDesc" Style="{StaticResource Muted}" FontSize="13"/>
                    <Border x:Name="pnlPolHint" Background="#FEF3C7" CornerRadius="6" Padding="10,6" Margin="0,12,0,0" Visibility="Collapsed">
                      <TextBlock x:Name="txtPolHint" Foreground="#92400E" FontSize="12" TextWrapping="Wrap"/>
                    </Border>
                    <TextBlock Text="ЗНАЧЕНИЕ" FontSize="11" FontWeight="Bold" Foreground="#6B7280" Margin="0,20,0,6"/>
                    <ComboBox x:Name="cmbPolValue" DisplayMemberPath="Title" Padding="8,6" FontSize="13"/>
                    <StackPanel Orientation="Horizontal" Margin="0,12,0,0">
                      <Button x:Name="btnPolApply" Style="{StaticResource BtnPrimary}" Content="Применить"/>
                      <Button x:Name="btnPolUnset" Style="{StaticResource Btn}" Content="Не задано"/>
                    </StackPanel>
                    <TextBlock Text="ПАРАМЕТРЫ РЕЕСТРА" FontSize="11" FontWeight="Bold" Foreground="#6B7280" Margin="0,24,0,6"/>
                    <Border Background="#F9FAFB" BorderBrush="#E5E7EB" BorderThickness="1" CornerRadius="6" Padding="10">
                      <TextBlock x:Name="txtPolReg" FontFamily="Consolas" FontSize="11" TextWrapping="Wrap" Foreground="#374151"/>
                    </Border>
                    <WrapPanel Margin="0,10,0,0">
                      <Button x:Name="btnPolRegedit" Style="{StaticResource BtnChip}" Content="Открыть в regedit"/>
                      <Button x:Name="btnPolCopy" Style="{StaticResource BtnChip}" Content="Копировать пути"/>
                    </WrapPanel>
                  </StackPanel>
                </ScrollViewer>
              </Grid>
            </Border>
          </Grid>
        </Grid>

        <!-- ===== Реестр ===== -->
        <Grid x:Name="pageRegistry" Margin="32,0,32,24" Visibility="Collapsed">
          <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
          </Grid.RowDefinitions>
          <Grid Margin="0,0,0,10">
            <Grid.ColumnDefinitions>
              <ColumnDefinition Width="Auto"/>
              <ColumnDefinition Width="*"/>
              <ColumnDefinition Width="320"/>
            </Grid.ColumnDefinitions>
            <StackPanel Orientation="Horizontal">
              <Button x:Name="btnScan" Style="{StaticResource BtnPrimary}" Content="Сканировать"/>
              <Button x:Name="btnRegDelete" Style="{StaticResource BtnDanger}" Content="Удалить выбранные"/>
              <Button x:Name="btnRegOpen" Style="{StaticResource Btn}" Content="Открыть в regedit"/>
              <Button x:Name="btnRegExport" Style="{StaticResource Btn}" Content="Экспорт в .reg"/>
            </StackPanel>
            <Grid Grid.Column="2">
              <TextBox x:Name="txtRegFilter" Style="{StaticResource Input}" Padding="34,8,8,8"/>
              <TextBlock Style="{StaticResource Icon}" Text="&#xE721;" Foreground="#9CA3AF" Margin="12,0,0,0" HorizontalAlignment="Left" IsHitTestVisible="False"/>
              <TextBlock x:Name="phRegFilter" Style="{StaticResource Placeholder}" Margin="36,0,0,0" Text="Фильтр…"/>
            </Grid>
          </Grid>
          <TextBlock x:Name="txtRegInfo" Grid.Row="1" Style="{StaticResource Muted}" Margin="0,0,0,10" Text="Серым отмечены системные значения (CurrentVersion\Policies) — их удаление может нарушить работу Windows."/>
          <Border Grid.Row="2" Style="{StaticResource Card}" Padding="0" Margin="0">
            <DataGrid x:Name="dgReg" AutoGenerateColumns="False" IsReadOnly="True" SelectionMode="Extended" HeadersVisibility="Column"
                      GridLinesVisibility="Horizontal" HorizontalGridLinesBrush="#F3F4F6" BorderThickness="0" Background="White"
                      RowHeight="30" CanUserAddRows="False" CanUserResizeRows="False">
              <DataGrid.ColumnHeaderStyle>
                <Style TargetType="DataGridColumnHeader">
                  <Setter Property="Background" Value="#F9FAFB"/>
                  <Setter Property="Foreground" Value="#6B7280"/>
                  <Setter Property="FontWeight" Value="SemiBold"/>
                  <Setter Property="Padding" Value="10,8"/>
                  <Setter Property="BorderBrush" Value="#E5E7EB"/>
                  <Setter Property="BorderThickness" Value="0,0,0,1"/>
                </Style>
              </DataGrid.ColumnHeaderStyle>
              <DataGrid.RowStyle>
                <Style TargetType="DataGridRow">
                  <Setter Property="Background" Value="{Binding RowBg}"/>
                </Style>
              </DataGrid.RowStyle>
              <DataGrid.CellStyle>
                <Style TargetType="DataGridCell">
                  <Setter Property="BorderThickness" Value="0"/>
                  <Setter Property="VerticalContentAlignment" Value="Center"/>
                </Style>
              </DataGrid.CellStyle>
              <DataGrid.Columns>
                <DataGridTextColumn Header="Раздел" Binding="{Binding Title}" Width="*"/>
                <DataGridTextColumn Header="Параметр" Binding="{Binding Subtitle}" Width="220"/>
                <DataGridTextColumn Header="Тип" Binding="{Binding C1}" Width="90"/>
                <DataGridTextColumn Header="Значение" Binding="{Binding C2}" Width="200"/>
                <DataGridTextColumn Header="В каталоге" Binding="{Binding C3}" Width="90"/>
              </DataGrid.Columns>
            </DataGrid>
          </Border>
        </Grid>

        <!-- ===== Профили и копии ===== -->
        <ScrollViewer x:Name="pageProfiles" VerticalScrollBarVisibility="Auto" Visibility="Collapsed">
          <StackPanel Margin="32,0,32,24">
            <Border Style="{StaticResource Card}">
              <StackPanel>
                <TextBlock Style="{StaticResource H2}" Text="Готовые профили"/>
                <TextBlock Style="{StaticResource Muted}" Margin="0,4,0,14" Text="Набор политик применяется в один клик. Перед изменениями автоматически создаётся резервная копия."/>
                <ItemsControl x:Name="icProfiles">
                  <ItemsControl.ItemTemplate>
                    <DataTemplate>
                      <Border BorderBrush="#E5E7EB" BorderThickness="1" CornerRadius="8" Padding="16,12" Margin="0,0,0,10">
                        <Grid>
                          <Grid.ColumnDefinitions>
                            <ColumnDefinition Width="Auto"/>
                            <ColumnDefinition Width="*"/>
                            <ColumnDefinition Width="Auto"/>
                          </Grid.ColumnDefinitions>
                          <Border Width="40" Height="40" CornerRadius="8" Background="#EFF6FF">
                            <TextBlock Style="{StaticResource Icon}" Text="&#xE8F1;" FontSize="18" Foreground="#2563EB" HorizontalAlignment="Center"/>
                          </Border>
                          <StackPanel Grid.Column="1" Margin="14,0" VerticalAlignment="Center">
                            <TextBlock Text="{Binding Title}" FontWeight="SemiBold" FontSize="14"/>
                            <TextBlock Text="{Binding Subtitle}" Foreground="#6B7280" TextWrapping="Wrap"/>
                          </StackPanel>
                          <Button Grid.Column="2" Style="{StaticResource BtnPrimary}" Content="Применить" Tag="{Binding Id}" VerticalAlignment="Center" Margin="0"/>
                        </Grid>
                      </Border>
                    </DataTemplate>
                  </ItemsControl.ItemTemplate>
                </ItemsControl>
                <WrapPanel Margin="0,6,0,0">
                  <Button x:Name="btnProfileFile" Style="{StaticResource Btn}" Content="Применить профиль из файла…"/>
                  <Button x:Name="btnProfileSave" Style="{StaticResource Btn}" Content="Сохранить текущие настройки как профиль…"/>
                </WrapPanel>
              </StackPanel>
            </Border>
            <Border Style="{StaticResource Card}">
              <StackPanel>
                <TextBlock Style="{StaticResource H2}" Text="Резервные копии"/>
                <TextBlock Style="{StaticResource Muted}" Margin="0,4,0,14" Text="Сохраняют значения всех политик каталога. Копия также создаётся автоматически перед первым изменением за сеанс."/>
                <WrapPanel>
                  <Button x:Name="btnBackup" Style="{StaticResource BtnPrimary}" Content="Создать резервную копию"/>
                  <Button x:Name="btnRestore" Style="{StaticResource Btn}" Content="Восстановить из копии…"/>
                  <Button x:Name="btnOpenBackups" Style="{StaticResource Btn}" Content="Открыть папку с копиями"/>
                </WrapPanel>
              </StackPanel>
            </Border>
            <Border Style="{StaticResource Card}" BorderBrush="#FCA5A5">
              <Grid>
                <Grid.ColumnDefinitions>
                  <ColumnDefinition Width="*"/>
                  <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <StackPanel>
                  <TextBlock Style="{StaticResource H2}" Foreground="#B91C1C" Text="Сброс политик каталога"/>
                  <TextBlock Style="{StaticResource Muted}" Margin="0,4,16,0" Text="Все политики каталога вернутся в состояние «Не задано». Настройки UAC, подписи SMB и длинных путей не затрагиваются."/>
                </StackPanel>
                <Button x:Name="btnResetAll" Grid.Column="1" Style="{StaticResource BtnDanger}" VerticalAlignment="Center" Margin="0" Content="Сбросить всё"/>
              </Grid>
            </Border>
          </StackPanel>
        </ScrollViewer>

        <!-- ===== Инструменты ===== -->
        <ScrollViewer x:Name="pageTools" VerticalScrollBarVisibility="Auto" Visibility="Collapsed">
          <UniformGrid Columns="3" Margin="32,0,16,24" VerticalAlignment="Top">
            <Button x:Name="btnToolGpupdate" Style="{StaticResource Tile}">
              <StackPanel>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE895;" FontSize="26" Foreground="#2563EB" HorizontalAlignment="Left"/>
                <TextBlock Text="gpupdate /force" FontSize="15" FontWeight="SemiBold" Margin="0,12,0,4"/>
                <TextBlock Style="{StaticResource Muted}" Text="Принудительно применить групповые политики"/>
              </StackPanel>
            </Button>
            <Button x:Name="btnToolGpresult" Style="{StaticResource Tile}">
              <StackPanel>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE9D9;" FontSize="26" Foreground="#2563EB" HorizontalAlignment="Left"/>
                <TextBlock Text="Отчёт gpresult" FontSize="15" FontWeight="SemiBold" Margin="0,12,0,4"/>
                <TextBlock Style="{StaticResource Muted}" Text="HTML-отчёт о применённых политиках"/>
              </StackPanel>
            </Button>
            <Button x:Name="btnToolGpedit" Style="{StaticResource Tile}">
              <StackPanel>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE713;" FontSize="26" Foreground="#2563EB" HorizontalAlignment="Left"/>
                <TextBlock Text="Редактор gpedit.msc" FontSize="15" FontWeight="SemiBold" Margin="0,12,0,4"/>
                <TextBlock Style="{StaticResource Muted}" Text="Стандартный редактор локальной групповой политики"/>
              </StackPanel>
            </Button>
            <Button x:Name="btnToolExplorer" Style="{StaticResource Tile}">
              <StackPanel>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE72C;" FontSize="26" Foreground="#2563EB" HorizontalAlignment="Left"/>
                <TextBlock Text="Перезапуск Проводника" FontSize="15" FontWeight="SemiBold" Margin="0,12,0,4"/>
                <TextBlock Style="{StaticResource Muted}" Text="Применить изменения интерфейса без выхода из системы"/>
              </StackPanel>
            </Button>
            <Button x:Name="btnToolLog" Style="{StaticResource Tile}">
              <StackPanel>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE81C;" FontSize="26" Foreground="#2563EB" HorizontalAlignment="Left"/>
                <TextBlock Text="Журнал изменений" FontSize="15" FontWeight="SemiBold" Margin="0,12,0,4"/>
                <TextBlock Style="{StaticResource Muted}" Text="Что, когда и как было изменено"/>
              </StackPanel>
            </Button>
            <Button x:Name="btnToolData" Style="{StaticResource Tile}">
              <StackPanel>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE8B7;" FontSize="26" Foreground="#2563EB" HorizontalAlignment="Left"/>
                <TextBlock Text="Папка данных" FontSize="15" FontWeight="SemiBold" Margin="0,12,0,4"/>
                <TextBlock Style="{StaticResource Muted}" Text="Резервные копии и журнал"/>
              </StackPanel>
            </Button>
            <Button x:Name="btnToolAudit" Style="{StaticResource Tile}">
              <StackPanel>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE81C;" FontSize="26" Foreground="#2563EB" HorizontalAlignment="Left"/>
                <TextBlock Text="Журнал запуска приложений" FontSize="15" FontWeight="SemiBold" Margin="0,12,0,4"/>
                <TextBlock Style="{StaticResource Muted}" Text="Какие программы и когда запускались на ПК"/>
              </StackPanel>
            </Button>
          </UniformGrid>
        </ScrollViewer>

        <!-- ===== Журнал ===== -->
        <Grid x:Name="pageAudit" Margin="32,0,32,24" Visibility="Collapsed">
          <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
          </Grid.RowDefinitions>
          <StackPanel Orientation="Horizontal" Margin="0,0,0,14">
            <RadioButton x:Name="rbLogApps" Style="{StaticResource Segment}" GroupName="logkind" IsChecked="True" Content="Запуск программ"/>
            <RadioButton x:Name="rbLogSites" Style="{StaticResource Segment}" GroupName="logkind" Content="Посещённые сайты"/>
          </StackPanel>

          <!-- Запуск программ -->
          <Grid x:Name="gridLogApps" Grid.Row="1">
            <Grid.RowDefinitions>
              <RowDefinition Height="Auto"/>
              <RowDefinition Height="Auto"/>
              <RowDefinition Height="*"/>
            </Grid.RowDefinitions>
            <Border Grid.Row="0" x:Name="bannerAudit" Style="{StaticResource Card}" Margin="0,0,0,12" BorderBrush="#FCD34D" Background="#FFFBEB" Visibility="Collapsed">
              <Grid>
                <Grid.ColumnDefinitions>
                  <ColumnDefinition Width="Auto"/>
                  <ColumnDefinition Width="*"/>
                  <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE7BA;" Foreground="#B45309" FontSize="18" Margin="0,0,14,0" VerticalAlignment="Center"/>
                <StackPanel Grid.Column="1" VerticalAlignment="Center">
                  <TextBlock FontWeight="SemiBold" Foreground="#92400E" Text="Запись запусков выключена"/>
                  <TextBlock Foreground="#92400E" FontSize="12" TextWrapping="Wrap" Text="Windows пока не ведёт журнал запуска программ. Включите запись — и дальше здесь будет видно, кто и когда что запускал. Прошлые запуски до включения не сохраняются."/>
                </StackPanel>
                <Button x:Name="btnAuditEnable" Grid.Column="2" Style="{StaticResource BtnPrimary}" Margin="12,0,0,0" Content="Включить запись запусков"/>
              </Grid>
            </Border>
            <Grid Grid.Row="1" Margin="0,0,0,10">
              <Grid.ColumnDefinitions>
                <ColumnDefinition Width="Auto"/>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="320"/>
              </Grid.ColumnDefinitions>
              <StackPanel Orientation="Horizontal">
                <Button x:Name="btnAuditRefresh" Style="{StaticResource BtnPrimary}" Content="Обновить"/>
                <Button x:Name="btnAuditDisable" Style="{StaticResource Btn}" Content="Выключить запись"/>
              </StackPanel>
              <Grid Grid.Column="2">
                <TextBox x:Name="txtAuditFilter" Style="{StaticResource Input}" Padding="34,8,8,8"/>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE721;" Foreground="#9CA3AF" Margin="12,0,0,0" HorizontalAlignment="Left" IsHitTestVisible="False"/>
                <TextBlock x:Name="phAuditFilter" Style="{StaticResource Placeholder}" Margin="36,0,0,0" Text="Фильтр: программа или пользователь…"/>
              </Grid>
            </Grid>
            <Border Grid.Row="2" Style="{StaticResource Card}" Padding="0" Margin="0">
              <Grid>
              <DataGrid x:Name="dgAudit" AutoGenerateColumns="False" IsReadOnly="True" HeadersVisibility="Column"
                        GridLinesVisibility="Horizontal" HorizontalGridLinesBrush="#F3F4F6" BorderThickness="0" Background="White"
                        RowHeight="30" CanUserAddRows="False" CanUserResizeRows="False">
                <DataGrid.ColumnHeaderStyle>
                  <Style TargetType="DataGridColumnHeader">
                    <Setter Property="Background" Value="#F9FAFB"/>
                    <Setter Property="Foreground" Value="#6B7280"/>
                    <Setter Property="FontWeight" Value="SemiBold"/>
                    <Setter Property="Padding" Value="10,8"/>
                    <Setter Property="BorderBrush" Value="#E5E7EB"/>
                    <Setter Property="BorderThickness" Value="0,0,0,1"/>
                  </Style>
                </DataGrid.ColumnHeaderStyle>
                <DataGrid.CellStyle>
                  <Style TargetType="DataGridCell">
                    <Setter Property="BorderThickness" Value="0"/>
                    <Setter Property="VerticalContentAlignment" Value="Center"/>
                  </Style>
                </DataGrid.CellStyle>
                <DataGrid.Columns>
                  <DataGridTextColumn Header="Время" Binding="{Binding C1}" Width="170"/>
                  <DataGridTextColumn Header="Программа" Binding="{Binding Title}" Width="220"/>
                  <DataGridTextColumn Header="Пользователь" Binding="{Binding Subtitle}" Width="160"/>
                  <DataGridTextColumn Header="Путь" Binding="{Binding C2}" Width="*"/>
                </DataGrid.Columns>
              </DataGrid>
                <StackPanel x:Name="pnlAuditEmpty" VerticalAlignment="Center" HorizontalAlignment="Center" Visibility="Collapsed">
                  <TextBlock Style="{StaticResource Icon}" Text="&#xE81C;" FontSize="40" Foreground="#D1D5DB" HorizontalAlignment="Center"/>
                  <TextBlock x:Name="txtAuditEmpty" Style="{StaticResource Muted}" Margin="0,12,0,0" HorizontalAlignment="Center"/>
                </StackPanel>
              </Grid>
            </Border>
          </Grid>

          <!-- Посещённые сайты -->
          <Grid x:Name="gridLogSites" Grid.Row="1" Visibility="Collapsed">
            <Grid.RowDefinitions>
              <RowDefinition Height="Auto"/>
              <RowDefinition Height="Auto"/>
              <RowDefinition Height="*"/>
            </Grid.RowDefinitions>
            <Border Grid.Row="0" x:Name="bannerSites" Style="{StaticResource Card}" Margin="0,0,0,12" BorderBrush="#FCD34D" Background="#FFFBEB" Visibility="Collapsed">
              <Grid>
                <Grid.ColumnDefinitions>
                  <ColumnDefinition Width="Auto"/>
                  <ColumnDefinition Width="*"/>
                  <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE7BA;" Foreground="#B45309" FontSize="18" Margin="0,0,14,0" VerticalAlignment="Center"/>
                <StackPanel Grid.Column="1" VerticalAlignment="Center">
                  <TextBlock FontWeight="SemiBold" Foreground="#92400E" Text="Запись сайтов выключена"/>
                  <TextBlock Foreground="#92400E" FontSize="12" TextWrapping="Wrap" Text="Включите запись — и Windows начнёт сохранять домены, которые открывались в браузерах (по DNS-запросам). Работает для всех браузеров и не стирается очисткой истории. Прошлые посещения до включения не сохраняются."/>
                </StackPanel>
                <Button x:Name="btnSitesEnable" Grid.Column="2" Style="{StaticResource BtnPrimary}" Margin="12,0,0,0" Content="Включить запись сайтов"/>
              </Grid>
            </Border>
            <Grid Grid.Row="1" Margin="0,0,0,10">
              <Grid.ColumnDefinitions>
                <ColumnDefinition Width="Auto"/>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="320"/>
              </Grid.ColumnDefinitions>
              <StackPanel Orientation="Horizontal">
                <Button x:Name="btnSitesRefresh" Style="{StaticResource BtnPrimary}" Content="Обновить"/>
                <Button x:Name="btnSitesDisable" Style="{StaticResource Btn}" Content="Выключить запись"/>
              </StackPanel>
              <Grid Grid.Column="2">
                <TextBox x:Name="txtSitesFilter" Style="{StaticResource Input}" Padding="34,8,8,8"/>
                <TextBlock Style="{StaticResource Icon}" Text="&#xE721;" Foreground="#9CA3AF" Margin="12,0,0,0" HorizontalAlignment="Left" IsHitTestVisible="False"/>
                <TextBlock x:Name="phSitesFilter" Style="{StaticResource Placeholder}" Margin="36,0,0,0" Text="Фильтр по домену…"/>
              </Grid>
            </Grid>
            <Border Grid.Row="2" Style="{StaticResource Card}" Padding="0" Margin="0">
              <Grid>
              <DataGrid x:Name="dgSites" AutoGenerateColumns="False" IsReadOnly="True" HeadersVisibility="Column"
                        GridLinesVisibility="Horizontal" HorizontalGridLinesBrush="#F3F4F6" BorderThickness="0" Background="White"
                        RowHeight="30" CanUserAddRows="False" CanUserResizeRows="False">
                <DataGrid.ColumnHeaderStyle>
                  <Style TargetType="DataGridColumnHeader">
                    <Setter Property="Background" Value="#F9FAFB"/>
                    <Setter Property="Foreground" Value="#6B7280"/>
                    <Setter Property="FontWeight" Value="SemiBold"/>
                    <Setter Property="Padding" Value="10,8"/>
                    <Setter Property="BorderBrush" Value="#E5E7EB"/>
                    <Setter Property="BorderThickness" Value="0,0,0,1"/>
                  </Style>
                </DataGrid.ColumnHeaderStyle>
                <DataGrid.CellStyle>
                  <Style TargetType="DataGridCell">
                    <Setter Property="BorderThickness" Value="0"/>
                    <Setter Property="VerticalContentAlignment" Value="Center"/>
                  </Style>
                </DataGrid.CellStyle>
                <DataGrid.Columns>
                  <DataGridTextColumn Header="Время" Binding="{Binding C1}" Width="170"/>
                  <DataGridTextColumn Header="Сайт (домен)" Binding="{Binding Title}" Width="*"/>
                  <DataGridTextColumn Header="Повторов подряд" Binding="{Binding C2}" Width="150"/>
                </DataGrid.Columns>
              </DataGrid>
                <StackPanel x:Name="pnlSitesEmpty" VerticalAlignment="Center" HorizontalAlignment="Center" Visibility="Collapsed">
                  <TextBlock Style="{StaticResource Icon}" Text="&#xE774;" FontSize="40" Foreground="#D1D5DB" HorizontalAlignment="Center"/>
                  <TextBlock x:Name="txtSitesEmpty" Style="{StaticResource Muted}" Margin="0,12,0,0" HorizontalAlignment="Center"/>
                </StackPanel>
              </Grid>
            </Border>
          </Grid>
        </Grid>

        <!-- ===== О программе ===== -->
        <ScrollViewer x:Name="pageAbout" VerticalScrollBarVisibility="Auto" Visibility="Collapsed">
          <StackPanel Margin="32,0,32,24" MaxWidth="760" HorizontalAlignment="Left">
            <Border Style="{StaticResource Card}">
              <StackPanel>
                <StackPanel Orientation="Horizontal" Margin="0,0,0,16">
                  <Border Width="56" Height="56" CornerRadius="12" Background="#2563EB">
                    <TextBlock Style="{StaticResource Icon}" Text="&#xEA18;" Foreground="White" FontSize="28" HorizontalAlignment="Center"/>
                  </Border>
                  <StackPanel Margin="16,0,0,0" VerticalAlignment="Center">
                    <TextBlock Text="Policy Manager" FontSize="22" FontWeight="SemiBold"/>
                    <TextBlock x:Name="txtAboutVersion" Style="{StaticResource Muted}" FontSize="13"/>
                  </StackPanel>
                </StackPanel>
                <TextBlock Style="{StaticResource Muted}" FontSize="13" TextWrapping="Wrap" Text="Управление политиками Windows 10/11 и ограничениями для пользователей без прав администратора. Работает во всех редакциях, включая Home."/>
              </StackPanel>
            </Border>

            <Border Style="{StaticResource Card}">
              <StackPanel>
                <TextBlock FontSize="11" FontWeight="Bold" Foreground="#6B7280" Text="РАЗРАБОТЧИК"/>
                <TextBlock Text="Лига Не Безопасного Интернета" FontSize="20" FontWeight="SemiBold" Margin="0,6,0,0" TextWrapping="Wrap"/>
              </StackPanel>
            </Border>

            <Border Style="{StaticResource Card}">
              <StackPanel>
                <TextBlock Style="{StaticResource H2}" Text="Сведения о системе" Margin="0,0,0,10"/>
                <Grid>
                  <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="Auto"/>
                    <ColumnDefinition Width="*"/>
                  </Grid.ColumnDefinitions>
                  <Grid.RowDefinitions>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="Auto"/>
                  </Grid.RowDefinitions>
                  <TextBlock Grid.Row="0" Grid.Column="0" Style="{StaticResource Muted}" Text="Windows:" Margin="0,2,16,2"/>
                  <TextBlock x:Name="txtAboutOS" Grid.Row="0" Grid.Column="1" Margin="0,2" TextWrapping="Wrap"/>
                  <TextBlock Grid.Row="1" Grid.Column="0" Style="{StaticResource Muted}" Text="Права:" Margin="0,2,16,2"/>
                  <TextBlock x:Name="txtAboutAdmin" Grid.Row="1" Grid.Column="1" Margin="0,2"/>
                  <TextBlock Grid.Row="2" Grid.Column="0" Style="{StaticResource Muted}" Text="Папка данных:" Margin="0,2,16,2"/>
                  <TextBlock x:Name="txtAboutData" Grid.Row="2" Grid.Column="1" Margin="0,2" TextWrapping="Wrap"/>
                </Grid>
              </StackPanel>
            </Border>

            <Border Style="{StaticResource Card}" BorderBrush="#FCD34D" Background="#FFFBEB">
              <StackPanel>
                <TextBlock Style="{StaticResource H2}" Foreground="#92400E" Text="Предупреждение"/>
                <TextBlock Foreground="#92400E" FontSize="13" TextWrapping="Wrap" Margin="0,6,0,0" Text="Программа изменяет системный реестр и групповые политики. Перед изменениями автоматически создаётся резервная копия. Все действия записываются в журнал."/>
              </StackPanel>
            </Border>
          </StackPanel>
        </ScrollViewer>
      </Grid>

      <!-- Уведомление -->
      <Border x:Name="toast" Grid.Row="2" HorizontalAlignment="Right" VerticalAlignment="Bottom" Margin="0,0,32,28"
              CornerRadius="8" Background="#111827" Padding="16,12" Visibility="Collapsed" MaxWidth="560">
        <Border.Effect>
          <DropShadowEffect BlurRadius="18" ShadowDepth="3" Opacity="0.3"/>
        </Border.Effect>
        <StackPanel Orientation="Horizontal">
          <TextBlock x:Name="toastIcon" Style="{StaticResource Icon}" FontSize="16" Margin="0,0,12,0"/>
          <TextBlock x:Name="toastText" Foreground="White" TextWrapping="Wrap" MaxWidth="480" VerticalAlignment="Center"/>
        </StackPanel>
      </Border>
    </Grid>

    <!-- Выбор программ -->
    <Grid x:Name="overlayPicker" Grid.ColumnSpan="2" Background="#99000000" Visibility="Collapsed">
      <Border Background="White" CornerRadius="12" Width="720" Margin="0,40" Padding="24" HorizontalAlignment="Center">
        <Border.Effect>
          <DropShadowEffect BlurRadius="30" ShadowDepth="4" Opacity="0.35"/>
        </Border.Effect>
        <Grid>
          <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
          </Grid.RowDefinitions>
          <StackPanel Margin="0,0,0,14">
            <TextBlock FontSize="20" FontWeight="SemiBold" Text="Какие программы разрешить?"/>
            <TextBlock Style="{StaticResource Muted}" Margin="0,6,0,0" Text="Отметьте программы, которые пользователям можно запускать. Всё, что не отмечено, будет запрещено. Игры из Steam/Epic запускаются через их лаунчер — достаточно разрешить сам лаунчер."/>
          </StackPanel>
          <Grid Grid.Row="1" Margin="0,0,0,10">
            <TextBox x:Name="txtPickSearch" Style="{StaticResource Input}" Padding="34,8,8,8"/>
            <TextBlock Style="{StaticResource Icon}" Text="&#xE721;" Foreground="#9CA3AF" Margin="12,0,0,0" HorizontalAlignment="Left" IsHitTestVisible="False"/>
            <TextBlock x:Name="phPickSearch" Style="{StaticResource Placeholder}" Margin="36,0,0,0" Text="Поиск программы…"/>
          </Grid>
          <Border Grid.Row="2" BorderBrush="#E5E7EB" BorderThickness="1" CornerRadius="8" Padding="4">
            <ListBox x:Name="lbApps" BorderThickness="0" ItemContainerStyle="{StaticResource RowItem}" ScrollViewer.HorizontalScrollBarVisibility="Disabled">
              <ListBox.ItemTemplate>
                <DataTemplate>
                  <CheckBox IsChecked="{Binding Checked, Mode=TwoWay}" VerticalContentAlignment="Center" HorizontalContentAlignment="Stretch" Cursor="Hand">
                    <Grid Margin="10,0,0,0">
                      <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="Auto"/>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                      </Grid.ColumnDefinitions>
                      <Image Source="{Binding Icon}" Width="28" Height="28" Margin="0,0,12,0" VerticalAlignment="Center"/>
                      <StackPanel Grid.Column="1" VerticalAlignment="Center">
                        <TextBlock Text="{Binding Title}" FontWeight="SemiBold" TextTrimming="CharacterEllipsis"/>
                        <TextBlock Text="{Binding Subtitle}" FontSize="11" Foreground="#9CA3AF" TextTrimming="CharacterEllipsis"/>
                      </StackPanel>
                      <Border Grid.Column="2" Background="{Binding BadgeBg}" CornerRadius="8" Padding="8,2" VerticalAlignment="Center" Margin="8,0,0,0">
                        <TextBlock Text="{Binding Badge}" Foreground="{Binding BadgeFg}" FontSize="11"/>
                      </Border>
                    </Grid>
                  </CheckBox>
                </DataTemplate>
              </ListBox.ItemTemplate>
            </ListBox>
          </Border>
          <Grid Grid.Row="3" Margin="0,16,0,0">
            <TextBlock x:Name="txtPickCount" Style="{StaticResource Muted}" VerticalAlignment="Center"/>
            <StackPanel Orientation="Horizontal" HorizontalAlignment="Right">
              <Button x:Name="btnPickCancel" Style="{StaticResource Btn}" Content="Отмена"/>
              <Button x:Name="btnPickOk" Style="{StaticResource BtnPrimary}" Margin="0" Content="Готово"/>
            </StackPanel>
          </Grid>
        </Grid>
      </Border>
    </Grid>
  </Grid>
</Window>
'@

function Show-MainWindow {
    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing
    if (-not ('PolicyManagerUI.Row' -as [type])) { Add-Type -TypeDefinition $RowTypeSource -Language CSharp }

    $os = Get-OSInfo
    [xml]$xml = $MainWindowXaml
    $window = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xml))
    $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace('x', 'http://schemas.microsoft.com/winfx/2006/xaml')
    $ui = @{}
    foreach ($node in $xml.SelectNodes('//*[@x:Name]', $ns)) {
        $name = $node.GetAttribute('Name', 'http://schemas.microsoft.com/winfx/2006/xaml')
        $el = $window.FindName($name)
        if ($el) { $ui[$name] = $el }
    }

    #region Вспомогательные функции

    $brushConverter = New-Object System.Windows.Media.BrushConverter
    function Get-Brush([string]$Hex) {
        $b = $brushConverter.ConvertFromString($Hex)
        $b.Freeze()
        return $b
    }
    $brush = @{
        GrayBg = Get-Brush '#F3F4F6'; GrayFg = Get-Brush '#6B7280'
        GreenBg = Get-Brush '#DCFCE7'; GreenFg = Get-Brush '#166534'
        AmberBg = Get-Brush '#FEF3C7'; AmberFg = Get-Brush '#92400E'
        RedBg = Get-Brush '#FEE2E2'; RedFg = Get-Brush '#991B1B'
        BlueBg = Get-Brush '#DBEAFE'; BlueFg = Get-Brush '#1E40AF'
        Accent = Get-Brush '#2563EB'; Slate = Get-Brush '#64748B'; Sys = Get-Brush '#F3F4F6'; White = Get-Brush '#FFFFFF'
        Green = Get-Brush '#22C55E'; Red = Get-Brush '#F87171'; Amber = Get-Brush '#FBBF24'
    }
    foreach ($k in @($brush.Keys)) { $brush[$k] = [System.Windows.Media.Brush]$brush[$k] }

    function Show-Info([string]$Text) { [void][System.Windows.MessageBox]::Show($window, $Text, $AppName, 'OK', 'Information') }
    function Show-Error([string]$Text) { [void][System.Windows.MessageBox]::Show($window, $Text, $AppName, 'OK', 'Error') }
    function Confirm-Action([string]$Text) {
        return ([System.Windows.MessageBox]::Show($window, $Text, $AppName, 'YesNo', 'Warning') -eq 'Yes')
    }

    $toastTimer = New-Object System.Windows.Threading.DispatcherTimer
    $toastTimer.Interval = [TimeSpan]::FromSeconds(5)
    $toastTimer.Add_Tick({ $ui.toast.Visibility = 'Collapsed'; $toastTimer.Stop() })
    function Show-Toast([string]$Text, [string]$Kind = 'ok') {
        if ($Kind -eq 'ok') { $ui.toastIcon.Text = [char]0xE73E; $ui.toastIcon.Foreground = $brush.Green }
        elseif ($Kind -eq 'warn') { $ui.toastIcon.Text = [char]0xE7BA; $ui.toastIcon.Foreground = $brush.Amber }
        else { $ui.toastIcon.Text = [char]0xE783; $ui.toastIcon.Foreground = $brush.Red }
        $ui.toastText.Text = $Text
        $ui.toast.Visibility = 'Visible'
        $toastTimer.Stop()
        $toastTimer.Start()
    }

    function Invoke-Safe([scriptblock]$Action) {
        try { & $Action }
        catch {
            $msg = $_.Exception.Message
            if ($_.Exception.InnerException) { $msg = $_.Exception.InnerException.Message }
            if (-not $IsAdmin) { $msg += "`r`n`r`nПрограмма запущена без прав администратора." }
            Write-Log "ОШИБКА: $msg"
            Show-Error $msg
        }
    }
    function Set-Busy([bool]$On) {
        if ($On) { $window.Cursor = [System.Windows.Input.Cursors]::Wait } else { $window.Cursor = $null }
    }

    function Register-Placeholder($TextBox, $Placeholder) {
        $TextBox.Tag = $Placeholder
        $TextBox.Add_TextChanged({ param($s, $e) if ($s.Text) { $s.Tag.Visibility = 'Collapsed' } else { $s.Tag.Visibility = 'Visible' } })
    }

    function Open-InRegedit([string]$Path) {
        $applet = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Applets\Regedit'
        $prefix = 'Computer\'
        $last = (Get-ItemProperty -LiteralPath $applet -Name LastKey -ErrorAction SilentlyContinue).LastKey
        if ($last -and $last -match '^([^\\]+\\)HKEY_') { $prefix = $Matches[1] }
        if (-not (Test-Path -LiteralPath $applet)) { New-Item -Path $applet -Force | Out-Null }
        Set-ItemProperty -LiteralPath $applet -Name LastKey -Value ($prefix + (ConvertTo-NativeRegPath $Path))
        Get-Process regedit -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Process regedit.exe
    }

    function New-Row([hashtable]$Props) {
        $r = New-Object PolicyManagerUI.Row
        foreach ($k in @($Props.Keys)) {
            $v = $Props[$k]
            # Кисти передаём как .NET-объекты, иначе WPF не сможет применить цвет из обёртки PowerShell
            if ($v -is [System.Windows.Media.Brush]) { $r.$k = [System.Windows.Media.Brush]$v }
            elseif ($v -is [System.Windows.Media.ImageSource]) { $r.$k = [System.Windows.Media.ImageSource]$v }
            else { $r.$k = $v }
        }
        return $r
    }

    function Select-OpenFile([string]$Filter, [string]$Dir, [bool]$Multi = $false) {
        $dlg = New-Object Microsoft.Win32.OpenFileDialog
        $dlg.Filter = $Filter
        $dlg.Multiselect = $Multi
        if ($Dir -and (Test-Path -LiteralPath $Dir)) { $dlg.InitialDirectory = $Dir }
        if ($dlg.ShowDialog($window) -eq $true) { return , $dlg.FileNames }
        return $null
    }
    function Select-SaveFile([string]$Filter, [string]$Dir, [string]$Name) {
        $dlg = New-Object Microsoft.Win32.SaveFileDialog
        $dlg.Filter = $Filter
        $dlg.FileName = $Name
        if ($Dir -and (Test-Path -LiteralPath $Dir)) { $dlg.InitialDirectory = $Dir }
        if ($dlg.ShowDialog($window) -eq $true) { return $dlg.FileName }
        return $null
    }

    #endregion

    #region Оформление и навигация

    $ui.txtVersion.Text = "версия $AppVersion"
    $ui.txtOS.Text = $os.Text
    if ($IsAdmin) {
        $ui.badgeAdmin.Background = Get-Brush '#14532D'
        $ui.badgeAdminIcon.Text = [char]0xE7EF; $ui.badgeAdminIcon.Foreground = $brush.Green
        $ui.badgeAdminText.Text = 'Администратор'; $ui.badgeAdminText.Foreground = Get-Brush '#BBF7D0'
    } else {
        $ui.badgeAdmin.Background = Get-Brush '#7F1D1D'
        $ui.badgeAdminIcon.Text = [char]0xE7BA; $ui.badgeAdminIcon.Foreground = $brush.Red
        $ui.badgeAdminText.Text = 'Без прав администратора'; $ui.badgeAdminText.Foreground = Get-Brush '#FECACA'
        $ui.bannerAdmin.Visibility = 'Visible'
    }
    if ($os.IsHome) { $ui.warnHome.Visibility = 'Visible' }

    $ui.txtAboutVersion.Text = "Версия $AppVersion"
    $ui.txtAboutOS.Text = $os.Text
    $ui.txtAboutAdmin.Text = if ($IsAdmin) { 'Администратор' } else { 'Без прав администратора' }
    $ui.txtAboutData.Text = $DataDir

    $pageInfo = [ordered]@{
        navRestrict = @('pageRestrict', 'Ограничения пользователей', 'Белый список программ и блокировка сайтов для всех, кроме администраторов')
        navPolicies = @('pagePolicies', 'Политики Windows', 'Конфиденциальность, обновления, безопасность, интерфейс и Microsoft Edge')
        navRegistry = @('pageRegistry', 'Политики в реестре', 'Все параметры из веток Policies, включая заданные другими программами')
        navProfiles = @('pageProfiles', 'Профили и резервные копии', 'Готовые наборы настроек, сохранение и восстановление')
        navTools    = @('pageTools', 'Инструменты', 'Применение и диагностика групповых политик')
        navAudit    = @('pageAudit', 'Журнал', 'Запуск приложений и посещённые сайты на этом компьютере')
        navAbout    = @('pageAbout', 'О программе', 'Сведения о Policy Manager и разработчике')
    }
    $script:RegScanned = $false

    function Show-Page([string]$Nav) {
        foreach ($k in $pageInfo.Keys) {
            $vis = 'Collapsed'
            if ($k -eq $Nav) { $vis = 'Visible' }
            $ui[$pageInfo[$k][0]].Visibility = $vis
        }
        $ui.txtPageTitle.Text = $pageInfo[$Nav][1]
        $ui.txtPageSubtitle.Text = $pageInfo[$Nav][2]
        if ($Nav -eq 'navRegistry' -and -not $script:RegScanned) { Update-RegistryScan }
        if ($Nav -eq 'navProfiles') { Update-ProfileList }
        if ($Nav -eq 'navAudit') { if ($ui.rbLogSites.IsChecked -eq $true) { Update-SiteView } else { Update-AuditView } }
    }
    foreach ($k in $pageInfo.Keys) {
        $ui[$k].Add_Checked({ param($s, $e) Invoke-Safe { Show-Page $s.Name } })
    }

    #endregion

    #region Страница «Ограничения»

    $progs = New-Object System.Collections.ObjectModel.ObservableCollection[string]
    $blockSites = New-Object System.Collections.ObjectModel.ObservableCollection[string]
    $allowSites = New-Object System.Collections.ObjectModel.ObservableCollection[string]
    $script:CurSites = $blockSites
    $ui.lbProg.ItemsSource = $progs
    $ui.lbSites.ItemsSource = $blockSites
    Register-Placeholder $ui.txtProgAdd $ui.phProgAdd
    Register-Placeholder $ui.txtSiteAdd $ui.phSiteAdd

    function Update-ListCounters {
        $ui.txtProgCount.Text = "Разрешено программ: $($progs.Count)"
    }
    $progs.Add_CollectionChanged({ Update-ListCounters })

    function Add-UniqueItem($Collection, [string]$Value) {
        if (-not $Value) { return }
        foreach ($x in $Collection) { if ($x -eq $Value) { return } }
        $Collection.Add($Value)
    }
    function Add-Programs($Names) { foreach ($n in $Names) { Add-UniqueItem $progs (ConvertTo-ExeName $n) } }
    function Add-Sites($Names) { foreach ($n in $Names) { Add-UniqueItem $script:CurSites (ConvertTo-Domain $n) } }

    function Update-SitesCount {
        if ($ui.rbSitesAllow.IsChecked -eq $true) { $ui.txtSitesCount.Text = "Разрешено сайтов: $($allowSites.Count)" }
        else { $ui.txtSitesCount.Text = "Заблокировано сайтов: $($blockSites.Count)" }
    }
    $blockSites.Add_CollectionChanged({ Update-SitesCount })
    $allowSites.Add_CollectionChanged({ Update-SitesCount })

    function Set-SitesMode([string]$Mode) {
        if ($Mode -eq 'allow') {
            $script:CurSites = $allowSites
            $ui.lbSites.ItemsSource = $allowSites
            $ui.pnlQuickAllow.Visibility = 'Visible'
            $ui.pnlQuickBlock.Visibility = 'Collapsed'
            $ui.chkHosts.Visibility = 'Collapsed'
            $ui.phSiteAdd.Text = 'Например: uchi.ru'
            $ui.txtSitesDesc.Text = 'Открываться будут ТОЛЬКО эти сайты (с поддоменами), все остальные запрещены. Не забудьте поисковик и сайты для входа в аккаунты, если они нужны.'
        } else {
            $script:CurSites = $blockSites
            $ui.lbSites.ItemsSource = $blockSites
            $ui.pnlQuickAllow.Visibility = 'Collapsed'
            $ui.pnlQuickBlock.Visibility = 'Visible'
            $ui.chkHosts.Visibility = 'Visible'
            $ui.phSiteAdd.Text = 'Например: youtube.com'
            $ui.txtSitesDesc.Text = 'Эти сайты и их поддомены не откроются в Edge, Chrome, Яндекс.Браузере и Firefox. Можно указать раздел сайта, например yandex.ru/games — остальной Яндекс будет работать.'
        }
        Update-SitesCount
    }
    $ui.rbSitesBlock.Add_Checked({ Invoke-Safe { Set-SitesMode 'block' } })
    $ui.rbSitesAllow.Add_Checked({ Invoke-Safe { Set-SitesMode 'allow' } })

    $ui.btnAllowSearch.Tag = 'yandex.ru ya.ru google.com google.ru bing.com duckduckgo.com'
    $ui.btnAllowStudy.Tag = @(
        'uchi.ru', 'resh.edu.ru', 'edu.ru', 'myschool.edu.ru', 'education.yandex.ru', 'dnevnik.ru', 'school.mos.ru', 'mos.ru',
        'sferum.ru', 'foxford.ru', 'skysmart.ru', 'yaklass.ru', 'interneturok.ru', 'olimpiada.ru', 'prosv.ru', 'rosuchebnik.ru',
        'wikipedia.org', 'wiktionary.org', 'gramota.ru', 'khanacademy.org', 'duolingo.com', 'stepik.org', 'translate.yandex.ru', 'translate.google.com'
    ) -join ' '
    $ui.btnAllowAccounts.Tag = @(
        'login.microsoftonline.com', 'login.live.com', 'live.com', 'microsoft.com', 'office.com', 'microsoft365.com',
        'accounts.google.com', 'gstatic.com', 'googleapis.com', 'passport.yandex.ru', 'id.yandex.ru', 'yastatic.net', 'id.vk.com'
    ) -join ' '
    $ui.btnAllowMail.Tag = 'mail.ru e.mail.ru mail.yandex.ru gmail.com mail.google.com outlook.live.com outlook.office.com'
    $ui.btnAllowGov.Tag = 'gosuslugi.ru esia.gosuslugi.ru nalog.gov.ru mos.ru pfr.gov.ru sfr.gov.ru'
    foreach ($b in @($ui.btnAllowSearch, $ui.btnAllowStudy, $ui.btnAllowAccounts, $ui.btnAllowMail, $ui.btnAllowGov)) {
        $b.Add_Click({
            param($s, $e)
            Invoke-Safe {
                $before = $allowSites.Count
                Add-Sites @($s.Tag -split ' ')
                $ui.chkSites.IsChecked = $true
                Show-Toast "Добавлено в белый список: $($allowSites.Count - $before). Не забудьте нажать «Применить ограничения»."
            }
        })
    }

    # Кнопки «удалить» внутри списков
    $removeHandler = [System.Windows.RoutedEventHandler] {
        param($s, $e)
        $btn = $e.OriginalSource
        if ($btn -is [System.Windows.Controls.Button] -and $btn.Tag) { [void]$s.ItemsSource.Remove([string]$btn.Tag) }
    }
    $ui.lbProg.AddHandler([System.Windows.Controls.Primitives.ButtonBase]::ClickEvent, $removeHandler)
    $ui.lbSites.AddHandler([System.Windows.Controls.Primitives.ButtonBase]::ClickEvent, $removeHandler)

    $ui.btnProgAdd.Add_Click({ Invoke-Safe { Add-Programs @($ui.txtProgAdd.Text -split '[,;\s]+'); $ui.txtProgAdd.Text = '' } })
    $ui.txtProgAdd.Add_KeyDown({ param($s, $e) if ($e.Key -eq 'Return') { Invoke-Safe { Add-Programs @($ui.txtProgAdd.Text -split '[,;\s]+'); $ui.txtProgAdd.Text = '' } } })
    $ui.btnSiteAdd.Add_Click({ Invoke-Safe { Add-Sites @($ui.txtSiteAdd.Text -split '[,;\s]+'); $ui.txtSiteAdd.Text = '' } })
    $ui.txtSiteAdd.Add_KeyDown({ param($s, $e) if ($e.Key -eq 'Return') { Invoke-Safe { Add-Sites @($ui.txtSiteAdd.Text -split '[,;\s]+'); $ui.txtSiteAdd.Text = '' } } })
    $ui.btnProgBrowse.Add_Click({
        Invoke-Safe {
            $files = Select-OpenFile 'Программы (*.exe)|*.exe' $env:ProgramFiles $true
            if ($files) { Add-Programs @($files | ForEach-Object { [IO.Path]::GetFileName($_) }) }
        }
    })
    $ui.btnProgClear.Add_Click({
        Invoke-Safe {
            if (-not (Confirm-Action 'Очистить список? Останутся только системные программы (Проводник).')) { return }
            $progs.Clear()
            Add-Programs $DefaultAllowedPrograms
        }
    })

    # Окно выбора программ
    function Get-ExeIcon([string]$Path) {
        try {
            if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $null }
            $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($Path)
            $src = [System.Windows.Interop.Imaging]::CreateBitmapSourceFromHIcon($ico.Handle, [System.Windows.Int32Rect]::Empty,
                [System.Windows.Media.Imaging.BitmapSizeOptions]::FromEmptyOptions())
            $src.Freeze()
            $ico.Dispose()
            return $src
        } catch { return $null }
    }

    $script:PickRows = New-Object System.Collections.Generic.List[object]
    $script:PickFilter = ''
    Register-Placeholder $ui.txtPickSearch $ui.phPickSearch

    function Update-PickCount {
        $n = @($script:PickRows | Where-Object { $_.Checked }).Count
        $ui.txtPickCount.Text = "Отмечено программ: $n"
    }

    function Show-ProgramPicker {
        Set-Busy $true
        try {
            $allowed = @{}
            foreach ($p in $progs) { $allowed[$p.ToLowerInvariant()] = $true }
            $rows = New-Object System.Collections.Generic.List[object]
            $seen = @{}
            foreach ($b in $BuiltinPrograms) {
                $key = $b.Exe.ToLowerInvariant()
                $seen[$key] = $true
                $rows.Add((New-Row @{ Id = $b.Exe; Title = $b.Name; Subtitle = $b.Exe; Badge = 'Windows'; BadgeBg = $brush.GrayBg; BadgeFg = $brush.GrayFg
                    Icon = (Get-ExeIcon $b.Path); Checked = $allowed.ContainsKey($key) }))
            }
            foreach ($a in @(Get-InstalledPrograms | Sort-Object Name)) {
                $key = $a.Exe.ToLowerInvariant()
                if ($seen.ContainsKey($key)) { continue }
                $seen[$key] = $true
                $rows.Add((New-Row @{ Id = $a.Exe; Title = $a.Name; Subtitle = "$($a.Exe)  ·  $($a.Path)"; Badge = 'Установлена'; BadgeBg = $brush.BlueBg; BadgeFg = $brush.BlueFg
                    Icon = (Get-ExeIcon $a.Path); Checked = $allowed.ContainsKey($key) }))
            }
            # Программы из списка, которых не нашлось среди ярлыков
            foreach ($p in $progs) {
                $key = $p.ToLowerInvariant()
                if ($seen.ContainsKey($key)) { continue }
                $seen[$key] = $true
                $rows.Add((New-Row @{ Id = $p; Title = $p; Subtitle = 'добавлена вручную'; Badge = 'Вручную'; BadgeBg = $brush.AmberBg; BadgeFg = $brush.AmberFg; Checked = $true }))
            }
            $script:PickRows = $rows
            $view = [System.Windows.Data.CollectionViewSource]::GetDefaultView($rows)
            $view.Filter = [Predicate[object]] {
                param($row)
                if (-not $script:PickFilter) { return $true }
                return (("$($row.Title) $($row.Subtitle)").IndexOf($script:PickFilter, [StringComparison]::OrdinalIgnoreCase) -ge 0)
            }
            $ui.lbApps.ItemsSource = $view
            $ui.txtPickSearch.Text = ''
            Update-PickCount
            $ui.overlayPicker.Visibility = 'Visible'
            [void]$ui.txtPickSearch.Focus()
        } finally { Set-Busy $false }
    }

    $ui.btnProgPick.Add_Click({ Invoke-Safe { Show-ProgramPicker } })
    $ui.txtPickSearch.Add_TextChanged({
        Invoke-Safe {
            $script:PickFilter = $ui.txtPickSearch.Text.Trim()
            if ($ui.lbApps.ItemsSource) { $ui.lbApps.ItemsSource.Refresh() }
        }
    })
    $ui.lbApps.AddHandler([System.Windows.Controls.Primitives.ButtonBase]::ClickEvent, [System.Windows.RoutedEventHandler] { Update-PickCount })
    $ui.btnPickCancel.Add_Click({ $ui.overlayPicker.Visibility = 'Collapsed' })
    $ui.btnPickOk.Add_Click({
        Invoke-Safe {
            foreach ($r in $script:PickRows) {
                if ($r.Checked) { Add-UniqueItem $progs $r.Id }
                else { foreach ($p in @($progs)) { if ($p -eq $r.Id) { [void]$progs.Remove($p) } } }
            }
            if (-not ($progs | Where-Object { $_ -eq 'explorer.exe' })) { $progs.Insert(0, 'explorer.exe') }
            $ui.overlayPicker.Visibility = 'Collapsed'
            Show-Toast "Разрешено программ: $($progs.Count). Не забудьте нажать «Применить ограничения»."
        }
    })

    $ui.btnQuickSocial.Tag = @(
        'vk.com', 'vk.ru', 'vkontakte.ru', 'vk.me', 'vk.cc', 'ok.ru', 'odnoklassniki.ru', 'dzen.ru',
        'tiktok.com', 'tiktokv.com', 'tiktokcdn.com', 'instagram.com', 'facebook.com', 'fb.com', 'threads.net',
        'x.com', 'twitter.com', 'pinterest.com', 'pinterest.ru', 'likee.video', 'reddit.com', 'tumblr.com', 'snapchat.com',
        'ask.fm', 'my.mail.ru', 'yappy.media'
    ) -join ' '
    $ui.btnQuickVideo.Tag = @(
        'youtube.com', 'youtu.be', 'youtube-nocookie.com', 'youtubekids.com',
        'rutube.ru', 'vkvideo.ru', 'vk.video', 'twitch.tv', 'kick.com', 'trovo.live', 'nuum.ru',
        'live.vkplay.ru', 'live.vkvideo.ru', 'dzen.ru/video', 'coub.com', 'yappy.media', 'boosty.to'
    ) -join ' '
    $ui.btnQuickGames.Tag = @(
        'yandex.ru/games', 'yandex.com/games', 'yandex.by/games', 'yandex.kz/games', 'yandex.uz/games', 'ya.ru/games', 'playhop.com',
        'games.mail.ru', 'my.games', 'vkplay.ru', 'vkplay.com', 'vk.com/games', 'vk.ru/games', 'ok.ru/games',
        'roblox.com', 'steampowered.com', 'steamcommunity.com', 'epicgames.com', 'minecraft.net',
        'poki.com', 'crazygames.com', 'crazygames.ru', 'miniclip.com', 'friv.com', 'y8.com', 'kongregate.com',
        'agame.com', 'coolmathgames.com', 'armorgames.com', 'newgrounds.com', 'itch.io', 'gamejolt.com',
        'igroutka.ru', 'igry-online.net', 'flashgames.ru', 'game-game.com.ua', 'gamezop.com', 'playgama.com',
        '1001igry.ru', 'gamaverse.com', 'krunker.io', 'slither.io', 'agar.io', 'diep.io', 'shellshock.io',
        'chess.com', 'lichess.org', 'brawlstars.com', 'supercell.com', 'genshin.hoyoverse.com', 'hoyoverse.com'
    ) -join ' '
    $ui.btnQuickMessengers.Tag = @(
        'web.telegram.org', 't.me', 'telegram.org', 'telegram.me',
        'web.whatsapp.com', 'whatsapp.com', 'discord.com', 'discord.gg', 'discordapp.com',
        'web.max.ru', 'icq.com', 'viber.com', 'web.skype.com'
    ) -join ' '
    $ui.btnQuickCinema.Tag = @(
        'kinopoisk.ru', 'ivi.ru', 'okko.tv', 'wink.ru', 'start.ru', 'kion.ru', 'premier.one',
        'more.tv', 'amediateka.ru', 'netflix.com', 'rezka.ag', 'hdrezka.ag', 'hdrezka.me', 'lordfilm.lu',
        'kinogo.biz', 'animego.org', 'animego.me', 'jut.su', 'anilibria.tv', 'shikimori.one', 'filmix.my'
    ) -join ' '
    $ui.btnQuickBets.Tag = @(
        'fon.bet', 'fonbet.ru', 'winline.ru', 'betcity.ru', 'ligastavok.ru', 'marathonbet.ru', 'leon.ru', 'olimp.bet',
        'pari.ru', 'bet-boom.ru', 'betboom.ru', 'tennisi.bet', 'melbet.ru', '1xbet.com', '1xstavka.ru',
        'pin-up.ru', 'pinup.ru', 'vulkan.ru', 'joycasino.com', 'stake.com', 'csgorun.ru', 'csfail.com', 'ggdrop.com'
    ) -join ' '
    foreach ($b in @($ui.btnQuickSocial, $ui.btnQuickVideo, $ui.btnQuickGames, $ui.btnQuickMessengers, $ui.btnQuickCinema, $ui.btnQuickBets)) {
        $b.Add_Click({
            param($s, $e)
            Invoke-Safe {
                $before = $blockSites.Count
                Add-Sites @($s.Tag -split ' ')
                $ui.chkSites.IsChecked = $true
                Show-Toast "Добавлено сайтов: $($blockSites.Count - $before). Не забудьте нажать «Применить ограничения»."
            }
        })
    }

    $lockBoxes = @{}
    foreach ($l in $Lockdowns) {
        $cb = New-Object System.Windows.Controls.CheckBox
        $cb.Style = $window.FindResource('Switch')
        $cb.Margin = New-Object System.Windows.Thickness(0, 0, 24, 14)
        $tb = New-Object System.Windows.Controls.TextBlock
        $tb.Text = $l.Label
        $tb.TextWrapping = 'Wrap'
        $cb.Content = $tb
        [void]$ui.pnlLockdowns.Children.Add($cb)
        $lockBoxes[$l.Id] = $cb
    }

    function Update-UserList {
        $rows = New-Object System.Collections.Generic.List[object]
        $standard = 0
        $status = @{}
        if ($IsAdmin) { $status = Get-UserRestrictionStatus }
        foreach ($u in @(Get-LocalUserInfo)) {
            $initial = if ($u.Name) { $u.Name.Substring(0, 1).ToUpper() } else { '?' }
            if ($u.IsAdmin) {
                $rows.Add((New-Row @{ Title = $u.Name; C1 = $initial; Badge = 'Администратор · без ограничений'; BadgeBg = $brush.BlueBg; BadgeFg = $brush.BlueFg; RowBg = $brush.Slate }))
                continue
            }
            $standard++
            $st = $status[$u.Name]
            if (-not $st) {
                $badge = 'Обычный пользователь'; $bg = $brush.GrayBg; $fg = $brush.GrayFg
            } elseif ($st.Status -eq 'ok' -and $st.Value) {
                $badge = 'Ограничения записаны ✓'; $bg = $brush.GreenBg; $fg = $brush.GreenFg
                if ($st.LoggedOn) { $badge += ' · сейчас в системе: выйти и войти' }
            } elseif ($st.Status -eq 'ok') {
                $badge = 'Ограничений нет'; $bg = $brush.AmberBg; $fg = $brush.AmberFg
            } elseif ($st.Status -eq 'noprofile') {
                $badge = 'Ещё не входил · применится при входе'; $bg = $brush.GrayBg; $fg = $brush.GrayFg
            } else {
                $badge = 'Ошибка: ' + $st.Message; $bg = $brush.RedBg; $fg = $brush.RedFg
            }
            $rows.Add((New-Row @{ Title = $u.Name; C1 = $initial; Badge = $badge; BadgeBg = $bg; BadgeFg = $fg; RowBg = $brush.Accent }))
        }
        $ui.icUsers.ItemsSource = $rows
        $vis = 'Collapsed'
        if ($standard -eq 0) { $vis = 'Visible' }
        $ui.txtUsersWarn.Visibility = $vis
    }

    function Set-RestrictionState([bool]$Applied) {
        if ($Applied) {
            $ui.txtRState.Text = 'Ограничения включены'
            $ui.stateIcon.Text = [char]0xE72E; $ui.stateIcon.Foreground = $brush.GreenFg; $ui.stateIconBg.Background = $brush.GreenBg
        } else {
            $ui.txtRState.Text = 'Ограничения не применены'
            $ui.stateIcon.Text = [char]0xE785; $ui.stateIcon.Foreground = $brush.GrayFg; $ui.stateIconBg.Background = $brush.GrayBg
        }
    }

    # Заполняет интерфейс из настроек (текущих или загруженных из файла)
    function Set-RestrictionsUI($r, [bool]$UseDefaults) {
        $progs.Clear()
        $blockSites.Clear()
        $allowSites.Clear()
        if ($UseDefaults) {
            $ui.chkWl.IsChecked = $true
            foreach ($p in $DefaultAllowedPrograms) { Add-UniqueItem $progs $p }
            $ui.chkSites.IsChecked = $true
            foreach ($l in $Lockdowns) { $lockBoxes[$l.Id].IsChecked = [bool]$l.Default }
        } else {
            $ui.chkWl.IsChecked = $r.WhitelistEnabled
            $list = @($r.Programs)
            if (-not $list.Count) { $list = $DefaultAllowedPrograms }
            foreach ($p in $list) { Add-UniqueItem $progs $p }
            $ui.chkSites.IsChecked = $r.SitesEnabled
            foreach ($l in $Lockdowns) { $lockBoxes[$l.Id].IsChecked = [bool]$r.Lockdowns[$l.Id] }
        }
        foreach ($x in @($r.BlockSites)) { Add-UniqueItem $blockSites $x }
        foreach ($x in @($r.AllowSites)) { Add-UniqueItem $allowSites $x }
        if ($r.SitesMode -eq 'allow') { $ui.rbSitesAllow.IsChecked = $true } else { $ui.rbSitesBlock.IsChecked = $true }
        Set-SitesMode $(if ($r.SitesMode -eq 'allow') { 'allow' } else { 'block' })
        $ui.chkHosts.IsChecked = [bool]$r.HostsEnabled
        Update-ListCounters
    }

    function Import-RestrictionsToUI {
        $r = Get-NonAdminRestrictions
        # Если ограничения ни разу не настраивались — предлагаем значения по умолчанию
        $neverConfigured = -not $r.Applied -and -not (Test-Path -LiteralPath $RestrictionsFile)
        Set-RestrictionsUI $r $neverConfigured
        Set-RestrictionState $r.Applied
    }

    function Get-RestrictionsFromUI {
        $lock = @{}
        foreach ($l in $Lockdowns) { $lock[$l.Id] = ($lockBoxes[$l.Id].IsChecked -eq $true) }
        $mode = 'block'
        if ($ui.rbSitesAllow.IsChecked -eq $true) { $mode = 'allow' }
        $block = @($blockSites)
        $allow = @($allowSites)
        $active = if ($mode -eq 'allow') { $allow } else { $block }
        [pscustomobject]@{
            WhitelistEnabled = ($ui.chkWl.IsChecked -eq $true)
            Programs         = @($progs)
            SitesEnabled     = ($ui.chkSites.IsChecked -eq $true -and $active.Count -gt 0)
            SitesMode        = $mode
            BlockSites       = $block
            AllowSites       = $allow
            HostsEnabled     = ($ui.chkHosts.IsChecked -eq $true)
            Lockdowns        = $lock
        }
    }

    function Invoke-ApplyRestrictions([bool]$AskConfirm = $true) {
        if (-not $IsAdmin) { Show-Error 'Нужны права администратора: нажмите «Запустить от администратора».'; return }
        # Текст, введённый в поле, но не добавленный кнопкой, тоже учитываем
        if ($ui.txtProgAdd.Text) { Add-Programs @($ui.txtProgAdd.Text -split '[,;\s]+'); $ui.txtProgAdd.Text = '' }
        if ($ui.txtSiteAdd.Text) { Add-Sites @($ui.txtSiteAdd.Text -split '[,;\s]+'); $ui.txtSiteAdd.Text = '' }
        $cfg = Get-RestrictionsFromUI
        if ($cfg.WhitelistEnabled -and -not $cfg.Programs.Count) { Show-Error 'Список разрешённых программ пуст.'; return }
        if ($cfg.WhitelistEnabled -and $cfg.Programs -notcontains 'explorer.exe') {
            if (-not (Confirm-Action 'В списке нет explorer.exe — у пользователей могут не открываться папки. Продолжить?')) { return }
        }
        if ($ui.chkSites.IsChecked -eq $true -and -not $cfg.SitesEnabled) { Show-Error 'Список сайтов пуст. Добавьте сайты или выключите ограничение сайтов.'; return }
        if ($AskConfirm -and -not (Confirm-Action ("Применить для всех пользователей без прав администратора?`r`n`r`n" + (Get-RestrictionSummary $cfg)))) { return }

        Set-Busy $true
        try { $userResults = Set-NonAdminRestrictions $cfg } finally { Set-Busy $false }
        Import-RestrictionsToUI
        Update-UserList
        $report = Format-UserResults $userResults
        if (-not $report) { $report = '• Обычных пользователей пока нет — ограничения применятся к новым учётным записям при первом входе.' }
        Show-Info ("Ограничения применены.`r`n`r`n$report`r`n`r`nЧтобы проверить: выйдите из учётной записи пользователя (Пуск → значок пользователя → Выйти), " +
            "войдите снова и попробуйте запустить программу не из списка или открыть запрещённый сайт.")
    }

    $ui.btnRApply.Add_Click({ Invoke-Safe { Invoke-ApplyRestrictions $true } })

    $ui.btnRExport.Add_Click({
        Invoke-Safe {
            $file = Select-SaveFile 'Настройки ограничений (*.json)|*.json' $BackupDir ('restrictions_{0}_{1:yyyyMMdd}.json' -f $env:COMPUTERNAME, (Get-Date))
            if ($file) {
                Export-RestrictionConfig (Get-RestrictionsFromUI) $file
                Write-Log "Настройки ограничений экспортированы: $file"
                Show-Toast "Настройки сохранены: $file"
            }
        }
    })
    $ui.btnRImport.Add_Click({
        Invoke-Safe {
            $files = Select-OpenFile 'Настройки ограничений (*.json)|*.json' $BackupDir
            if (-not $files) { return }
            $cfg = Import-RestrictionConfig $files[0]
            Set-RestrictionsUI $cfg $false
            Write-Log "Загружены настройки ограничений: $($files[0])"
            if (Confirm-Action ("Настройки загружены:`r`n`r`n" + (Get-RestrictionSummary $cfg) + "`r`n`r`nПрименить их сейчас для всех пользователей без прав администратора?")) {
                Invoke-ApplyRestrictions $false
            } else {
                Show-Toast 'Настройки загружены в форму. Проверьте их и нажмите «Применить ограничения».'
            }
        }
    })

    $ui.btnCheckUsers.Add_Click({ Invoke-Safe { Set-Busy $true; try { Update-UserList } finally { Set-Busy $false }; Show-Toast 'Проверка завершена' } })

    $ui.btnRClear.Add_Click({
        Invoke-Safe {
            if (-not $IsAdmin) { Show-Error 'Нужны права администратора: нажмите «Запустить от администратора».'; return }
            if (-not (Confirm-Action 'Снять все ограничения для пользователей без прав администратора?')) { return }
            Set-Busy $true
            try { [void](Clear-NonAdminRestrictions) } finally { Set-Busy $false }
            Import-RestrictionsToUI
            Update-UserList
            Show-Toast 'Ограничения сняты. Изменения вступят в силу после повторного входа пользователей.'
        }
    })

    #endregion

    #region Страница «Политики»

    $policyRows = New-Object System.Collections.Generic.List[object]
    foreach ($p in $script:Catalog) {
        $scope = Get-PolicyScope $p
        $scopeText = switch ($scope) { 'HKLM' { 'Для всего компьютера' } 'HKCU' { 'Для текущего пользователя' } default { 'Компьютер и пользователь' } }
        $haystack = '{0} {1} {2} {3}' -f $p.Name, $p.Description, $p.Id, (($p.Values | ForEach-Object { $_.Name }) -join ' ')
        $policyRows.Add((New-Row @{ Id = $p.Id; Title = $p.Name; Subtitle = $scopeText; Group = $p.Category; Tag = $p; C2 = $haystack }))
    }
    $policyView = [System.Windows.Data.CollectionViewSource]::GetDefaultView($policyRows)
    [void]$policyView.GroupDescriptions.Add((New-Object System.Windows.Data.PropertyGroupDescription 'Group'))
    $script:PolFilterCat = '_all'
    $script:PolFilterText = ''
    $policyView.Filter = [Predicate[object]] {
        param($row)
        if ($script:PolFilterCat -eq '_configured') { if ($row.C1 -eq '_unset') { return $false } }
        elseif ($script:PolFilterCat -ne '_all' -and $row.Group -ne $script:PolFilterCat) { return $false }
        if ($script:PolFilterText -and $row.C2.IndexOf($script:PolFilterText, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $false }
        return $true
    }
    $ui.lbPolicies.ItemsSource = $policyView

    $catRows = New-Object System.Collections.Generic.List[object]
    $catRows.Add((New-Row @{ Id = '_all'; Title = 'Все' }))
    $catRows.Add((New-Row @{ Id = '_configured'; Title = 'Настроенные' }))
    foreach ($c in ($script:Catalog | ForEach-Object { $_.Category } | Select-Object -Unique)) { $catRows.Add((New-Row @{ Id = $c; Title = $c })) }
    $ui.lbCats.ItemsSource = $catRows
    $ui.lbCats.SelectedIndex = 0
    Register-Placeholder $ui.txtPolSearch $ui.phPolSearch

    function Set-RowState($Row, $State) {
        $Row.C1 = $State.Key
        $Row.Badge = $State.Label
        switch ($State.Key) {
            '_unset' { $Row.BadgeBg = $brush.GrayBg; $Row.BadgeFg = $brush.GrayFg }
            '_other' { $Row.BadgeBg = $brush.AmberBg; $Row.BadgeFg = $brush.AmberFg }
            '_error' { $Row.BadgeBg = $brush.RedBg; $Row.BadgeFg = $brush.RedFg }
            default  { $Row.BadgeBg = $brush.GreenBg; $Row.BadgeFg = $brush.GreenFg }
        }
    }

    function Update-PolicyCounter {
        $configured = @($policyRows | Where-Object { $_.C1 -ne '_unset' }).Count
        $ui.txtPolCount.Text = "Настроено $configured из $($policyRows.Count)"
    }

    function Update-PolicyStates {
        foreach ($row in $policyRows) { Set-RowState $row (Get-SafePolicyState $row.Tag) }
        $policyView.Refresh()
        Update-PolicyCounter
        if ($ui.lbPolicies.SelectedItem) { Show-PolicyDetails $ui.lbPolicies.SelectedItem }
    }

    function Show-PolicyDetails($Row) {
        $p = $Row.Tag
        $ui.pnlPolEmpty.Visibility = 'Collapsed'
        $ui.pnlPolDetails.Visibility = 'Visible'
        $ui.txtPolCategory.Text = $p.Category.ToUpper()
        $ui.txtPolName.Text = $p.Name
        $ui.txtPolDesc.Text = $p.Description
        $lines = foreach ($v in $p.Values) {
            $c = Get-RegValue $v.Path $v.Name
            $cur = if ($c) { '= ' + (Format-RegData $c.Kind $c.Data) } else { '(нет)' }
            '{0}\{1}  [{2}]  {3}' -f (ConvertTo-NativeRegPath $v.Path), $v.Name, $v.Type, $cur
        }
        $ui.txtPolReg.Text = ($lines -join "`r`n")

        $opts = New-Object System.Collections.Generic.List[object]
        if (-not $p.NoUnset) { $opts.Add((New-Row @{ Id = '_unset'; Title = 'Не задано (удалить параметры)' })) }
        foreach ($o in $p.Options) { $opts.Add((New-Row @{ Id = $o.Key; Title = $o.Label })) }
        $ui.cmbPolValue.ItemsSource = $opts
        $ui.cmbPolValue.SelectedIndex = -1
        for ($i = 0; $i -lt $opts.Count; $i++) { if ($opts[$i].Id -eq $Row.C1) { $ui.cmbPolValue.SelectedIndex = $i } }
        $ui.btnPolUnset.IsEnabled = -not $p.NoUnset

        $hints = @()
        if ($p.Reboot) { $hints += 'Требуется перезагрузка.' }
        if ($Row.Subtitle -ne 'Для всего компьютера') { $hints += 'Часть параметров действует только для пользователя, от имени которого запущена программа.' }
        if (-not $IsAdmin -and (Get-PolicyScope $p) -like '*HKLM*') { $hints += 'Нужны права администратора.' }
        $ui.txtPolHint.Text = $hints -join ' '
        $vis = 'Collapsed'
        if ($hints.Count) { $vis = 'Visible' }
        $ui.pnlPolHint.Visibility = $vis
    }

    function Invoke-ApplyPolicy([string]$Key) {
        $row = $ui.lbPolicies.SelectedItem
        if (-not $row) { return }
        $p = $row.Tag
        if ($p.Description -match 'ВНИМАНИЕ' -and $Key -ne '_unset') {
            if (-not (Confirm-Action "$($p.Description)`r`n`r`nПродолжить?")) { return }
        }
        try {
            Set-PolicyOption $p $Key
        } finally {
            Set-RowState $row (Get-SafePolicyState $p)
            Update-PolicyCounter
            Show-PolicyDetails $row
        }
        Show-Toast "«$($p.Name)»: $($row.Badge)"
        if ($p.Reboot) { Show-Info 'Изменение вступит в силу после перезагрузки.' }
    }

    $ui.lbCats.Add_SelectionChanged({
        Invoke-Safe {
            if ($ui.lbCats.SelectedItem) { $script:PolFilterCat = $ui.lbCats.SelectedItem.Id; $policyView.Refresh() }
        }
    })
    $ui.txtPolSearch.Add_TextChanged({ Invoke-Safe { $script:PolFilterText = $ui.txtPolSearch.Text.Trim(); $policyView.Refresh() } })
    $ui.lbPolicies.Add_SelectionChanged({ Invoke-Safe { if ($ui.lbPolicies.SelectedItem) { Show-PolicyDetails $ui.lbPolicies.SelectedItem } } })
    $ui.btnPolApply.Add_Click({
        Invoke-Safe {
            if (-not $ui.cmbPolValue.SelectedItem) { Show-Info 'Выберите значение.'; return }
            Invoke-ApplyPolicy $ui.cmbPolValue.SelectedItem.Id
        }
    })
    $ui.btnPolUnset.Add_Click({ Invoke-Safe { Invoke-ApplyPolicy '_unset' } })
    $ui.btnPolRegedit.Add_Click({ Invoke-Safe { if ($ui.lbPolicies.SelectedItem) { Open-InRegedit $ui.lbPolicies.SelectedItem.Tag.Values[0].Path } } })
    $ui.btnPolCopy.Add_Click({
        Invoke-Safe {
            if ($ui.lbPolicies.SelectedItem) {
                $text = ($ui.lbPolicies.SelectedItem.Tag.Values | ForEach-Object { (ConvertTo-NativeRegPath $_.Path) + '\' + $_.Name }) -join "`r`n"
                [System.Windows.Clipboard]::SetText($text)
                Show-Toast 'Пути скопированы в буфер обмена'
            }
        }
    })

    #endregion

    #region Страница «Реестр»

    $script:RegScan = @()
    Register-Placeholder $ui.txtRegFilter $ui.phRegFilter

    function Update-RegistryList {
        $q = $ui.txtRegFilter.Text.Trim()
        $known = @{}
        foreach ($p in $script:Catalog) { foreach ($v in $p.Values) { $known["$($v.Path)|$($v.Name)"] = $true } }
        $rows = New-Object System.Collections.Generic.List[object]
        foreach ($r in $script:RegScan) {
            if ($q -and ("$($r.Path) $($r.Name) $($r.Data)").IndexOf($q, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
            $name = $r.Name
            if ($name -eq '') { $name = '(По умолчанию)' }
            $bg = $brush.White
            if ($r.Path -match 'CurrentVersion\\Policies') { $bg = $brush.Sys }
            $inCatalog = ''
            if ($known.ContainsKey("$($r.Path)|$($r.Name)")) { $inCatalog = 'да' }
            $rows.Add((New-Row @{ Title = (ConvertTo-NativeRegPath $r.Path); Subtitle = $name; C1 = $r.Kind; C2 = $r.Data; C3 = $inCatalog; RowBg = $bg; Tag = $r }))
        }
        $ui.dgReg.ItemsSource = $rows
        $ui.txtRegInfo.Text = "Найдено параметров: $($rows.Count). Серым отмечены системные значения (CurrentVersion\Policies) — их удаление может нарушить работу Windows."
    }

    function Update-RegistryScan {
        Set-Busy $true
        try {
            $script:RegScan = @(Get-AllRegistryPolicies)
            $script:RegScanned = $true
            Update-RegistryList
        } finally { Set-Busy $false }
    }

    $ui.btnScan.Add_Click({ Invoke-Safe { Update-RegistryScan; Show-Toast "Сканирование завершено: $($script:RegScan.Count) параметров" } })
    $ui.txtRegFilter.Add_TextChanged({ Invoke-Safe { Update-RegistryList } })
    $ui.btnRegOpen.Add_Click({ Invoke-Safe { if ($ui.dgReg.SelectedItem) { Open-InRegedit $ui.dgReg.SelectedItem.Tag.Path } } })
    $ui.dgReg.Add_MouseDoubleClick({ Invoke-Safe { if ($ui.dgReg.SelectedItem) { Open-InRegedit $ui.dgReg.SelectedItem.Tag.Path } } })

    $ui.btnRegDelete.Add_Click({
        Invoke-Safe {
            $sel = @($ui.dgReg.SelectedItems | ForEach-Object { $_.Tag })
            if (-not $sel.Count) { Show-Info 'Выберите параметры для удаления.'; return }
            $msg = "Удалить выбранные параметры ($($sel.Count))?`r`n`r`n" + (($sel | Select-Object -First 15 | ForEach-Object { (ConvertTo-NativeRegPath $_.Path) + '\' + $_.Name }) -join "`r`n")
            if ($sel | Where-Object { $_.Path -match 'CurrentVersion\\Policies' }) {
                $msg += "`r`n`r`nВНИМАНИЕ: среди них есть системные значения CurrentVersion\Policies (например, настройки UAC)."
            }
            if (-not (Confirm-Action $msg)) { return }
            Invoke-AutoBackup
            foreach ($r in $sel) {
                Remove-RegValue $r.Path $r.Name
                Write-Log "Удалён параметр $(ConvertTo-NativeRegPath $r.Path)\$($r.Name) (было: $($r.Data))"
            }
            Update-RegistryScan
            Update-PolicyStates
            Show-Toast "Удалено параметров: $($sel.Count)"
        }
    })

    $ui.btnRegExport.Add_Click({
        Invoke-Safe {
            $dir = Join-Path $BackupDir ('reg_{0:yyyyMMdd_HHmmss}' -f (Get-Date))
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            $saved = 0
            foreach ($root in $PolicyRoots) {
                $native = ConvertTo-NativeRegPath $root
                $file = Join-Path $dir (($native -replace '^HKEY_LOCAL_MACHINE', 'HKLM' -replace '^HKEY_CURRENT_USER', 'HKCU' -replace '\\', '_') + '.reg')
                $proc = Start-Process reg.exe -ArgumentList 'export', "`"$native`"", "`"$file`"", '/y' -Wait -PassThru -WindowStyle Hidden
                if ($proc.ExitCode -eq 0) { $saved++ }
            }
            Start-Process explorer.exe -ArgumentList "`"$dir`""
            Show-Toast "Сохранено .reg-файлов: $saved"
        }
    })

    #endregion

    #region Страница «Профили и копии»

    function Update-ProfileList {
        $rows = New-Object System.Collections.Generic.List[object]
        if (Test-Path -LiteralPath $ProfilesDir) {
            foreach ($f in Get-ChildItem -LiteralPath $ProfilesDir -Filter *.json | Sort-Object Name) {
                $title = $f.BaseName
                $desc = ''
                try {
                    $pj = Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                    if ($pj.name) { $title = $pj.name }
                    $count = @($pj.policies.PSObject.Properties).Count
                    $desc = "$($pj.description) · политик: $count"
                } catch { $desc = 'Не удалось прочитать файл' }
                $rows.Add((New-Row @{ Id = $f.FullName; Title = $title; Subtitle = $desc }))
            }
        }
        $ui.icProfiles.ItemsSource = $rows
    }

    function Invoke-ProfileFile([string]$File, [string]$Title) {
        if (-not (Confirm-Action "Применить профиль «$Title»?`r`n`r`nПеред изменениями будет создана резервная копия.")) { return }
        Set-Busy $true
        try { $r = Invoke-PolicyProfile $File } finally { Set-Busy $false }
        Update-PolicyStates
        if ($r.Errors.Count) { Show-Error ("Применено политик: $($r.Ok). Ошибки:`r`n" + ($r.Errors -join "`r`n")) }
        else { Show-Toast "Профиль «$($r.Name)» применён: политик — $($r.Ok)" }
        if ($r.Reboot) { Show-Info 'Для части изменений нужна перезагрузка.' }
    }

    $ui.icProfiles.AddHandler([System.Windows.Controls.Primitives.ButtonBase]::ClickEvent, [System.Windows.RoutedEventHandler] {
        param($s, $e)
        $btn = $e.OriginalSource
        if ($btn -is [System.Windows.Controls.Button] -and $btn.Tag) {
            Invoke-Safe { Invoke-ProfileFile ([string]$btn.Tag) $btn.DataContext.Title }
        }
    })
    $ui.btnProfileFile.Add_Click({
        Invoke-Safe {
            $files = Select-OpenFile 'Профиль (*.json)|*.json' $ProfilesDir
            if ($files) { Invoke-ProfileFile $files[0] ([IO.Path]::GetFileNameWithoutExtension($files[0])) }
        }
    })
    $ui.btnProfileSave.Add_Click({
        Invoke-Safe {
            $file = Select-SaveFile 'Профиль (*.json)|*.json' $ProfilesDir 'my-profile.json'
            if ($file) {
                Export-CurrentAsProfile $file ([IO.Path]::GetFileNameWithoutExtension($file))
                Update-ProfileList
                Show-Toast "Профиль сохранён: $file"
            }
        }
    })
    $ui.btnBackup.Add_Click({
        Invoke-Safe {
            $file = Select-SaveFile 'Резервная копия (*.json)|*.json' $BackupDir ('backup_{0:yyyyMMdd_HHmmss}.json' -f (Get-Date))
            if ($file) {
                Export-PolicyBackup $file
                Write-Log "Резервная копия: $file"
                Show-Toast "Резервная копия сохранена: $file"
            }
        }
    })
    $ui.btnRestore.Add_Click({
        Invoke-Safe {
            $files = Select-OpenFile 'Резервная копия (*.json)|*.json' $BackupDir
            if ($files -and (Confirm-Action "Восстановить политики из файла?`r`n$($files[0])")) {
                Set-Busy $true
                try { $errors = Import-PolicyBackup $files[0] } finally { Set-Busy $false }
                Update-PolicyStates
                if ($errors) { Show-Error "Восстановлено с ошибками: $errors. Подробности в журнале." }
                else { Show-Toast 'Политики восстановлены из резервной копии' }
            }
        }
    })
    $ui.btnOpenBackups.Add_Click({ Invoke-Safe { Start-Process explorer.exe -ArgumentList "`"$BackupDir`"" } })
    $ui.btnResetAll.Add_Click({
        Invoke-Safe {
            if (-not (Confirm-Action "Сбросить все политики каталога в «Не задано»?`r`n`r`nПеред изменениями будет создана резервная копия.")) { return }
            Set-Busy $true
            try { $n = Reset-AllPolicies } finally { Set-Busy $false }
            Update-PolicyStates
            Show-Toast "Сброшено политик: $n"
        }
    })

    #endregion

    #region Страница «Инструменты»

    $ui.btnToolGpupdate.Add_Click({ Invoke-Safe { Start-Process cmd.exe -ArgumentList '/c', 'gpupdate /force & pause' } })
    $ui.btnToolGpresult.Add_Click({
        Invoke-Safe {
            $file = Join-Path $env:TEMP ('gpresult_{0:yyyyMMdd_HHmmss}.html' -f (Get-Date))
            Set-Busy $true
            try { $proc = Start-Process gpresult.exe -ArgumentList '/h', "`"$file`"", '/f' -Wait -PassThru -WindowStyle Hidden } finally { Set-Busy $false }
            if ($proc.ExitCode -eq 0 -and (Test-Path -LiteralPath $file)) { Start-Process $file }
            else { Show-Error "gpresult завершился с кодом $($proc.ExitCode)." }
        }
    })
    $ui.btnToolGpedit.Add_Click({
        Invoke-Safe {
            if (Test-Path -LiteralPath (Join-Path (Get-System32Dir) 'gpedit.msc')) { Start-Process mmc.exe -ArgumentList 'gpedit.msc' }
            else { Show-Info 'gpedit.msc отсутствует (редакция Home). Эта программа работает с политиками напрямую через реестр.' }
        }
    })
    $ui.btnToolExplorer.Add_Click({
        Invoke-Safe {
            Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force
            # Windows перезапускает Проводник сама; запускаем вручную, только если этого не произошло
            for ($i = 0; $i -lt 10 -and -not (Get-Process explorer -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
            if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }
            Show-Toast 'Проводник перезапущен'
        }
    })
    $ui.btnToolLog.Add_Click({
        Invoke-Safe {
            if (-not (Test-Path -LiteralPath $LogFile)) { Write-Log 'Журнал создан' }
            Start-Process notepad.exe -ArgumentList "`"$LogFile`""
        }
    })
    $ui.btnToolData.Add_Click({ Invoke-Safe { Start-Process explorer.exe -ArgumentList "`"$DataDir`"" } })
    $ui.btnToolAudit.Add_Click({ $ui.navAudit.IsChecked = $true })

    #endregion

    #region Страница «Журнал запусков»

    $script:AuditLoaded = $false
    Register-Placeholder $ui.txtAuditFilter $ui.phAuditFilter
    Register-Placeholder $ui.txtSitesFilter $ui.phSitesFilter

    function Update-AuditView {
        if (-not $IsAdmin) {
            $ui.dgAudit.ItemsSource = $null
            $ui.bannerAudit.Visibility = 'Collapsed'
            $ui.pnlAuditEmpty.Visibility = 'Visible'
            $ui.txtAuditEmpty.Text = 'Журнал запусков доступен только с правами администратора. Нажмите «Запустить от администратора».'
            return
        }
        $enabled = Test-ProcessAuditEnabled
        $ui.bannerAudit.Visibility = $(if ($enabled) { 'Collapsed' } else { 'Visible' })
        Set-Busy $true
        try {
            $rows = New-Object System.Collections.Generic.List[object]
            $err = $null
            try {
                foreach ($r in @(Get-ProcessLog 500 $ui.txtAuditFilter.Text.Trim())) {
                    $rows.Add((New-Row @{ Title = $r.Program; Subtitle = $r.User; C1 = $r.Time.ToString('dd.MM.yyyy HH:mm:ss'); C2 = $r.Path }))
                }
            } catch { $err = $_.Exception.Message }
            $ui.dgAudit.ItemsSource = $rows
            if ($rows.Count) {
                $ui.pnlAuditEmpty.Visibility = 'Collapsed'
            } else {
                $ui.pnlAuditEmpty.Visibility = 'Visible'
                if ($err) { $ui.txtAuditEmpty.Text = 'Не удалось прочитать журнал: ' + $err }
                elseif (-not $enabled) { $ui.txtAuditEmpty.Text = 'Пока нет записей. Включите запись запусков — и они начнут появляться здесь.' }
                else { $ui.txtAuditEmpty.Text = 'Записей нет. Запустите какую-нибудь программу и нажмите «Обновить».' }
            }
        } finally { Set-Busy $false }
        $script:AuditLoaded = $true
    }

    $ui.btnAuditEnable.Add_Click({
        Invoke-Safe {
            if (-not $IsAdmin) { Show-Error 'Нужны права администратора.'; return }
            Enable-ProcessAudit
            Update-AuditView
            Show-Toast 'Запись запусков включена. Записываются программы, запущенные после этого момента.'
        }
    })
    $ui.btnAuditDisable.Add_Click({
        Invoke-Safe {
            if (-not $IsAdmin) { Show-Error 'Нужны права администратора.'; return }
            if (-not (Confirm-Action 'Выключить запись запуска приложений?')) { return }
            Disable-ProcessAudit
            Update-AuditView
            Show-Toast 'Запись запусков выключена'
        }
    })
    $ui.btnAuditRefresh.Add_Click({ Invoke-Safe { Update-AuditView; Show-Toast 'Журнал обновлён' } })
    $ui.txtAuditFilter.Add_KeyDown({ param($s, $e) if ($e.Key -eq 'Return') { Invoke-Safe { Update-AuditView } } })

    function Update-SiteView {
        if (-not $IsAdmin) {
            $ui.dgSites.ItemsSource = $null
            $ui.bannerSites.Visibility = 'Collapsed'
            $ui.pnlSitesEmpty.Visibility = 'Visible'
            $ui.txtSitesEmpty.Text = 'Журнал сайтов доступен только с правами администратора. Нажмите «Запустить от администратора».'
            return
        }
        $enabled = Test-SiteLogEnabled
        $ui.bannerSites.Visibility = $(if ($enabled) { 'Collapsed' } else { 'Visible' })
        Set-Busy $true
        try {
            $rows = New-Object System.Collections.Generic.List[object]
            $err = $null
            try {
                foreach ($r in @(Get-SiteLog 2000 $ui.txtSitesFilter.Text.Trim())) {
                    $rows.Add((New-Row @{ Title = $r.Domain; C1 = $r.Time.ToString('dd.MM.yyyy HH:mm:ss'); C2 = [string]$r.Count }))
                }
            } catch { $err = $_.Exception.Message }
            $ui.dgSites.ItemsSource = $rows
            if ($rows.Count) {
                $ui.pnlSitesEmpty.Visibility = 'Collapsed'
            } else {
                $ui.pnlSitesEmpty.Visibility = 'Visible'
                if ($err) { $ui.txtSitesEmpty.Text = 'Не удалось прочитать журнал: ' + $err }
                elseif (-not $enabled) { $ui.txtSitesEmpty.Text = 'Пока нет записей. Включите запись сайтов — и они начнут появляться здесь.' }
                else { $ui.txtSitesEmpty.Text = 'Записей нет. Откройте сайт в браузере и нажмите «Обновить».' }
            }
        } finally { Set-Busy $false }
    }

    $ui.rbLogApps.Add_Checked({
        Invoke-Safe {
            $ui.gridLogApps.Visibility = 'Visible'
            $ui.gridLogSites.Visibility = 'Collapsed'
            Update-AuditView
        }
    })
    $ui.rbLogSites.Add_Checked({
        Invoke-Safe {
            $ui.gridLogApps.Visibility = 'Collapsed'
            $ui.gridLogSites.Visibility = 'Visible'
            Update-SiteView
        }
    })
    $ui.btnSitesEnable.Add_Click({
        Invoke-Safe {
            if (-not $IsAdmin) { Show-Error 'Нужны права администратора.'; return }
            Enable-SiteLog
            Update-SiteView
            Show-Toast 'Запись сайтов включена. Сохраняются сайты, открытые после этого момента.'
        }
    })
    $ui.btnSitesDisable.Add_Click({
        Invoke-Safe {
            if (-not $IsAdmin) { Show-Error 'Нужны права администратора.'; return }
            if (-not (Confirm-Action 'Выключить запись посещённых сайтов?')) { return }
            Disable-SiteLog
            Update-SiteView
            Show-Toast 'Запись сайтов выключена'
        }
    })
    $ui.btnSitesRefresh.Add_Click({ Invoke-Safe { Update-SiteView; Show-Toast 'Журнал обновлён' } })
    $ui.txtSitesFilter.Add_KeyDown({ param($s, $e) if ($e.Key -eq 'Return') { Invoke-Safe { Update-SiteView } } })

    #endregion

    #region Общие события

    $ui.btnElevate.Add_Click({ Invoke-Safe { Start-Elevated; $window.Close() } })

    function Update-Everything {
        Set-Busy $true
        try {
            Update-PolicyStates
            Update-UserList
            Import-RestrictionsToUI
            if ($script:RegScanned) { Update-RegistryScan }
        } finally { Set-Busy $false }
    }
    $ui.btnRefresh.Add_Click({ Invoke-Safe { Update-Everything; Show-Toast 'Состояние обновлено' } })
    $window.Add_KeyDown({ param($s, $e) if ($e.Key -eq 'F5') { Invoke-Safe { Update-Everything } } })

    $window.Add_ContentRendered({
        Invoke-Safe { Show-Page 'navRestrict' }
        Invoke-Safe { Update-PolicyStates }
        Invoke-Safe { Update-UserList }
        Invoke-Safe { Import-RestrictionsToUI }
    })

    #endregion

    [void]$window.ShowDialog()
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
    Write-Log "Ошибка запуска: $($_.Exception.Message)"
    Add-Type -AssemblyName PresentationFramework
    [void][System.Windows.MessageBox]::Show("Ошибка запуска:`r`n$($_.Exception.Message)", $AppName, 'OK', 'Error')
}

#endregion
