# Deploy family-mcp ke STB

Naik versi tetap manual lewat SSH. Folder ini yang menandai fitur mana yang siap
naik, dan apa yang harus dicek di server sebelum container di-build ulang.

Service ini stateless: tidak ada database, migration, atau seeder. Yang hidup di
STB hanya image container + `.env.docker`.

Spek tetap di `docs/`. Jangan taruh catatan deploy di sana.

Agent di repo ini mengikuti [`.cursor/rules/stb-deploy-notes.mdc`](../.cursor/rules/stb-deploy-notes.mdc):
selesai fitur yang mengubah tool, panggilan API, env, Dockerfile, atau dependency,
catatan `pending/` ikut dibuat di perubahan yang sama. Pindah ke `shipped/` hanya
setelah STB benar-benar sudah naik.

## Tanda siap deploy

```text
deploy/releases/
  pending/     # kode selesai, STB belum naik
  shipped/     # sudah compose up di STB dan health-nya ok
  _template.md
```

Satu file per fitur. Nama: `YYYY-MM-DD-nama-fitur.md` (salin dari `_template.md`).

Isi selalu empat bagian:

| Bagian | Arti |
|---|---|
| Env | Key baru yang harus ditambah manual ke `.env.docker` di STB. Contoh nilai ada di `.env.docker.example`. |
| Build | Perubahan Dockerfile, base image, atau dependency. `scripts/deploy.sh` selalu build ulang image. |
| Data awal | Hampir selalu "Tidak ada". Service ini tidak punya database atau seeder. |
| Cek setelah naik | Perintah yang dijalankan di STB setelah container hidup. |

File ini ikut commit bareng fiturnya. Ada file baru di `pending/` = belum naik STB.

Satu fence = satu perintah. `scripts/deploy.sh` menjalankan setiap fence secara
utuh, jadi tulis **satu perintah per fence**. Dua perintah dalam satu fence jadi
satu perintah rusak, dan hasil ceknya jadi palsu.

Perintah `curl` dianggap gagal kalau tidak terhubung, HTTP 404, atau HTTP 5xx.
Perintah lain dianggap gagal kalau exit code-nya bukan 0.

Karena port `family-mcp` biasanya tidak dipublish ke host, cek default dilakukan
dari dalam container:

```bash
docker compose --env-file .env.docker exec -T family-mcp node -e "fetch('http://127.0.0.1:3100/health').then(r=>r.text()).then(t=>{console.log(t);process.exit(t.includes('\"ok\"')?0:1)}).catch(()=>process.exit(1))"
```

Versi cukup tanggal di nama file. Tidak pakai tag semver.

## Saat fitur selesai (di laptop)

1. Salin template:

   ```bash
   cp deploy/releases/_template.md deploy/releases/pending/YYYY-MM-DD-nama-fitur.md
   ```

2. Isi empat bagian. Kalau tidak ada env / build / data awal, tulis **Tidak ada.**
3. Commit bareng kode fiturnya, lalu push.

## Env di STB

Sekali saja, siapkan `.env.docker` (file itu tidak ikut git):

```bash
cp .env.docker.example .env.docker
```

Lalu isi nilainya. `docker-compose.yml` sudah ikut git dan memakai network
`shared_net` yang sama dengan API.

`scripts/deploy.sh` berhenti kalau `.env.docker` belum ada, atau kalau ada key di
`.env.docker.example` yang belum ada di `.env.docker`. File `.env.docker` yang
sudah ada tidak pernah ditimpa.

`FAMILY_API_BASE_URL` harus memakai alamat yang bisa dijangkau container, mis.
`http://family-suite-api:3000/api/v1`. Skrip menolak `127.0.0.1` atau `localhost`
karena dari dalam container alamat itu menunjuk ke container MCP sendiri.

Tidak ada token di env service ini. Token MCP dikirim per request oleh Nouride
lewat header `Authorization` dan diteruskan apa adanya ke API.

## Naik ke STB (SSH)

Dari laptop:

```bash
ssh <user>@<host-stb>
cd /path/ke/family-tree-mcp
```

Di STB, working tree harus bersih selain `.env.docker` (file itu di-ignore, tidak
ikut `git pull`).

```bash
git status
git pull
bash scripts/deploy.sh
```

`npm run deploy` sama isinya. Perintah itu:

1. Menampilkan catatan di `deploy/releases/pending/`.
2. Berhenti kalau `.env.docker` belum ada atau belum punya key yang ada di
   `.env.docker.example`.
3. Berhenti kalau `FAMILY_API_BASE_URL` masih menunjuk `127.0.0.1` / `localhost`.
4. `docker compose up -d --build`.
5. Menunggu health check container `family-mcp`.
6. Menjalankan setiap perintah di bagian **Cek setelah naik** pada catatan
   `pending/`. `curl` dengan HTTP 404/5xx dihitung gagal; perintah lain dengan
   exit code bukan 0 dihitung gagal.
7. Kalau semua cek lolos, `git mv` semua catatan `pending/` ke `shipped/`,
   commit, dan push. Kalau ada yang gagal, file tetap di `pending/` dan
   penyebabnya ditulis di output.

Kalau container tidak sehat, lihat log:

```bash
docker compose --env-file .env.docker logs --tail=200 family-mcp
```

Kalau cek gagal, perbaiki di laptop, push, lalu di STB `git pull` dan
`bash scripts/deploy.sh` lagi.

## Urutan singkat

1. Laptop: tulis catatan di `pending/` (termasuk cek di **Cek setelah naik**),
   commit, push.
2. STB: `ssh` → `git pull` → `bash scripts/deploy.sh`.
3. Kalau skrip selesai, catatan sudah pindah ke `shipped/`. Laptop: `git pull`.
