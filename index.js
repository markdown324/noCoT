// noCoT - Stream Content Hider Extension
// 使用安全的加载模式，支持折叠功能

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
        import('../../../extensions.js').then(function (mod) {
            extension_settings = mod.extension_settings;
            return import('../../../../script.js');
        }).then(function (mod) {
            saveSettingsDebounced = mod.saveSettingsDebounced;
            debugLog('Modules loaded');
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

            debugLog('Settings loaded:', { currentMarker, showIndicator, showCollapsed });
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

    function createThinkingWrapper(thinkingContent, isStreaming) {
        const wrapper = document.createElement('div');
        wrapper.className = 'noCoT-thinking-wrapper' + (isStreaming ? ' streaming' : '');

        const toggle = document.createElement('button');
        toggle.className = 'noCoT-thinking-toggle';
        toggle.type = 'button';
        toggle.innerHTML = '<span class="toggle-text">' + getThinkingDurationText() + '</span><span class="toggle-icon">▼</span>';

        const content = document.createElement('div');
        content.className = 'noCoT-thinking-content';

        const textDiv = document.createElement('div');
        textDiv.className = 'thinking-text';
        textDiv.textContent = thinkingContent.replace(/<[^>]*>/g, '');
        content.appendChild(textDiv);

        toggle.onclick = function () {
            this.classList.toggle('expanded');
            content.classList.toggle('expanded');
        };

        wrapper.appendChild(toggle);
        wrapper.appendChild(content);

        return wrapper;
    }

    function handleMessage(targetDiv) {
        if (!targetDiv || isProcessing) return;

        // 已处理完成的跳过
        if (targetDiv.dataset.noCoTDone === 'true') {
            // 只更新时间显示
            const toggleText = targetDiv.querySelector('.toggle-text');
            if (toggleText && streamStartTime) {
                toggleText.textContent = getThinkingDurationText();
            }
            return;
        }

        const html = targetDiv.innerHTML;
        if (!html || html.length < 5) return;

        const idx = html.indexOf(currentMarker);

        if (idx === -1) {
            // 标记未出现 - 流式处理中
            if (showCollapsed) {
                // 折叠模式：显示可折叠区域
                if (!streamStartTime) streamStartTime = Date.now();

                if (!targetDiv.querySelector('.noCoT-thinking-wrapper')) {
                    isProcessing = true;

                    const wrapper = createThinkingWrapper(html, true);
                    const mainDiv = document.createElement('div');
                    mainDiv.className = 'noCoT-main-content';

                    targetDiv.innerHTML = '';
                    targetDiv.appendChild(wrapper);
                    targetDiv.appendChild(mainDiv);

                    isProcessing = false;
                } else {
                    // 更新思考内容
                    const thinkingText = targetDiv.querySelector('.thinking-text');
                    if (thinkingText) {
                        thinkingText.textContent = html.replace(/<[^>]*>/g, '');
                    }
                    const toggleText = targetDiv.querySelector('.toggle-text');
                    if (toggleText) {
                        toggleText.textContent = getThinkingDurationText();
                    }
                }
            } else {
                // 隐藏模式
                if (!targetDiv.classList.contains('waiting-for-marker')) {
                    targetDiv.classList.add('waiting-for-marker', 'hide-mode');
                    if (showIndicator) targetDiv.classList.add('show-indicator');
                }
            }
        } else {
            // 标记已出现 - 完成处理
            isProcessing = true;

            targetDiv.classList.remove('waiting-for-marker', 'hide-mode', 'show-indicator');
            targetDiv.dataset.noCoTDone = 'true';

            const parts = html.split(currentMarker);
            const thinkingContent = parts[0];
            const mainContent = parts.slice(1).join(currentMarker);

            if (showCollapsed && thinkingContent.trim()) {
                // 折叠模式：显示折叠区域 + 主内容
                const wrapper = createThinkingWrapper(thinkingContent, false);
                const mainDiv = document.createElement('div');
                mainDiv.className = 'noCoT-main-content';
                mainDiv.innerHTML = mainContent;

                targetDiv.innerHTML = '';
                targetDiv.appendChild(wrapper);
                targetDiv.appendChild(mainDiv);
            } else {
                // 隐藏模式：只显示主内容
                targetDiv.innerHTML = mainContent;
            }

            streamStartTime = null;
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

        fetch('/' + EXTENSION_FOLDER_PATH + '/settings.html')
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

        if (!startObserver()) {
            let tries = 0;
            const timer = setInterval(function () {
                if (startObserver() || ++tries > 20) clearInterval(timer);
            }, 500);
        }

        debugLog('Initialized! Marker:', currentMarker);
    }

    // 延迟启动，避免阻塞其他扩展
    if (typeof jQuery !== 'undefined') {
        jQuery(function () {
            setTimeout(loadModulesAndInit, 100);
        });
    } else {
        setTimeout(loadModulesAndInit, 500);
    }

})();