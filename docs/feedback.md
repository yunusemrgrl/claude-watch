Tamam, repo üstünden “gerçek eleştiri” yapıyorum (README + özellik seti + riskler). Kaynak: kendi README’in ve repo meta’sı. ￼

Güçlü tarafların (cidden iyi)
• README problem anlatımı çok net: “agent çalışıyor mu, stuck mı, bitti mi bilmiyorum” → bunu çok iyi çakıyorsun. ￼
• Quick start sürtünmesi düşük: npx -y ... start ve “zero config” iddiası devtool için doğru yön. ￼
• Plan Mode fikri değerli: .claudedash/queue.md + workflow.md + execution.log üçlüsü, “agent’ı kontrol altına alma” ihtiyacına iyi oturuyor. ￼
• Context rollback = farklılaştırıcı: hooks install --git + snapshots list + recover akışı “vibe coding sonrası toparlama” için baya iyi bir hook. ￼

Kritik eleştiriler (büyümeni yavaşlatan şeyler)

1. Ürün çok “şey” yapıyor → tek cümlede satması zor

README’de Features listesi uzun ve hepsi “önemli gibi” görünüyor: Kanban, Plan mode, Context health, Quality gates, Worktrees, API, Hooks, Cost tracker, MCP… ￼
Bu şu etkiyi yaratıyor: kullanıcı “tamam da ben bunu niye kuruyorum?” sorusuna tek cevap bulmakta zorlanıyor.

Öneri (konumlandırma):
• Ana mesajı 1 cümleye indir: örn “stuck + overflow erken uyarı”.
• Diğer her şeyi “Advanced” altına it (şu an bile Advanced var ama hâlâ ana kısım kalabalık). ￼

2. Güvenlik/Paylaşım kısmı “pratik ama riskli”

“Team access” örneği query string’de token taşıyor: ?token=mysecret123. ￼
Bu dev ortamında bile log’lara / browser history’ye / proxy’ye düşebilir.

Öneri (güvenli default):
• Token’ı Authorization header (Bearer) ile taşıma opsiyonunu “recommended” yap.
• Query token’ı “only for quick demos” diye işaretle.
• /events (SSE) için de auth stratejisini netleştir (SSE’de header geçmek zor olabiliyor; o yüzden cookie-based veya short-lived token gibi çözümler düşün). ￼

3. Claude’a “dosya formatı / path” bağımlılığı = platform riski

Senin value’nun kalbi “Claude’un yazdığı dosyaları okuyorum” (ör. ~/.claude/tasks/, worktree pathleri vs). ￼
Bu harika çünkü zero-integration; ama aynı zamanda kırılgan.

Öneri (risk azaltma):
• “Adapters” yaklaşımı: Claude Code bugün, yarın başka agent (Codex/Cursor/…); aynı UI, farklı source driver.
• En azından README’ye “hangi Claude sürümü / hangi dosya formatı varsayımı” gibi bir uyumluluk notu ekle.

4. API yüzeyi geniş ama “hardening” sinyali az

README’de epey endpoint var (POST /log, POST /agent/register, POST /plan/task, DELETE /snapshots/:hash …). ￼
Bu kadar yüzey olunca insanlar şu soruyu soruyor: “Bunu LAN’a açarsam ne olur?”

Öneri (minimum güven):
• Rate limit (en azından write endpoint’lerde)
• CORS politikası
• Token doğrulama kapsamını net yaz (hangi endpoint’ler auth istiyor)
• “0.0.0.0 açma” konusu zaten uyarılmış ama bunu daha sert yapabilirsin. ￼

5. Küçük ama imajı bozan detaylar
   • Repo topics’te “antrophic” yazıyor (typo). Bu küçük ama güven hissini etkiliyor. ￼

En hızlı “impact” alacağın 5 fix (star ve kullanım artırır) 1. README’nin en üstüne: “Who is this for / Not for” (2 madde). 2. “Core value”yu tek başlık yap: Stuck + Context overflow early warning (diğerleri secondary). ￼ 3. Token’ı header-based recommended yap, query token’ı demo’ya düşür. ￼ 4. “Compatibility” bölümü ekle: Claude Code path/format varsayımları. ￼ 5. Typo/ufak temizlik: topics, docs linkleri, 1 dakikalık demo GIF/video.

Tamam, claudedash’e (repo + mimari + bazı kritik dosyalar üzerinden) “acımasız ama faydalı” bir eleştiri çıkarıyorum.

