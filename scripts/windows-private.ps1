param(
  [ValidateSet('PublishConfig','ProtectEmptyScratch','ProtectBackupRoot')][string]$Operation,
  [Parameter(Mandatory=$true)][string]$Path
)
$ErrorActionPreference = 'Stop'
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$accounts = @($owner, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
$isDirectory = $Operation -ne 'PublishConfig'
if ($isDirectory) {
  $item = Get-Item -Force -LiteralPath $Path
  if (!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unexpected directory.' }
  if ($Operation -eq 'ProtectBackupRoot') {
    $expected = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) 'backups'))
    if (![string]::Equals($item.FullName.TrimEnd('\'),$expected,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected backup root.' }
  } elseif ($item.Name -notmatch '^\.fjstudio-backup-[a-zA-Z0-9]+$' -or @(Get-ChildItem -Force -LiteralPath $Path).Count -gt 0) {
    throw 'Unexpected staging directory.'
  }
  $existing = Get-Acl -LiteralPath $Path
  if (!$existing.GetOwner([Security.Principal.SecurityIdentifier]).Equals($owner)) { throw 'Unexpected staging owner.' }
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
} else {
  if ([IO.Path]::GetFileName($Path) -cnotin @('.env.local','.env.human.local','.env.archive.local')) { throw 'Unexpected configuration name.' }
  if ([IO.File]::Exists($Path)) { exit 73 }
  $acl = [Security.AccessControl.FileSecurity]::new()
  $inherit = [Security.AccessControl.InheritanceFlags]::None
}
$acl.SetAccessRuleProtection($true,$false)
foreach ($ace in @($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))) {
  $acl.RemoveAccessRuleSpecific($ace)
}
foreach ($account in $accounts) {
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($account,'FullControl',$inherit,'None','Allow'))
}
if ($isDirectory) {
  [IO.Directory]::SetAccessControl($Path,$acl)
} else {
  $temp = Join-Path ([IO.Path]::GetDirectoryName($Path)) ('.fjstudio-config-' + [Guid]::NewGuid().ToString('N'))
  # The temporary file has a private descriptor as soon as its name exists.
  $stream = [IO.FileStream]::new($temp,[IO.FileMode]::CreateNew,[Security.AccessControl.FileSystemRights]::Write,
    [IO.FileShare]::None,4096,[IO.FileOptions]::None,$acl)
  try {
    try { [Console]::OpenStandardInput().CopyTo($stream); $stream.Flush($true) }
    finally { $stream.Dispose() }
    try { [IO.File]::Move($temp,$Path) }
    catch [IO.IOException] { if ([IO.File]::Exists($Path)) { exit 73 }; throw }
  } finally { if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) } }
}
