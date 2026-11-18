/* loading.js - full-screen "loading..." panel, shown ONLY when something is really slow.

   What it watches:
     - the page itself while it loads
     - every <iframe> (Bandcamp players, YouTube, PDFs...), also the ones added later by scripts;
       iframes with loading="lazy" count only once they are on screen
     - anything a page reports with  siteLoading.begin('name')  ...  siteLoading.end('name')

   Rules (all adjustable, see "settings"):
     - nothing is shown if the thing loads in less than 0.3 s
     - once shown, the panel stays at least 0.45 s (no flicker) and never longer than 9 s
     - the panel lets clicks through, so a stuck load can never block the site

   Per-page settings, put BEFORE the script tag:
     <script>window.SITE_LOADING_CONFIG = { pageWaitsFor: 'dom', trackFrames: false };</script>
*/
(function () {
    'use strict';

    var settings = {
        showAfter: 300,        // ms a load must last before the panel appears
        minShow: 450,          // ms the panel stays once it appeared
        maxShow: 9000,         // ms after which the panel gives up and disappears
        text: 'loading...',
        trackFrames: true,     // watch iframes
        pageWaitsFor: 'load'   // 'load' = until images etc. are in, 'dom' = only until the page structure is ready
    };
    var custom = window.SITE_LOADING_CONFIG;
    if (custom) { for (var key in custom) { if (Object.prototype.hasOwnProperty.call(custom, key)) settings[key] = custom[key]; } }

    var tasks = [];            // what is loading right now
    var panel = null, visible = false, shownAt = 0, showTimer = 0, hideTimer = 0, maxTimer = 0;

    var CSS = '#site-loading{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
        'pointer-events:none;opacity:0;visibility:hidden;transition:opacity .25s ease,visibility 0s linear .25s;' +
        'background:radial-gradient(ellipse at center,#000 0%,rgba(0,0,0,.97) 35%,rgba(0,0,0,.72) 70%,rgba(0,0,0,.4) 100%);' +
        "color:#fff;font:20px/1 'Courier New',monospace;letter-spacing:.06em}" +
        '#site-loading.on{opacity:1;visibility:visible;transition:opacity .2s ease}' +
        '#site-loading span{animation:site-loading-pulse 1.4s ease-in-out infinite}' +
        '@keyframes site-loading-pulse{0%,100%{opacity:.55}50%{opacity:1}}' +
        '@media (prefers-reduced-motion:reduce){#site-loading,#site-loading span{transition:none;animation:none}}';

    function ensurePanel() {
        if (panel) return;
        var style = document.createElement('style');
        style.id = 'site-loading-style';
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
        panel = document.createElement('div');
        panel.id = 'site-loading';
        panel.setAttribute('role', 'status');
        panel.setAttribute('aria-live', 'polite');
        var label = document.createElement('span');
        label.textContent = settings.text;
        panel.appendChild(label);
        (document.body || document.documentElement).appendChild(panel);
    }

    function show() {
        ensurePanel();
        panel.classList.add('on');
        visible = true;
        shownAt = Date.now();
        clearTimeout(maxTimer);
        maxTimer = setTimeout(function () { tasks.length = 0; hide(); }, settings.maxShow);   // something is stuck: give up
    }

    function hide() {
        clearTimeout(maxTimer); maxTimer = 0;
        hideTimer = 0;
        if (panel) panel.classList.remove('on');
        visible = false;
    }

    function update() {
        if (tasks.length) {
            clearTimeout(hideTimer); hideTimer = 0;
            if (!visible && !showTimer) {
                showTimer = setTimeout(function () { showTimer = 0; if (tasks.length) show(); }, settings.showAfter);
            }
        } else {
            clearTimeout(showTimer); showTimer = 0;
            if (visible && !hideTimer) {
                hideTimer = setTimeout(hide, Math.max(0, settings.minShow - (Date.now() - shownAt)));
            }
        }
    }

    function begin(token) { if (tasks.indexOf(token) === -1) { tasks.push(token); update(); } }
    function end(token) { var at = tasks.indexOf(token); if (at !== -1) { tasks.splice(at, 1); update(); } }

    /* ---------- the page ---------- */
    if (document.readyState !== 'complete') {
        begin('page');
        var pageDone = function () { end('page'); };
        if (settings.pageWaitsFor === 'dom') {
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pageDone); else pageDone();
        } else {
            window.addEventListener('load', pageDone);
        }
    }

    /* ---------- iframes ---------- */
    var lazyWatcher = null;

    function lazyEntered(entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                lazyWatcher.unobserve(entry.target);
                if (!entry.target.__siteLoadingDone) begin(entry.target);
            }
        });
    }

    function checkFrame(frame) {
        var src = frame.getAttribute('src');
        if (!src || src === 'about:blank') return;
        frame.__siteLoadingDone = false;
        if (frame.getAttribute('loading') === 'lazy' && 'IntersectionObserver' in window) {
            if (!lazyWatcher) lazyWatcher = new IntersectionObserver(lazyEntered);
            lazyWatcher.observe(frame);
        } else {
            begin(frame);
        }
    }

    function watchFrame(frame) {
        if (!settings.trackFrames || frame.__siteLoadingWatched) return;
        frame.__siteLoadingWatched = true;
        var finished = function () { frame.__siteLoadingDone = true; end(frame); };
        frame.addEventListener('load', finished);
        frame.addEventListener('error', finished);
        checkFrame(frame);
    }

    function eachFrame(node, action) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'IFRAME') action(node);
        else if (node.querySelectorAll) { Array.prototype.forEach.call(node.querySelectorAll('iframe'), action); }
    }

    if (window.MutationObserver) {
        new MutationObserver(function (records) {
            records.forEach(function (record) {
                if (record.type === 'attributes') {                               // src set later (e.g. lazy scripts)
                    if (record.target.tagName === 'IFRAME' && settings.trackFrames) {
                        if (record.target.__siteLoadingWatched) checkFrame(record.target); else watchFrame(record.target);
                    }
                    return;
                }
                Array.prototype.forEach.call(record.addedNodes, function (node) { eachFrame(node, watchFrame); });
                Array.prototype.forEach.call(record.removedNodes, function (node) { eachFrame(node, end); });   // closed before it loaded
            });
        }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }

    document.addEventListener('DOMContentLoaded', function () { Array.prototype.forEach.call(document.querySelectorAll('iframe'), watchFrame); });

    window.siteLoading = { begin: begin, end: end, pending: function () { return tasks.length; }, settings: settings };
})();
