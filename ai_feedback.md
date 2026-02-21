# claudedash — AI Agent Feedback

Bu dosya, claudedash'i kullanan AI agentların (Claude Code, otonom agentlar) ihtiyaçlarını,
eksiklerini ve önerilerini belgeler. Her geliştirme sonrası agent deneyimi buraya eklenir.

---

## Mevcut Durum (v0.8.0)

### Ne iyi çalışıyor
- `npx claudedash start` ile sıfır kurulum, anında başlatma
- SSE ile gerçek zamanlı todo güncellemeleri — agent çalışırken dashboard canlı güncelleniyor
- Plan modu (queue.md + execution.log) — otonom workflow için temiz protokol
- `/health` endpoint — agent kendi durumunu sorgulayabiliyor
- `/facets` — AI session kalite analizi (outcome, friction, helpfulness)
- `/conversations` — JSONL tool analytics
- `/cost` — tahmini API maliyeti
- Activity view'da Session Quality + Tool Analytics + Cost sekmeler (v0.8.0)

### Agent Perspektifinden Eksikler

#### 1. Queue durumu sorgulanamıyor
- **Problem:** Agent, queue'daki task'ların güncel durumunu API üzerinden okuyamıyor.
  Şu an sadece dosya okuyarak (queue.md + execution.log) durumu anlıyor.
- **İstenen:** `GET /queue` endpoint → task listesi + her task'ın hesaplanmış statüsü
- **Neden önemli:** Sub-agent'lar parent'ın task queue'sunu görebilmeli

#### 2. Agent kendini kayıt edemiyor
- **Problem:** Birden fazla agent (paralel) çalışırken dashboard sadece session bazlı gösteriyor.
  Hangi agent hangi task'ı çalıştırıyor belirsiz.
- **İstenen:** `POST /agent/register` + `POST /agent/heartbeat` — agent adı, task_id, durum
- **Neden önemli:** Multi-agent senaryolarında orkestrasyon görünürlüğü

#### 3. Execution log append API yok
- **Problem:** Agent şu an doğrudan `.claudedash/execution.log` dosyasına yazıyor.
  Bu kısıtlayıcı — farklı dizinlerden çalışan agentlar log dosyasını bulamayabilir.
- **İstenen:** `POST /log` endpoint → `{ task_id, status, agent, reason?, meta? }`
- **Neden önemli:** Agent her yerden HTTP ile log basabilmeli, dosya path bilmesine gerek yok

#### 4. Task blocker bildirimi
- **Problem:** Agent bir task'ı BLOCKED olarak işaretlediğinde kullanıcı ancak dashboard'a
  bakınca görüyor. Anlık uyarı mekanizması yok.
- **İstenen:** BLOCKED log event'i SSE'den push edilmeli, browser bildirim tetiklenmeli
- **Neden önemli:** Agent engellendiğinde kullanıcı müdahalesi gerekiyor

#### 5. Conversation context endpoint yok
- **Problem:** Agent, kendi önceki oturumlarına (JSONL) programatik erişemiyor.
  "Bu projede daha önce ne yaptım?" sorusunu sormak için dosya okumak gerekiyor.
- **İstenen:** `GET /conversations?project=<path>&limit=5` — özet + son tool calls
- **Neden önemli:** Agent hafızasını dashboarddan sorgulayabilmeli

#### 6. Plan modu: workflow.md yokken agent kaybolabiliyor
- **Problem:** Yeni projede sadece queue.md var, workflow.md yok. Agent nasıl ilerleneceğini
  tahmin etmek zorunda.
- **İstenen:** `npx claudedash init` komutunun çıktısında varsayılan workflow.md şablonu olmalı
- **Neden önemli:** Agent-scope entegrasyonu için önemli

---

## Özellik İstekleri (Agent Kullanımı İçin)

### Kısa Vadeli (v0.8)
- [ ] `GET /queue` — hesaplanmış task durumlarıyla queue snapshot
- [ ] `POST /log` — HTTP üzerinden execution log append
- [ ] BLOCKED event → SSE push → browser bildirim

### Orta Vadeli (v0.9)
- [ ] `POST /agent/register` + heartbeat sistemi
- [ ] `GET /conversations?project=` — proje bazlı konuşma geçmişi özeti
- [ ] `npx claudedash init` — workflow.md şablonu dahil

### Uzun Vadeli
- [ ] Agent authentication (basit token yeterli)
- [ ] Multi-project queue federation — birden fazla projenin queue'su tek dashboardda
- [ ] Webhook/Slack entegrasyonu — task complete/failed bildirimi

---

## Rakip Analizi Notları

Araştırılan repolar: ccusage, claude-code-ui, claude-code-hooks-multi-agent-observability,
ccboard, ClaudeWatch, claude-pilot

### ccusage'dan öğrenilenler
- JSONL parsing yaklaşımı: her mesajı satır satır oku, tool_use bloklarını çıkar
- Bunu S5-T1'de `/conversations` endpoint ile yapıyoruz

