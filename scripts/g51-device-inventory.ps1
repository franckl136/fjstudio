# Relevé matériel local. Le reçu ne conserve ni numéro de série ni identifiant USB.
$ErrorActionPreference = 'Stop'
$sdkRoots = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME, "$env:LOCALAPPDATA\Android\Sdk", "C:\Android\Sdk", "D:\Android\Sdk") |
    Where-Object { $_ } | Select-Object -Unique
function Find-Tool([string] $Name, [string] $RelativePath) {
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    foreach ($root in $sdkRoots) {
        $candidate = Join-Path $root $RelativePath
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
}
$adbPath = Find-Tool 'adb.exe' 'platform-tools\adb.exe'
$emulatorPath = Find-Tool 'emulator.exe' 'emulator\emulator.exe'
$devices = @(Get-PnpDevice -PresentOnly | Where-Object {
    $_.Class -in 'AndroidUsbDeviceClass','WPD' -or $_.FriendlyName -match 'Android|Apple iPhone|Apple Mobile Device|ADB Interface|Pixel|Galaxy'
})
$androidStates = @()
if ($adbPath) {
    $list = @(& $adbPath devices)
    if ($LASTEXITCODE -ne 0) { throw 'Inventaire ADB indisponible' }
    $androidStates = @($list | ForEach-Object {
        if ($_ -match '^\S+\s+(device|offline|unauthorized|recovery|sideload|bootloader)$') { $matches[1] }
    })
}
$avds = @()
if ($emulatorPath) {
    $avds = @(& $emulatorPath -list-avds | Where-Object { $_.Trim() })
    if ($LASTEXITCODE -ne 0) { throw 'Inventaire AVD indisponible' }
}
[ordered]@{
    schema = 'fjstudio-device-inventory-v1'
    observedAt = [DateTimeOffset]::UtcNow.ToString('o')
    operatingSystem = 'Windows'
    adbAvailable = [bool]$adbPath
    adbStates = $androidStates
    emulatorAvailable = [bool]$emulatorPath
    configuredAvds = $avds.Count
    pnpCandidates = $devices.Count
    usbIosCandidates = @($devices | Where-Object FriendlyName -Match 'Apple iPhone|Apple Mobile Device').Count
    iosToolAvailable = [bool](Get-Command idevice_id -ErrorAction SilentlyContinue)
    qualification = 'inventory-only'
} | ConvertTo-Json
