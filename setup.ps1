# Sets Shortlisted up on Windows and opens it in the browser.
#
#   powershell -ExecutionPolicy Bypass -File setup.ps1
#
# Safe to run again: it keeps an existing .env and only starts what is not
# running. The one thing it needs is Docker Desktop, installed and open.

Set-Location -LiteralPath $PSScriptRoot

function Say($text) { Write-Host ""; Write-Host $text }
function Fail($text) { Write-Host ""; Write-Host $text -ForegroundColor Red; exit 1 }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this again."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Fail "Docker is installed but not running. Open Docker Desktop, wait until it says it is running, and run this again."
}

$envPath = Join-Path $PSScriptRoot ".env"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Set-EnvValue($name, $value) {
  $lines = [System.IO.File]::ReadAllLines($envPath) | ForEach-Object { if ($_ -match "^$name=") { "$name=$value" } else { $_ } }
  [System.IO.File]::WriteAllText($envPath, (($lines -join "`n") + "`n"), $utf8)
}
function Get-EnvValue($name) {
  foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
    if ($line -match "^$name=(.*)$") { return $Matches[1].Trim() }
  }
  return ""
}
function Test-PortInUse($port) {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
  try { $listener.Start(); $listener.Stop(); return $false } catch { return $true }
}

if (-not (Test-Path -LiteralPath $envPath)) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot ".env.example") -Destination $envPath

  $port = 3000
  while (Test-PortInUse $port) { $port++ }
  Set-EnvValue "WEB_PORT" $port
  if ($port -ne 3000) { Say "Port 3000 is taken, so Shortlisted will use $port." }

  if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    Say "How should Shortlisted reach a model?"
    Write-Host "  1) My Claude subscription (Claude Code, signs in once)"
    Write-Host "  2) My ChatGPT subscription (Codex, signs in once)"
    Write-Host "  3) Copy and paste, no sign-in"
    $choice = Read-Host "Choose 1, 2 or 3 [3]"
    switch ($choice) {
      "1" { Set-EnvValue "SHORTLISTED_PROVIDER" "claude-cli" }
      "2" { Set-EnvValue "SHORTLISTED_PROVIDER" "codex-cli" }
      default { Set-EnvValue "SHORTLISTED_PROVIDER" "manual" }
    }
  }
}

$port = Get-EnvValue "WEB_PORT"
if (-not $port) { $port = "3000" }
$provider = Get-EnvValue "SHORTLISTED_PROVIDER"

Say "Getting Shortlisted. The first time this downloads about 1 GB."
docker compose pull --quiet web 2> $null
if ($LASTEXITCODE -ne 0) {
  Say "No published image was found, so it is being built here. This takes a few minutes."
  docker compose build
  if ($LASTEXITCODE -ne 0) { Fail "The build failed. The lines above say why." }
}

docker compose up -d
if ($LASTEXITCODE -ne 0) { Fail "Shortlisted could not start. The lines above say why." }

Say "Starting"
$ready = $false
foreach ($i in 1..90) {
  try {
    Invoke-WebRequest -Uri "http://localhost:$port/api/me" -UseBasicParsing -TimeoutSec 3 | Out-Null
    $ready = $true
    break
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) { Fail "Shortlisted did not start within three minutes. Run 'docker compose logs web' to see why." }

function Start-SignIn($statusArgs, $loginArgs, $name) {
  docker compose exec -T worker @statusArgs *> $null
  if ($LASTEXITCODE -eq 0) { return }
  $command = "docker compose exec worker " + ($loginArgs -join " ")
  if ([Console]::IsInputRedirected) { Say "$name is not signed in. Run: $command"; return }
  Say "Sign in to $name. A link will appear. Open it, sign in, and paste the code back here."
  docker compose exec worker @loginArgs
  if ($LASTEXITCODE -ne 0) { Say "Sign-in did not finish. You can run it later: $command" }
}
if ($provider -eq "claude-cli") { Start-SignIn @("claude", "auth", "status") @("claude", "auth", "login") "Claude Code" }
if ($provider -eq "codex-cli") { Start-SignIn @("codex", "login", "status") @("codex", "login", "--device-auth") "Codex" }

$url = "http://localhost:$port/setup"
Say "Shortlisted is running at $url"
Start-Process $url
