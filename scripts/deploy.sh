#!/usr/bin/env bash
# Naik ke STB: build ulang container family-mcp, tunggu sehat, lalu jalankan
# cek dari catatan deploy/releases/pending/. Setelah semua lolos, catatan
# dipindah ke shipped/ dan di-push.
# Usage (di folder repo, di STB, setelah git pull):
#   bash scripts/deploy.sh
#   npm run deploy
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env.docker"
EXAMPLE_FILE="$ROOT_DIR/.env.docker.example"
MCP_CONTAINER="family-mcp"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy] .env.docker belum ada. Sekali saja: cp .env.docker.example .env.docker" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[deploy] docker tidak ada di PATH" >&2
  exit 1
fi

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

# KEY from a dotenv file. Empty if missing. Strips one pair of quotes.
env_value() {
  local file="$1"
  local key="$2"
  local line val
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  line="${line%$'\r'}"
  val="${line#*=}"
  if [[ "$val" == \"*\" && "$val" == *\" ]]; then
    val="${val:1:$((${#val} - 2))}"
  elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
    val="${val:1:$((${#val} - 2))}"
  fi
  printf '%s' "$val"
}

env_keys() {
  local file="$1"
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$file" | cut -d= -f1 | tr -d '\r' | sort -u
}

echo "[deploy] catatan belum shipped:"
pending_notes=(deploy/releases/pending/*.md)
if [[ -e "${pending_notes[0]}" ]]; then
  for note in "${pending_notes[@]}"; do
    echo "  - $note"
  done
else
  echo "  (tidak ada)"
fi

missing=()
while IFS= read -r key; do
  [[ -n "$key" ]] || continue
  if ! grep -qE "^${key}=" "$ENV_FILE"; then
    missing+=("$key")
  fi
done < <(env_keys "$EXAMPLE_FILE")

if ((${#missing[@]} > 0)); then
  echo "[deploy] .env.docker belum punya key dari .env.docker.example:" >&2
  for key in "${missing[@]}"; do
    echo "  - $key" >&2
  done
  echo "[deploy] tambahkan key itu, lalu jalankan ulang. Nilai contoh ada di .env.docker.example." >&2
  exit 1
fi

api_base="$(env_value "$ENV_FILE" FAMILY_API_BASE_URL)"
if [[ "$api_base" == *127.0.0.1* || "$api_base" == *localhost* ]]; then
  echo "[deploy] FAMILY_API_BASE_URL='${api_base}' tidak bisa dipakai dari dalam container." >&2
  echo "[deploy] Dari container, 127.0.0.1/localhost menunjuk ke container MCP sendiri." >&2
  echo "[deploy] Pakai nama service API, mis. http://family-suite-api:3000/api/v1" >&2
  exit 1
fi

echo "[deploy] docker compose up -d --build"
compose up -d --build

echo "[deploy] menunggu family-mcp sehat..."
healthy=0
for _ in $(seq 1 120); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$MCP_CONTAINER" 2>/dev/null || echo missing)"
  if [[ "$status" == "healthy" ]]; then
    healthy=1
    break
  fi
  if [[ "$status" == "unhealthy" ]]; then
    break
  fi
  sleep 2
done

if [[ "$healthy" != "1" ]]; then
  echo "[deploy] family-mcp tidak sehat. Log:" >&2
  compose logs --tail=120 family-mcp >&2 || true
  exit 1
fi

echo "[deploy] health ok"

# Prints one command per line from a note's "Cek setelah naik" bash fences.
commands_in_note() {
  local file="$1"
  local in_section=0 in_fence=0
  local line buf=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$in_section" == "0" ]]; then
      [[ "$line" == "## Cek setelah naik" ]] && in_section=1
      continue
    fi
    [[ "$line" == "## "* ]] && break
    if [[ "$in_fence" == "0" ]]; then
      if [[ "$line" == '```bash' || "$line" == '```sh' ]]; then
        in_fence=1
        buf=""
      fi
      continue
    fi
    if [[ "$line" == '```' ]]; then
      in_fence=0
      local one="${buf#"${buf%%[![:space:]]*}"}"
      one="${one%"${one##*[![:space:]]}"}"
      if [[ -n "$one" ]]; then
        printf '%s\n' "$one"
      fi
      buf=""
      continue
    fi
    if [[ "$line" == *\\ ]]; then
      buf+="${line%\\} "
    else
      buf+="$line "
    fi
  done < "$file"
}

run_note_checks() {
  local failed=0
  local seen=""
  local note cmd body err code cmd_status snippet out
  local notes=(deploy/releases/pending/*.md)
  if [[ ! -e "${notes[0]}" ]]; then
    echo "[deploy] tidak ada catatan pending. Tidak ada cek tambahan."
    return 0
  fi

  for note in "${notes[@]}"; do
    while IFS= read -r cmd; do
      [[ -n "$cmd" ]] || continue
      if [[ "$seen" == *"|${cmd}|"* ]]; then
        continue
      fi
      seen+="|${cmd}|"

      if [[ "$cmd" == curl* ]]; then
        body="$(mktemp)"
        err="$(mktemp)"
        # -f would treat HTTP 403 as failure. 403 means the route exists.
        local run="${cmd// -fsS / -sS }"
        run="${run// -f / }"
        set +e
        code="$(bash -c "$run -sS -o $(printf '%q' "$body") -w '%{http_code}'" 2>"$err")"
        cmd_status=$?
        set -e
        snippet="$(tr '\n' ' ' <"$body" | cut -c1-240)"
        rm -f "$body"
        if [[ "$cmd_status" != "0" || -z "$code" || "$code" == "000" ]]; then
          echo "[deploy] gagal: ${note}" >&2
          echo "[deploy] perintah: ${cmd}" >&2
          echo "[deploy] curl tidak terhubung: $(tr '\n' ' ' <"$err")" >&2
          failed=1
        elif [[ "$code" == "404" || "$code" == 5* ]]; then
          echo "[deploy] gagal: ${note}" >&2
          echo "[deploy] perintah: ${cmd}" >&2
          echo "[deploy] HTTP ${code}: ${snippet}" >&2
          failed=1
        else
          echo "[deploy] ok HTTP ${code}: ${cmd}"
        fi
        rm -f "$err"
      else
        set +e
        out="$(bash -c "$cmd" 2>&1)"
        cmd_status=$?
        set -e
        if [[ "$cmd_status" != "0" ]]; then
          echo "[deploy] gagal: ${note}" >&2
          echo "[deploy] perintah: ${cmd}" >&2
          echo "[deploy] exit ${cmd_status}: $(printf '%s' "$out" | tail -n 20)" >&2
          failed=1
        else
          echo "[deploy] ok (exit 0): ${cmd}"
          if [[ -n "$out" ]]; then
            printf '%s\n' "$out" | tail -n 5
          fi
        fi
      fi
    done < <(commands_in_note "$note")
  done

  if [[ "$failed" != "0" ]]; then
    echo "[deploy] catatan tetap di pending/. Perbaiki di laptop, push, lalu di STB: git pull && bash scripts/deploy.sh" >&2
    return 1
  fi
  return 0
}

ship_pending_notes() {
  local files=()
  local f base
  for f in deploy/releases/pending/*.md; do
    [[ -e "$f" ]] || continue
    files+=("$f")
  done
  if ((${#files[@]} == 0)); then
    echo "[deploy] selesai. Tidak ada catatan untuk dipindah."
    return 0
  fi
  for f in "${files[@]}"; do
    base="$(basename "$f")"
    git mv "deploy/releases/pending/$base" "deploy/releases/shipped/$base"
    echo "[deploy] pindah ${base} → shipped/"
  done
  git -c user.name="family-mcp-stb" -c user.email="stb@localhost" \
    commit -m "Mark STB release notes shipped." -- deploy/releases/pending deploy/releases/shipped
  if ! git push; then
    echo "[deploy] catatan sudah dipindah dan di-commit di STB, tapi git push gagal." >&2
    echo "[deploy] jalankan git push di STB supaya laptop ikut melihat shipped/." >&2
    return 1
  fi
  echo "[deploy] selesai. Catatan pending sudah di shipped/ dan di-push."
}

if ! run_note_checks; then
  exit 1
fi
ship_pending_notes
