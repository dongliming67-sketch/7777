# Cosmic拆分智能体

基于AI的COSMIC功能规模度量拆分工具，支持多种文档格式导入和Excel导出。

## 功能特性

- 🤖 **AI智能拆分**: 集成智谱GLM、OpenAI、DeepSeek等大语言模型，智能分析功能过程
- 📄 **多格式导入**: 支持 .docx、.txt、.md 格式文档导入，支持拖拽上传
- 📊 **Excel导出**: 一键导出标准Cosmic拆分结果表格
- 💬 **流式对话**: 支持与AI进行多轮对话，实时显示分析过程
- 📋 **表格预览**: 可视化表格预览，支持数据移动类型高亮显示
- 📈 **统计分析**: 实时显示CFP点数、E/R/W/X分布统计
- 🆓 **免费API**: 推荐使用智谱GLM-4-Flash，完全免费、无限tokens

## 快速开始

### 1. 安装依赖

```bash
npm install
cd client && npm install
```

或一键安装：
```bash
npm run install-all
```

### 2. 配置API密钥（推荐免费方案）

**推荐使用智谱GLM-4-Flash（免费、无限tokens、永久有效）**

1. 访问 https://bigmodel.cn 注册账号
2. 在控制台获取API Key
3. 编辑 `.env` 文件：

```env
OPENAI_API_KEY=你的智谱API密钥
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
OPENAI_MODEL=glm-4-flash
```

**其他支持的API服务：**
| 服务商 | Base URL | 免费额度 |
|--------|----------|----------|
| 智谱GLM | https://open.bigmodel.cn/api/paas/v4 | 无限 |
| SiliconCloud | https://api.siliconflow.cn/v1 | 有限免费 |
| OpenAI | https://api.openai.com/v1 | 付费 |
| DeepSeek | https://api.deepseek.com/v1 | 付费 |
| 豆包/火山方舟 | https://ark.cn-beijing.volces.com/api/v3 | 50万tokens |

### 3. 启动应用

```bash
npm run dev
```

访问 http://localhost:5173

## 使用说明

1. **上传文档**: 点击上传区域或直接拖拽文件（支持 .docx, .txt, .md）
2. **AI分析**: 系统自动解析文档内容并调用AI进行Cosmic拆分
3. **交互优化**: 通过对话框与AI交互，调整拆分结果
4. **查看表格**: 点击"查看表格"按钮预览结构化数据
5. **导出Excel**: 点击"导出Excel"按钮下载结果

## 技术栈

- **前端**: React 18 + Vite + TailwindCSS + Lucide Icons
- **后端**: Node.js + Express
- **AI**: OpenAI兼容API（智谱GLM、OpenAI、DeepSeek等）
- **文档处理**: mammoth (Word) + exceljs (Excel)

## 项目结构

```
cosmic拆分智能体/
├── server/
│   └── index.js          # 后端API服务
├── client/
│   ├── src/
│   │   ├── App.jsx       # 主应用组件
│   │   ├── main.jsx      # 入口文件
│   │   └── index.css     # 样式文件
│   └── package.json
├── .env                  # API配置文件
├── package.json
└── README.md
```

## Cosmic方法论

COSMIC功能过程方法通过识别"数据移动"来度量软件规模：

| 类型 | 名称 | 说明 |
|------|------|------|
| **E** | Entry/输入 | 外部→系统内部，数据首次进入功能过程 |
| **R** | Read/读 | 从永久性存储读取已有数据 |
| **W** | Write/写 | 向永久性存储写入新生成或修改的数据 |
| **X** | eXit/输出 | 系统内部→外部，功能过程的最终结果 |

每个数据移动计为1个CFP（COSMIC功能规模单位）。

### 拆分规则

- 每个功能过程的第一个子过程必须为 **E**，最后一个必须为 **X**
- 顺序：E(1个) → R(≥1个) → W(≥1个) → X(1个)
- 一个功能过程中只能有1个E和1个X

## 常见问题

**Q: 文档解析失败怎么办？**
A: 请确保文件是有效的 .docx 格式（不支持旧版 .doc），或尝试使用 .txt/.md 格式。

**Q: 如何获取免费API？**
A: 推荐使用智谱GLM，访问 https://bigmodel.cn 注册即可获取免费API Key。

**Q: 拖拽上传不工作？**
A: 请确保将文件拖拽到上传区域内，松开鼠标后会自动上传。
