Param(
  [string]$Runtime = 'win-x64',
  [switch]$SelfContained
)

$ErrorActionPreference = 'Stop'

$global:DotNetPath = $null
function Resolve-DotNet {
  try { & dotnet --version *> $null; $global:DotNetPath = 'dotnet'; return $true } catch {}
  $candidates = @(
    "$Env:ProgramFiles\dotnet\dotnet.exe",
    "$Env:ProgramFiles(x86)\dotnet\dotnet.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { $global:DotNetPath = $p; return $true }
  }
  return $false
}

if (-not (Resolve-DotNet)) {
  Write-Host 'ERROR: .NET SDK not found in PATH.' -ForegroundColor Red
  Write-Host 'Install the .NET 9 SDK (not just the runtime):' -ForegroundColor Yellow
  Write-Host '  https://dotnet.microsoft.com/download/dotnet/9.0' -ForegroundColor Yellow
  Write-Host 'After install, restart PowerShell and try again.' -ForegroundColor Yellow
  exit 1
}

$proj = Join-Path $PSScriptRoot 'ServerManagerWin\ServerManagerWin.csproj'
$tf = 'net9.0-windows'
if (-not (Test-Path $proj)) {
  Write-Host 'ERROR: ServerManagerWin project not found.' -ForegroundColor Red
  exit 1
}

$sc = $SelfContained.IsPresent
$props = @('PublishSingleFile=true','IncludeNativeLibrariesForSelfExtract=true')
if ($sc) { $props += 'SelfContained=true' } else { $props += 'SelfContained=false' }

Write-Host 'Publishing Windows Server Manager EXE...' -ForegroundColor Cyan
& $global:DotNetPath publish $proj -c Release -r $Runtime -p:$(($props -join ';')) | Out-Host

$pubDir = Join-Path $PSScriptRoot "ServerManagerWin\bin\Release\$tf\$Runtime\publish"
if (-not (Test-Path $pubDir)) {
  Write-Host 'ERROR: Publish directory not found.' -ForegroundColor Red
  exit 1
}

$exe = Join-Path $pubDir 'WheelOfWackServerManager.exe'
if (-not (Test-Path $exe)) {
  Write-Host 'ERROR: EXE not found after publish.' -ForegroundColor Red
  exit 1
}

$dest = Join-Path $PSScriptRoot 'WheelOfWackServerManager.exe'
Copy-Item $exe $dest -Force
Write-Host "Success: $dest" -ForegroundColor Green
