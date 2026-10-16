param(
  [ValidateSet('debug', 'release')]
  [string]$Variant = 'debug'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$javaCandidates = @()
if ($env:JAVA_HOME) { $javaCandidates += $env:JAVA_HOME }
$javaCandidates += Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending |
  Select-Object -ExpandProperty FullName

$javaHome = $javaCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'bin\java.exe') } | Select-Object -First 1
if (-not $javaHome) {
  throw 'A compatible JDK 21 was not found. Install Microsoft.OpenJDK.21 with winget.'
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_SDK_ROOT = Join-Path $projectRoot '.android-sdk'
$task = if ($Variant -eq 'release') { 'assembleRelease' } else { 'assembleDebug' }
Push-Location (Join-Path $projectRoot 'android')
try {
  & '.\gradlew.bat' $task
  if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}
