// noCoT - 极简调试版本
// 用于定位冷启动卡死问题

console.log('[noCoT] === SCRIPT FILE PARSING START ===');

let extension_settings, saveSettingsDebounced;

try {
    console.log('[noCoT] Attempting to import extensions.js...');
    const extModule = await import('../../../extensions.js');
    extension_settings = extModule.extension_settings;
    console.log('[noCoT] extensions.js imported successfully');
} catch (e) {
    console.error('[noCoT] Failed to import extensions.js:', e);
}

try {
    console.log('[noCoT] Attempting to import script.js...');
    const scriptModule = await import('../../../../script.js');
    saveSettingsDebounced = scriptModule.saveSettingsDebounced;
    console.log('[noCoT] script.js imported successfully');
} catch (e) {
    console.error('[noCoT] Failed to import script.js:', e);
}

console.log('[noCoT] === IMPORTS COMPLETE ===');

const EXTENSION_NAME = "noCoT";
const EXTENSION_FOLDER_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}`;
const DEFAULT_MARKER = "</thinking>";

let currentMarker = DEFAULT_MARKER;
let showIndicator = true;
let showCollapsed = false;
let streamStartTime = null;
let observer = null;

function debugLog(...args) {
    console.log(`[${EXTENSION_NAME}]`, ...args);
}

function loadSettings() {
    try {
        if (!extension_settings) {
            debugLog('extension_settings not available');
            return;
        }

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
        const $marker = jQuery('#stream_hider_marker');
        const $indicator = jQuery('#stream_hider_show_indicator');
        const $collapsed = jQuery('#stream_hider_show_collapsed');

        if ($marker.length) {
            $marker.val(currentMarker).on('input', function () {
                if (extension_settings && extension_settings[EXTENSION_NAME]) {
                    extension_settings[EXTENSION_NAME].marker = jQuery(this).val();
                    currentMarker = jQuery(this).val();
                    if (saveSettingsDebounced) saveSettingsDebounced();
                }
            });
        }

        if ($indicator.length) {
            $indicator.prop('checked', showIndicator).on('change', function () {
                if (extension_settings && extension_settings[EXTENSION_NAME]) {
                    extension_settings[EXTENSION_NAME].indicator = jQuery(this).is(':checked');
                    showIndicator = jQuery(this).is(':checked');
                    if (saveSettingsDebounced) saveSettingsDebounced();
                }
            });
        }

        if ($collapsed.length) {
            $collapsed.prop('checked', showCollapsed).on('change', function () {
                if (extension_settings && extension_settings[EXTENSION_NAME]) {
                    extension_settings[EXTENSION_NAME].showCollapsed = jQuery(this).is(':checked');
                    showCollapsed = jQuery(this).is(':checked');
                    if (saveSettingsDebounced) saveSettingsDebounced();
                }
            });
        }

        debugLog('Settings events bound');
    } catch (e) {
        console.error('[noCoT] bindSettingsEvents error:', e);
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
        console.error('[noCoT] createOrUpdateThinkingWrapper error:', e);
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
        console.error('[noCoT] handleStreamingMessage error:', e);
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
            console.error('[noCoT] Observer error:', e);
        }
    });

    observer.observe(chat, { childList: true, subtree: true, characterData: true });
    debugLog('Observer started');
    return true;
}

// 主入口
console.log('[noCoT] === SETTING UP JQUERY READY ===');

jQuery(function () {
    console.log('[noCoT] === JQUERY READY FIRED ===');

    debugLog('Initializing extension...');
    loadSettings();

    // 加载设置面板
    jQuery.get(`${EXTENSION_FOLDER_PATH}/settings.html`)
        .done(function (html) {
            jQuery('#extensions_settings2').append(html);
            debugLog('Settings panel loaded');
            bindSettingsEvents();
        })
        .fail(function (err) {
            console.error('[noCoT] Failed to load settings panel:', err);
        });

    // 启动观察器
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

console.log('[noCoT] === SCRIPT FILE PARSING END ===');