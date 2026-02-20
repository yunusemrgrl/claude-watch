# Slice S1 — Aktif Uyarılar: "Sekmemi Neden Açık Tutayım?"

## S1-T1
Area: Dashboard
Priority: critical
Depends: -
Description: Web Notification API ile tarayıcı bildirimleri. Görev `DONE` / `FAILED` / `BLOCKED` durumuna geçtiğinde OS seviyesinde bildirim gönder. `Notification.requestPermission()` ilk açılışta çağrılır; kullanıcı reddederse fallback olarak dashboard içi toast gösterilir.
AC: Chrome/Firefox'ta görev başarısız olduğunda sistem bildirimi çıkar. İzin reddedilirse dashboard sağ üstünde kırmızı banner gösterilir. `src/dashboard/` altındaki bileşene eklenir.

## S1-T2
Area: Dashboard
Priority: high
Depends: S1-T1
Description: Tarayıcı sekme başlığını dinamik güncelle. Format: `[2 aktif] ClaudeDash` ya da `[⚠ 1 hata] ClaudeDash`. Hiçbir aktif görev yoksa normal başlık. SSE olayı geldiğinde güncellenir.
AC: Görev `in_progress` olduğunda başlıkta sayı görünür. `FAILED` olduğunda ⚠ simgesi eklenir. Tüm sekmeler kapanınca sayı sıfırlanır.

## S1-T3
Area: CLI
Priority: medium
Depends: -
Description: `claudedash start` çalışırken, SSE üzerinden `FAILED` veya `BLOCKED` event geldiğinde terminal'de sesli uyarı + renkli log bas. Node.js `process.stdout.write('\u0007')` (BEL karakteri) ile terminal zil çalar; `chalk` ile kırmızı satır.
AC: Agent bir task'ı FAILED logladığında terminalde zil çalar ve kırmızı mesaj görünür. `--no-bell` flag ile devre dışı bırakılabilir.

# Slice S2 — TodoWrite Güvenilirliği & Onboarding

## S2-T1
Area: Dashboard
Priority: critical
Depends: -
Description: Live mode'da TodoWrite verisi yoksa (30 sn boyunca hiç güncelleme gelmezse) "Agent setup eksik" banner'ı göster. Banner `CLAUDE.md`'deki TodoWrite direktifini nasıl ekleyeceğini adım adım açıklar. "Kopyala" butonu ile direktifi panoya alır.
AC: Yeni kullanıcı `claudedash start` açtığında ve agent TodoWrite kullanmıyorsa 30 sn sonra yönlendirme banner'ı görünür. Banner'daki "Kopyala" butonu çalışır. Görev gelirse banner kaybolur.

## S2-T2
Area: CLI
Priority: high
Depends: -
Description: `claudedash init` komutu çalışma dizinindeki `CLAUDE.md` dosyasını kontrol eder. TodoWrite direktifi yoksa "CLAUDE.md'ye TodoWrite direktifi eklendi" mesajıyla direktifi otomatik append eder. Dosya yoksa oluşturur.
AC: Boş bir dizinde `claudedash init` çalıştırmak `CLAUDE.md` dosyasını TodoWrite direktifiyle oluşturur. Direktif zaten varsa duplicate eklenmez.

## S2-T3
Area: Dashboard
Priority: medium
Depends: S2-T1
Description: Dashboard sol paneline "Agent Bağlantı Sağlığı" göstergesi ekle: son TodoWrite kaç saniye önce geldi, SSE bağlı mı, kaç aktif session var. Pasif izleme değil, gerçek zamanlı bağlantı kalitesi.
AC: `/health` endpoint'ine `lastTodoWrite` timestamp ve `connectedClients` alanları eklenir. Dashboard'da yeşil/sarı/kırmızı nokta gösterir.

# Slice S3 — Tarayıcıdan Kuyruk Editörü

## S3-T1
Area: Server
Priority: high
Depends: -
Description: `PATCH /plan/task/:taskId` endpoint'i ekle. Body: `{ status: 'DONE' | 'BLOCKED', reason?: string }`. `queue.md` dosyasını günceller ve `execution.log`'a yazar. Yalnızca localhost'tan erişilebilir (mevcut CORS politikası yeterli).
AC: `curl -X PATCH http://localhost:3141/plan/task/S1-T1 -d '{"status":"DONE"}'` queue.md'deki task'ı günceller. SSE ile diğer istemcilere yayınlanır.

## S3-T2
Area: Dashboard
Priority: high
Depends: S3-T1
Description: Plan Mode panelinde her task kartına "Tamamla" / "Bloke Et" butonları ekle. Tıklanınca `PATCH /plan/task/:taskId` çağrısı yapar ve optimistic UI günceller. Geri al (undo) 5 sn toast ile sunulur.
AC: Dashboard'dan task durumunu değiştirmek queue.md'yi günceller. SSE aracılığıyla sayfa otomatik yenilenir. Undo butonu 5 sn içinde önceki duruma döner.

