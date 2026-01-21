// noCoT - Stream Content Hider Extension
// 不使用 IIFE，以便访问 SillyTavern 全局变量

const noCoT = {
    EXTENSION_NAME: "noCoT",
    EXTENSION_FOLDER_PATH: "scripts/extensions/third-party/noCoT",
    DEFAULT_MARKER: "</thinking>",
    DEBUG: true,

    extension_settings: null,
    saveSettingsDebounced: null,
    currentMarker: "</thinking>",
    showIndicator: true,
    showCollapsed: false,
    observer: null,
    isProcessing: false,

    debugLog: function (...args) {
        if (this.DEBUG) console.log(`[${this.EXTENSION_NAME}]`, ...args);
    },

    loadSettings: function () {
        if (!this.extension_settings) return;

        try {
            if (!this.extension_settings[this.EXTENSION_NAME]) {
                this.extension_settings[this.EXTENSION_NAME] = {
                    marker: this.DEFAULT_MARKER,
                    indicator: true,
                    showCollapsed: false
                };
            }

            const settings = this.extension_settings[this.EXTENSION_NAME];
            this.currentMarker = settings.marker || this.DEFAULT_MARKER;
            this.showIndicator = settings.indicator !== false;
            this.showCollapsed = settings.showCollapsed === true;

            this.debugLog('Settings loaded');
        } catch (e) {
            console.error('[noCoT] loadSettings error:', e);
        }
    },

    bindSettingsEvents: function () {
        const self = this;

        jQuery('#stream_hider_marker').val(this.currentMarker).on('input', function () {
            if (self.extension_settings && self.extension_settings[self.EXTENSION_NAME]) {
                self.extension_settings[self.EXTENSION_NAME].marker = jQuery(this).val();
                self.currentMarker = jQuery(this).val();
                if (self.saveSettingsDebounced) self.saveSettingsDebounced();
            }
        });

        jQuery('#stream_hider_show_indicator').prop('checked', this.showIndicator).on('change', function () {
            if (self.extension_settings && self.extension_settings[self.EXTENSION_NAME]) {
                self.extension_settings[self.EXTENSION_NAME].indicator = jQuery(this).is(':checked');
                self.showIndicator = jQuery(this).is(':checked');
                if (self.saveSettingsDebounced) self.saveSettingsDebounced();
            }
        });

        jQuery('#stream_hider_show_collapsed').prop('checked', this.showCollapsed).on('change', function () {
            if (self.extension_settings && self.extension_settings[self.EXTENSION_NAME]) {
                self.extension_settings[self.EXTENSION_NAME].showCollapsed = jQuery(this).is(':checked');
                self.showCollapsed = jQuery(this).is(':checked');
                if (self.saveSettingsDebounced) self.saveSettingsDebounced();
            }
        });
    },

    handleMessageReceived: function (data) {
        this.debugLog('=== handleMessageReceived ===');
        this.debugLog('data type:', typeof data);
        this.debugLog('data:', data);

        // 处理不同格式的数据
        let rawContent;
        if (typeof data === 'string') {
            rawContent = data;
        } else if (typeof data === 'number') {
            // data 是消息索引，需要从 chat 数组获取内容
            if (this.chat && this.chat[data]) {
                rawContent = this.chat[data].mes;
                this.debugLog('Got content from chat array at index', data);
            } else {
                this.debugLog('Cannot find message at index', data, 'in chat array');
                // 尝试从 DOM 获取
                const lastMesText = document.querySelector('.last_mes .mes_text');
                if (lastMesText) {
                    rawContent = lastMesText.textContent || lastMesText.innerText;
                    this.debugLog('Got content from DOM instead');
                } else {
                    return;
                }
            }
        } else if (data && data.mes) {
            rawContent = data.mes;
        } else if (data && typeof data === 'object') {
            rawContent = data.message || data.content || data.text || JSON.stringify(data);
        } else {
            this.debugLog('Cannot extract message content from data');
            return;
        }

        if (!rawContent) {
            this.debugLog('rawContent is empty');
            return;
        }

        this.debugLog('Raw content (first 500 chars):', rawContent.substring(0, 500));
        this.debugLog('Looking for marker:', this.currentMarker);

        const markerIndex = rawContent.indexOf(this.currentMarker);
        this.debugLog('Marker found:', markerIndex !== -1, 'at index:', markerIndex);

        if (markerIndex === -1) {
            this.debugLog('Marker not found in message');
            return;
        }

        // 找到标记，提取内容
        const thinkingContent = rawContent.substring(0, markerIndex);
        const mainContent = rawContent.substring(markerIndex + this.currentMarker.length);

        this.debugLog('Thinking content length:', thinkingContent.length);
        this.debugLog('Main content (first 200 chars):', mainContent.substring(0, 200));

        // 更新最后一条消息的显示
        const self = this;
        setTimeout(function () {
            self.updateLastMessageDisplay(thinkingContent, mainContent);
        }, 100);
    },

    updateLastMessageDisplay: function (thinkingContent, mainContent) {
        const lastMesText = document.querySelector('.last_mes .mes_text');
        if (!lastMesText) {
            this.debugLog('Could not find last message text element');
            return;
        }

        if (lastMesText.dataset.noCoTDone === 'true') {
            this.debugLog('Message already processed');
            return;
        }

        this.isProcessing = true;
        lastMesText.classList.remove('waiting-for-marker', 'hide-mode', 'show-indicator');
        lastMesText.dataset.noCoTDone = 'true';

        this.debugLog('Updating message display, showCollapsed:', this.showCollapsed);

        if (this.showCollapsed && thinkingContent.trim()) {
            // 折叠模式
            const escapedThinking = thinkingContent
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            // 获取当前渲染后的内容并移除思考部分
            const currentHtml = lastMesText.innerHTML;
            const escapedMarker = this.currentMarker.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const markerInHtml = currentHtml.indexOf(escapedMarker);
            const displayContent = markerInHtml !== -1 ? currentHtml.substring(markerInHtml + escapedMarker.length) : currentHtml;

            lastMesText.innerHTML = '<div class="noCoT-thinking-wrapper">' +
                '<button class="noCoT-thinking-toggle" type="button" onclick="this.classList.toggle(\'expanded\');this.nextElementSibling.classList.toggle(\'expanded\');">' +
                '<span class="toggle-text">查看思考过程</span><span class="toggle-icon">▼</span></button>' +
                '<div class="noCoT-thinking-content"><div class="thinking-text">' + escapedThinking + '</div></div></div>' +
                '<div class="noCoT-main-content">' + displayContent + '</div>';
            this.debugLog('Applied collapsed mode');
        } else {
            // 隐藏模式 - 移除思考部分
            const currentHtml = lastMesText.innerHTML;
            const escapedMarker = this.currentMarker.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const markerInHtml = currentHtml.indexOf(escapedMarker);
            if (markerInHtml !== -1) {
                lastMesText.innerHTML = currentHtml.substring(markerInHtml + escapedMarker.length);
                this.debugLog('Applied hide mode - removed thinking content');
            }
        }

        this.isProcessing = false;
    },

    handleStreamingMessage: function (targetDiv) {
        if (!targetDiv || this.isProcessing) return;
        if (targetDiv.dataset.noCoTDone === 'true') {
            targetDiv.classList.remove('waiting-for-marker', 'hide-mode', 'show-indicator');
            return;
        }

        const html = targetDiv.innerHTML;
        if (!html || html.length < 5) return;

        const escapedMarker = this.currentMarker.replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (html.indexOf(escapedMarker) !== -1) {
            targetDiv.classList.remove('waiting-for-marker', 'hide-mode', 'show-indicator');
            return;
        }

        if (!this.showCollapsed) {
            if (!targetDiv.classList.contains('waiting-for-marker')) {
                targetDiv.classList.add('waiting-for-marker', 'hide-mode');
                if (this.showIndicator) targetDiv.classList.add('show-indicator');
            }
        }
    },

    startObserver: function () {
        if (this.observer) return true;

        const chat = document.getElementById('chat');
        if (!chat) return false;

        const self = this;
        this.observer = new MutationObserver(function () {
            if (self.isProcessing) return;
            const msg = document.querySelector('.last_mes .mes_text');
            if (msg) self.handleStreamingMessage(msg);
        });

        this.observer.observe(chat, { childList: true, subtree: true, characterData: true });
        this.debugLog('Observer started');
        return true;
    },

    init: function () {
        const self = this;
        this.debugLog('Initializing...');

        // 动态加载模块，包括 eventSource 和 event_types
        import('../../../extensions.js').then(function (mod) {
            self.extension_settings = mod.extension_settings;
            return import('../../../../script.js');
        }).then(function (mod) {
            self.saveSettingsDebounced = mod.saveSettingsDebounced;

            // 尝试从 script.js 模块获取 eventSource、event_types 和 chat
            self.eventSource = mod.eventSource;
            self.event_types = mod.event_types;
            self.chat = mod.chat;

            self.debugLog('Modules loaded');
            self.debugLog('mod.chat:', mod.chat);
            self.debugLog('mod.chat length:', mod.chat ? mod.chat.length : 'N/A');

            self.postInit();
        }).catch(function (err) {
            console.error('[noCoT] Module load error:', err);
        });
    },

    postInit: function () {
        const self = this;
        this.loadSettings();

        fetch('/' + this.EXTENSION_FOLDER_PATH + '/settings.html')
            .then(function (r) { return r.text(); })
            .then(function (html) {
                const container = document.getElementById('extensions_settings2');
                if (container) {
                    container.insertAdjacentHTML('beforeend', html);
                    self.debugLog('Settings panel loaded');
                    self.bindSettingsEvents();
                }
            })
            .catch(function (e) {
                console.error('[noCoT] Settings panel error:', e);
            });

        // 注册消息接收事件 - 使用从模块导入的 eventSource
        this.debugLog('self.eventSource:', this.eventSource);
        this.debugLog('self.event_types:', this.event_types);

        if (this.eventSource && this.event_types) {
            // 监听多个事件来调试
            const eventsToListen = [
                'MESSAGE_RECEIVED',
                'MESSAGE_SENT',
                'GENERATION_ENDED',
                'STREAM_TOKEN_RECEIVED',
                'CHARACTER_MESSAGE_RENDERED'
            ];

            for (const eventName of eventsToListen) {
                if (this.event_types[eventName]) {
                    this.eventSource.on(this.event_types[eventName], function (data) {
                        self.debugLog('Event fired:', eventName, 'data:', data);
                        if (eventName === 'MESSAGE_RECEIVED' || eventName === 'GENERATION_ENDED' || eventName === 'CHARACTER_MESSAGE_RENDERED') {
                            self.handleMessageReceived(data);
                        }
                    });
                    this.debugLog('Registered', eventName, '=', this.event_types[eventName]);
                }
            }

            // 列出所有可用的事件类型
            this.debugLog('All available event_types:', Object.keys(this.event_types));
        } else {
            this.debugLog('eventSource not available from module, will use observer only');
        }

        // 启动观察器
        if (!this.startObserver()) {
            let tries = 0;
            const timer = setInterval(function () {
                if (self.startObserver() || ++tries > 20) clearInterval(timer);
            }, 500);
        }

        this.debugLog('Initialized! Marker:', this.currentMarker);
    }
};

// 页面加载后初始化
jQuery(document).ready(function () {
    setTimeout(function () {
        noCoT.init();
    }, 100);
});