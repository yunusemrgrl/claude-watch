/* agent-scope landing page — anime.js animations */

'use strict';

// ── Utilities ──────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function copyText(text, feedbackEl, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = feedbackEl.textContent;
    feedbackEl.textContent = successMsg || 'copied!';
    setTimeout(() => { feedbackEl.textContent = orig; }, 2000);
    return true;
  } catch {
    return false;
  }
}

// ── 1. Hero entrance sequence ──────────────────────────
function animateHero() {
  // set initial hidden states
  const els = ['#hero-badge', '#hl-1', '#hl-2', '#hl-3', '#hero-sub', '#hero-ctas', '#terminal-hint', '#hero-demo'];
  els.forEach(sel => {
    const el = $(sel);
    if (el) el.style.opacity = '0';
  });

  const tl = anime.timeline({ easing: 'easeOutQuart' });

  tl.add({
    targets: '#hero-badge',
    opacity: [0, 1],
    translateY: [12, 0],
    duration: 550,
  })
  .add({
    targets: ['#hl-1', '#hl-2', '#hl-3'],
    opacity: [0, 1],
    translateY: [48, 0],
    duration: 750,
    delay: anime.stagger(110),
  }, '-=200')
  .add({
    targets: '#hero-sub',
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 600,
  }, '-=450')
  .add({
    targets: '#hero-ctas',
    opacity: [0, 1],
    translateY: [16, 0],
    duration: 500,
  }, '-=380')
  .add({
    targets: '#terminal-hint',
    opacity: [0, 0.75],
    duration: 400,
  }, '-=300')
  .add({
    targets: '#hero-demo',
    opacity: [0, 1],
    translateX: [32, 0],
    duration: 900,
    easing: 'easeOutCubic',
  }, '-=700');

  return tl;
}

// ── 2. Kanban demo animations ──────────────────────────
function animateKanban() {
  // Stagger in all kanban cards
  anime({
    targets: '.kb-card',
    opacity: [0, 1],
    translateY: [8, 0],
    delay: anime.stagger(55, { from: 'first' }),
    duration: 350,
    easing: 'easeOutQuart',
  });

  // Progress bar on active card: slowly fills from 65% → 84%
  anime({
    targets: '#kc-prog',
    width: ['65%', '84%'],
    duration: 14000,
    easing: 'linear',
  });

  // Live dot pulse on active card
  anime({
    targets: '#kc-live-dot',
    scale: [1, 1.8, 1],
    opacity: [1, 0.3, 1],
    duration: 1400,
    easing: 'easeInOutSine',
    loop: true,
  });

  // Badge dot (open source badge) pulse
  anime({
    targets: '.badge-dot',
    scale: [1, 1.5, 1],
    opacity: [1, 0.5, 1],
    duration: 2200,
    easing: 'easeInOutSine',
    loop: true,
  });

  // Live dot in chrome bar pulse
  anime({
    targets: '#live-dot',
    scale: [1, 1.6, 1],
    opacity: [1, 0.4, 1],
    duration: 2000,
    easing: 'easeInOutSine',
    loop: true,
  });

  // Context health bar — oscillates with a realistic pattern
  const ctxSteps = [42, 46, 44, 52, 55, 58, 53, 48, 62, 66, 72, 68, 64, 58, 52, 45, 42];
  let ctxIdx = 0;

  function stepContext() {
    ctxIdx = (ctxIdx + 1) % ctxSteps.length;
    const pct = ctxSteps[ctxIdx];

    anime({
      targets: '#ctx-fill',
      width: pct + '%',
      duration: 1800,
      easing: 'easeInOutSine',
      update() {
        const fill = $('#ctx-fill');
        const pctEl = $('#ctx-pct');
        const badge = $('#ctx-badge');
        if (!fill || !pctEl || !badge) return;

        const current = Math.round(parseFloat(fill.style.width) || pct);
        pctEl.textContent = current + '%';

        if (current >= 75) {
          fill.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
          fill.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.5)';
          badge.textContent = 'critical';
          badge.className = 'ctx-badge ctx-critical';
        } else if (current >= 65) {
          fill.style.background = 'linear-gradient(90deg, #eab308, #facc15)';
          fill.style.boxShadow = '0 0 8px rgba(234, 179, 8, 0.5)';
          badge.textContent = 'warn';
          badge.className = 'ctx-badge ctx-warn';
        } else {
          fill.style.background = 'linear-gradient(90deg, #22c55e, #4ade80)';
          fill.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.4)';
          badge.textContent = 'safe';
          badge.className = 'ctx-badge ctx-safe';
        }
      },
      complete() {
        setTimeout(stepContext, 2200 + Math.random() * 800);
      },
    });
  }

  setTimeout(stepContext, 2000);

  // Quality gate: tests pending → pass → pending (cycling)
  let testsPass = false;

  function cycleTestsGate() {
    const el = $('#qg-tests');
    if (!el) return;

    testsPass = !testsPass;

    // Flash the element
    anime({
      targets: el,
      scale: [1, 1.18, 1],
      duration: 260,
      easing: 'easeOutBack',
      complete() {
        if (testsPass) {
          el.textContent = 'tests ✓';
          el.className = 'qg qg-pass';
        } else {
          el.textContent = 'tests…';
          el.className = 'qg qg-pending';
        }
      },
    });

    setTimeout(cycleTestsGate, testsPass ? 4500 : 2800);
  }

  setTimeout(cycleTestsGate, 3500);
}

