import { extension_settings, getContext, saveSettingsDebounced } from "../../../extensions.js";

const EXTENSION_NAME = "stream-hider";
const DEFAULT_MARKER = "</thinking>";

let observer = null;
let currentMarker = DEFAULT_MARKER;
let showIndicator = true;

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
    $('#stream_hider_marker').val(currentMarker).on('input', function () {
        extension_settings[EXTENSION_NAME].marker = $(this).val();
        currentMarker = $(this).val();
        saveSettingsDebounced();
    });

    $('#stream_hider_show_indicator').prop('checked', showIndicator).on('change', function () {
        extension_settings[EXTENSION_NAME].indicator = $(this).is(':checked');
        showIndicator = $(this).is(':checked');
        saveSettingsDebounced();
    });
}

/**
 * 核心处理函数：处理正在生成的消息
 */
function handleStreamingMessage(targetDiv) {
    // 此时的 innerHTML 包含了 markdown 渲染后的 HTML 或 正在生成的原始文本
    let rawHtml = targetDiv.innerHTML;
    let rawText = targetDiv.innerText; // 用于检测标记，避免 HTML 标签干扰

    // 检查标记是否存在
    const markerIndex = rawHtml.indexOf(currentMarker);

    if (markerIndex === -1) {
        // 阶段 A: 标记还没出来 (例如正在输出思考过程)
        // 添加 CSS 类来隐藏内容
        targetDiv.classList.add('waiting-for-marker');
        if (showIndicator) {
            targetDiv.classList.add('show-indicator');
        }
    } else {
        // 阶段 B: 标记已经出现了！

        // 1. 移除隐藏状态的 CSS，让它恢复可见
        targetDiv.classList.remove('waiting-for-marker');
        targetDiv.classList.remove('show-indicator');

        // 2. 截取内容：只保留标记之后的部分
        // 注意：split 可能会破坏未闭合的 HTML 标签，但在流式输出中这是常见的妥协
        // 我们使用 split 来获取标记后的部分
        const parts = rawHtml.split(currentMarker);

        if (parts.length > 1) {
            // parts[0] 是隐藏内容，parts[1] 是正文
            // 我们只保留 parts[1] 及其之后的所有内容（防止标记在文中多次出现）
            const newContent = parts.slice(1).join(currentMarker);

            // 只有当内容确实不同时才修改 DOM，避免光标跳动
            // 这里的比较需要谨慎，防止死循环
            if (targetDiv.innerHTML !== newContent) {
                targetDiv.innerHTML = newContent;
            }
        }
    }
}

jQuery(document).ready(function () {
    loadSettings();

    // 创建观察者
    observer = new MutationObserver((mutations) => {
        // 我们只关心最后一个消息气泡的变化（正在生成的那个）
        const lastMessage = document.querySelector('.last_mes .mes_text');

        if (lastMessage) {
            // 检查这是否是用户的消息（通常我们只处理 AI 的回复）
            // 可以通过父级元素的属性来判断，或者默认都处理
            handleStreamingMessage(lastMessage);
        }
    });

    // 开始监听聊天区域
    const chatContainer = document.querySelector('#chat');
    if (chatContainer) {
        observer.observe(chatContainer, {
            childList: true,   // 监听子元素添加
            subtree: true,     // 监听深层变化
            characterData: true // 监听文字内容变化
        });
    }

    console.log('Stream Hider Loaded. Marker:', currentMarker);
});