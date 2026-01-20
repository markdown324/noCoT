import { extension_settings, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 扩展标识 - 必须与文件夹名称匹配
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

    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = {
            marker: DEFAULT_MARKER,
            indicator: true,
            showCollapsed: false
        };
        debugLog('Created default settings');
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
        debugLog('Marker updated:', currentMarker);
    });

    $('#stream_hider_show_indicator').prop('checked', showIndicator).off('change').on('change', function () {
        extension_settings[EXTENSION_NAME].indicator = $(this).is(':checked');
        showIndicator = $(this).is(':checked');
        saveSettingsDebounced();
        debugLog('Indicator updated:', showIndicator);
    });

    $('#stream_hider_show_collapsed').prop('checked', showCollapsed).off('change').on('change', function () {
        extension_settings[EXTENSION_NAME].showCollapsed = $(this).is(':checked');
        showCollapsed = $(this).is(':checked');
        saveSettingsDebounced();
        debugLog('Show collapsed updated:', showCollapsed);
    });
}

/**
 * 创建可折叠思考区域 HTML
 */
function createThinkingWrapper(thinkingContent, duration) {
    const durationText = duration ? `思考了 ${Math.round(duration / 1000)} 秒` : '思考过程';

    const wrapper = document.createElement('div');
    wrapper.className = 'noCoT-thinking-wrapper';
    wrapper.innerHTML = `
        <button class="noCoT-thinking-toggle" type="button">
            <span class="toggle-text">${durationText}</span>
            <span class="toggle-icon">▼</span>
        </button>
        <div class="noCoT-thinking-content">
            <pre>${escapeHtml(thinkingContent)}</pre>
        </div>
    `;

    // 绑定展开/折叠事件
    const toggle = wrapper.querySelector('.noCoT-thinking-toggle');
    const content = wrapper.querySelector('.noCoT-thinking-content');

    toggle.addEventListener('click', () => {
        toggle.classList.toggle('expanded');
        content.classList.toggle('expanded');
    });

    return wrapper;
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
 * 处理流式消息内容
 */
function handleStreamingMessage(targetDiv) {
    if (!targetDiv) return;

    const rawHtml = targetDiv.innerHTML;
    const rawText = targetDiv.innerText;
    const markerIndex = rawHtml.indexOf(currentMarker);

    if (markerIndex === -1) {
        // 标记还没出现 - 处理隐藏逻辑
        if (!targetDiv.classList.contains('waiting-for-marker')) {
            targetDiv.classList.add('waiting-for-marker');

            if (showCollapsed) {
                // 折叠模式：不完全隐藏，但标记为正在处理
                targetDiv.classList.add('collapse-mode');
            } else {
                // 隐藏模式
                targetDiv.classList.add('hide-mode');
                if (showIndicator) {
                    targetDiv.classList.add('show-indicator');
                }
            }

            debugLog('Content hidden, waiting for marker...');
        }
    } else {
        // 标记已出现 - 处理显示逻辑
        const wasWaiting = targetDiv.classList.contains('waiting-for-marker');

        targetDiv.classList.remove('waiting-for-marker', 'hide-mode', 'collapse-mode', 'show-indicator');

        const parts = rawHtml.split(currentMarker);
        if (parts.length > 1) {
            const thinkingContent = parts[0];
            const mainContent = parts.slice(1).join(currentMarker);

            // 计算思考时间
            const duration = streamStartTime ? Date.now() - streamStartTime : null;

            if (showCollapsed && thinkingContent.trim()) {
                // 折叠模式：创建可折叠区域
                const existingWrapper = targetDiv.querySelector('.noCoT-thinking-wrapper');

                if (!existingWrapper) {
                    // 首次创建
                    targetDiv.innerHTML = '';

                    const wrapper = createThinkingWrapper(
                        thinkingContent.replace(/<[^>]*>/g, ''), // 移除 HTML 标签
                        duration
                    );
                    wrapper.classList.remove('streaming');
                    targetDiv.appendChild(wrapper);

                    // 添加主要内容
                    const mainDiv = document.createElement('div');
                    mainDiv.className = 'noCoT-main-content';
                    mainDiv.innerHTML = mainContent;
                    targetDiv.appendChild(mainDiv);

                    debugLog('Created collapsible thinking section');
                } else {
                    // 更新已有区域
                    const mainDiv = targetDiv.querySelector('.noCoT-main-content');
                    if (mainDiv && mainDiv.innerHTML !== mainContent) {
                        mainDiv.innerHTML = mainContent;
                    }
                }
            } else {
                // 隐藏模式：只显示标记后内容
                if (targetDiv.innerHTML !== mainContent) {
                    targetDiv.innerHTML = mainContent;
                    debugLog('Content trimmed, marker and preceding content removed');
                }
            }
        }
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

            // 移除 streaming 状态
            const wrapper = lastMessage.querySelector('.noCoT-thinking-wrapper');
            if (wrapper) {
                wrapper.classList.remove('streaming');
            }
        }

        streamStartTime = null;
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
        debugLog('Settings panel loaded successfully');
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
    debugLog('='.repeat(50));
    debugLog('Extension initializing...');
    debugLog('='.repeat(50));

    // 加载设置面板
    await loadSettingsPanel();

    // 加载设置
    loadSettings();

    // 注册事件监听器
    if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
        debugLog('Registering event listeners...');

        if (event_types.STREAM_TOKEN_RECEIVED) {
            eventSource.on(event_types.STREAM_TOKEN_RECEIVED, handleStreamTokenReceived);
        }

        if (event_types.GENERATION_ENDED) {
            eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);
        }
    }

    // MutationObserver 作为主要方案
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