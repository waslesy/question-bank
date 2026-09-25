param(
    [string]$OutputPath = (Join-Path $HOME '.question-bank-signing\questionbank-release.jks')
)

$ErrorActionPreference = 'Stop'
$alias = 'questionbank-release'
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$parent = Split-Path -Parent $resolvedOutput

if (Test-Path -LiteralPath $resolvedOutput) {
    throw "Refusing to overwrite existing keystore: $resolvedOutput"
}

New-Item -ItemType Directory -Force -Path $parent | Out-Null
$keytool = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\keytool.exe' } else { (Get-Command keytool -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $keytool)) {
    throw 'keytool was not found. Set JAVA_HOME to a JDK installation.'
}

Write-Host "Creating a new release keystore at $resolvedOutput"
Write-Host "Alias: $alias"
Write-Host 'keytool will request the new passwords interactively.'

& $keytool -genkeypair -v -keystore $resolvedOutput -alias $alias -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=QuestionBank Release, O=QuestionBank, C=CN'
if ($LASTEXITCODE -ne 0) {
    throw "keytool failed with exit code $LASTEXITCODE"
}

Write-Host 'Keystore created. Keep it backed up outside the repository.'
