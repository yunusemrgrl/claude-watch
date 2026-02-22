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

# Slice S13 — MCP Genişletme (Self-Query Boşlukları)

## S13-T1
Area: CLI
Priority: critical
Depends: -
Description: MCP'ye eksik tool'ları ekle: `get_cost` (stats-cache.json'dan bugünkü maliyet), `get_history` (history.jsonl'dan son 20 prompt), `get_hook_events` (son 20 hook event). Ayrıca `get_billing_block` inactive durumda dahi stats-cache'den tahmini günlük maliyeti döndürsün: `{ active: false, todayCostUSD: 1.24 }`. Bu 3 tool MCP client'ın "bugün ne harcadım, ne yaptım?" sorularını yanıtlar.
AC: `tools/call get_cost` → `{ totalCostUSD, perModel }`. `tools/call get_history` → son 20 prompt listesi. `tools/call get_hook_events` → son hook event'leri. `get_billing_block` → inactive'de de cost alanı dolu.

## S13-T2
Area: CLI
Priority: high
Depends: -
Description: MCP'ye agent lifecycle tool'ları ekle: `register_agent { agentId, name, taskId }` ve `send_heartbeat { agentId, status, taskId }`. Bu sayede MCP üzerinden çalışan bir agent kendini dashboard'a kayıt edebilir. Mevcut `POST /agent/register` ve `POST /agent/heartbeat` endpoint'lerini proxy'le. Ayrıca `create_task { slice, area, description, ac, dependsOn? }` tool'u: queue.md'ye yeni task ekler (S12-T2 ile aynı backend, MCP üzerinden expose).
AC: `register_agent` → dashboard'da agent görünüyor. `create_task` → queue.md güncelleniyor, `get_queue` doğru task'ı döndürüyor.

