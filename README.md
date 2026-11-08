# family-tree-mcp

MCP server terpisah untuk **Family Roots**, **Money Track**, dan **Task Board**.
Service ini memanggil REST API `family-tree-api` memakai token MCP per request
(`Authorization: Bearer frmcp_...`). Token **tidak disimpan** di service ini.

> Status: scaffold v0.1.0. Sudah bisa dijalankan, di-connect ke Nouride, dan
> dipakai untuk tool baca + tool tulis Task Board utama. Tool Money Track tulis
> dan reorder Task Board belum diimplementasikan.

Rencana lengkap ada di [`docs/MCP-PLAN.md`](./docs/MCP-PLAN.md). Tutorial
post-deploy API + Nouride ada di
[`../family-tree-api/docs/reference/MCP-NOURIDE-SETUP.md`](../family-tree-api/docs/reference/MCP-NOURIDE-SETUP.md).

---

## Arsitektur

```text
Nouride agent  ──MCP Streamable HTTP──▶  family-mcp  ──REST + Bearer frmcp_...──▶  family-tree-api
     │                                       │                                          │
     │ 1 person = 1 agent = 1 token          │ pass-through, tanpa simpan token         │ audit + aturan bisnis
     └───────────────────────────────────────┴──────────────────────────────────────────┘
```

- `family-mcp` **tidak** akses MySQL langsung.
- `family-mcp` **tidak** melakukan login, refresh token, atau secondary password.
- Semua aturan bisnis, audit log, dan ownership tetap di API.
- Mapping `discord_id → person_id + token` ada di Nouride/bot, bukan di API.

---

## Menjalankan lokal

Prasyarat: Node 22+ dan API FamilyRoots sudah jalan.

```bash
cp .env.example .env
# isi FAMILY_API_BASE_URL, mis. http://127.0.0.1:3000/api/v1
npm install
npm run dev
```

Cek health:

```bash
curl http://127.0.0.1:3100/health
```

Endpoint MCP: `http://127.0.0.1:3100/mcp`

Build + test:

```bash
npm run build
npm test
```

---

## Environment

| Key | Wajib | Default | Keterangan |
|---|---|---|---|
| `MCP_HTTP_HOST` | tidak | `0.0.0.0` | Host bind |
| `MCP_HTTP_PORT` | tidak | `3100` | Port MCP + health |
| `FAMILY_API_BASE_URL` | **ya** | — | Base API termasuk `/api/v1` |
| `FAMILY_MCP_REQUEST_TIMEOUT_MS` | tidak | `15000` | Timeout request ke API |
| `FAMILY_MCP_ENABLE_WRITE` | tidak | `true` | Tool tulis Task Board |
| `FAMILY_MCP_ENABLE_DESTRUCTIVE` | tidak | `false` | Tool delete (butuh approval) |
| `FAMILY_MCP_LOG_LEVEL` | tidak | `info` | `debug`/`info`/`warn`/`error` |

Untuk Docker, `FAMILY_API_BASE_URL` harus memakai alamat yang bisa dijangkau
container, mis. `http://family-suite-api:3000/api/v1` — bukan `127.0.0.1`.

---

## Docker

Build native di STB (arm64):

```bash
docker build -t family-tree-mcp:latest .
```

Build multi-arch dari mesin lain:

```bash
docker buildx build --platform linux/arm64 -t family-tree-mcp:latest .
```

Jalankan dengan compose:

```bash
cp docker-compose.example.yml docker-compose.yml
cp .env.example .env
# edit .env + nama network
docker compose up -d
docker compose logs -f family-mcp
```

---

## Tool yang sudah ada

### Family Roots (read-only)

- `family_whoami` — validasi token + identitas person
- `family_search_people` — cari nama/nickname + gender
- `family_get_person` — detail person (kontak opsional)
- `family_get_relations` — orang tua, anak, saudara, pasangan, kakek/nenek,
  cucu, leluhur, keturunan, ipar
- `family_get_tree` — graph pohon keluarga

Tidak ada tool create/update/delete Family Roots.

