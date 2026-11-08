# deploy-flow

Tanggal: 2026-11-08

Menambah alur deploy STB untuk `family-mcp`: `scripts/deploy.sh`, folder
`deploy/releases/`, pemisahan env server ke `.env.docker`, dan Dockerfile +
`docker-compose.yml` yang mengikuti struktur `family-tree-api`.

## Env

`.env.docker` sekarang dipakai untuk STB (sebelumnya compose membaca `.env`).
Sekali saja di STB:

```bash
cp .env.docker.example .env.docker
```

Lalu isi `.env.docker`. `docker-compose.yml` sudah ikut git dan memakai network
`shared_net` yang sama dengan API. Key yang dipakai sama dengan `.env.example`:

- `MCP_HTTP_HOST` — default `0.0.0.0`.
- `MCP_HTTP_PORT` — default `3100`.
- `FAMILY_API_BASE_URL` — **wajib** alamat yang bisa dijangkau container, mis.
  `http://family-suite-api:3000/api/v1`. Jangan `127.0.0.1` / `localhost`.
- `FAMILY_MCP_REQUEST_TIMEOUT_MS` — default `15000`.
- `FAMILY_MCP_ENABLE_WRITE` — default `true`.
- `FAMILY_MCP_ENABLE_DESTRUCTIVE` — default `false`.
- `FAMILY_MCP_LOG_LEVEL` — default `info`.

Tidak ada token di env ini. Token MCP tetap dikirim per request oleh Nouride.

## Build

Ada. Dockerfile diubah mengikuti struktur image API: dua stage
(`builder`/`runtime`), `docker/entrypoint.sh`, dan HEALTHCHECK `wget`. Build
ulang otomatis lewat `docker compose up -d --build` (dijalankan
`scripts/deploy.sh`).

Tidak ada dependency baru.

## Data awal

Tidak ada. Service ini tidak punya database atau seeder.

## Cek setelah naik

```bash
docker compose --env-file .env.docker exec -T family-mcp node -e "fetch('http://127.0.0.1:3100/health').then(r=>r.text()).then(t=>{console.log(t);process.exit(t.includes('\"ok\"')?0:1)}).catch(()=>process.exit(1))"
```

Harapan: JSON `{"status":"ok",...}` dan exit 0.

```bash
docker compose --env-file .env.docker exec -T family-mcp node -e "fetch('http://127.0.0.1:3100/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>{console.log(r.status);process.exit(r.status===401?0:1)}).catch(()=>process.exit(1))"
```

Harapan: `401` (route `/mcp` hidup dan menolak request tanpa Bearer).
