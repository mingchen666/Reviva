<#
  .SYNOPSIS
  Download and extract bundled standalone CPython 3.11 for Reviva.
  .DESCRIPTION
  Downloads python-build-standalone (install_only_stripped) for the given
  Windows architecture(s) and extracts into electron/builtin-assets/bin/python/windows-<arch>/.
  This makes the bundled interpreter available for local builds without CI.
  .PARAMETER Arch
  Architecture to fetch: 'x64', 'arm64', or 'all' (default: all).
  .PARAMETER ReleaseTag
  python-build-standalone release tag (default: 20250626).
  .EXAMPLE
  pwsh scripts/download-python.ps1 -Arch x64
  pwsh scripts/download-python.ps1 -Arch all
#>
param(
  [ValidateSet('x64', 'arm64', 'all')]
  [string]$Arch = 'all',
  [string]$ReleaseTag = '20261026',
  [string]$PythonVersion = '3.11.18'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$outRoot = Join-Path $repoRoot 'electron\builtin-assets\bin\python'

$archMap = @{
  'x64'   = 'x86_64-pc-windows-msvc'
  'arm64' = 'aarch64-pc-windows-msvc'
}

$archs = if ($Arch -eq 'all') { @('x64', 'arm64') } else { @($Arch) }

foreach ($a in $archs) {
  $triple = $archMap[$a]
  $destDir = Join-Path $outRoot "windows-$a"
  $assetName = "cpython-$PythonVersion+$ReleaseTag-$triple-install_only_stripped.tar.gz"
  $url = "https://github.com/astral-sh/python-build-standalone/releases/download/$ReleaseTag/$assetName"
  $tmpFile = Join-Path $env:TEMP $assetName

  Write-Host "==> Python $PythonVersion ($a) -> $destDir"

  $pyExe = Join-Path $destDir "python\python.exe"
  if (Test-Path $pyExe) {
    Write-Host "    Already present, skipping. (delete $destDir to re-fetch)"
    continue
  }

  Write-Host "    Downloading $url"
  $maxTries = 4
  $got = $false
  for ($i = 1; $i -le $maxTries; $i++) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $tmpFile -UseBasicParsing -TimeoutSec 120
      $got = $true
      break
    } catch {
      Write-Host "    Attempt $i failed: $($_.Exception.Message)"
      if ($i -lt $maxTries) { Start-Sleep -Seconds 5 }
    }
  }
  if (-not $got) { throw "Download failed after $maxTries attempts: $url" }

  if (Test-Path $destDir) { Remove-Item $destDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null

  Write-Host "    Extracting..."
  & tar -xzf $tmpFile -C $destDir
  if ($LASTEXITCODE -ne 0) { throw "tar extraction failed for $assetName" }

  Remove-Item $tmpFile -Force

  if (-not (Test-Path $pyExe)) {
    throw "Extraction did not produce expected python.exe at $pyExe"
  }
  Write-Host "    OK: $pyExe"
}

Write-Host "==> Done."
