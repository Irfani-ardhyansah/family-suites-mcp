# money-track-tulis-transaksi

Tanggal: 2026-11-08

Menambah tool tulis Money Track: transaksi, transfer, dan tarik tunai
(create/update/delete). Delete tetap destruktif dan nonaktif secara default.

## Env

Tidak ada key baru. `FAMILY_MCP_ENABLE_WRITE=true` sudah mengaktifkan tool tulis.
`FAMILY_MCP_ENABLE_DESTRUCTIVE` tetap `false`; ubah hanya bila delete memang
diizinkan.

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

Harapan: log startup normal, tanpa error tool registration.
