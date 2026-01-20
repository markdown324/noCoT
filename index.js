import { extension_settings, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 扩展标识 - 必须与文件夹名称匹配
const EXTENSION_NAME = "noCoT";
const EXTENSION_FOLDER_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}`;
const DEFAULT_MARKER = "</thinking>";

// 调试模式 - 在控制台输出详细日志
const DEBUG = true;

function debugLog(...args) {
    if (DEBUG) {
        console.log(`[${EXTENSION_NAME}]`, ...args);
    }
}

function debugError(...args) {
    console.error(`[${EXTENSION_NAME}]`, ...args);
}

// 设置变量
let currentMarker = DEFAULT_MARKER;
let showIndicator = true;
let isProcessingStream = false;

/**
 * 从设置中加载配置
 */
function loadSettings() {
    debugLog('Loading settings...');

    // 初始化设置对象
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = {
            marker: DEFAULT_MARKER,
            indicator: true
        };
        debugLog('Created default settings');
    }

    const settings = extension_settings[EXTENSION_NAME];
    currentMarker = settings.marker || DEFAULT_MARKER;
    showIndicator = settings.indicator !== false;

    debugLog('Current marker:', currentMarker);
    debugLog('Show indicator:', showIndicator);

    // 绑定设置面板的输入事件
    const markerInput = $('#stream_hider_marker');
    const indicatorCheckbox = $('#stream_hider_show_indicator');

    if (markerInput.length) {
        markerInput.val(currentMarker).off('input').on('input', function () {
            extension_settings[EXTENSION_NAME].marker = $(this).val();
            currentMarker = $(this).val();
            saveSettingsDebounced();
            debugLog('Marker updated to:', currentMarker);
        });
        debugLog('Marker input bound successfully');
    } else {
        debugError('Marker input element not found!');
    }

    if (indicatorCheckbox.length) {
        indicatorCheckbox.prop('checked', showIndicator).off('change').on('change', function () {
            extension_settings[EXTENSION_NAME].indicator = $(this).is(':checked');
            showIndicator = $(this).is(':checked');
            saveSettingsDebounced();
            debugLog('Indicator setting updated to:', showIndicator);
        });
        debugLog('Indicator checkbox bound successfully');
    } else {
        debugError('Indicator checkbox element not found!');
    }
}

/**
 * 处理流式消息内容
 */
function handleStreamingMessage(targetDiv) {
    if (!targetDiv) return;

    const rawHtml = targetDiv.innerHTML;
    const markerIndex = rawHtml.indexOf(currentMarker);

    if (markerIndex === -1) {
        // 标记还没出现 - 隐藏内容
        if (!targetDiv.classList.contains('waiting-for-marker')) {
            targetDiv.classList.add('waiting-for-marker');
            if (showIndicator) {
                targetDiv.classList.add('show-indicator');
            }
            debugLog('Content hidden, waiting for marker...');
        }
    } else {
        // 标记已出现 - 显示标记后的内容
        if (targetDiv.classList.contains('waiting-for-marker')) {
            debugLog('Marker found! Revealing content...');
        }

        targetDiv.classList.remove('waiting-for-marker');
        targetDiv.classList.remove('show-indicator');

        const parts = rawHtml.split(currentMarker);
        if (parts.length > 1) {
            const newContent = parts.slice(1).join(currentMarker);
            if (targetDiv.innerHTML !== newContent) {
                targetDiv.innerHTML = newContent;
                debugLog('Content trimmed, marker and preceding content removed');
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
            lastMessage.classList.remove('waiting-for-marker');
            lastMessage.classList.remove('show-indicator');
        }
    }
}

/**
 * 加载设置面板 HTML
 */
async function loadSettingsPanel() {
    debugLog('Loading settings panel from:', `${EXTENSION_FOLDER_PATH}/settings.html`);

    try {
        const settingsHtml = await $.get(`${EXTENSION_FOLDER_PATH}/settings.html`);
        $('#extensions_settings2').append(settingsHtml);
        debugLog('Settings panel loaded and appended to #extensions_settings2');
        return true;
    } catch (error) {
        debugError('Failed to load settings panel:', error);

        // 尝试备用位置
        try {
            const settingsHtml = await $.get(`/scripts/extensions/third-party/${EXTENSION_NAME}/settings.html`);
            $('#extensions_settings2').append(settingsHtml);
            debugLog('Settings panel loaded from backup path');
            return true;
        } catch (error2) {
            debugError('Backup path also failed:', error2);
            return false;
        }
    }
}

/**
 * 初始化扩展
 */
jQuery(async () => {
    debugLog('='.repeat(50));
    debugLog('Extension initializing...');
    debugLog('Extension folder:', EXTENSION_FOLDER_PATH);
    debugLog('='.repeat(50));

    // 加载设置面板
    const panelLoaded = await loadSettingsPanel();
    if (!panelLoaded) {
        debugError('Settings panel could not be loaded!');
    }

    // 加载设置
    loadSettings();

    // 注册事件监听器
    if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
        debugLog('Event system available, registering listeners...');

        if (event_types.STREAM_TOKEN_RECEIVED) {
            eventSource.on(event_types.STREAM_TOKEN_RECEIVED, handleStreamTokenReceived);
            debugLog('Registered STREAM_TOKEN_RECEIVED listener');
        }

        if (event_types.GENERATION_ENDED) {
            eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);
            debugLog('Registered GENERATION_ENDED listener');
        }
    } else {
        debugLog('Event system not available, using MutationObserver only');
    }

    // MutationObserver 作为主要/降级方案
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
        debugLog('MutationObserver registered on #chat');
    } else {
        debugError('#chat container not found!');
    }

    debugLog('Extension initialization complete!');
    debugLog('To test: Send a message and check if content before', currentMarker, 'is hidden');
});