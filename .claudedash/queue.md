# Slice S11 — "Indispensable" Milestone

## S11-T1
Area: CLI
Priority: critical
Depends: -
Description: `npx claudedash status` komutu ekle. Terminal'de tek satırlık durum çıktısı: aktif session sayısı, toplam in_progress task, bugünkü maliyet tahmini, billing block kalan süresi (varsa), BLOCKED task varsa kırmızı uyarı. Örnek çıktı: `● 2 sessions · 3 tasks active · $0.84 today · block 2h14m left`. JSON flag ile `--json` çıktısı da desteklensin. Bu ccusage'ın terminal status line'ına karşılık gelen claudedash cevabı.
AC: `npx claudedash status` → tek satır terminal çıktısı, tüm bilgiler doğru. `--json` → machine-readable. No server required (doğrudan dosya okur).

## S11-T2
Area: Server
Priority: critical
Depends: -
Description: claudedash'i MCP (Model Context Protocol) server olarak expose et. `claudedash mcp` komutu veya `GET /mcp/tools` + `POST /mcp/call` endpoints. Araçlar: `get_queue` (queue snapshot), `get_agents` (agent listesi), `get_sessions` (aktif session'lar), `get_cost` (bugünkü maliyet), `get_billing_block` (block durumu), `log_task` (execution.log'a yaz). MCP JSON-RPC 2.0 formatı. Böylece Claude kendi dashboard'unu sorgulayabilir: "queue'da kaç READY task var?"
AC: Claude Code'da `add_mcp_server claudedash http://localhost:4317/mcp` → araçlar görünüyor. `get_queue` çalışıyor. Claude kendi dashboard'unu sorgulayabiliyor.

## S11-T3
Area: CLI+Server
Priority: high
Depends: -
Description: PreCompact + PostCompact hook desteği. `claudedash hooks install --all` ile 4 hook: PostToolUse, Stop (mevcut) + PreCompact, PostCompact. PreCompact hook'u: mevcut plan durumunu (hangi task in_progress, kaçı DONE) `.claudedash/compact-state.json`'a yaz. PostCompact hook'u: compact-state.json varsa, agent CLAUDE.md'de "compact sonrası oku" talimatı eklensin. Dashboard'da "Last compaction: 2m ago, state saved" göster. Bu planning-with-files'ın context persistence pattern'ı ama otomatik.
AC: `claudedash hooks install --all` → 4 hook kurulu. PreCompact tetiklenince compact-state.json oluşuyor. Dashboard'da compaction eventi görünüyor.

## S11-T4
Area: Dashboard
Priority: high
Depends: -
Description: LiveView'a token burn rate widget ekle. Son 10 dakikadaki token kullanımını (SSE session event'lerinden) takip et, tokens/dakika hesapla. Her aktif session için "context dolana kadar ~Xdk" tahmini göster. Billing block'ta "blok bitene kadar ~Xdk, tahmini son maliyet $Y" göster. Basit lineer projeksiyon yeterli. Sidebar'da mevcut context health yüzdesinin yanına ekle.
AC: Aktif session varken sidebar'da burn rate + tahmini süre görünüyor. Billing block varsa ek projeksiyon. Gerçekçi rakamlar (tokens/min).

## S11-T5
Area: Dashboard
Priority: medium
Depends: -
Description: CLAUDE.md editörü ekle (yeni tab veya Settings modal). Mevcut proje CLAUDE.md dosyasını göster ve düzenlenebilir yap. `GET /claudemd` endpoint: `.claudedash/CLAUDE.md` + proje root'undaki `CLAUDE.md` dosyalarını döndür. `PUT /claudemd` endpoint: içeriği kaydet. Dashboard'da Monaco veya basit textarea ile editör. Kaydet butonuyla anlık güncelleme. Çünkü CLAUDE.md'yi her seferinde terminal'de düzenlemek zahmetli.
AC: Dashboard'da CLAUDE.md tab/modal'ı var. Düzenleme yapılıp kaydedilince dosya güncelleniyor. Her iki CLAUDE.md (proje root + .claudedash/) gösteriliyor.

## S11-T6
Area: Server
Priority: medium
Depends: -
Description: `GET /sessions/:sessionId/context` endpoint ekle. Belirli bir session'ın JSONL dosyasını okur, son N mesajı özetler: toplam mesaj, tool call'lar, son kullanıcı promptu, son asistan çıktısı (ilk 500 karakter). Bu sayede agent "bu session'da ne vardı?" diye sorabilir. Ayrıca `GET /sessions/:sessionId/tools` → bu session'da kullanılan araçlar + sayıları. MCP'nin `get_sessions` aracına entegre edilir.
AC: `GET /sessions/abc123/context` → session özeti JSON. Tool counts doğru. Büyük JSONL dosyalarında timeout yok (streaming veya limit ile).

# Slice S12 — Developer Experience Polish

## S12-T1
Area: Dashboard
Priority: high
Depends: -
Description: Global keyboard shortcut sistemi ekle. `?` tuşuna basınca shortcut cheatsheet göster. Shortcutlar: `L` → Live view, `Q` → Queue view, `A` → Activity, `D` → Docs, `R` → son session resume, `/` → search focus, `Escape` → search temizle, `Ctrl+K` → command palette (session seç). Bu developer'lar için terminal-like hissettirmek için kritik.
AC: `?` cheatsheet açılıyor. Tüm shortcutlar çalışıyor. Command palette ile session seçimi var.

## S12-T2
Area: Dashboard+Server
Priority: high
Depends: -
Description: Hızlı "Task Oluştur" UI'ı ekle. Queue tab'ında "+" butonu → modal: slice seç (mevcut slice'lardan), task description yaz, area seç, depends seç (mevcut task'lardan dropdown). Submit → `PUT /queue` endpoint queue.md'ye yeni task ekler (doğru formatta). Bu çok önemli: şu an queue.md'yi el ile düzenlemek gerekiyor. Dashboard'dan task oluşturabilmek developer flow'unu kırmıyor.
AC: Dashboard'dan task oluşturulabiliyor. queue.md'ye doğru format ile ekleniyor. Mevcut task listesi güncelleniyor.

## S12-T3
Area: CLI
Priority: medium
Depends: -
Description: `claudedash doctor` komutu. Kullanıcının kurulumunu kontrol eder: ~/.claude/ var mı? queue.md var mı? execution.log var mı? hooks kurulu mu? Port 4317 açık mı? Server versiyonu npm'deki latest ile eşleşiyor mu? Her kontrol için ✓ / ✗ + tavsiye. Bu "neden çalışmıyor?" sorusunu ortadan kaldırır.
AC: `claudedash doctor` → her kontrol için sonuç. Eksik hook varsa `claudedash hooks install` önerisi. Port çakışması varsa alternatif port önerisi.
