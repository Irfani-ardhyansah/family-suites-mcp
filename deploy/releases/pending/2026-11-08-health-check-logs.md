# health-check-dan-log-docker

Tanggal: 2026-11-08

Menambah `GET /health/ready` (cek MCP + API), memperkaya `GET /health`
(uptime/version/timestamp), request log ke stdout/stderr untuk Dozzle, dan
mem-publish port MCP `3100` ke host supaya bisa dicek dari STB/LAN.

## Env

Tidak ada.

`FAMILY_MCP_LOG_LEVEL` tetap `info`. Set `debug` kalau ingin melihat request
`/health` tiap healthcheck.

Port `3100` sekarang dipublish ke host (`0.0.0.0:3100->3100/tcp`) supaya bisa
dicek dari STB atau perangkat lain di LAN. Kalau hanya ingin loopback, ubah
`docker-compose.yml` menjadi `127.0.0.1:3100:3100`.

## Build

Tidak ada perubahan Dockerfile atau dependency. Image tetap di-build ulang
otomatis oleh `scripts/deploy.sh`.

## Data awal

Tidak ada. Service ini tidak punya database atau seeder.

## Cek setelah naik

```bash
curl -fsS http://127.0.0.1:3100/health
```

Harapan: `200` dengan `{"status":"ok","service":"family-mcp",...}`.

```bash
curl -fsS http://127.0.0.1:3100/health/ready
```

Harapan: `200` dengan `"api":{"ok":true,...}`. `503` berarti API belum
terjangkau dari container MCP.

```bash
docker compose --env-file .env.docker logs --tail=20 family-mcp
```

Harapan: log startup dan request tampil di stdout container. Log yang sama
otomatis muncul di Dozzle.

```bash
docker ps --filter name=family-mcp --format '{{.Ports}}' | grep -q '3100->3100/tcp'
```

Harapan: exit 0. Kalau gagal, port belum dipublish dan container perlu dibuat
ulang dari `docker-compose.yml` terbaru.
