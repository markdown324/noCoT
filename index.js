import { extension_settings, saveSettingsDebounced } from "../../../extensions.js";
import { eventSource, event_types } from "../../../../script.js";

const EXTENSION_NAME = "stream-hider";
const DEFAULT_MARKER = "</thinking>";

// 设置变量
let currentMarker = DEFAULT_MARKER;
let showIndicator = true;

// 跟踪当前正在处理的消息
let isProcessingStream = false;

/**
 * 从设置中加载配置
 */
function loadSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = {
            marker: DEFAULT_MARKER,
            indicator: true
        };
    }

    const settings = extension_settings[EXTENSION_NAME];
    currentMarker = settings.marker || DEFAULT_MARKER;
    showIndicator = settings.indicator !== false;

    // 绑定设置面板的输入事件
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
}

/**
 * 处理流式消息内容
 * @param {Element} targetDiv - 消息内容容器
 */
function handleStreamingMessage(targetDiv) {
    if (!targetDiv) return;

    const rawHtml = targetDiv.innerHTML;
    const markerIndex = rawHtml.indexOf(currentMarker);

    if (markerIndex === -1) {
        // 标记还没出现 - 隐藏内容
        targetDiv.classList.add('waiting-for-marker');
        if (showIndicator) {
            targetDiv.classList.add('show-indicator');
        }
    } else {
        // 标记已出现 - 显示标记后的内容
        targetDiv.classList.remove('waiting-for-marker');
        targetDiv.classList.remove('show-indicator');

        const parts = rawHtml.split(currentMarker);
        if (parts.length > 1) {
            const newContent = parts.slice(1).join(currentMarker);
            if (targetDiv.innerHTML !== newContent) {
                targetDiv.innerHTML = newContent;
            }
        }
    }
}

/**
 * 处理流式 token 接收事件
 */
function handleStreamTokenReceived() {
    isProcessingStream = true;
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
        isProcessingStream = false;
        // 最终处理一次，确保内容正确显示
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
    try {
        const response = await fetch('/scripts/extensions/third-party/noCoT/settings.html');
        if (response.ok) {
            const html = await response.text();
            $('#extensions_settings').append(html);
        }
    } catch (error) {
        console.error('Stream Hider: Failed to load settings panel', error);
    }
}

/**
 * 初始化扩展
 */
jQuery(async function () {
    // 加载设置面板
    await loadSettingsPanel();

    // 加载设置
    loadSettings();

    // 注册事件监听器
    eventSource.on(event_types.STREAM_TOKEN_RECEIVED, handleStreamTokenReceived);
    eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);

    // 降级方案：如果事件不可用，使用 MutationObserver
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
    }

    console.log('Stream Hider Loaded. Marker:', currentMarker);
});