// noCoT - Stream Content Hider Extension
// 修复了 MutationObserver 无限循环导致的内存溢出问题

import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const EXTENSION_NAME = "noCoT";
const EXTENSION_FOLDER_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}`;
const DEFAULT_MARKER = "</thinking>";
const DEBUG = true;

let currentMarker = DEFAULT_MARKER;
let showIndicator = true;
let showCollapsed = false;
let streamStartTime = null;
let observer = null;

// 防重入锁 - 防止 MutationObserver 无限循环
let isProcessing = false;

function debugLog(...args) {
    if (DEBUG) console.log(`[${EXTENSION_NAME}]`, ...args);
}

function loadSettings() {
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
        $('#stream_hider_marker')
            .val(currentMarker)
            .off('input.noCoT')
            .on('input.noCoT', function () {
                extension_settings[EXTENSION_NAME].marker = $(this).val();
                currentMarker = $(this).val();
                saveSettingsDebounced();
            });

        $('#stream_hider_show_indicator')
            .prop('checked', showIndicator)
            .off('change.noCoT')
            .on('change.noCoT', function () {
                extension_settings[EXTENSION_NAME].indicator = $(this).is(':checked');
                showIndicator = $(this).is(':checked');
                saveSettingsDebounced();
            });

        $('#stream_hider_show_collapsed')
            .prop('checked', showCollapsed)
            .off('change.noCoT')
            .on('change.noCoT', function () {
                extension_settings[EXTENSION_NAME].showCollapsed = $(this).is(':checked');
                showCollapsed = $(this).is(':checked');
                saveSettingsDebounced();
            });
    } catch (e) {
        console.error('[noCoT] bindSettingsEvents error:', e);
    }
}

function getThinkingDurationText() {
    if (!streamStartTime) return '思考中...';
    const seconds = Math.round((Date.now() - streamStartTime) / 1000);
    return `思考了 ${seconds} 秒`;
}

function createThinkingWrapper(thinkingContent, isStreaming) {
    const wrapper = document.createElement('div');
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

    wrapper.querySelector('.noCoT-thinking-toggle').onclick = function () {
        this.classList.toggle('expanded');
        wrapper.querySelector('.noCoT-thinking-content').classList.toggle('expanded');
    };

    const thinkingText = wrapper.querySelector('.thinking-text');
    if (thinkingText) {
        thinkingText.textContent = thinkingContent.replace(/<[^>]*>/g, '');
    }

    return wrapper;
}

function handleStreamingMessage(targetDiv) {
    if (!targetDiv) return;

    // 防重入检查 - 避免无限循环
    if (isProcessing) return;

    // 检查是否已经被处理过（有我们的标记）
    if (targetDiv.dataset.noCoTProcessed === 'true') {
        // 只更新思考时长，不修改 DOM 结构
        const toggleText = targetDiv.querySelector('.noCoT-thinking-toggle .toggle-text');
        if (toggleText && streamStartTime) {
            toggleText.textContent = getThinkingDurationText();
        }
        return;
    }

    try {
        const rawHtml = targetDiv.innerHTML;
        if (!rawHtml || rawHtml.length < 3) return;

        const markerIndex = rawHtml.indexOf(currentMarker);

        if (markerIndex === -1) {
            // 标记还没出现
            if (showCollapsed) {
                // 折叠模式
                if (!streamStartTime) streamStartTime = Date.now();

                // 检查是否需要创建 wrapper
                if (!targetDiv.querySelector('.noCoT-thinking-wrapper')) {
                    isProcessing = true;

                    const wrapper = createThinkingWrapper(rawHtml, true);
                    const mainDiv = document.createElement('div');
                    mainDiv.className = 'noCoT-main-content';

                    targetDiv.innerHTML = '';
                    targetDiv.appendChild(wrapper);
                    targetDiv.appendChild(mainDiv);
                    targetDiv.dataset.noCoTProcessed = 'true';

                    isProcessing = false;
                }
            } else {
                // 隐藏模式
                if (!targetDiv.classList.contains('waiting-for-marker')) {
                    targetDiv.classList.add('waiting-for-marker', 'hide-mode');
                    if (showIndicator) targetDiv.classList.add('show-indicator');
                }
            }
        } else {
            // 标记已出现 - 最终处理
            isProcessing = true;

            targetDiv.classList.remove('waiting-for-marker', 'hide-mode', 'show-indicator');
            targetDiv.dataset.noCoTProcessed = 'true';

            const parts = rawHtml.split(currentMarker);
            const thinkingContent = parts[0];
            const mainContent = parts.slice(1).join(currentMarker);

            if (showCollapsed && thinkingContent.trim()) {
                const wrapper = createThinkingWrapper(thinkingContent, false);
                const mainDiv = document.createElement('div');
                mainDiv.className = 'noCoT-main-content';
                mainDiv.innerHTML = mainContent;

                targetDiv.innerHTML = '';
                targetDiv.appendChild(wrapper);
                targetDiv.appendChild(mainDiv);
            } else {
                targetDiv.innerHTML = mainContent;
            }

            streamStartTime = null;
            isProcessing = false;
        }
    } catch (e) {
        isProcessing = false;
        console.error('[noCoT] handleStreamingMessage error:', e);
    }
}

function startObserver() {
    if (observer) return true;

    const chat = document.getElementById('chat');
    if (!chat) return false;

    observer = new MutationObserver(function (mutations) {
        // 防重入检查
        if (isProcessing) return;

        try {
            const lastMsg = document.querySelector('.last_mes .mes_text');
            if (lastMsg) {
                handleStreamingMessage(lastMsg);
            }
        } catch (e) {
            console.error('[noCoT] Observer error:', e);
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

// 主入口
jQuery(function () {
    debugLog('Initializing extension...');

    loadSettings();

    $.get(`${EXTENSION_FOLDER_PATH}/settings.html`)
        .done(function (html) {
            $('#extensions_settings2').append(html);
            debugLog('Settings panel loaded');
            bindSettingsEvents();
        })
        .fail(function (err) {
            console.error('[noCoT] Failed to load settings panel:', err);
        });

    if (!startObserver()) {
        let retries = 0;
        const timer = setInterval(function () {
            if (startObserver() || ++retries > 30) {
                clearInterval(timer);
            }
        }, 1000);
    }

    debugLog('Extension initialized! Marker:', currentMarker);
});