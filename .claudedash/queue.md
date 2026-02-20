# Slice S1 — Plan Mode UX: Add Task + Kanban Toggle

## S1-T1
Area: Dashboard
Priority: critical
Depends: -
Description: Plan sidebar'ında "+ Add Task" butonunu en üste taşı (şu an en altta). Sidebar header'ının hemen altına, slice listesinin üstüne yerleştir. Formun davranışı aynı kalacak, sadece konum değişiyor.
AC: "+ Add Task" butonu Plan sidebar'ında en üstte görünür. Form açılınca input otomatik focus alır.

## S1-T2
Area: Dashboard
Priority: high
Depends: S1-T1
Description: Plan Mode'a Kanban/Liste görünüm toggle'ı ekle. Header alanına List/Kanban switch butonu koy. Kanban görünümde tasklar READY/IN_PROGRESS/DONE/BLOCKED sütunlarına dağılır (LiveView'daki KanbanColumn bileşenine benzer). Liste görünümü mevcut slice-tree yapısı. State localStorage'da saklansın.
AC: Toggle ile iki görünüm arası geçiş yapılabiliyor. Kanban'da 4 sütun var (READY, IN_PROGRESS, DONE, BLOCKED). Seçim sayfa yenilemede korunuyor.

# Slice S2 — Plan Mode Task Detail Yeniden Tasarımı

## S2-T1
Area: Dashboard
Priority: critical
Depends: -
Description: Plan modda taska tıklayınca açılan detail panel'i kaldır. Bunun yerine sağ tarafta her zaman görünür sabit bir "Task Detail" panel yap (selectedTask null ise boş/placeholder göster). Panel genişliği 380px, sol tarafta sidebar + kanban, sağda sabit detail panel. Mevcut detail içeriği (description, AC, deps, quality timeline, agent stats) korunacak ama daha iyi bir layout ile.
AC: Taska tıklayınca sayfa layout'u değişmiyor. Detail panel her zaman görünür durumda. Seçili task yoksa "Select a task to view details" placeholder gösteriyor.

## S2-T2
Area: Dashboard
Priority: high
Depends: S2-T1
Description: Task detail panel içeriğini yeniden düzenle. Üstte task ID + status badge + priority. Ortada description ve AC scrollable alan. Altta quality timeline compact halde. Agent/timing bilgileri küçük badge'ler olarak header'da gösterilsin. "Mark Done" ve "Block" aksiyonları her zaman görünür olsun, tooltip ile.
AC: Detail panel kompakt ama bilgi yoğun. Scroll gerekmeden kritik bilgiler (id, status, description, AC) görünüyor. Quality ve agent bilgileri ikincil konumda.

# Slice S3 — Worktrees Yeniden Tasarımı

## S3-T1
Area: Dashboard
Priority: high
Depends: -
Description: Worktrees görünümünü 2 kolonlu grid layout'a çevir. Sol kolon: worktree kartları (branch name büyük, path küçük, dirty/clean badge, ahead/behind sayaçları). Sağ kolon: seçili worktree'nin detayları (associated tasks, HEAD commit, full path). Kart tıklayınca seçilsin, accordion kaldırılsın.
AC: Grid layout çalışıyor. Worktree kartı seçilince sağda detaylar görünüyor. Accordion expand/collapse yok, direkt seçim var.

# Slice S4 — /usage Kotaları Dashboard'da

## S4-T1
Area: Server
Priority: high
Depends: -
Description: `GET /usage` endpoint ekle. `~/.claude/usage.json` veya benzer dosyayı oku (yoksa Claude API /usage endpoint'ini simüle et). Endpoint: kalan mesaj kotası, kullanılan token miktarı, reset zamanı bilgilerini dönsün. Dosya yoksa 404 + hint dön.
AC: `curl http://localhost:4317/usage` bir JSON döndürüyor. Hata durumunda anlamlı mesaj var.

## S4-T2
Area: Dashboard
Priority: high
Depends: S4-T1
Description: Top bar'a kullanım kotası widget'ı ekle. SSE dot'un yanına küçük bir "quota" göstergesi: kalan mesaj sayısı veya % olarak. Hover'da detaylı bilgi (reset time, token usage). Veri yoksa widget gizli kalır.
AC: Kota verisi varsa top bar'da küçük gösterge görünüyor. Tooltip'te detay var. Veri yoksa hiçbir şey gösterilmiyor.

# Slice S5 — Session Resume

## S5-T1
Area: Dashboard
Priority: medium
Depends: -
Description: Live Mode session kartlarına "Resume" butonu ekle. `claude resume <sessionId>` komutunu panoya kopyalar ve bir toast gösterir. Session detail panel'inde (sağ slide-in) de bu buton olsun. Tooltip: "Copy 'claude resume <id>' to clipboard".
AC: Session kartında küçük "Resume" ikonu var. Tıklayınca `claude resume <sessionId>` komutu kopyalanıyor. Toast 3sn görünüyor.

## S5-T2
Area: Server
Priority: medium
Depends: -
Description: `POST /sessions/:id/resume-cmd` endpoint ekle. `{"command": "claude resume <sessionId>", "sessionId": "..."}` döndürür. Dashboard bu endpoint üzerinden komutu alır (client-side fallback da var).
AC: Endpoint çalışıyor. Dashboard hem endpoint hem de client-side string concat ile komutu üretiyor.
