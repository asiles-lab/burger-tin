const homeHeader = document.querySelector('.site-header');
if (homeHeader) {
  const updateHeaderSurface = () => homeHeader.classList.toggle('is-scrolled', window.scrollY > 24);
  updateHeaderSurface();
  window.addEventListener('scroll', updateHeaderSurface, { passive: true });
}
