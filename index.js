// noCoT - Stream Content Hider Extension
// 使用 SillyTavern 事件系统获取原始消息内容

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
    let observer = null;
    let isProcessing = false;

    // 存储已处理消息的 ID，避免重复处理
    let processedMessages = new Set();

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

            debugLog('Settings loaded');
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
    }

    // 处理已完成的消息（通过事件系统，获取原始内容）
    function handleMessageReceived(data) {
        debugLog('=== MESSAGE_RECEIVED ===');
        debugLog('data:', data);

        if (!data || !data.mes) {
            debugLog('No message content in data');
            return;
        }

        const rawContent = data.mes;
        debugLog('Raw content (first 500 chars):', rawContent.substring(0, 500));
        debugLog('Looking for marker:', currentMarker);

        const markerIndex = rawContent.indexOf(currentMarker);
        debugLog('Marker found:', markerIndex !== -1, 'at index:', markerIndex);

        if (markerIndex === -1) {
            debugLog('Marker not found in message');
            return;
        }

        // 找到标记，提取内容
        const thinkingContent = rawContent.substring(0, markerIndex);
        const mainContent = rawContent.substring(markerIndex + currentMarker.length);

        debugLog('Thinking content length:', thinkingContent.length);
        debugLog('Main content length:', mainContent.length);

        // 更新最后一条消息的显示
        setTimeout(function () {
            updateLastMessageDisplay(thinkingContent, mainContent);
        }, 100);
    }

    // 更新最后一条消息的显示
    function updateLastMessageDisplay(thinkingContent, mainContent) {
        const lastMesText = document.querySelector('.last_mes .mes_text');
        if (!lastMesText) {
            debugLog('Could not find last message text element');
            return;
        }

        if (lastMesText.dataset.noCoTDone === 'true') {
            debugLog('Message already processed');
            return;
        }

        isProcessing = true;
        lastMesText.classList.remove('waiting-for-marker', 'hide-mode', 'show-indicator');
        lastMesText.dataset.noCoTDone = 'true';

        if (showCollapsed && thinkingContent.trim()) {
            // 折叠模式
            const escapedThinking = thinkingContent
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            lastMesText.innerHTML = '<div class="noCoT-thinking-wrapper">' +
                '<button class="noCoT-thinking-toggle" type="button" onclick="this.classList.toggle(\'expanded\');this.nextElementSibling.classList.toggle(\'expanded\');">' +
                '<span class="toggle-text">查看思考过程</span><span class="toggle-icon">▼</span></button>' +
                '<div class="noCoT-thinking-content"><div class="thinking-text">' + escapedThinking + '</div></div></div>' +
                '<div class="noCoT-main-content">' + lastMesText.innerHTML.split(currentMarker.replace(/</g, '&lt;').replace(/>/g, '&gt;')).slice(1).join('') + '</div>';
            debugLog('Applied collapsed mode');
        } else {
            // 隐藏模式 - 需要重新渲染主内容
            // 由于 ST 已经渲染了完整内容，我们需要移除思考部分
            // 找到渲染后的分隔点比较困难，这里采用简化方案
            debugLog('Hide mode - content already rendered by ST');
        }

        isProcessing = false;
    }

    // 流式输出时的处理（用于隐藏模式）
    function handleStreamingMessage(targetDiv) {
        if (!targetDiv || isProcessing) return;
        if (targetDiv.dataset.noCoTDone === 'true') {
            targetDiv.classList.remove('waiting-for-marker', 'hide-mode', 'show-indicator');
            return;
        }

        const html = targetDiv.innerHTML;
        if (!html || html.length < 5) return;

        // 同时检查原始和转义版本
        const escapedMarker = currentMarker.replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (html.indexOf(currentMarker) !== -1 || html.indexOf(escapedMarker) !== -1) {
            // 标记已出现，等待 MESSAGE_RECEIVED 事件处理
            targetDiv.classList.remove('waiting-for-marker', 'hide-mode', 'show-indicator');
            return;
        }

        // 标记未出现 - 隐藏模式
        if (!showCollapsed) {
            if (!targetDiv.classList.contains('waiting-for-marker')) {
                targetDiv.classList.add('waiting-for-marker', 'hide-mode');
                if (showIndicator) targetDiv.classList.add('show-indicator');
            }
        }
    }

    function startObserver() {
        if (observer) return true;

        const chat = document.getElementById('chat');
        if (!chat) return false;

        observer = new MutationObserver(function () {
            if (isProcessing) return;
            const msg = document.querySelector('.last_mes .mes_text');
            if (msg) handleStreamingMessage(msg);
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

        // 注册消息接收事件（获取原始内容）
        if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
            eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
            debugLog('Registered MESSAGE_RECEIVED event handler');
        } else {
            debugLog('eventSource or event_types not available, using observer only');
        }

        // 启动观察器（用于流式输出时的隐藏）
        if (!startObserver()) {
            let tries = 0;
            const timer = setInterval(function () {
                if (startObserver() || ++tries > 20) clearInterval(timer);
            }, 500);
        }

        debugLog('Initialized! Marker:', currentMarker);
    }

    if (typeof jQuery !== 'undefined') {
        jQuery(function () {
            setTimeout(loadModulesAndInit, 100);
        });
    } else {
        setTimeout(loadModulesAndInit, 500);
    }

})();