## S13-T3
Area: Server
Priority: high
Depends: -
Description: `GET /sessions/:sessionId/context` endpoint (S11-T6'nın uygulaması). JSONL dosyasını okur, son 20 mesajı parse eder, şunu döndür: `{ sessionId, messageCount, lastUserPrompt, lastAssistantSummary (ilk 300 char), toolCounts, recentTools: string[] }`. MCP'ye `get_session_context { sessionId }` tool olarak ekle. Büyük JSONL'lar için sadece son 500 satırı oku.
AC: `GET /sessions/abc123/context` → özet JSON. `tools/call get_session_context { sessionId }` → aynı veriyi MCP üzerinden döndürüyor.

## S13-T4
Area: Server+Dashboard
Priority: medium
Depends: -
Description: Stale session temizleme. `GET /sessions` şu an .claude/todos/ klasöründeki TÜM JSONL'ları döndürüyor — çok eski ve ilgisiz session'lar da dahil (örn. "agent-scope" projesi). Çözüm: (1) Son 7 günde güncellenmemiş session'ları varsayılan olarak filtrele. (2) Dashboard'da "Show all sessions" toggle ekle. (3) `GET /sessions?days=7` gibi query param desteği. Bu sidebar'ın gürültüsünü azaltır.
AC: Default `GET /sessions` → sadece son 7 gün. `?days=all` → hepsi. Dashboard sidebar temiz.

# Slice S14 — MCP Self-Query Bug Düzeltmeleri

## S14-T1
Area: Server+CLI
Priority: critical
Depends: -
Description: `todayCostUSD` etiket hatası düzelt. `get_billing_block` ve `/billing-block` endpoint'i şu an stats-cache.json'dan lifetime birikimli maliyeti `todayCostUSD` olarak etiketliyor — bu son derece yanıltıcı. Düzeltme seçenekleri: (A) Alanı `lifetimeCostUSD` olarak yeniden etiketle + stats-cache'de date bilgisi varsa gerçek "bugün" hesapla; (B) JSONL dosyalarından bugünkü (son 24h) mesajlardaki `costUSD` alanlarını toplayarak gerçek günlük maliyet hesapla. (B) daha doğru ama daha pahalı. Minimum: alanı `totalCostUSD` olarak rename et, `todayCostUSD` tamamen kaldır veya ayrı hesapla.
AC: `get_billing_block` → `todayCostUSD` alanı gerçekten bugüne ait. Ya da alan `lifetimeCostUSD` ile değiştiriliyor. `/cost` endpoint'i ile tutarlı.

## S14-T2
Area: Server
Priority: critical
Depends: -
Description: Context health hesabını düzelt. Şu an `contextHealth = inputTokens / contextWindowSize`. Ama `cacheReadInputTokens` da context penceresini dolduruyor — yüksek cache kullanımlı session'lar (ör. 5.9M cacheReadTokens) %0.1 gösteriyor. Doğru hesap: `(inputTokens + cacheReadInputTokens) / contextWindowSize`. `/sessions` endpoint'indeki her session nesnesi için düzelt. Dashboard'da context bar yüzdesi ve "context dolmak üzere" uyarı eşiği de buna bağlı.
AC: Cache-heavy session'da (ör. 5.9M cacheRead) contextHealth gerçekçi yüzde gösteriyor. Warning threshold hâlâ 80%+ için çalışıyor.

## S14-T3
Area: CLI
Priority: high
Depends: -
Description: MCP'ye `get_current_session` tool'u ekle. Agent hangi session'da çalıştığını bilmeli. Çözüm: (1) `$CLAUDE_SESSION_ID` env var'ı varsa doğrudan o session'ı döndür; (2) yoksa en son güncellenen JSONL dosyasını döndür (muhtemelen aktif session). Döndürülecek: tam session nesnesi + `isCurrent: true` flag. Bu tool agent'ın kendi context'ini (hangi proje, kaç token kullandım) sorgulayabilmesini sağlar.
AC: `tools/call get_current_session` → en az `{ sessionId, projectName, contextHealth, totalTokens }` döndürüyor. Env var varsa kesin eşleşme, yoksa best-guess.

## S14-T4
Area: Server
Priority: medium
Depends: -
Description: `/history` endpoint'ine sayfalama ekle. Şu an sabit 50 satır limiti var. Parametre: `?limit=N&offset=M` (max limit: 500). `get_history` MCP tool da `limit` ve `offset` parametresi alsın. history.jsonl büyük olabilir — sadece son N satırı okumak için `fs.statSync` + offset-from-end okuma kullan (tüm dosyayı okumaktan kaçın).
AC: `GET /history?limit=100&offset=50` → 100 prompt, 50'den itibaren. `tools/call get_history { limit: 100 }` → 100 prompt. Büyük dosyalarda timeout yok.

## S14-T5
Area: Server
Priority: low
Depends: -
Description: `get_billing_block` ve `/billing-block`'a son billing block bilgisini ekle. Inactive durumda stats-cache'den son block'un başlangıç/bitiş zamanını ve maliyetini çıkar. Response'a şunu ekle: `{ active: false, lastBlockStartedAt?, lastBlockEndedAt?, lastBlockCostUSD? }`. stats-cache.json formatını incele, bu bilgi varsa parse et. Yoksa bu alanları atlayabilir.
AC: Son billing block sonrası `get_billing_block` → `lastBlockEndedAt` + `lastBlockCostUSD` dolu. Bilgi yoksa alanlar atlanıyor (undefined değil, tamamen yok).

# Slice S15 — React Doctor Fixes

## S15-T1
Area: Dashboard
Priority: high
Depends: -
Description: Dead code temizliği. react-doctor/knip tespitleri: (1) 4 kullanılmayan CSS dosyasını sil: src/styles/fonts.css, index.css, tailwind.css, theme.css. (2) scroll-area.tsx'ten kullanılmayan ScrollBar export'unu kaldır. (3) status.ts'teki kullanılmayan export'u kaldır. (4) src/types.ts'teki kullanılmayan Task tipini kaldır.
AC: react-doctor dead code uyarıları sıfır. Build başarılı. lint temiz.

## S15-T2
Area: Dashboard
Priority: high
Depends: -
Description: Array index key buglarını düzelt. 6 yerde `key={i}` (index) kullanılıyor: WorktreePanel.tsx:176, PlansLibraryView.tsx:73, PlanView.tsx:292+452, ActivityView.tsx:668, QualityTimeline.tsx:80. Her birinde listedeki nesnenin stable bir alanını key olarak kullan (name, path, id, timestamp vb.).
AC: Tüm .map() çağrılarında index yerine stable key. react-doctor uyarısı sıfır.

## S15-T3
Area: Dashboard
Priority: critical
Depends: -
Description: fetch()+useEffect'te AbortController eksikliğini düzelt (4 hata). page.tsx:117 (usage fetch), page.tsx:124 (health fetch), PlanView.tsx:422 (quality-timeline fetch), LiveView.tsx:73 (worktrees fetch). Her useEffect'te AbortController oluştur, fetch'e signal ver, cleanup'ta abort() çağır. Bu memory leak ve setState-after-unmount hatalarını önler.
AC: 4 fetch+useEffect'in tamamında AbortController var. react-doctor error sayısı 0.

## S15-T4
Area: Dashboard
Priority: medium
Depends: -
Description: a11y + hydration uyarılarını gider. (1) page.tsx:311 ve 315: modal overlay div'lerinde onClick var ama keyboard handler yok — onKeyDown ekle veya div'i button'a çevir. (2) page.tsx:114: useEffect(setState,[]) mount flash — mounted state'e suppressHydrationWarning ekle ya da pattern'ı düzelt.
AC: jsx-a11y uyarıları 0. Hydration flicker uyarısı 0. react-doctor skoru ≥95.

# Slice S16 — Claude Worktree Native Support

## S16-T1
Area: Server
Priority: high
Depends: -
Description: WorktreeState tipine `isClaudeManaged: boolean` ve `worktreeName?: string` alanları ekle. worktreeDetector.ts'te enrichWorktreeStatus'dan sonra (veya parsePorcelain'de) şunu kontrol et: path `.claude/worktrees/` içeriyorsa isClaudeManaged=true, worktreeName=basename(path) olarak set et. GET /worktrees yanıtında bu alanlar dönsün.
AC: `.claude/worktrees/feat-auth` path'li bir worktree için GET /worktrees → `{ isClaudeManaged: true, worktreeName: "feat-auth" }`. Normal worktree → `{ isClaudeManaged: false }`.

## S16-T2
Area: Dashboard
Priority: high
Depends: S16-T1
Description: WorktreePanel.tsx'i yeni alanlara göre güncelle. (1) WorktreeCard'da isClaudeManaged=true ise küçük "claude" badge'i göster (mavi/chart-4 rengi). (2) worktreeName varsa branch adının yanında daha büyük göster, path'i ikincil yap. (3) Boş durum TypingPrompt'unu güncelle: "git worktree add" yerine "claude --worktree <name>" komutunu göster, ".claude/worktrees/<name>/ altında oluşturulur" açıklaması ekle. (4) WorktreeDetail'de isClaudeManaged için "Claude-managed" etiketi göster.
AC: Claude-managed worktree'de badge görünüyor. Boş durumda "claude --worktree <name>" komutu yazıyor. Build ve lint temiz.

# Slice S17 — Polish: README + Landing + Versioning

## S17-T1
Area: Landing
Priority: critical
Depends: -
Description: Landing page tab CSS bug düzelt. `.sc-img { display: block }` kuralı `.sc-slide { display: none }` kuralını override ediyor, tüm slide'lar görünüyor. Fix: `.sc-img`'dan `display: block` kaldır (zaten `.sc-slide-active` yönetiyor). Test: 6 tab'dan sadece "Live" görünmeli başta.
AC: Sayfa yüklenince sadece ilk slide görünüyor. Diğer tab'lara tıklanınca doğru slide açılıyor. Fotoğraflar alt alta değil.

## S17-T2
Area: Landing
Priority: high
Depends: S17-T1
Description: activity.mp4 → GIF dönüştür. ffmpeg ile `landing/assets/activitiy.mp4`'ü `landing/assets/activity.gif`'e çevir (fps=8, scale=1200:-1, optimize et). HTML'de video tag'ini img tag'i ile değiştir. README'de mp4 referansını gif ile güncelle.
AC: activity.gif var ve 2MB altında (kalite optimize). Landing'de tab aktifken gif görünüyor. README'de çalışıyor.

## S17-T3
Area: Docs
Priority: critical
Depends: S17-T2
Description: README.md'yi sıfırdan yeniden yaz. Kullanıcının verdiği spec'e uygun: büyük başlık + one-liner, badges, hero/problem→solution, quick start + gif, feature highlights (emoji), Live/Plan comparison table, screenshots gallery, install options, plan mode kullanımı, CLI commands table, sharing/team, advanced features (context health / quality gates / worktrees), API table, stack, contributing + license. Tamamen İngilizce, kısa cümleler, bol whitespace, 120-200 satır, modern+profesyonel.
AC: README.md sıfırdan yazılmış, tüm bölümler mevcut, fotoğraflar düzgün sıralanmış (live.png önce), activity.gif çalışıyor, mp4 yok.

## S17-T4
Area: CI
Priority: high
Depends: -
Description: Versioning otomasyonunu düzelt. (1) auto-tag.yml workflow'una GitHub Release oluşturma adımı ekle: `gh release create v$VERSION --title "v$VERSION" --generate-notes`. (2) v1.1.18 için mevcut GitHub release yoksa oluştur. (3) package.json version ile git tag + npm publish + GitHub release üçlüsünün hep senkronda olmasını sağla.
AC: `gh release list` → v1.1.18 release'i var ve npm ile eşleşiyor. Bundan sonra version bump → otomatik tag + npm publish + GitHub release.

## S17-T5
Area: Dashboard
Priority: medium
Depends: -
Description: react-doctor çalıştır, skoru kontrol et. Yeni sorunlar varsa düzelt. Hedef ≥95 puan.
AC: `npx -y react-doctor@latest .` skoru ≥95. Yeni error/warning yoksa DONE.

# Slice S18 — README Screenshot Gallery

## S18-T1
Area: Docs
Priority: high
Depends: -
Description: README.md screenshots bölümünü 2×3 HTML table grid'e çevir. Her screenshot için alt açıklama (sub caption). 6 ekran görüntüsü (live, queue, worktrees, activity, config, docs) 3 satır × 2 sütun layout. Daha görsel, daha profesyonel.
AC: README.md screenshots section HTML table kullanıyor. 6 screenshot düzgün sıralı. Her cell'de açıklayıcı caption var. GitHub'da render ediliyor.
