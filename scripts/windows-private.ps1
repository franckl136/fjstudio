param(
  [ValidateSet('PublishConfig','ProtectEmptyScratch')][string]$Operation,
  [Parameter(Mandatory=$true)][string]$Path
)
$ErrorActionPreference = 'Stop'
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$accounts = @($owner, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
$isDirectory = $Operation -eq 'ProtectEmptyScratch'
if ($isDirectory) {
  $item = Get-Item -Force -LiteralPath $Path
  if (!$item.PSIsContainer -or $item.Name -notmatch '^\.fjstudio-backup-[a-zA-Z0-9]+$' -or
      ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      @(Get-ChildItem -Force -LiteralPath $Path).Count -gt 0) {
    throw 'Unexpected staging directory.'
  }
  $acl = Get-Acl -LiteralPath $Path
  if (!$acl.GetOwner([Security.Principal.SecurityIdentifier]).Equals($owner)) { throw 'Unexpected staging owner.' }
  $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
} else {
  if ([IO.Path]::GetFileName($Path) -cne '.env.local') { throw 'Unexpected configuration name.' }
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
  Set-Acl -LiteralPath $Path -AclObject $acl
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