### claude-code-hooks'tan öğrenilenler
- Hook sistemi (PreToolUse, PostToolUse event'leri) gerçek zamanlı event feed için ideal
- claudedash şu an polling/SSE yapıyor; hook entegrasyonu çok daha hızlı olurdu
- **Öneri:** `~/.claude/settings.json`'a hook ekleyerek claudedash sunucusuna POST at

### ccboard'dan öğrenilenler
- SQLite cache ile 89x hızlı başlatma — büyük JSONL dosyaları için önemli
- Şimdilik JSONL'yi her request'te okuyoruz, caching eklenebilir

### Kimsenin yapmadığı (claudedash fırsatı)
- `usage-data/facets/` verisi (AI session analizi) — S4'te yapıyoruz
- Todo list + plan mode entegrasyonu — sadece claudedash'te var
- Worktree → task eşleştirmesi — sadece claudedash'te var

---

## Hook Entegrasyonu Taslağı (Gelecek)

`~/.claude/settings.json`'a şu hook eklenebilir:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://localhost:4317/hook -H 'Content-Type: application/json' -d '{\"event\":\"PostToolUse\",\"tool\":\"$CLAUDE_TOOL_NAME\",\"session\":\"$CLAUDE_SESSION_ID\"}'"
      }]
    }]
  }
}
```

Bu hook, her tool kullanımında dashboard'a bildirir → gerçek zamanlı tool timeline mümkün olur.

---

## Derinlemesine Rakip Araştırması Bulguları (2026-02-21)

Araştırılan repolar: ccusage, claudecodeui, claude-code-hooks-multi-agent-observability,
ClaudeWatch, claude-pilot

### ccusage'dan kritik öğrenimler

**5 Saatlik Billing Block:**
Claude Code, 5 saatlik rolling window ile faturalandırıyor. ccusage bu bloğu takip eder:
- Aktif block'un elapsed time'ı, kalan token/süre
- Burn rate: token/dakika + $/saat
- Block sonu tahmini maliyet

JSONL dosyalarında `message.usage` alanı (`inputTokens`, `outputTokens`,
`cacheCreationInputTokens`, `cacheReadInputTokens`, `costUSD`) var.
Bu alanları parse ederek gerçek zamanlı billing block widget yapılabilir.

**Statusline hook:**
ccusage'ın statusline komutu şu veriyi bir hook JSON'ından okuyor:
- `cost.total_cost_usd`, `cost.total_duration_ms`
- `cost.total_lines_added/removed`
- `context_window.total_input_tokens`, `context_window.context_window_size`
Bu veri Claude Code tarafından hook çalıştığında env var olarak sağlanıyor.

**Cache efficiency metric:**
`cacheReadInputTokens / totalInputTokens` oranı — yüksek oran context'in verimli
kullanıldığını gösteriyor. Dashboard'da bir "cache hit rate" gauge mantıklı.

### claudecodeui'dan kritik öğrenimler

Her JSONL mesajında `gitBranch` alanı var → hangi branch'te çalışıldığı biliniyor.
`isSidechain: true` → sub-agent (Task tool ile başlatılmış) konuşmalar.

Conversation browser için message content types:
- `text` — düz metin
- `tool_use` — `{ name, input }` — tam argümanlarla
- `tool_result` — `{ tool_use_id, content, is_error }` — ham çıktı
- `thinking` — extended thinking blokları (etkinleştirilince)

### claude-pilot'tan kritik öğrenimler

**Pre/post-compaction state capture:**
`PreCompact` hook'u tetiklendiğinde aktif task listesi, plan ve mevcut görev
kaydedilmeli. Sonra `PostCompact` hook'u bu durumu restore etmeli.
claudedash şu an context compaction'da task listesi kaybını izlemiyor.

**`~/.claude/plans/*.md` dosyaları:**
4 adet plan dosyası mevcut. Her biri: başlık, context, değişiklik listesi,
doğrulama adımları. Plans Library sekmesi ile bunlar gösterilebilir.

**Threshold-based context uyarıları:**
40% → save, 55% → summarize, 65% → warning, 75% → auto-compact.
claudedash'in mevcut ContextHealth sistemi sadece warn/critical yapıyor;
daha granüler threshold'lar eklenebilir.

### Keşfedilmemiş `~/.claude` verileri (öncelik sırasıyla)

| Kaynak | İçerik | claudedash'te Önerilen Widget |
|--------|---------|-------------------------------|
| `history.jsonl` | Her promptun tam metni + proje + zaman | Aranabilir prompt geçmişi, top projeler |
| `session-meta/` (yeni alanlar) | `user_interruptions`, `user_response_times`, `files_modified`, `lines_removed` | Engagement score, velocity metric |
| `plans/*.md` | Claude tarafından yazılan plan belgeleri | Plans Library sekmesi |
| `tasks/{id}/N.json` | `blocks`/`blockedBy` dependency graph | Task bağımlılık görselleştirmesi |
| JSONL `message.usage` | Token/cost per message | 5h billing block widget |
| JSONL `gitBranch` | Branch başına aktivite | Branch bazlı iş özeti |

### Agent için Hook Mimarisi (Yüksek Öncelik)

Tüm rakipler polling yapıyor — gerçek zamanlı tool call görünürlüğü yok.
Hook tabanlı push mimarisi ile claudedash <1sn latency yakalayabilir:

```
~/.claude/settings.json → hooks →
  PostToolUse: curl POST http://localhost:4317/hook
  PreCompact: curl POST http://localhost:4317/hook
  SessionEnd: curl POST http://localhost:4317/hook
```

Hook payload: `{ event, tool_name, session_id, timestamp, cwd }`
→ Server SSE'den push eder → dashboard tool call timeline render eder

Bu, rakiplerden gerçek anlamda farklılaştıran özellik olur.

---

---

## v1.0.1 Retrospektifi — Agent Perspektifi (2026-02-21)

### Tamamlanan (S7–S10, v0.7.0 → v1.0.1)

✅ `GET /history` — history.jsonl prompt geçmişi
✅ `GET /plans` — ~/.claude/plans/*.md kütüphanesi (Docs tab)
✅ `GET /facets` — AI session kalite analizi
✅ `GET /conversations` — JSONL tool analytics
✅ `GET /cost` + `GET /billing-block` — maliyet ve 5h rolling window
✅ `POST /hook` + `GET /hook/events` — hook mimarisi
✅ `npx claudedash hooks install` — settings.json entegrasyonu
✅ `POST /log` — HTTP execution log
✅ `GET /queue` — computed task snapshot
✅ `POST /agent/register` + heartbeat + `GET /agents` — multi-agent registry
✅ LiveView Quick Resume panel — son sessionları sidebar'da göster
✅ Tab rename: Plan→Queue, Plans→Docs
✅ Notification: task-blocked SSE → browser notification

### Rakip Analizi Sonrası Eksikler (S11 hedefleri)

**Kritik (developer'ı bağımlı yapar):**

1. **MCP Server yok** — ccusage ve claude-pilot her ikisi de MCP expose ediyor. Claude kendi dashboard'unu sorgulayamıyor. `POST /mcp/call { tool: "get_queue" }` → Claude kendi task listesini okuyabilse workflow döngüsü kapanır. Bu en yüksek etkili eksik.

2. **Terminal status komutu yok** — ccusage'ın `ccusage monitor` gibi. `claudedash status` ile tek satır: session sayısı, cost, billing block. Tarayıcı açmadan bilgi almak kritik.

3. **PreCompact hook desteği yok** — planning-with-files ve claude-pilot her ikisi de `/clear` sonrası context recovery yapıyor. Şu an claudedash hooks install sadece PostToolUse + Stop yapıyor.

**Önemli (DX iyileştirir):**

4. **Burn rate / token projeksiyon yok** — ccusage ve Claude-Code-Usage-Monitor her ikisi de "kaç dakika kaldı" hesaplıyor. Bunu LiveView context bar'ına eklemek zor değil.

5. **CLAUDE.md editörü yok** — Her seferinde terminal'de düzenliyoruz. Dashboard'dan bir `PUT /claudemd` endpoint yeterli.

6. **`claudedash doctor` yok** — Yeni kullanıcılar neden çalışmıyor anlamıyor. Tek komutla kurulum kontrolü.

### Gözlemler (mini proje deneyimi)

Bu retroyu yazarken claudedash'i fiilen kullanarak geliştirdim. Gözlemler:

- **Quick Resume çok kullanışlı** — sidebar'da son session'lar görünüyor, hemen `claude resume` yapılabiliyor. Bunu gördükten sonra terminal'e gitme ihtiyacı azaldı.
- **Queue tab → Kanban daha iyi bir isim olabilirdi** — "Queue" teknik, "Kanban" tanıdık.
- **Billing block widget aktif olmadığında yok** — Bazen son 5 saatte aktivite yoksa widget kaybolur, neden yokluğunu anlamak zorlaşıyor. "Henüz aktivite yok" placeholder olabilir.
- **`/history` 50 prompt limiti** — Daha fazla prompt geçmişi istiyorum (100+), en azından arama ile.
- **Cost breakdown yeterli değil** — Hangi session ne kadar harcadı görmek istiyorum, sadece toplam değil.
- **MCP eksikliği hissediliyor** — `get_queue` demek yerine dosya okumak zorunda kaldım. MCP olsaydı `claudedash status` terminal komutuna gerek de kalmazdı, Claude direkt sorgulardı.

### Sonuç: Port 4317'yi Vazgeçilmez Yapmak İçin Öncelik Sırası

```
1. MCP Server      → Claude kendi dashboard'unu okur (feedback loop kapanır)
2. claudedash status → Terminal'de hızlı kontrol
3. PreCompact hook → Context recovery otomatikleşir
4. Burn rate       → "Context dolmadan uyar"
5. CLAUDE.md editör → Settings döngüsü dashboarddan
6. Task oluştur UI → Queue'yu terminal'e gitmeden yönet
7. claudedash doctor → Onboarding sorunu yok
```

_Son güncelleme: 2026-02-21 — v1.0.1 retrospektifi_
