# nama-fitur

Tanggal: YYYY-MM-DD

Satu kalimat: apa yang naik ke STB.

## Env

Tidak ada.

<!-- Kalau ada key baru, ganti bagian di atas dengan daftar ini.
     Nilai contoh ada di .env.docker.example. Isi manual di .env.docker di STB
     (file itu tidak ikut git).

- `NAMA_KEY` — untuk apa. Wajib diisi / boleh kosong.
-->

## Build

Tidak ada. `scripts/deploy.sh` selalu build ulang image.

<!-- Kalau ada perubahan Dockerfile, base image, atau dependency:
Ada. Build ulang otomatis lewat `docker compose up -d --build`.

- Dockerfile / package.json / package-lock.json — apa yang berubah.
-->

## Data awal

Tidak ada. Service ini tidak punya database atau seeder.

## Cek setelah naik

```bash
docker compose --env-file .env.docker exec -T family-mcp node -e "fetch('http://127.0.0.1:3100/health').then(r=>r.text()).then(t=>{console.log(t);process.exit(t.includes('\"ok\"')?0:1)}).catch(()=>process.exit(1))"
```

<!-- scripts/deploy.sh menjalankan setiap perintah di bagian ini.
     Satu fence = satu perintah.
     curl: tidak terhubung / HTTP 404 / HTTP 5xx = gagal.
     Perintah lain: exit code bukan 0 = gagal.
     Port MCP biasanya tidak dipublish, jadi pakai `docker compose exec`. -->
