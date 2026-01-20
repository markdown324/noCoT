// noCoT - Stream Content Hider Extension
// 使用延迟加载和完整错误处理，避免阻塞 SillyTavern 启动

(function () {
    'use strict';

    const EXTENSION_NAME = "noCoT";
    const EXTENSION_FOLDER_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}`;
    const DEFAULT_MARKER = "</thinking>";
    const DEBUG = true;

    // 设置变量
    let extension_settings = null;
    let saveSettingsDebounced = null;
    let currentMarker = DEFAULT_MARKER;
    let showIndicator = true;
    let showCollapsed = false;
    let streamStartTime = null;
    let isInitialized = false;
    let observer = null;

    function debugLog(...args) {
        if (DEBUG) console.log(`[${EXTENSION_NAME}]`, ...args);
    }

    function debugError(...args) {
        console.error(`[${EXTENSION_NAME}]`, ...args);
    }

    /**
     * 延迟导入模块
     */
    async function importModules() {
        try {
            const extensionsModule = await import('../../../extensions.js');
            extension_settings = extensionsModule.extension_settings;

            const scriptModule = await import('../../../../script.js');
            saveSettingsDebounced = scriptModule.saveSettingsDebounced;

            debugLog('Modules imported successfully');
            return true;
        } catch (error) {
            debugError('Failed to import modules:', error);
            return false;
        }
    }

    /**
     * 加载设置
     */
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
        } catch (error) {
            debugError('Error loading settings:', error);
        }
    }

    /**
     * 绑定设置面板事件
     */
    function bindSettingsEvents() {
        try {
            const $marker = $('#stream_hider_marker');
            const $indicator = $('#stream_hider_show_indicator');
            const $collapsed = $('#stream_hider_show_collapsed');

            if ($marker.length) {
                $marker.val(currentMarker).off('input.noCoT').on('input.noCoT', function () {
                    if (extension_settings && extension_settings[EXTENSION_NAME]) {
                        extension_settings[EXTENSION_NAME].marker = $(this).val();
                        currentMarker = $(this).val();
                        if (saveSettingsDebounced) saveSettingsDebounced();
                    }
                });
            }

            if ($indicator.length) {
                $indicator.prop('checked', showIndicator).off('change.noCoT').on('change.noCoT', function () {
                    if (extension_settings && extension_settings[EXTENSION_NAME]) {
                        extension_settings[EXTENSION_NAME].indicator = $(this).is(':checked');
                        showIndicator = $(this).is(':checked');
                        if (saveSettingsDebounced) saveSettingsDebounced();
                    }
                });
            }

            if ($collapsed.length) {
                $collapsed.prop('checked', showCollapsed).off('change.noCoT').on('change.noCoT', function () {
                    if (extension_settings && extension_settings[EXTENSION_NAME]) {
                        extension_settings[EXTENSION_NAME].showCollapsed = $(this).is(':checked');
                        showCollapsed = $(this).is(':checked');
                        if (saveSettingsDebounced) saveSettingsDebounced();
                    }
                });
            }
        } catch (error) {
            debugError('Error binding settings events:', error);
        }
    }

    /**
     * 获取思考时长文本
     */
    function getThinkingDurationText() {
        if (!streamStartTime) return '思考中...';
        const seconds = Math.round((Date.now() - streamStartTime) / 1000);
        return `思考了 ${seconds} 秒`;
    }

    /**
     * 创建或更新折叠区域
     */
    function createOrUpdateThinkingWrapper(targetDiv, thinkingContent, isStreaming) {
        try {
            let wrapper = targetDiv.querySelector('.noCoT-thinking-wrapper');

            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.className = 'noCoT-thinking-wrapper' + (isStreaming ? ' streaming' : '');

                wrapper.innerHTML = `
                    <button class="noCoT-thinking-toggle" type="button">
                        <span class="toggle-text">${getThinkingDurationText()}</span>
                        <span class="toggle-icon">▼</span>
                    </button>
                    <div class="noCoT-thinking-content">
                        <div class="thinking-text"></div>
                    </div>
                `;

                const toggle = wrapper.querySelector('.noCoT-thinking-toggle');
                const content = wrapper.querySelector('.noCoT-thinking-content');

                toggle.onclick = function () {
                    this.classList.toggle('expanded');
                    content.classList.toggle('expanded');
                };

                targetDiv.innerHTML = '';
                targetDiv.appendChild(wrapper);

                const mainDiv = document.createElement('div');
                mainDiv.className = 'noCoT-main-content';
                targetDiv.appendChild(mainDiv);
            }

            // 更新内容
            const thinkingText = wrapper.querySelector('.thinking-text');
            if (thinkingText) {
                thinkingText.textContent = thinkingContent.replace(/<[^>]*>/g, '');
            }

            const toggleText = wrapper.querySelector('.toggle-text');
            if (toggleText) {
                toggleText.textContent = getThinkingDurationText();
            }

            wrapper.classList.toggle('streaming', isStreaming);

            return wrapper;
        } catch (error) {
            debugError('Error in createOrUpdateThinkingWrapper:', error);
            return null;
        }
    }

    /**
     * 处理流式消息
     */
    function handleStreamingMessage(targetDiv) {
        if (!targetDiv) return;

        try {
            const rawHtml = targetDiv.innerHTML;

            // 如果内容为空或太短，忽略
            if (!rawHtml || rawHtml.length < 5) return;

            const markerIndex = rawHtml.indexOf(currentMarker);

            if (markerIndex === -1) {
                // 标记还没出现
                if (showCollapsed) {
                    if (!streamStartTime) streamStartTime = Date.now();
                    createOrUpdateThinkingWrapper(targetDiv, rawHtml, true);
                } else {
                    if (!targetDiv.classList.contains('waiting-for-marker')) {
                        targetDiv.classList.add('waiting-for-marker', 'hide-mode');
                        if (showIndicator) {
                            targetDiv.classList.add('show-indicator');
                        }
                    }
                }
            } else {
                // 标记已出现
                targetDiv.classList.remove('waiting-for-marker', 'hide-mode', 'show-indicator');

                const parts = rawHtml.split(currentMarker);
                const thinkingContent = parts[0];
                const mainContent = parts.slice(1).join(currentMarker);

                if (showCollapsed && thinkingContent.trim()) {
                    createOrUpdateThinkingWrapper(targetDiv, thinkingContent, false);
                    const mainDiv = targetDiv.querySelector('.noCoT-main-content');
                    if (mainDiv) mainDiv.innerHTML = mainContent;
                } else {
                    targetDiv.innerHTML = mainContent;
                }

                streamStartTime = null;
            }
        } catch (error) {
            debugError('Error in handleStreamingMessage:', error);
        }
    }

    /**
     * 启动观察器
     */
    function startObserver() {
        if (observer) return; // 已经启动

        const chatContainer = document.querySelector('#chat');
        if (!chatContainer) {
            debugLog('Chat container not found yet');
            return false;
        }

        observer = new MutationObserver(function (mutations) {
            try {
                const lastMessage = document.querySelector('.last_mes .mes_text');
                if (lastMessage) {
                    handleStreamingMessage(lastMessage);
                }
            } catch (error) {
                debugError('Observer error:', error);
            }
        });

        observer.observe(chatContainer, {
            childList: true,
            subtree: true,
            characterData: true
        });

        debugLog('Observer started');
        return true;
    }

    /**
     * 加载设置面板
     */
    async function loadSettingsPanel() {
        try {
            const response = await fetch(`/${EXTENSION_FOLDER_PATH}/settings.html`);
            if (response.ok) {
                const html = await response.text();
                const container = document.querySelector('#extensions_settings2');
                if (container) {
                    container.insertAdjacentHTML('beforeend', html);
                    debugLog('Settings panel loaded');
                    return true;
                }
            }
        } catch (error) {
            debugError('Error loading settings panel:', error);
        }
        return false;
    }

    /**
     * 主初始化函数
     */
    async function initialize() {
        if (isInitialized) return;

        debugLog('Initializing extension...');

        // 导入模块
        const modulesLoaded = await importModules();
        if (!modulesLoaded) {
            debugLog('Modules not loaded, will retry later');
        }

        // 加载设置
        loadSettings();

        // 加载设置面板
        await loadSettingsPanel();
        bindSettingsEvents();

        // 启动观察器（可能失败，会在后面重试）
        if (!startObserver()) {
            // 延迟重试
            const retryInterval = setInterval(function () {
                if (startObserver()) {
                    clearInterval(retryInterval);
                }
            }, 1000);

            // 30秒后停止重试
            setTimeout(function () {
                clearInterval(retryInterval);
            }, 30000);
        }

        isInitialized = true;
        debugLog('Extension initialized! Marker:', currentMarker);
    }

    // 使用 jQuery ready，但在 setTimeout 中延迟执行，给 ST 更多时间加载
    if (typeof jQuery !== 'undefined') {
        jQuery(function () {
            setTimeout(initialize, 500);
        });
    } else {
        // 如果 jQuery 不可用，使用 DOMContentLoaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                setTimeout(initialize, 500);
            });
        } else {
            setTimeout(initialize, 500);
        }
    }

})();