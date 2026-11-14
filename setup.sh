#!/usr/bin/env bash
# Sets Shortlisted up on macOS or Linux and opens it in the browser.
#
#   bash setup.sh
#
# Safe to run again: it keeps an existing .env and only starts what is not
# running. The one thing it needs is Docker Desktop, installed and open.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n%s\n' "$1"; }
fail() { printf '\n%s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this again."
docker info >/dev/null 2>&1 || fail "Docker is installed but not running. Open Docker Desktop, wait until it says it is running, and run this again."

set_env() { # set_env NAME VALUE, replacing the line in .env
  local tmp
  tmp="$(mktemp)"
  sed "s|^$1=.*|$1=$2|" .env >"$tmp" && cat "$tmp" >.env && rm -f "$tmp"
}
get_env() { sed -n "s|^$1=||p" .env | head -n 1; }
port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

if [ ! -f .env ]; then
  cp .env.example .env

  port=3000
  while port_in_use "$port"; do port=$((port + 1)); done
  set_env WEB_PORT "$port"
  [ "$port" = 3000 ] || say "Port 3000 is taken, so Shortlisted will use $port."

  if [ -t 0 ]; then
    say "How should Shortlisted reach a model?"
    echo "  1) My Claude subscription (Claude Code, signs in once)"
    echo "  2) My ChatGPT subscription (Codex, signs in once)"
    echo "  3) Copy and paste, no sign-in"
    read -r -p "Choose 1, 2 or 3 [3]: " choice
    case "${choice:-3}" in
      1) set_env SHORTLISTED_PROVIDER claude-cli ;;
      2) set_env SHORTLISTED_PROVIDER codex-cli ;;
      *) set_env SHORTLISTED_PROVIDER manual ;;
    esac
  fi
fi

port="$(get_env WEB_PORT)"
port="${port:-3000}"
provider="$(get_env SHORTLISTED_PROVIDER)"

say "Getting Shortlisted. The first time this downloads about 1 GB."
if ! docker compose pull --quiet web 2>/dev/null; then
  say "No published image was found, so it is being built here. This takes a few minutes."
  docker compose build
fi

docker compose up -d

say "Starting"
ready=0
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:$port/api/me" >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ "$ready" = 1 ] || fail "Shortlisted did not start within three minutes. Run 'docker compose logs web' to see why."

sign_in() { # sign_in "status command" "login command" "name"
  if docker compose exec -T worker $1 >/dev/null 2>&1; then return; fi
  if [ ! -t 0 ]; then say "$3 is not signed in. Run: docker compose exec worker $2"; return; fi
  say "Sign in to $3. A link will appear. Open it, sign in, and paste the code back here."
  docker compose exec worker $2 || say "Sign-in did not finish. You can run it later: docker compose exec worker $2"
}
case "$provider" in
  claude-cli) sign_in "claude auth status" "claude auth login" "Claude Code" ;;
  codex-cli) sign_in "codex login status" "codex login --device-auth" "Codex" ;;
esac

url="http://localhost:$port/setup"
say "Shortlisted is running at $url"
if command -v open >/dev/null 2>&1; then open "$url"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 || true; fi