// ── 3. Scroll-triggered reveal ─────────────────────────
function initScrollReveal() {
  const items = $$('[data-animate]');

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      anime({
        targets: entry.target,
        opacity: [0, 1],
        translateY: [28, 0],
        duration: 650,
        easing: 'easeOutQuart',
      });

      io.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  items.forEach(el => io.observe(el));
}

// ── 4. Feature card hover glow ─────────────────────────
function initFeatureHover() {
  $$('.feature-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      anime({
        targets: card,
        scale: 1.015,
        duration: 220,
        easing: 'easeOutQuart',
      });
    });
    card.addEventListener('mouseleave', () => {
      anime({
        targets: card,
        scale: 1,
        duration: 220,
        easing: 'easeOutQuart',
      });
    });
  });
}

// ── 5. Copy buttons ────────────────────────────────────
function initCopyButtons() {
  // CTA command copy buttons
  [['#copy-cmd', '#cmd-text-1'], ['#copy-cmd-2', '#cmd-text-2']].forEach(([btnSel, textSel]) => {
    const btn = $(btnSel);
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const textEl = $(textSel);
      const ok = await copyText('npx agent-scope start', textEl, 'copied! ✓');
      if (ok) {
        anime({
          targets: btn,
          scale: [1, 0.95, 1],
          duration: 200,
          easing: 'easeOutBack',
        });
      }
    });
  });

  // Terminal code block copy
  const termBtn = $('#term-copy');
  if (termBtn) {
    termBtn.addEventListener('click', () => {
      const code = [
        '# Zero-install — run directly with npx',
        'npx agent-scope start',
        '',
        '# Or install globally',
        'npm install -g agent-scope',
        'agent-scope start',
        '',
        '# Custom project path',
        'agent-scope start --claude-dir ~/my-project/.claude',
      ].join('\n');

      copyText(code, termBtn, 'copied! ✓');
    });
  }
}

// ── 6. Nav scroll shadow ───────────────────────────────
function initNavScroll() {
  const header = $('#site-header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.style.boxShadow = '0 1px 40px rgba(0,0,0,0.4)';
    } else {
      header.style.boxShadow = 'none';
    }
  }, { passive: true });
}

// ── 7. Subtle background glow parallax ────────────────
function initParallax() {
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const glow1 = $('.bg-glow-1');
    const glow2 = $('.bg-glow-2');
    if (glow1) glow1.style.transform = `translateY(${y * 0.15}px)`;
    if (glow2) glow2.style.transform = `translateY(${y * -0.1}px)`;
  }, { passive: true });
}

// ── Init ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Check for anime.js
  if (typeof anime === 'undefined') {
    console.warn('anime.js not loaded — skipping animations');
    $$('[data-animate], #hero-badge, #hl-1, #hl-2, #hl-3, #hero-sub, #hero-ctas, #terminal-hint, #hero-demo')
      .forEach(el => { el.style.opacity = '1'; });
    return;
  }

  animateHero();
  setTimeout(animateKanban, 700);
  initScrollReveal();
  initFeatureHover();
  initCopyButtons();
  initNavScroll();
  initParallax();
});
