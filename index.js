// noCoT - Stream Content Hider Extension
// 标准 ES 模块格式，兼容 SillyTavern 扩展加载器

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

function debugLog(...args) {
    if (DEBUG) console.log(`[${EXTENSION_NAME}]`, ...args);
}

function debugError(...args) {
    console.error(`[${EXTENSION_NAME}]`, ...args);
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
        debugError('loadSettings error:', e);
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
        debugError('bindSettingsEvents error:', e);
    }
}

function getThinkingDurationText() {
    if (!streamStartTime) return '思考中...';
    const seconds = Math.round((Date.now() - streamStartTime) / 1000);
    return `思考了 ${seconds} 秒`;
}

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

            wrapper.querySelector('.noCoT-thinking-toggle').onclick = function () {
                this.classList.toggle('expanded');
                wrapper.querySelector('.noCoT-thinking-content').classList.toggle('expanded');
            };

            targetDiv.innerHTML = '';
            targetDiv.appendChild(wrapper);

            const mainDiv = document.createElement('div');
            mainDiv.className = 'noCoT-main-content';
            targetDiv.appendChild(mainDiv);
        }

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
    } catch (e) {
        debugError('createOrUpdateThinkingWrapper error:', e);
        return null;
    }
}

function handleStreamingMessage(targetDiv) {
    if (!targetDiv) return;

    try {
        const rawHtml = targetDiv.innerHTML;
        if (!rawHtml || rawHtml.length < 3) return;

        const markerIndex = rawHtml.indexOf(currentMarker);

        if (markerIndex === -1) {
            if (showCollapsed) {
                if (!streamStartTime) streamStartTime = Date.now();
                createOrUpdateThinkingWrapper(targetDiv, rawHtml, true);
            } else {
                if (!targetDiv.classList.contains('waiting-for-marker')) {
                    targetDiv.classList.add('waiting-for-marker', 'hide-mode');
                    if (showIndicator) targetDiv.classList.add('show-indicator');
                }
            }
        } else {
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
    } catch (e) {
        debugError('handleStreamingMessage error:', e);
    }
}

function startObserver() {
    if (observer) return true;

    const chat = document.getElementById('chat');
    if (!chat) return false;

    observer = new MutationObserver(function () {
        try {
            const lastMsg = document.querySelector('.last_mes .mes_text');
            if (lastMsg) handleStreamingMessage(lastMsg);
        } catch (e) {
            debugError('Observer callback error:', e);
        }
    });

    observer.observe(chat, { childList: true, subtree: true, characterData: true });
    debugLog('Observer started');
    return true;
}

// 主入口 - 使用 jQuery ready
jQuery(function () {
    debugLog('Initializing extension...');

    // 加载设置
    loadSettings();

    // 加载设置面板
    $.get(`${EXTENSION_FOLDER_PATH}/settings.html`)
        .done(function (html) {
            $('#extensions_settings2').append(html);
            debugLog('Settings panel loaded');
            bindSettingsEvents();
        })
        .fail(function (err) {
            debugError('Failed to load settings panel:', err);
        });

    // 启动观察器（带重试）
    if (!startObserver()) {
        let retries = 0;
        const retryTimer = setInterval(function () {
            if (startObserver() || ++retries > 30) {
                clearInterval(retryTimer);
            }
        }, 1000);
    }

    debugLog('Extension initialized! Marker:', currentMarker);
});