Neyi iyi yapıyor?
• Mimari net: “dosya değişti → watcher → SSE → UI refresh” hattı temiz ve anlaşılır. createWatcher debounced event atıyor, UI da SSE ile tetikleniyor. ￼
• Zero-dependency / local-first yaklaşım doğru: SQLite gibi ekstra bağımlılıkları bilinçli ertelemişsin, gerekçen de mantıklı. ￼
• Gerçek hayata uygun özellikler: “PreCompact → auto-save + snapshot + restore note” fikri çok “agent kullanmış insan” işi. ￼
• Rate-limit + token opsiyonu var: En azından “localhost dışına açılırsa” kısmi koruma düşünülmüş. ￼

Asıl eleştiri (gerçek riskler)

1. Güvenlik: “local tool” olmasına rağmen fazla keskin bıçak
   • /hook endpoint’i git commit çalıştırıyor (execFileSync('git', ...)). Bu endpoint yanlışlıkla ağdan erişilebilir hale gelirse (host 0.0.0.0 gibi) kötü sürpriz çıkar. Şu an token opsiyonel olduğu için “unutulursa” açık kapı. ￼
   • Token kontrolünde queryToken desteği var. Query-string token, log’larda / history’de sızmaya daha yatkın. (Bu local tool’da bile “kaza riski” demek.) ￼
   • CORS sadece localhost/127.0.0.1 origin’lerine izin veriyor, iyi; ama yine de en güvenlisi: default host sadece 127.0.0.1 + token default “enabled” + query token kapalı. ￼

Öneri (P0):
• --host 0.0.0.0 gibi durumlarda token zorunlu yap.
• Query token’ı kaldır (sadece Authorization: Bearer).
• /hook için ayrıca “allowlist IP” + opsiyonel “disable dangerous hooks” flag’i.

2. Route’larda “sync FS + parsing” yaklaşımı büyüyünce can yakar

live.ts içinde çok fazla readFileSync/readdirSync var ve aynı handler içinde hem IO hem parse hem mapping yapılıyor. Bu local tool’da çoğu zaman okay, ama:
• Windows + büyük dosyalar + yoğun watcher event’leri = UI’da takılma görebilirsin.
• /sessions/:id/context bütün jsonl’ı okuyup split ediyor, sonra son 500 satırı işliyor. Bu en pahalı pattern: “son 500 lazım ama hepsini oku”. ￼

Öneri (P0/P1):
• “tail read” (stream) ile son N satırı al (ya da dosya boyutundan geriye doğru chunk okuyup newline say).
• Plan/sessions cache’leri var ama bunu “tek yerde standart” hale getir: cache layer (mtime + size + inode) gibi. Mimari dokümanda cache’ler anlatılmış ama kod içinde dağınık. ￼

3. live.ts “God file” olmaya başlamış

Şu an live.ts:
• SSE yönetiyor
• sessions cache yönetiyor
• dismissed persistence yönetiyor
• jsonl context summary çıkarıyor
• hook event ring buffer tutuyor
• git commit + snapshot + plan state işlemleri yapıyor

Bu kadar çok sorumluluk, ileride feature eklemeyi zorlaştırır (bug riski yükselir). ￼

Öneri (P0):
• live.ts içindekileri 3 servise ayır: 1. SseHub (client set, broadcast, ping) 2. SessionService (readSessions cache, filters, meta enrichment) 3. HookService (ring buffer + PreCompact/PostCompact actions)

4. “Hook ile otomatik commit” fikri harika ama davranışı sert

Şu an PreCompact’ta:
• git add -A + git commit ... deniyor (sessizce fail etse de) ￼

Bu bazı kullanıcılar için korkutucu:
• yanlış repo’da çalışıyorsa
• commit mesajı/formatı uymuyorsa
• staging’de istemediği dosyalar varsa

Öneri (P0 UX):
• Default: kapalı (--auto-commit ile açılır)
• Açıkken bile: .claudedash/config.json içinde allowlist (ör. only tracked files / only specific paths)
• UI’da “Auto-commit enabled” badge + son commit hash göster

5. “Plan Mode config” güzel ama init çıktısı fazla opinionated

init komutu queue template + config + workflow yazıyor. Bence iyi, ama:
• template “Area enum” gibi kısımlar bazılarına gereksiz gelebilir
• “tek format” dayatıyor gibi algılanabilir ￼

Öneri (P1):
• claudedash init --minimal (sadece boş dosyalar)
• --template simple|team|default gibi seçenekler

Hızlı “PR roadmap” (en yüksek etki → düşük efor) 1. Güvenlik sertleştirme
• --host localhost değilse token zorunlu + query token kaldır. ￼ 2. /sessions/:id/context tail-read
• full read yerine “son N satır” stream/tail. ￼ 3. Hook auto-commit’i opt-in yap
• --auto-commit + config allowlist. ￼ 4. live.ts parçalama
• SseHub / SessionService / HookService. ￼ 5. Docs: “threat model”
• “claudedash local tool ama host açarsan riskler şunlar” gibi 1 sayfa. (SECURITY.md var ama daha çok disclosure policy.) ￼
