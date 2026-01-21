// noCoT - Stream Content Hider Extension
// 修复折叠模式不生效的问题

(function () {
    'use strict';

    const EXTENSION_NAME = "noCoT";
    const EXTENSION_FOLDER_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}`;
    const DEFAULT_MARKER = "</thinking>";
    const DEBUG = true;

    let extension_settings = null;
    let saveSettingsDebounced = null;
    let currentMarker = DEFAULT_MARKER;
    let showIndicator = true;
    let showCollapsed = false;
    let streamStartTime = null;
    let observer = null;
    let isProcessing = false;
    let lastProcessedContent = '';

    function debugLog(...args) {
        if (DEBUG) console.log(`[${EXTENSION_NAME}]`, ...args);
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

            debugLog('Settings:', { currentMarker, showIndicator, showCollapsed });
        } catch (e) {
            console.error('[noCoT] loadSettings error:', e);
        }
    }

    function bindSettingsEvents() {
        jQuery('#stream_hider_marker').val(currentMarker).on('input', function () {
            if (extension_settings && extension_settings[EXTENSION_NAME]) {
                extension_settings[EXTENSION_NAME].marker = jQuery(this).val();
                currentMarker = jQuery(this).val();
                if (saveSettingsDebounced) saveSettingsDebounced();
                debugLog('Marker changed to:', currentMarker);
            }
        });

        jQuery('#stream_hider_show_indicator').prop('checked', showIndicator).on('change', function () {
            if (extension_settings && extension_settings[EXTENSION_NAME]) {
                extension_settings[EXTENSION_NAME].indicator = jQuery(this).is(':checked');
                showIndicator = jQuery(this).is(':checked');
                if (saveSettingsDebounced) saveSettingsDebounced();
                debugLog('Indicator changed to:', showIndicator);
            }
        });

        jQuery('#stream_hider_show_collapsed').prop('checked', showCollapsed).on('change', function () {
            if (extension_settings && extension_settings[EXTENSION_NAME]) {
                extension_settings[EXTENSION_NAME].showCollapsed = jQuery(this).is(':checked');
                showCollapsed = jQuery(this).is(':checked');
                if (saveSettingsDebounced) saveSettingsDebounced();
                debugLog('ShowCollapsed changed to:', showCollapsed);
            }
        });
    }

    function getThinkingDurationText() {
        if (!streamStartTime) return '思考中...';
        return `思考了 ${Math.round((Date.now() - streamStartTime) / 1000)} 秒`;
    }

    function createThinkingWrapper(thinkingContent, mainContent, isStreaming) {
        const container = document.createElement('div');
        container.className = 'noCoT-container';

        // 思考区域
        const wrapper = document.createElement('div');
        wrapper.className = 'noCoT-thinking-wrapper' + (isStreaming ? ' streaming' : '');

        const toggle = document.createElement('button');
        toggle.className = 'noCoT-thinking-toggle';
        toggle.type = 'button';
        toggle.innerHTML = '<span class="toggle-text">' + getThinkingDurationText() + '</span><span class="toggle-icon">▼</span>';

        const content = document.createElement('div');
        content.className = 'noCoT-thinking-content';
        content.innerHTML = '<div class="thinking-text">' + thinkingContent.replace(/<[^>]*>/g, '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';

        toggle.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.classList.toggle('expanded');
            content.classList.toggle('expanded');
        };

        wrapper.appendChild(toggle);
        wrapper.appendChild(content);
        container.appendChild(wrapper);

        // 主内容区域
        if (mainContent) {
            const mainDiv = document.createElement('div');
            mainDiv.className = 'noCoT-main-content';
            mainDiv.innerHTML = mainContent;
            container.appendChild(mainDiv);
        }

        return container;
    }

    function handleMessage(targetDiv) {
        if (!targetDiv || isProcessing) return;

        // 获取当前内容
        const html = targetDiv.innerHTML;
        if (!html || html.length < 5) return;

        // 如果已经是我们处理过的容器，只更新内容
        if (targetDiv.querySelector('.noCoT-container')) {
            const toggleText = targetDiv.querySelector('.toggle-text');
            if (toggleText && streamStartTime) {
                toggleText.textContent = getThinkingDurationText();
            }
            return;
        }

        // 检查内容是否变化（避免重复处理相同内容）
        if (html === lastProcessedContent) return;
        lastProcessedContent = html;

        const idx = html.indexOf(currentMarker);

        debugLog('Processing message, marker found:', idx !== -1, 'showCollapsed:', showCollapsed);

        if (idx === -1) {
            // 标记未出现 - 流式处理中
            if (!streamStartTime) streamStartTime = Date.now();

            if (showCollapsed) {
                // 折叠模式：替换为折叠容器
                isProcessing = true;

                const container = createThinkingWrapper(html, '', true);
                targetDiv.innerHTML = '';
                targetDiv.appendChild(container);

                isProcessing = false;
                debugLog('Created collapsed wrapper during streaming');
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

            const parts = html.split(currentMarker);
            const thinkingContent = parts[0];
            const mainContent = parts.slice(1).join(currentMarker);

            if (showCollapsed && thinkingContent.trim()) {
                // 折叠模式
                const container = createThinkingWrapper(thinkingContent, mainContent, false);
                targetDiv.innerHTML = '';
                targetDiv.appendChild(container);
                debugLog('Created final collapsed wrapper');
            } else {
                // 隐藏模式
                targetDiv.innerHTML = mainContent;
            }

            streamStartTime = null;
            lastProcessedContent = '';
            isProcessing = false;
        }
    }

    function startObserver() {
        if (observer) return true;

        const chat = document.getElementById('chat');
        if (!chat) return false;

        observer = new MutationObserver(function (mutations) {
            if (isProcessing) return;

            // 只处理最后一条消息
            const msg = document.querySelector('.last_mes .mes_text');
            if (msg) {
                handleMessage(msg);
            }
        });

        observer.observe(chat, {
            childList: true,
            subtree: true,
            characterData: true
        });

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

        debugLog('Initialized!');
    }

    if (typeof jQuery !== 'undefined') {
        jQuery(function () {
            setTimeout(loadModulesAndInit, 100);
        });
    } else {
        setTimeout(loadModulesAndInit, 500);
    }

})();