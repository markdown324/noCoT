// noCoT - 最小化版本，用于排查加载问题

(function () {
    'use strict';

    const EXTENSION_NAME = "noCoT";
    const EXTENSION_FOLDER_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}`;
    const DEFAULT_MARKER = "</thinking>";

    let extension_settings = null;
    let saveSettingsDebounced = null;
    let currentMarker = DEFAULT_MARKER;
    let showIndicator = true;
    let showCollapsed = false;
    let streamStartTime = null;
    let observer = null;
    let isProcessing = false;

    function debugLog(...args) {
        console.log(`[${EXTENSION_NAME}]`, ...args);
    }

    function loadModulesAndInit() {
        // 延迟加载模块，避免阻塞
        import('../../../extensions.js').then(function (mod) {
            extension_settings = mod.extension_settings;
            debugLog('extensions.js loaded');

            return import('../../../../script.js');
        }).then(function (mod) {
            saveSettingsDebounced = mod.saveSettingsDebounced;
            debugLog('script.js loaded');

            // 模块加载完成后初始化
            initExtension();
        }).catch(function (err) {
            console.error('[noCoT] Module load error:', err);
        });
    }

    function loadSettings() {
        if (!extension_settings) return;

        try {
            if (!extension_settings[EXTENSION_NAME]) {
                extension_settings[EXTENSION_NAME] = {
                    marker: DEFAULT_MARKER,
                    indicator: true,
                    showCollapsed: false
                };
            }

            const settings = extension_settings[EXTENSION_NAME];
            currentMarker = settings.marker || DEFAULT_MARKER;
            showIndicator = settings.indicator !== false;
            showCollapsed = settings.showCollapsed === true;

            debugLog('Settings loaded');
        } catch (e) {
            console.error('[noCoT] loadSettings error:', e);
        }
    }

    function bindSettingsEvents() {
        try {
            jQuery('#stream_hider_marker').val(currentMarker).on('input', function () {
                if (extension_settings && extension_settings[EXTENSION_NAME]) {
                    extension_settings[EXTENSION_NAME].marker = jQuery(this).val();
                    currentMarker = jQuery(this).val();
                    if (saveSettingsDebounced) saveSettingsDebounced();
                }
            });

            jQuery('#stream_hider_show_indicator').prop('checked', showIndicator).on('change', function () {
                if (extension_settings && extension_settings[EXTENSION_NAME]) {
                    extension_settings[EXTENSION_NAME].indicator = jQuery(this).is(':checked');
                    showIndicator = jQuery(this).is(':checked');
                    if (saveSettingsDebounced) saveSettingsDebounced();
                }
            });

            jQuery('#stream_hider_show_collapsed').prop('checked', showCollapsed).on('change', function () {
                if (extension_settings && extension_settings[EXTENSION_NAME]) {
                    extension_settings[EXTENSION_NAME].showCollapsed = jQuery(this).is(':checked');
                    showCollapsed = jQuery(this).is(':checked');
                    if (saveSettingsDebounced) saveSettingsDebounced();
                }
            });
        } catch (e) {
            console.error('[noCoT] bindSettingsEvents error:', e);
        }
    }

    function getThinkingDurationText() {
        if (!streamStartTime) return '思考中...';
        return `思考了 ${Math.round((Date.now() - streamStartTime) / 1000)} 秒`;
    }

    function handleMessage(targetDiv) {
        if (!targetDiv || isProcessing) return;
        if (targetDiv.dataset.noCoTDone === 'true') return;

        const html = targetDiv.innerHTML;
        if (!html || html.length < 5) return;

        const idx = html.indexOf(currentMarker);

        if (idx === -1) {
            // 标记未出现
            if (!showCollapsed) {
                targetDiv.classList.add('waiting-for-marker', 'hide-mode');
                if (showIndicator) targetDiv.classList.add('show-indicator');
            }
        } else {
            // 标记已出现
            isProcessing = true;
            targetDiv.classList.remove('waiting-for-marker', 'hide-mode', 'show-indicator');
            targetDiv.dataset.noCoTDone = 'true';

            const parts = html.split(currentMarker);
            const mainContent = parts.slice(1).join(currentMarker);
            targetDiv.innerHTML = mainContent;

            isProcessing = false;
        }
    }

    function startObserver() {
        if (observer) return true;

        const chat = document.getElementById('chat');
        if (!chat) return false;

        observer = new MutationObserver(function () {
            if (isProcessing) return;
            const msg = document.querySelector('.last_mes .mes_text');
            if (msg) handleMessage(msg);
        });

        observer.observe(chat, { childList: true, subtree: true, characterData: true });
        debugLog('Observer started');
        return true;
    }

    function initExtension() {
        debugLog('Initializing...');

        loadSettings();

        // 加载设置面板
        fetch(`/${EXTENSION_FOLDER_PATH}/settings.html`)
            .then(function (r) { return r.text(); })
            .then(function (html) {
                const container = document.getElementById('extensions_settings2');
                if (container) {
                    container.insertAdjacentHTML('beforeend', html);
                    debugLog('Settings panel loaded');
                    bindSettingsEvents();
                }
            })
            .catch(function (e) {
                console.error('[noCoT] Settings panel error:', e);
            });

        // 启动观察器
        if (!startObserver()) {
            let tries = 0;
            const timer = setInterval(function () {
                if (startObserver() || ++tries > 20) clearInterval(timer);
            }, 500);
        }

        debugLog('Initialized! Marker:', currentMarker);
    }

    // 使用 setTimeout 延迟启动，确保不阻塞其他扩展
    if (typeof jQuery !== 'undefined') {
        jQuery(function () {
            setTimeout(loadModulesAndInit, 100);
        });
    } else {
        setTimeout(loadModulesAndInit, 500);
    }

})();