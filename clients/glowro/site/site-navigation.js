const siteHeader = document.querySelector('.site-header');
const menu = document.getElementById('mobile-nav');
const menuToggle = document.getElementById('menu-toggle');

function closeMenu() {
  menu.hidden = true;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Abrir menú');
}

if (siteHeader && menu && menuToggle) {
  const updateHeaderSurface = () => siteHeader.classList.toggle('is-scrolled', window.scrollY > 24);
  updateHeaderSurface();
  window.addEventListener('scroll', updateHeaderSurface, { passive: true });
  menuToggle.addEventListener('click', () => {
    const opening = menu.hidden;
    menu.hidden = !opening;
    menuToggle.setAttribute('aria-expanded', String(opening));
    menuToggle.setAttribute('aria-label', opening ? 'Cerrar menú' : 'Abrir menú');
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.querySelectorAll('a.brand-image[href="#inicio"]').forEach(link => link.addEventListener('click', event => {
    if (window.location.pathname !== '/' || window.location.search) return;
    event.preventDefault();
    closeMenu();
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) closeMenu();
  });
}
