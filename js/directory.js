/* ===== ASSET DATA & DETAIL PANEL — Workforce Navigator =====
   Loads content/assets.json (the one source for the map, the finder's cards and
   this panel, so publishing a node through the admin tools updates them all),
   and shows an organization's details: in the map's inline info panel, or as a
   sheet (#asset-modal) when the map isn't the thing being looked at (the
   finder's cards on phones). The Directory page this used to serve is now part
   of navigator.html (js/navigator-finder.js). */

let assetData = {}; // Global store for data fetched from JSON

function escapeHtmlDir(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// escapeHtmlDir is safe for text-node content but not for attribute values —
// the browser's text-node serialization doesn't escape quote characters,
// since they're only meaningful inside a quoted attribute. openAssetModal
// puts submitted asset/link URLs straight into href="", so this both closes
// that quote-breakout gap and rejects non-http(s) schemes (e.g. javascript:)
// before a submitted URL ever reaches the DOM.
function safeHref(url) {
    const trimmed = (url || '').trim();
    if (!/^https?:\/\//i.test(trimmed)) return '#';
    return trimmed
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * 1. DATA LOADING
 * Pulls the written information from /content/assets.json
 */
async function loadAssetData() {
    try {
        const response = await fetch('content/assets.json');
        if (!response.ok) throw new Error('Network response was not ok');
        
        assetData = await response.json();

        // Same draft-preview mechanism as viz-engine.js — merges an
        // unpublished node stashed by the admin tools' "Preview on Map"
        // button so its info panel shows real content, never touching
        // assets.json itself.
        const previewId = new URLSearchParams(window.location.search).get('preview');
        if (previewId) {
            try {
                const draft = JSON.parse(sessionStorage.getItem('wf_preview_node') || 'null');
                if (draft && draft.id === previewId) assetData[draft.id] = draft.data;
            } catch (err) {
                console.error('directory: could not parse preview draft', err);
            }
        }

        // The finder (js/navigator-finder.js) builds its cards from this
        document.dispatchEvent(new CustomEvent('assets:loaded'));

        // Only check for URL parameters (from map clicks) AFTER data is ready
        checkUrlParameters();
    } catch (error) {
        console.error("Error loading asset JSON:", error);
    }
}

/**
 * 2. INITIALIZATION
 * Runs when the page loads
 */
document.addEventListener('DOMContentLoaded', () => {
    loadAssetData();
    setupModalListeners();
});

/**
 * 3. UI FUNCTIONS
 */
function setupModalListeners() {
    // Close inline viz panel
    const vizInfoClose = document.getElementById('viz-info-close');
    if (vizInfoClose) {
        vizInfoClose.onclick = () => {
            document.getElementById('viz-info-panel').classList.remove('open');
            // On mobile, leaving the panel resets the whole map back to the
            // core ring — not just the branched-out asset that opened it —
            // since an expanded category can still be sitting open
            // underneath (tap a category, tap one of its children, then
            // close the panel: collapseBranch alone tore down the child's
            // satellites but left the category itself expanded). Desktop
            // has no category-collapse concept to reset, so it keeps the
            // narrower, branch-only teardown.
            if (window.innerWidth <= 768 && typeof dismissMobileFocus === 'function') dismissMobileFocus();
            else collapseBranch(); // tear down any branched-out related-program nodes too
        };
    }

    const modal = document.getElementById('asset-modal');
    const closeBtn = document.querySelector('.close');

    // Close modal on 'X' click
    if (closeBtn) {
        closeBtn.onclick = () => closeAssetModal(modal);
    }

    // Close modal on clicking outside the box
    window.onclick = (event) => {
        if (event.target == modal) closeAssetModal(modal);
    };

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeAssetModal(modal);
        }
    });
}

// iOS Safari lets a touch drag scroll the body behind a position:fixed
// overlay even though the overlay covers the whole viewport — locking
// body overflow while the modal's open (and restoring it on every close
// path) keeps that scroll on the modal's own .modal-body instead.
function closeAssetModal(modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

// Shows just the domain instead of the full URL — a full path (e.g.
// "www.mga.edu/center-career-leadership-development/index.php") is long
// enough to overflow the fixed-width info panel/modal.
function shortenUrl(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
        return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }
}

// opts.sheet: show it in the sheet even where the map's inline panel exists
function openAssetModal(assetId, opts) {
    const asset = assetData[assetId];
    const inlinePanel  = (opts && opts.sheet) ? null : document.getElementById('viz-info-panel');

    // Build shared HTML content. Every value below can originate from a
    // public "Suggest an Asset"/"Request an Edit" submission that an admin
    // approved and published as-is (see js/forms.js, admin/js/node-builder-core.js)
    // — nothing upstream strips HTML out of it, so it must be escaped here,
    // at the one place it's actually rendered to real site visitors.
    let html = `<p>${asset ? escapeHtmlDir(asset.description || '') : 'Information coming soon...'}</p>`;
    if (asset && asset.impact)   html += `<p><strong>Community Impact:</strong> ${escapeHtmlDir(asset.impact)}</p>`;
    if (asset && asset.links && asset.links.length) {
        html += `<p><strong>Related Programs:</strong></p><div class="related-links">`;
        html += asset.links.map(l => `<a href="${safeHref(l.url)}" target="_blank" rel="noopener">${escapeHtmlDir(l.label)}</a>`).join('');
        html += `</div>`;
    }
    if (asset && asset.website)  html += `<p><strong>Website:</strong> <a href="${safeHref(asset.website)}" target="_blank" rel="noopener">${escapeHtmlDir(shortenUrl(asset.website))}</a></p>`;

    // Use inline panel when it exists (orientation handles portrait/landscape layout)
    if (inlinePanel) {
        document.getElementById('viz-info-title').textContent = asset ? asset.name : 'Asset Information';
        document.getElementById('viz-info-body').innerHTML = html;
        // Without this, clicking a different node while scrolled down keeps
        // the old scroll offset — the new content jumps in mid-scroll instead
        // of opening at the top.
        inlinePanel.scrollTop = 0;
        inlinePanel.classList.add('open');
        return;
    }

    // No inline panel (or asked for the sheet): use the fixed modal
    const modal   = document.getElementById('asset-modal');
    const title   = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    if (!modal || !title || !content) return;

    title.textContent  = asset ? asset.name : 'Asset Information';
    content.innerHTML  = html;
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function checkUrlParameters() {
    // ?asset=mercer opens that organization (old Directory links redirect here with it)
    const urlParams = new URLSearchParams(window.location.search);
    const assetId = urlParams.get('asset');
    
    if (assetId) {
        // On phones the map sits below the list, so show it as a sheet there
        openAssetModal(assetId, { sheet: window.innerWidth <= 900 });
        // Drop just this parameter from the address, keeping the finder's own
        urlParams.delete('asset');
        const rest = urlParams.toString();
        window.history.replaceState({}, document.title, window.location.pathname + (rest ? '?' + rest : '') + window.location.hash);
    }
}