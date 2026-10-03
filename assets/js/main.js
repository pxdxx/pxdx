'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ===================== LOTTIE ICON SYSTEM =====================
   Premium animated icons (extracted from Telegram custom-emoji packs via
   Lottie) replace plain emoji/icon glyphs across the page. Lazy-mounted
   on scroll-into-view so we don't pay for off-screen animation. */
const lottieCache = {};

function mountLottie(el) {
  const name = el.dataset.lottie;
  if (!name || el.dataset.lottieMounted) return;
  el.dataset.lottieMounted = '1';

  const init = (data) => {
    if (!document.body.contains(el)) return;
    lottie.loadAnimation({ container: el, renderer: 'svg', loop: true, autoplay: true, animationData: data });
    el.classList.add('is-loaded');
  };

  if (lottieCache[name]) { init(lottieCache[name]); return; }
  fetch(`assets/lottie/${name}.json`)
    .then((r) => { if (!r.ok) throw new Error('404'); return r.json(); })
    .then((data) => { lottieCache[name] = data; init(data); })
    .catch(() => {});
}

const lottieObserver = ('IntersectionObserver' in window)
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { mountLottie(entry.target); lottieObserver.unobserve(entry.target); }
      });
    }, { rootMargin: '200px' })
  : null;

$$('.lottie-icon[data-lottie]').forEach((el) => {
  if (lottieObserver) lottieObserver.observe(el);
  else mountLottie(el);
});

/* ===================== I18N ===================== */
/* Page ships with Russian copy already in the markup, so loading in RU
   needs no translation pass — applyLang('en') just overwrites it, and
   switching back to 'ru' restores it from this same dictionary. */
const I18N = {
  ru: {
    'nav.about': 'Обо мне',
    'nav.stack': 'Стек',
    'nav.projects': 'Проекты',
    'nav.contact': 'Контакты',
    'nav.toggleLabel': 'Меню',
    'hero.lead': 'Специализируюсь на создании любых Telegram-ботов, сайтов и прочего софта.',
    'hero.ctaTelegram': 'Написать в Telegram',
    'about.p1': 'Разрабатываю приложения и утилиты на стыке desktop, web и Telegram. От маленький проектов до полноценных магазинов и бизнесов.',
    'about.p2': 'Работаю с HTML/CSS/JS, Swift, Python для скриптов и автоматизации, PostgreSQL. Открыт к интересным заказам и совместным проектам.',
    'about.tag1': 'Обход блокировок',
    'about.tag2': 'Telegram-боты',
    'about.tag3': 'Автоматизация',
    'projects.p1.desc': 'Приложение для macOS, открывающее доступ к Discord и YouTube в обход блокировок.',
    'projects.p2.name': 'Расширение для Nekto.me',
    'projects.p2.desc': 'Браузерное расширение для видеочата Nekto.me: удобная панель справа, автоматический скип собеседников, смена темы сайта и статистика бесед (всего, за сегодня, самая долгая).',
    'saturn.alt': 'Декоративная частицевая планета',
  },
  en: {
    'nav.about': 'About',
    'nav.stack': 'Stack',
    'nav.projects': 'Projects',
    'nav.contact': 'Contact',
    'nav.toggleLabel': 'Menu',
    'hero.lead': 'I build Telegram bots, websites and other software.',
    'hero.ctaTelegram': 'Message on Telegram',
    'about.p1': 'I build apps and utilities at the intersection of desktop, web and Telegram, from small projects to full-blown shops and businesses.',
    'about.p2': 'I work with HTML/CSS/JS, Swift, Python for scripts and automation, and PostgreSQL. Open to interesting work and collaborations.',
    'about.tag1': 'Bypassing blocks',
    'about.tag2': 'Telegram bots',
    'about.tag3': 'Automation',
    'projects.p1.desc': 'A macOS app that opens access to Discord and YouTube past blocks.',
    'projects.p2.name': 'Nekto.me extension',
    'projects.p2.desc': 'A browser extension for the Nekto.me video chat: a handy panel on the right, automatic skipping of chat partners, site theme switching, and conversation stats (total, today, longest).',
    'saturn.alt': 'Decorative particle planet',
  },
};

function applyLang(lang) {
  const dict = I18N[lang];
  if (!dict) return;
  document.documentElement.lang = lang;
  $$('[data-i18n]').forEach((el) => {
    const val = dict[el.dataset.i18n];
    if (val != null) el.textContent = val;
  });
  $('#navToggle')?.setAttribute('aria-label', dict['nav.toggleLabel']);
  $('[data-particle-saturn]')?.setAttribute('aria-label', dict['saturn.alt']);
  $$('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.langBtn === lang));
}

$$('.lang-btn').forEach((btn) => {
  btn.addEventListener('click', () => applyLang(btn.dataset.langBtn));
});

/* ===================== NAV / SCROLL ===================== */
const navLinks = $$('.nav-link');
const sections = navLinks.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);

navLinks.forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('.nav')?.classList.remove('open');
  });
});

/* Scrollspy: pick the last section whose top has crossed the reference
   line (just under the sticky header), not an intersection-area overlap.
   An overlap-based observer misjudges short sections — Стек has little
   content, so Проекты could dominate the observed band and get marked
   active even right after landing on Стек. */
function updateActiveNav() {
  const line = 64 + 40;
  let current = sections[0];
  for (const s of sections) {
    if (s.getBoundingClientRect().top - line <= 0) current = s;
  }
  if (!current) return;
  const id = '#' + current.id;
  navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === id));
}
let navRaf = null;
window.addEventListener('scroll', () => {
  if (navRaf) return;
  navRaf = requestAnimationFrame(() => { updateActiveNav(); navRaf = null; });
}, { passive: true });
updateActiveNav();

$('#navToggle')?.addEventListener('click', () => $('.nav')?.classList.toggle('open'));

/* ===================== REVEAL ON SCROLL ===================== */
const revealObserver = ('IntersectionObserver' in window)
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in-view'); revealObserver.unobserve(entry.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
  : null;

$$('.reveal').forEach((el) => (revealObserver ? revealObserver.observe(el) : el.classList.add('in-view')));

/* ===================== YEAR ===================== */
const yearEl = $('#year');
if (yearEl) yearEl.textContent = new Date().getFullYear();