### Money Track (read-only)

- `money_get_context` — setup, dashboard, akun, pocket, kategori, preferensi
- `money_get_dashboard`
- `money_list_accounts`
- `money_list_pockets`
- `money_list_categories`
- `money_list_transactions`
- `money_get_transaction`
- `money_list_activity`
- `money_list_debts`
- `money_list_budgets`
- `money_get_monthly_report`
- `money_list_wishlist`

Belum ada tool tulis transaksi/transfer/debt/budget/wishlist.

### Task Board

Baca:

- `task_get_context` — tool pertama yang disarankan
- `task_list`
- `task_get`
- `task_list_history`
- `task_list_revisions`
- `task_list_todos`
- `task_list_workplaces`

Tulis:

- `task_create`
- `task_update`
- `task_create_revision`
- `task_set_status`
- `task_set_branch`
- `task_add_description`
- `task_update_description`
- `task_remove_description`
- `task_add_todo`
- `task_update_todo`
- `task_create_workplace`
- `task_update_workplace`
- `task_archive_workplace`
- `task_unarchive_workplace`

Destruktif (default nonaktif):

- `task_delete_todo`
- `task_delete`
- `task_delete_workplace`

Belum diimplementasikan: `task_reorder`, `task_reorder_descriptions`,
`task_reorder_todos`, upload gambar task (multipart tetap dari aplikasi).

Aturan Task Board yang dijaga MCP:

- Wajib `type`, `title`, `branchName`, minimal satu `descriptions`.
- Status valid: `To-Do`, `In Progress`, `Merge Request`, `Merged`.
  `Done` tidak valid.
- Revisi hanya dari task induk berstatus `Merged`.
- `PUT /tasks/:id` mengganti seluruh `descriptions`; tool bantu
  read-modify-write sudah menangani ini.
- `migration_files` hanya nama file `.ts`/`.js`/`.sql`, bukan path.
- MCP hanya mencatat `branchName`; tidak ada operasi Git.

---

## Nouride

Konsep: satu orang = satu agent = satu token. Token dimasukkan sebagai
credential agent, bukan ditulis mentah di `mcp.toml`.

Contoh server library (`agents/mcp.toml`):

```toml
[servers.familyroots]
transport = "streamable_http"
url = "http://family-mcp:3100/mcp"
per_agent = true
```

Lalu di agent masing-masing, aktifkan server dan isi credential lewat secret
store Nouride. Nama tool di Nouride berbentuk `familyroots__<tool>`, mis.
`familyroots__task_create`.

Detail langkah, allowlist, approval tool destruktif, dan troubleshooting ada di
tutorial API:

- [`MCP-NOURIDE-SETUP.md`](../family-tree-api/docs/reference/MCP-NOURIDE-SETUP.md)

---

## Keamanan

- Setiap request `/mcp` wajib `Authorization: Bearer frmcp_...`.
- Token diteruskan apa adanya ke API; tidak ada penyimpanan token di memory
  jangka panjang.
- Session MCP di-bind ke fingerprint SHA-256 token; session tidak bisa dipakai
  token lain.
- Endpoint keamanan API (WebAuthn, secondary password, logout, token management)
  tetap **session JWT only** dan tidak bisa dipakai lewat token MCP.
- Tool destruktif butuh `FAMILY_MCP_ENABLE_DESTRUCTIVE=true` + `confirm` eksplisit
  + approval Nouride.
- Jangan pernah menaruh token di log, URL, `mcp.toml`, atau commit.

---

## Struktur kode

```text
src/
  index.ts                 # Express + Streamable HTTP + session MCP
  server.ts                # Membuat McpServer + register tool
  config/env.ts
  auth/passthrough.ts      # Authorization per request (AsyncLocalStorage)
  api/
    client.ts              # fetch + unwrap envelope + error mapping
    family.ts
    money.ts
    task.ts
  tools/
    family.ts
    money.ts
    task.ts
    format.ts
    result.ts
  errors.ts
  utils/objects.ts
test/
docs/MCP-PLAN.md
```
