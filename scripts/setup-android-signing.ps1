param(
  [string]$KeytoolPath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot 'android'
$keystoreDir = Join-Path $androidRoot 'keystore'
$keystorePath = Join-Path $keystoreDir 'quick-vocab-release.jks'
$propertiesPath = Join-Path $androidRoot 'signing.properties'

if (-not $KeytoolPath) {
  $candidates = @(
    $(if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\keytool.exe' }),
    (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr\bin\keytool.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Android\Android Studio\jbr\bin\keytool.exe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  $KeytoolPath = $candidates | Select-Object -First 1
}

if (-not $KeytoolPath -or -not (Test-Path -LiteralPath $KeytoolPath)) {
  throw 'keytool.exe was not found. Install Android Studio or pass -KeytoolPath.'
}
if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $propertiesPath)) {
  throw 'Signing files already exist. They were not replaced so future APK updates remain compatible.'
}

$randomBytes = New-Object byte[] 24
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($randomBytes) } finally { $random.Dispose() }
$password = [Convert]::ToBase64String($randomBytes).Replace('+', 'A').Replace('/', 'B')
New-Item -ItemType Directory -Force -Path $keystoreDir | Out-Null

& $KeytoolPath -genkeypair -v `
  -keystore $keystorePath `
  -storepass $password `
  -keypass $password `
  -alias 'quick-vocab' `
  -keyalg RSA `
  -keysize 4096 `
  -validity 10000 `
  -dname 'CN=Quick Vocab, OU=Personal, O=haishiqiguai, C=CN'
if ($LASTEXITCODE -ne 0) { throw "keytool 失败，退出码 $LASTEXITCODE" }

$properties = @(
  'storeFile=../keystore/quick-vocab-release.jks'
  "storePassword=$password"
  'keyAlias=quick-vocab'
  "keyPassword=$password"
) -join [Environment]::NewLine
[System.IO.File]::WriteAllText($propertiesPath, $properties + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

Write-Host 'Android release signing files were created.'
Write-Host "Keystore: $keystorePath"
Write-Host "Properties: $propertiesPath"
Write-Host 'Back up both files offline. Losing them prevents future APKs from updating the installed app.'
