# noCoT - Stream Content Hider

一个为 SillyTavern 开发的扩展，用于在流式输出中隐藏 AI 的思考过程，只显示最终回复内容。

## ✨ 功能

- 🧠 **自动隐藏思考过程** - 隐藏指定标记（如 `</thinking>`）之前的内容
- ⚡ **实时流式处理** - 无需等待完整响应，边生成边处理
- 🎨 **可自定义占位符** - 显示"思考中..."动画提示
- 💾 **设置自动保存** - 配置会自动持久化

## 📦 安装

### 方法一：通过 SillyTavern 安装（推荐）

1. 打开 SillyTavern 设置 → 扩展 → 安装扩展
2. 输入仓库地址：`https://github.com/your-repo/noCoT`
3. 点击安装
4. 刷新页面

### 方法二：手动安装

1. 克隆或下载此仓库
2. 将文件夹复制到 `data/<user-handle>/extensions/third-party/noCoT`
3. 重启 SillyTavern

## ⚙️ 配置

在 SillyTavern 设置 → 扩展 中找到 **流式隐藏设置**：

| 选项 | 说明 | 默认值 |
|------|------|--------|
| 分割标记 | 在此标记之前的内容将被隐藏 | `</thinking>` |
| 显示占位符 | 是否在隐藏内容时显示"🧠 深度思考中..."提示 | ✅ 启用 |

### 常用标记示例

- `</thinking>` - Claude 等模型的思考标签
- `[START]` - 自定义分割标记
- `---` - 分割线

## 🔧 工作原理

1. 扩展监听 SillyTavern 的流式消息事件
2. 实时检测消息内容中是否包含指定标记
3. 标记出现前：隐藏所有内容，显示"思考中"占位符
4. 标记出现后：移除隐藏状态，只显示标记后的内容

## 📋 兼容性

- SillyTavern 1.12.0+
- 支持所有使用流式输出的 API

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
