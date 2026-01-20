import { extension_settings, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

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
let originalContent = ''; // 保存原始内容用于折叠模式

/**
 * 从设置中加载配置
 */
function loadSettings() {
    debugLog('Loading settings...');

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
    $('#stream_hider_marker').val(currentMarker).off('input').on('input', function () {
        extension_settings[EXTENSION_NAME].marker = $(this).val();
        currentMarker = $(this).val();
        saveSettingsDebounced();
    });

    $('#stream_hider_show_indicator').prop('checked', showIndicator).off('change').on('change', function () {
        extension_settings[EXTENSION_NAME].indicator = $(this).is(':checked');
        showIndicator = $(this).is(':checked');
        saveSettingsDebounced();
    });

    $('#stream_hider_show_collapsed').prop('checked', showCollapsed).off('change').on('change', function () {
        extension_settings[EXTENSION_NAME].showCollapsed = $(this).is(':checked');
        showCollapsed = $(this).is(':checked');
        saveSettingsDebounced();
    });
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
    if (!streamStartTime) return '思考中';
    const seconds = Math.round((Date.now() - streamStartTime) / 1000);
    return `思考了 ${seconds} 秒`;
}

/**
 * 创建或更新折叠模式下的思考区域
 */
function createOrUpdateThinkingWrapper(targetDiv, thinkingContent, isStreaming) {
    let wrapper = targetDiv.querySelector('.noCoT-thinking-wrapper');

    if (!wrapper) {
        // 首次创建
        wrapper = document.createElement('div');
        wrapper.className = 'noCoT-thinking-wrapper';
        wrapper.innerHTML = `
            <button class="noCoT-thinking-toggle" type="button">
                <span class="toggle-text">${getThinkingDurationText()}</span>
                <span class="toggle-icon">▼</span>
            </button>
            <div class="noCoT-thinking-content">
                <div class="thinking-text"></div>
            </div>
        `;

        // 绑定展开/折叠事件
        const toggle = wrapper.querySelector('.noCoT-thinking-toggle');
        const content = wrapper.querySelector('.noCoT-thinking-content');

        toggle.addEventListener('click', () => {
            toggle.classList.toggle('expanded');
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
        // 清理 HTML 标签，只保留文本
        const cleanText = thinkingContent.replace(/<[^>]*>/g, '');
        if (thinkingText.textContent !== cleanText) {
            thinkingText.textContent = cleanText;
        }
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
}

/**
 * 处理流式消息内容
 */
function handleStreamingMessage(targetDiv) {
    if (!targetDiv) return;

    // 检查是否已经有 wrapper（折叠模式已初始化）
    const existingWrapper = targetDiv.querySelector('.noCoT-thinking-wrapper');

    // 获取原始内容
    let rawHtml, rawText;
    if (existingWrapper) {
        // 如果已有 wrapper，从 main-content 获取新内容（如果有的话）
        // 但实际上我们需要追踪原始流式内容
        rawHtml = originalContent + (targetDiv.querySelector('.noCoT-main-content')?.innerHTML || '');
    } else {
        rawHtml = targetDiv.innerHTML;
        rawText = targetDiv.innerText;
    }

    // 对于折叠模式，直接从 DOM 获取当前内容
    if (!existingWrapper) {
        rawHtml = targetDiv.innerHTML;
    }

    const markerIndex = rawHtml.indexOf(currentMarker);

    if (markerIndex === -1) {
        // 标记还没出现
        if (showCollapsed) {
            // 折叠模式：立即显示可折叠区域，实时更新内容
            if (!existingWrapper) {
                // 保存原始内容
                originalContent = rawHtml;
            } else {
                // 内容可能在原 DOM 之外更新了，需要追踪
                // 由于 SillyTavern 直接更新 .mes_text，我们需要不同策略
            }

            // 直接在当前 div 上操作会被 SillyTavern 覆盖
            // 我们需要一个不同的方法：使用 overlay 或者拦截内容

            // 简化方案：将当前内容作为思考内容显示
            createOrUpdateThinkingWrapper(targetDiv, rawHtml, true);

        } else {
            // 隐藏模式
            if (!targetDiv.classList.contains('waiting-for-marker')) {
                targetDiv.classList.add('waiting-for-marker', 'hide-mode');
                if (showIndicator) {
                    targetDiv.classList.add('show-indicator');
                }
                debugLog('Content hidden, waiting for marker...');
            }
        }
    } else {
        // 标记已出现
        targetDiv.classList.remove('waiting-for-marker', 'hide-mode', 'collapse-mode', 'show-indicator');

        const parts = rawHtml.split(currentMarker);
        const thinkingContent = parts[0];
        const mainContent = parts.slice(1).join(currentMarker);

        if (showCollapsed && thinkingContent.trim()) {
            // 折叠模式：更新或创建 wrapper
            const wrapper = createOrUpdateThinkingWrapper(targetDiv, thinkingContent, false);

            // 更新主内容
            const mainDiv = targetDiv.querySelector('.noCoT-main-content');
            if (mainDiv && mainDiv.innerHTML !== mainContent) {
                mainDiv.innerHTML = mainContent;
            }

            debugLog('Marker found, finalized thinking section');
        } else {
            // 隐藏模式：只显示标记后内容
            if (targetDiv.innerHTML !== mainContent) {
                targetDiv.innerHTML = mainContent;
                debugLog('Content trimmed');
            }
        }

        // 重置原始内容追踪
        originalContent = '';
    }
}

/**
 * 处理流式 token 接收事件
 */
function handleStreamTokenReceived() {
    if (!isProcessingStream) {
        debugLog('Stream started');
        isProcessingStream = true;
        streamStartTime = Date.now();
        originalContent = '';
    }

    const lastMessage = document.querySelector('.last_mes .mes_text');
    if (lastMessage) {
        handleStreamingMessage(lastMessage);
    }
}

/**
 * 处理消息生成完成事件
 */
function handleGenerationEnded() {
    if (isProcessingStream) {
        debugLog('Stream ended');
        isProcessingStream = false;

        const lastMessage = document.querySelector('.last_mes .mes_text');
        if (lastMessage) {
            lastMessage.classList.remove('waiting-for-marker', 'hide-mode', 'collapse-mode', 'show-indicator');

            const wrapper = lastMessage.querySelector('.noCoT-thinking-wrapper');
            if (wrapper) {
                wrapper.classList.remove('streaming');
                // 更新最终时长
                const toggleText = wrapper.querySelector('.toggle-text');
                if (toggleText && streamStartTime) {
                    const seconds = Math.round((Date.now() - streamStartTime) / 1000);
                    toggleText.textContent = `思考了 ${seconds} 秒`;
                }
            }
        }

        streamStartTime = null;
        originalContent = '';
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
jQuery(async () => {
    debugLog('Extension initializing...');

    await loadSettingsPanel();
    loadSettings();

    // 注册事件监听器
    if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
        if (event_types.STREAM_TOKEN_RECEIVED) {
            eventSource.on(event_types.STREAM_TOKEN_RECEIVED, handleStreamTokenReceived);
        }
        if (event_types.GENERATION_ENDED) {
            eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);
        }
        debugLog('Event listeners registered');
    }

    // MutationObserver
    const chatContainer = document.querySelector('#chat');
    if (chatContainer) {
        const observer = new MutationObserver(() => {
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
    }

    debugLog('Extension initialized! Marker:', currentMarker);
});