## S3-T3
Area: Dashboard
Priority: medium
Depends: S3-T2
Description: Plan Mode'da "Yeni Görev Ekle" formu. Kısa başlık + öncelik (critical/high/medium/low) + bağımlılık alanları. `POST /plan/task` endpoint ile queue.md'ye yeni blok append eder.
AC: Dashboard'dan eklenen görev queue.md'de doğru formatta görünür. Zorunlu alan (başlık) boş geçilemez; client-side validasyon.

# Slice S4 — Auth & Takım Paylaşımı

## S4-T1
Area: CLI
Priority: high
Depends: -
Description: `claudedash start --token <secret>` seçeneği. Token varsa tüm API endpoint'leri `Authorization: Bearer <token>` header kontrolü yapar. Token yoksa (varsayılan) mevcut davranış devam eder. Token CLI'a verilmezse `CLAUDEDASH_TOKEN` env var'ından okunur.
AC: Token ile başlatılan server'a token'sız GET isteği 401 döner. Doğru token ile 200 döner. Dashboard URL'e `?token=<secret>` eklenerek açılabilir.

## S4-T2
Area: Docs
Priority: medium
Depends: S4-T1
Description: README'ye "Takımla Paylaşım" bölümü ekle. `--token` kullanım örneği, güvenlik uyarısı (token'ı git'e commit etme), `.env` ile kullanım, local tunnel (ngrok/cloudflared) önerisi.
AC: README'de "Sharing with your team" H2 başlığı altında en az 3 kod örneği var.

# Slice S5 — Landing & README Yenileme

## S5-T1
Area: Docs
Priority: high
Depends: -
Description: Landing sayfasına Worktrees özellik kartı ekle (mevcut 4 kart yanına 5. olarak). İçerik: "Paralel Worktree İzleme — Birden fazla git worktree'de çalışan agentları tek ekranda görün." Ayrıca sayfanın footer'ına "Not affiliated with Anthropic" disclaimeri ekle.
AC: `landing/index.html`'de Worktrees feature kartı var. Footer'da disclaimer metni görünüyor. `npm run build` geçiyor.

## S5-T2
Area: Docs
Priority: high
Depends: -
Description: README.md'yi güncelle: (1) Test sayısını doğru yaz (mevcut `npx vitest run` çıktısıyla eşleştir), (2) CLI komutları tablosuna `recover`, `spec`, `worktree` ekle, (3) API endpoint tablosuna `/claude-insights` ve `?file=` parametresini ekle, (4) "Why claudedash?" bölümüne "Görev başarısız olduğunda bildirim al" maddesini ekle.
AC: `grep "recover\|spec\|worktree" README.md` sonuç verir. API tablosunda `/claude-insights` satırı var.

## S5-T3
Area: Docs
Priority: medium
Depends: S5-T1
Description: Landing sayfasına gerçek ekran görüntüsü veya animasyonlu GIF placeholder'ı ekle. Şu an `assets/screenshot-1.png` yolu var ama dosya yok. En azından `assets/` dizini oluştur ve placeholder SVG koy; kayıp dosya nedeniyle broken image gösterilmesin.
AC: `assets/screenshot-1.png` veya `assets/screenshot-1.svg` mevcut. Landing'de broken image icon görünmüyor.

# Slice S6 — Uyumluluk & Araçlar

## S6-T1
Area: Tooling
Priority: medium
Depends: -
Description: `THIRD_PARTY_NOTICES` dosyası oluştur. `npm ls --json` çıktısından prod bağımlılıkları listele, her paketin lisansını ekle. `claudedash doctor` CLI komutu ekle: Node.js versiyonu, git varlığı, port erişilebilirliği, CLAUDE.md varlığı, `~/.claude/` dizini erişimi kontrol eder.
AC: Repo kökünde `THIRD_PARTY_NOTICES` dosyası var (en az 10 bağımlılık). `claudedash doctor` komutu tüm kontrolleri ✓/✗ ile raporlar.

## S6-T2
Area: Tooling
Priority: medium
Depends: -
Description: GitHub Actions workflow'unda action SHA pinleme. Mevcut `actions/checkout@v4` gibi tag kullanımlarını commit SHA ile değiştir (örn. `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`). Ayrıca model-aware context health: `/sessions` response'una `modelContextLimit` alanı ekle. Varsayılan 200k; `?model=claude-haiku` sorgusuyla 100k olarak hesaplansın.
AC: `.github/workflows/ci.yml`'de SHA pinli action referansları var. `GET /sessions?model=claude-haiku` ile dönen sessions'da contextHealth.limit 100000 oluyor.
