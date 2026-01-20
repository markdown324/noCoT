import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// 扩展标识
const EXTENSION_NAME = "noCoT";
const EXTENSION_FOLDER_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}`;
const DEFAULT_MARKER = "</thinking>";

// 调试模式
const DEBUG = true;

function debugLog(...args) {
    if (DEBUG) console.log(`[${EXTENSION_NAME}]`, ...args);
}

function debugError(...args) {
    console.error(`[${EXTENSION_NAME}]`, ...args);
}

// 设置变量
let currentMarker = DEFAULT_MARKER;
let showIndicator = true;
let showCollapsed = false;
let isProcessingStream = false;
let streamStartTime = null;

/**
 * 从设置中加载配置
 */
function loadSettings() {
    debugLog('Loading settings...');

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

        // 绑定设置面板事件
        const $marker = $('#stream_hider_marker');
        const $indicator = $('#stream_hider_show_indicator');
        const $collapsed = $('#stream_hider_show_collapsed');

        if ($marker.length) {
            $marker.val(currentMarker).off('input').on('input', function () {
                extension_settings[EXTENSION_NAME].marker = $(this).val();
                currentMarker = $(this).val();
                saveSettingsDebounced();
            });
        }

        if ($indicator.length) {
            $indicator.prop('checked', showIndicator).off('change').on('change', function () {
                extension_settings[EXTENSION_NAME].indicator = $(this).is(':checked');
                showIndicator = $(this).is(':checked');
                saveSettingsDebounced();
            });
        }

        if ($collapsed.length) {
            $collapsed.prop('checked', showCollapsed).off('change').on('change', function () {
                extension_settings[EXTENSION_NAME].showCollapsed = $(this).is(':checked');
                showCollapsed = $(this).is(':checked');
                saveSettingsDebounced();
            });
        }
    } catch (error) {
        debugError('Error loading settings:', error);
    }
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 获取当前思考时长文本
 */
function getThinkingDurationText() {
    if (!streamStartTime) return '思考中...';
    const seconds = Math.round((Date.now() - streamStartTime) / 1000);
    return `思考了 ${seconds} 秒`;
}

/**
 * 创建或更新折叠模式下的思考区域
 */
function createOrUpdateThinkingWrapper(targetDiv, thinkingContent, isStreaming) {
    try {
        let wrapper = targetDiv.querySelector('.noCoT-thinking-wrapper');

        if (!wrapper) {
            // 首次创建
            wrapper = document.createElement('div');
            wrapper.className = 'noCoT-thinking-wrapper';
            if (isStreaming) {
                wrapper.classList.add('streaming');
            }

            const toggle = document.createElement('button');
            toggle.className = 'noCoT-thinking-toggle';
            toggle.type = 'button';
            toggle.innerHTML = `
                <span class="toggle-text">${getThinkingDurationText()}</span>
                <span class="toggle-icon">▼</span>
            `;

            const content = document.createElement('div');
            content.className = 'noCoT-thinking-content';

            const textDiv = document.createElement('div');
            textDiv.className = 'thinking-text';
            content.appendChild(textDiv);

            wrapper.appendChild(toggle);
            wrapper.appendChild(content);

            // 绑定展开/折叠事件
            toggle.addEventListener('click', function () {
                this.classList.toggle('expanded');
                content.classList.toggle('expanded');
            });

            // 清空并添加 wrapper
            targetDiv.innerHTML = '';
            targetDiv.appendChild(wrapper);

            // 添加主内容容器
            const mainDiv = document.createElement('div');
            mainDiv.className = 'noCoT-main-content';
            targetDiv.appendChild(mainDiv);

            debugLog('Created thinking wrapper');
        }

        // 更新思考内容
        const thinkingText = wrapper.querySelector('.thinking-text');
        if (thinkingText) {
            const cleanText = thinkingContent.replace(/<[^>]*>/g, '');
            thinkingText.textContent = cleanText;
        }

        // 更新时长文本
        const toggleText = wrapper.querySelector('.toggle-text');
        if (toggleText) {
            toggleText.textContent = getThinkingDurationText();
        }

        // 更新流式状态
        if (isStreaming) {
            wrapper.classList.add('streaming');
        } else {
            wrapper.classList.remove('streaming');
        }

        return wrapper;
    } catch (error) {
        debugError('Error in createOrUpdateThinkingWrapper:', error);
        return null;
    }
}

/**
 * 处理流式消息内容
 */
function handleStreamingMessage(targetDiv) {
    if (!targetDiv) return;

    try {
        const existingWrapper = targetDiv.querySelector('.noCoT-thinking-wrapper');
        const rawHtml = targetDiv.innerHTML;
        const markerIndex = rawHtml.indexOf(currentMarker);

        if (markerIndex === -1) {
            // 标记还没出现
            if (showCollapsed) {
                // 折叠模式：立即显示可折叠区域
                if (!streamStartTime) {
                    streamStartTime = Date.now();
                }
                createOrUpdateThinkingWrapper(targetDiv, rawHtml, true);
            } else {
                // 隐藏模式
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
                // 折叠模式：完成思考区域
                createOrUpdateThinkingWrapper(targetDiv, thinkingContent, false);

                const mainDiv = targetDiv.querySelector('.noCoT-main-content');
                if (mainDiv) {
                    mainDiv.innerHTML = mainContent;
                }
            } else {
                // 隐藏模式：只显示标记后内容
                targetDiv.innerHTML = mainContent;
            }
        }
    } catch (error) {
        debugError('Error in handleStreamingMessage:', error);
    }
}

/**
 * 加载设置面板 HTML
 */
async function loadSettingsPanel() {
    debugLog('Loading settings panel...');

    try {
        const settingsHtml = await $.get(`${EXTENSION_FOLDER_PATH}/settings.html`);
        $('#extensions_settings2').append(settingsHtml);
        debugLog('Settings panel loaded');
        return true;
    } catch (error) {
        debugError('Failed to load settings panel:', error);
        return false;
    }
}

/**
 * 初始化扩展
 */
jQuery(async function () {
    try {
        debugLog('Extension initializing...');

        await loadSettingsPanel();
        loadSettings();

        // MutationObserver - 主要方案
        const chatContainer = document.querySelector('#chat');
        if (chatContainer) {
            const observer = new MutationObserver(function () {
                const lastMessage = document.querySelector('.last_mes .mes_text');
                if (lastMessage) {
                    handleStreamingMessage(lastMessage);
                }
            });

            observer.observe(chatContainer, {
                childList: true,
                subtree: true,
                characterData: true
            });
            debugLog('MutationObserver registered');
        } else {
            debugLog('Chat container not found, will retry...');
            // 延迟重试
            setTimeout(function () {
                const chat = document.querySelector('#chat');
                if (chat) {
                    const obs = new MutationObserver(function () {
                        const lastMsg = document.querySelector('.last_mes .mes_text');
                        if (lastMsg) handleStreamingMessage(lastMsg);
                    });
                    obs.observe(chat, { childList: true, subtree: true, characterData: true });
                    debugLog('MutationObserver registered (delayed)');
                }
            }, 2000);
        }

        debugLog('Extension initialized! Marker:', currentMarker);
    } catch (error) {
        debugError('Extension initialization failed:', error);
    }
});