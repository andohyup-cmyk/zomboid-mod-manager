# Read-only Workshop mod.info audit for Project Zomboid Build 42.22.
# Does not change mods, server settings or Steam files.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$WorkshopRoot,
  [string]$OutputPath = ".\zomboid-workshop-audit.json"
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath $WorkshopRoot -ErrorAction Stop).Path.TrimEnd('\','/')
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
  throw "WorkshopRoot must be an existing directory."
}
if (Test-Path -LiteralPath $OutputPath) {
  throw "Output already exists. Choose a new OutputPath to preserve the existing report."
}
$records = @()
$skipped = @()
$workshops = @(Get-ChildItem -LiteralPath $root -Directory |
  Where-Object { $_.Name -match '^\d{5,20}$' })
foreach ($workshop in $workshops) {
  $files = @(Get-ChildItem -LiteralPath $workshop.FullName -File -Filter "mod.info" -Recurse -ErrorAction SilentlyContinue)
  if ($files.Count -eq 0) {
    $skipped += $workshop.Name
    continue
  }
  foreach ($file in $files) {
    $id = $null
    $name = $null
    $requires = @()
    foreach ($line in (Get-Content -LiteralPath $file.FullName -ErrorAction Stop)) {
      if ($line -match '^\s*id\s*=\s*(.+?)\s*$' -and -not $id) { $id = $Matches[1].Trim(); continue }
      if ($line -match '^\s*name\s*=\s*(.+?)\s*$' -and -not $name) { $name = $Matches[1].Trim(); continue }
      if ($line -match '^\s*require\s*=\s*(.+?)\s*$') {
        $requires = @(($Matches[1] -split ',') | ForEach-Object { $_.Trim() } |
          Where-Object { $_ -ne '' })
      }
    }
    $relative = $file.FullName.Substring($workshop.FullName.Length).TrimStart('\','/')
    $records += [pscustomobject]@{
      workshopId = $workshop.Name
      modId = $id
      displayName = $name
      requires = $requires
      relativePath = ($workshop.Name + "\" + $relative)
      modIdConfirmedFromFile = [bool]($id)
      b4222Compatible = "unverified"
      multiplayerCompatible = "unverified"
      middleServerAddition = "unverified"
    }
  }
}
$report = [ordered]@{
  format = "pzmod-workshop-readonly-audit-v1"
  scannedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  targetBuild = "42.22"
  workshopCount = $workshops.Count
  modInfoCount = @($records).Count
  missingModInfoWorkshopIds = $skipped
  mods = @($records)
  note = "mod.info existence does not prove B42.22, multiplayer or hot-add compatibility."
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Host "Report written to $OutputPath ($($records.Count) mod.info files). No game file changed."
