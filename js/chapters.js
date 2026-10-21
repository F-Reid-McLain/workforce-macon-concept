/* Long in-page jumps (the "Skip to the data" link, the section rail) would otherwise
   smooth-scroll through thousands of pixels of the 3D story. Instead: a quick fade
   out, an instant jump, and a fade back in. Short jumps keep native smooth scrolling. */
(function () {
    'use strict';
    const main = document.querySelector('main');
    if (!main) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.addEventListener('click', e => {
        const a = e.target.closest('a[href^="#"]');
        const target = a && a.hash.length > 1 && document.getElementById(a.hash.slice(1));
        if (!target) return;
        const top = Math.max(0, target.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(target).scrollMarginTop) || 0));
        if (Math.abs(top - scrollY) < innerHeight * 1.5) return;
        e.preventDefault();
        const land = () => { scrollTo({ top, behavior: 'instant' }); history.pushState(null, '', a.hash); };
        if (reduce) { land(); return; }
        main.style.transition = 'opacity 0.18s ease';
        main.style.opacity = '0';
        setTimeout(() => {
            land();
            requestAnimationFrame(() => { main.style.opacity = '1'; });
            setTimeout(() => { main.style.transition = ''; }, 260);
        }, 180);
    });
})();
