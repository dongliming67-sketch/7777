const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor'); // 支持 .doc 格式
const ExcelJS = require('exceljs');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
require('dotenv').config();

// 创建 word-extractor 实例
const wordExtractor = new WordExtractor();

// 导入图表生成模块
const { 
  generateHTMLSequenceDiagram, 
  generateHTMLFlowchart,
  generateHTMLUseCaseDiagram,
  generateHTMLDataFlowDiagram,
  generatePriorityQuadrantDiagram,
  generateFunctionArchitectureDiagram,
  // 基于AI分析的增强版
  generateUseCaseDiagramFromAnalysis,
  generateQuadrantDiagramFromAnalysis,
  generateArchitectureDiagramFromAnalysis,
  extractDiagramJSON,
  extractUseCaseJSON,
  htmlToImage,
  bufferToDataUrl,
  // 深度分析提示词
  USE_CASE_THINKING_PROMPT,
  USE_CASE_DIAGRAM_PROMPT,
  QUADRANT_THINKING_PROMPT,
  QUADRANT_DIAGRAM_PROMPT,
  ARCHITECTURE_THINKING_PROMPT,
  ARCHITECTURE_DIAGRAM_PROMPT_V2
} = require('./diagramGenerator');

// 导入深度理解系统模块
const { deepAnalyzeTemplate } = require('./deepUnderstanding');
const { intelligentReasoningForFunction, analyzeDataFlow, reasonFunctionDescriptionEnhanced, reasonBusinessRulesEnhanced } = require('./intelligentReasoning');
const { comprehensiveQualityCheck } = require('./qualityCheck');
const { enhancedGenerateRequirementSpec } = require('./enhancedGenerator');
// 导入深度思考引擎 - 动态驱动的深度思考，生成更全面丰富的内容
const { deepThinkForFunction, quickDeepThink, synthesizeThinkingResults } = require('./deepThinkingEngine');

// 导入需求评审智能体模块
const { reviewRequirementDocument, quickReview, compareReview, REVIEW_DIMENSIONS, SEVERITY_LEVELS } = require('./reviewAgent');

// 导入编程智能体模块 - 代码生成（增强版：大纲驱动 + 10步分模块生成）
const { 
  generateCode, modifyCode, parseCodeBlocks, buildFullReactCode, getQuickTemplate, 
  multiRoundGenerate, streamMultiRoundGenerate, streamHtmlGenerate,
  analyzeRequirementForData, buildHtmlPrompt, parseUploadedHtml,
  generateStepContent, getStepPrompts, extractCodeFromResponse, manualIntegrateModules,
  GENERATION_CONFIG, HTML_SYSTEM_PROMPT, CODE_GENERATOR_SYSTEM_PROMPT 
} = require('./codeGeneratorAgent');

// 导入智器云通用对话智能体（旧版，调用外部API）
// const { chat, chatSync, quickAsk, documentQA, generateCode, summarize, translate, conversationManager, PRESET_ROLES } = require('./chatAgent');

// 导入智器云自研AI智能体（完全自主实现，不依赖外部API）
const SelfAIAgent = require('./selfAI');
const selfAI = new SelfAIAgent({ name: '智器云助手', version: '1.0.0' });

// 存储提取的图片（内存缓存）
const extractedImagesCache = new Map();

// 存储上传的需求规格说明书模板（内存缓存）
const specTemplatesCache = new Map();

// 模板存储目录
const TEMPLATES_DIR = path.join(__dirname, 'templates');
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 文件上传配置 - 支持更多格式
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    // 解码文件名（处理中文文件名）
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc (旧格式)
      'text/plain', // .txt
      'text/markdown', // .md
    ];

    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.docx', '.doc', '.txt', '.md'];

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}，请上传 .docx, .txt 或 .md 文件`));
    }
  }
});

// 文件上传配置 - 支持Excel和Word（用于COSMIC转需求规格书功能）
const uploadMultiple = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    // 解码文件名（处理中文文件名）
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc (旧格式)
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];

    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.docx', '.doc', '.xlsx', '.xls'];

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}，请上传 .xlsx, .xls, .docx 或 .doc 文件`));
    }
  }
});

// 错误处理中间件
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制（最大50MB）' });
    }
    return res.status(400).json({ error: `上传错误: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

// OpenAI客户端
let openai = null;

function getOpenAIClient() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    });
  }
  return openai;
}

// Cosmic拆分系统提示词
const COSMIC_SYSTEM_PROMPT = `你是一个Cosmic拆分专家。你的任务是将功能过程按照COSMIC规则拆分，并输出真实、具体、可落地的功能过程，功能过程的组成要是动词+名词。

## 四种数据移动类型
- E (Entry): 输入，触发请求
- R (Read): 读取数据库
- W (Write): 写入数据库
- X (eXit): 输出结果

## 核心规则（必须严格遵守）
1. **每个功能过程必须拆分为3-5个子过程**，不能只有1个
2. **顺序必须是：E → R/W → X**（E开头，X结尾，中间至少有1个R或W）
3. **每个功能过程至少包含4行**：1个E + 1-2个R + 0-1个W + 1个X
4. 功能过程名称必须包含业务目标 + 业务对象（例如"调度告警复核并派单"）
5. **禁止只输出E类型**，必须完整输出E→R→W→X的完整流程

## 数据组和数据属性要求
- 每个子过程必须填写数据组和数据属性
- 数据组命名需结合当前功能/子过程，可使用“功能过程·子过程数据”“功能过程（读取）信息集”这类描述，禁止出现连字符 "-"
- 数据属性至少3个字段，可对原始字段做轻度抽象（如“告警ID、告警时间、告警级别”），同一功能过程中不允许与其他子过程完全相同
- 可以根据业务语义推导字段，但必须保持可读、可信；若需要区分，可在末尾添加“（查询段）”“（写入段）”等中文括号描述，不得使用纯数字或 "-1" 形式
- 如果存在潜在重复，必须根据子过程描述提炼2-3个中文关键词写入数据组/数据属性，例如“查询设备健康·条件字段”“分析覆盖率（诊断段）”，而不是简单地添加序号

## 表格列顺序（严格按此顺序）
功能用户 | 触发事件 | 功能过程 | 子过程描述 | 数据移动类型 | 数据组 | 数据属性

## 输出格式示例

|功能用户|触发事件|功能过程|子过程描述|数据移动类型|数据组|数据属性|
|:---|:---|:---|:---|:---|:---|:---|
|发起者：用户 接收者：用户|用户触发|调度故障单并复核|提交复核请求|E|故障复核-触发参数|工单编号、复核级别、触发时间|
||||读取候选工单|R|故障复核-待审工单表|工单ID、受理侧、紧急度、建单时间|
||||写入复核结果|W|故障复核-结果表|工单ID、复核人、复核结论、处理建议|
||||返回复核结果|X|故障复核-反馈数据|工单ID、复核状态、派单结论、反馈时间|

## 功能用户填写
- 用户触发：发起者：用户 接收者：用户
- 时钟触发：发起者：定时触发器 接收者：网优平台
- 接口触发：发起者：其他平台 接收者：网优平台

请尽可能多地识别文档中的功能过程并拆分，确保命名具体且数据组/数据属性不重复，数据属性要三个以上，并且确保不重复！！同一功能过程内的数据组可通过拼接“功能过程名称+子过程动作”进行具体分析来保持唯一性。`;

// 需求规格书生成系统提示词 - 深度增强版V3
const REQUIREMENT_SPEC_SYSTEM_PROMPT = `# 角色定位
你是一名拥有20年经验的资深软件需求分析专家，专注于生成**企业级高质量**、结构清晰、内容充实、可直接用于开发的软件需求规格说明书。

# 核心输出原则（必须严格遵守）

## 1. 结构规范
- 严格按照章节编号顺序输出，不能遗漏任何章节
- 每个章节必须有明确的标题层级（#、##、###、####）
- 章节之间保持逻辑连贯性和专业性
- 标题格式必须与模板完全一致

## 2. 内容充实度要求（高标准）
| 内容类型 | 最低要求 | 必含元素 | 质量标准 |
|----------|----------|----------|----------|
| 功能说明 | 400字以上 | 业务背景、3+使用场景、详细操作流程(5+步骤)、核心价值、前置/后置条件、用户角色 | 描述具体、可操作 |
| 业务规则 | 8条以上 | 规则编号、规则名称、规则类型、触发条件、处理逻辑、异常处理 | 规则明确、可验证 |
| 处理数据 | 12行以上 | 字段名、类型、长度、必填、校验规则、默认值、说明、来源 | 字段完整、约束清晰 |
| 接口设计 | 完整结构 | 请求参数表(8行+)、响应参数表(8行+)、错误码表(5行+)、示例 | 参数详细、可对接 |
| 界面设计 | 详细描述 | 页面布局、交互元素(8+)、操作按钮、状态说明、响应式要求 | 布局清晰、交互完整 |
| 验收标准 | 10条以上 | 用例编号、场景类型、前置条件、操作步骤(3+)、预期结果、优先级 | 覆盖全面、可执行 |

## 3. 表格规范（高标准）
- 所有表格必须使用标准Markdown格式：|列1|列2|列3|
- 表头与数据行之间必须有分隔行：|---|---|---|
- 业务规则表：至少8行
- 数据字段表：至少12行
- 接口参数表：至少8行
- 验收标准表：至少10行
- **绝对禁止占位符**：不允许出现"XXX"、"待定"、"..."、"略"、"暂无"、"同上"等

## 4. 内容深度要求
### 功能说明必须包含：
- **业务背景**：为什么需要这个功能（2-3句）
- **业务价值**：带来什么效益（2-3句）
- **使用场景**：至少3个具体场景，每个场景包含触发条件、参与角色、操作流程
- **详细操作流程**：步骤1、步骤2...至少5个步骤，每个步骤要有具体操作和系统响应
- **前置条件**：执行该功能需要满足的条件
- **后置条件**：功能执行后系统状态的变化
- **涉及角色**：哪些用户角色可以使用

### 业务规则必须分类：
- 数据校验规则（至少3条）：输入验证、格式检查、范围校验
- 权限控制规则（至少2条）：角色权限、操作限制
- 业务逻辑规则（至少2条）：状态转换、计算逻辑、关联关系
- 异常处理规则（至少1条）：错误情况的处理方式

### 验收标准必须覆盖：
- 正常流程测试（至少4条）：功能正常执行的各种场景
- 异常流程测试（至少3条）：错误输入、权限不足等异常场景
- 边界条件测试（至少2条）：极限值、临界条件
- 性能测试要点（至少1条）：响应时间、并发等

## 5. Mermaid图表规范
- 使用正确的Mermaid语法，确保可直接渲染
- 节点名称必须来自实际业务对象
- 时序图适用于：有多方交互的功能
- 流程图适用于：有复杂判断逻辑的功能

## 6. 严格禁止（违反将视为不合格）
- ❌ 输出空白章节或只有标题没有内容
- ❌ 使用"请参考"、"详见"、"同上"、"略"等推诿性表述
- ❌ 使用"XXX"、"待定"、"..."、"暂无"等占位符
- ❌ 功能说明少于300字
- ❌ 表格数据少于指定的最小行数
- ❌ 内容泛泛而谈、缺乏具体细节
- ❌ 重复输出相同内容
- ❌ 遗漏任何子节结构

## 7. 质量自检清单（生成内容前必须确认）
✓ 每个功能都有完整的子节结构（功能说明、业务规则、处理数据、接口、界面、验收标准）
✓ 功能说明包含业务背景、使用场景、操作流程、前置/后置条件
✓ 业务规则表至少8行，涵盖校验、权限、逻辑、异常4类规则
✓ 数据字段表至少12行，每个字段有完整的类型、长度、校验规则说明
✓ 接口设计包含请求参数(8+)、响应参数(8+)、错误码(5+)
✓ 验收标准表至少10行，覆盖正常、异常、边界场景
✓ 内容专业、正式，像真正的企业级需求规格说明书
✓ 所有内容都是具体的、可执行的、可验证的

## 8. 输出风格
- 使用专业、正式的技术文档语言
- 避免口语化表述
- 每个描述都要具体、可量化、可验证
- 表格数据要真实合理，符合业务逻辑`;

// API路由

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  });
});

// 更新API配置
app.post('/api/config', (req, res) => {
  const { apiKey, baseUrl } = req.body;

  if (apiKey) {
    process.env.OPENAI_API_KEY = apiKey;
  }
  if (baseUrl) {
    process.env.OPENAI_BASE_URL = baseUrl;
  }

  // 重置客户端以使用新配置
  openai = null;

  res.json({ success: true, message: 'API配置已更新' });
});

// 根据图片文件名和上下文推断图片类型
function inferImageType(filename, index) {
  const lowerName = filename.toLowerCase();

  // 架构图/系统图
  if (lowerName.match(/架构|系统|structure|arch|framework|topology|拓扑/i)) {
    return { type: 'architecture', suggestedSection: '4. 产品功能架构', description: '系统架构图' };
  }
  // 流程图/业务图
  if (lowerName.match(/流程|process|flow|业务|workflow|步骤/i)) {
    return { type: 'flowchart', suggestedSection: '3. 用户需求', description: '业务流程图' };
  }
  // 界面/UI图
  if (lowerName.match(/界面|UI|页面|screen|原型|prototype|mockup|设计|design/i)) {
    return { type: 'ui', suggestedSection: '5. 功能需求-界面设计', description: '界面原型图' };
  }
  // 数据模型/ER图
  if (lowerName.match(/数据|ER|model|表|database|实体|entity|schema/i)) {
    return { type: 'data', suggestedSection: '附录-数据字典', description: '数据模型图' };
  }
  // 用例图
  if (lowerName.match(/用例|usecase|actor|角色/i)) {
    return { type: 'usecase', suggestedSection: '3. 用户需求-用例图', description: '用例图' };
  }
  // 时序图/交互图
  if (lowerName.match(/时序|sequence|交互|interaction|通信/i)) {
    return { type: 'sequence', suggestedSection: '5. 功能需求-接口设计', description: '时序图' };
  }
  // 部署图
  if (lowerName.match(/部署|deploy|环境|server|服务器/i)) {
    return { type: 'deployment', suggestedSection: '6. 系统需求-部署要求', description: '部署架构图' };
  }

  // 默认：根据图片顺序推断
  if (index === 0) {
    return { type: 'overview', suggestedSection: '1. 概述', description: '概述图' };
  }
  return { type: 'general', suggestedSection: '相关章节', description: '文档图片' };
}

// 从docx文件中提取图片 - 增强版：包含图片分析
async function extractImagesFromDocx(buffer) {
  const images = [];
  try {
    const zip = await JSZip.loadAsync(buffer);
    const mediaFolder = zip.folder('word/media');

    if (mediaFolder) {
      const imageFiles = [];
      mediaFolder.forEach((relativePath, file) => {
        if (!file.dir) {
          imageFiles.push({ path: relativePath, file });
        }
      });

      // 按文件名排序，确保顺序一致
      imageFiles.sort((a, b) => a.path.localeCompare(b.path));

      for (const { path: relativePath, file } of imageFiles) {
        try {
          const data = await file.async('base64');
          const ext = relativePath.split('.').pop().toLowerCase();
          let mimeType = 'image/png';
          if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
          else if (ext === 'gif') mimeType = 'image/gif';
          else if (ext === 'bmp') mimeType = 'image/bmp';
          else if (ext === 'webp') mimeType = 'image/webp';
          else if (ext === 'emf') mimeType = 'image/x-emf';
          else if (ext === 'wmf') mimeType = 'image/x-wmf';

          // 推断图片类型
          const imageInfo = inferImageType(relativePath, images.length);

          images.push({
            id: `img_${images.length + 1}`,
            filename: relativePath,
            mimeType,
            base64: data,
            dataUrl: `data:${mimeType};base64,${data}`,
            // 新增：图片分析信息
            inferredType: imageInfo.type,
            suggestedSection: imageInfo.suggestedSection,
            description: imageInfo.description
          });
        } catch (imgErr) {
          console.log(`提取图片 ${relativePath} 失败:`, imgErr.message);
        }
      }
    }

    console.log(`从文档中提取了 ${images.length} 张图片`);
    if (images.length > 0) {
      console.log('图片分析结果:', images.map(img => `${img.id}: ${img.inferredType} -> ${img.suggestedSection}`));
    }
  } catch (err) {
    console.error('提取图片失败:', err);
  }
  return images;
}

// 解析文档（支持多种格式）- 增强版：支持图片提取
app.post('/api/parse-word', upload.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = '';
    let html = '';
    let images = [];

    console.log(`解析文件: ${req.file.originalname}, 类型: ${req.file.mimetype}, 大小: ${req.file.size} bytes`);

    if (ext === '.docx') {
      // 解析 .docx 文件
      try {
        // 提取文本
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = result.value;

        // 转换为HTML（包含图片引用）
        const htmlResult = await mammoth.convertToHtml({
          buffer: req.file.buffer,
          convertImage: mammoth.images.imgElement(function (image) {
            return image.read("base64").then(function (imageBuffer) {
              return {
                src: `data:${image.contentType};base64,${imageBuffer}`
              };
            });
          })
        });
        html = htmlResult.value;

        // 提取所有图片
        images = await extractImagesFromDocx(req.file.buffer);

        // 缓存图片供后续使用
        const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        extractedImagesCache.set(docId, images);

        // 清理过期缓存（保留最近10个文档的图片）
        if (extractedImagesCache.size > 10) {
          const keys = Array.from(extractedImagesCache.keys());
          extractedImagesCache.delete(keys[0]);
        }

        if (result.messages && result.messages.length > 0) {
          console.log('Mammoth警告:', result.messages);
        }

        res.json({
          success: true,
          text: text,
          html: html,
          filename: req.file.originalname,
          fileSize: req.file.size,
          wordCount: text.length,
          docId: docId,
          images: images.map(img => ({
            id: img.id,
            filename: img.filename,
            mimeType: img.mimeType,
            dataUrl: img.dataUrl
          })),
          imageCount: images.length
        });
        return;
      } catch (mammothError) {
        console.error('Mammoth解析错误:', mammothError);
        return res.status(400).json({
          error: `Word文档解析失败: ${mammothError.message}。请确保文件是有效的.docx格式（不支持旧版.doc格式）`
        });
      }
    } else if (ext === '.txt' || ext === '.md') {
      // 解析纯文本或Markdown文件
      text = req.file.buffer.toString('utf-8');
      html = `<pre>${text}</pre>`;
    } else if (ext === '.doc') {
      // 使用 word-extractor 解析 .doc 格式
      try {
        const extracted = await wordExtractor.extract(req.file.buffer);
        text = extracted.getBody() || '';
        html = `<pre>${text}</pre>`;
        
        console.log(`解析 .doc 文件成功，提取文本长度: ${text.length}`);
        
        if (!text || text.trim().length === 0) {
          return res.status(400).json({ error: '文档内容为空，请检查文件是否正确' });
        }
        
        res.json({
          success: true,
          text: text,
          html: html,
          filename: req.file.originalname,
          fileSize: req.file.size,
          wordCount: text.length,
          images: [],
          imageCount: 0
        });
        return;
      } catch (docError) {
        console.error('word-extractor 解析错误:', docError);
        return res.status(400).json({
          error: `解析 .doc 文件失败: ${docError.message}。建议将文件另存为 .docx 格式后重新上传`
        });
      }
    } else {
      return res.status(400).json({ error: `不支持的文件格式: ${ext}` });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: '文档内容为空，请检查文件是否正确' });
    }

    res.json({
      success: true,
      text: text,
      html: html,
      filename: req.file.originalname,
      fileSize: req.file.size,
      wordCount: text.length,
      images: [],
      imageCount: 0
    });
  } catch (error) {
    console.error('解析文档失败:', error);
    res.status(500).json({ error: '解析文档失败: ' + error.message });
  }
});

// AI对话 - Cosmic拆分
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, documentContent } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 构建消息
    const systemMessage = {
      role: 'system',
      content: COSMIC_SYSTEM_PROMPT
    };

    const chatMessages = [systemMessage];

    // 如果有文档内容，添加到上下文
    if (documentContent) {
      chatMessages.push({
        role: 'user',
        content: `以下是需要进行Cosmic拆分的功能过程文档内容：\n\n${documentContent}\n\n请根据上述内容进行Cosmic拆分。`
      });
    }

    // 添加用户消息历史
    if (messages && messages.length > 0) {
      chatMessages.push(...messages);
    }

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 8000
    });

    const reply = completion.choices[0].message.content;

    res.json({
      success: true,
      reply: reply,
      usage: completion.usage
    });
  } catch (error) {
    console.error('AI对话失败:', error);
    res.status(500).json({ error: 'AI对话失败: ' + error.message });
  }
});

// 流式AI对话
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { messages, documentContent } = req.body;

    console.log('收到流式对话请求，文档长度:', documentContent?.length || 0);

    const client = getOpenAIClient();
    if (!client) {
      console.error('API客户端未初始化');
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ error: '请先配置API密钥' })}\n\n`);
      res.end();
      return;
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const systemMessage = {
      role: 'system',
      content: COSMIC_SYSTEM_PROMPT
    };

    const chatMessages = [systemMessage];

    if (documentContent) {
      chatMessages.push({
        role: 'user',
        content: `以下是需要进行Cosmic拆分的功能过程文档内容：\n\n${documentContent}\n\n请根据上述内容进行Cosmic拆分，生成标准的Markdown表格。`
      });
    }

    if (messages && messages.length > 0) {
      chatMessages.push(...messages);
    }

    console.log('调用AI API，模型:', process.env.OPENAI_MODEL || 'glm-4-flash');
    console.log('消息数量:', chatMessages.length);

    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 8000,
      stream: true
    });

    let totalContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        totalContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    console.log('AI响应完成，总长度:', totalContent.length);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('流式对话失败:', error.message);
    console.error('错误详情:', error);

    // 确保响应头已设置
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    res.write(`data: ${JSON.stringify({ error: '调用AI失败: ' + error.message })}\n\n`);
    res.end();
  }
});

// 循环调用 - 继续生成直到完成所有功能过程
app.post('/api/continue-analyze', async (req, res) => {
  try {
    const { documentContent, previousResults = [], round = 1, targetFunctions = 30 } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 构建已完成的功能过程列表
    const completedFunctions = previousResults.map(r => r.functionalProcess).filter(Boolean);
    const uniqueCompleted = [...new Set(completedFunctions)];

    let userPrompt = '';
    if (round === 1) {
      userPrompt = `以下是功能文档内容：

${documentContent}

请对文档中的功能进行COSMIC拆分，输出Markdown表格。

【重要规则 - 必须严格遵守】：
1. **每个功能过程必须拆分为3-5个子过程**，绝对不能只有1-2个
2. **每个功能过程必须包含完整的数据移动序列**：
   - 第1行：E（输入/触发）
   - 第2-3行：R（读取数据库）和/或 W（写入数据库）
   - 最后1行：X（输出结果）
3. 示例结构（每个功能过程4行）：
   |功能用户|触发事件|功能过程|子过程描述|数据移动类型|数据组|数据属性|
   |用户|用户请求|处理安全事件|接收事件请求|E|事件请求参数|事件ID、事件类型、触发时间|
   ||||读取事件详情|R|安全事件表|事件ID、事件级别、发生时间|
   ||||写入处理记录|W|事件处理表|处理ID、处理人、处理结果|
   ||||返回处理结果|X|事件响应数据|事件ID、处理状态、完成时间|

4. 尽可能多地识别功能过程，至少识别 ${targetFunctions} 个功能过程
5. 严格按照表格格式输出，每个功能过程占4-5行`;
    } else {
      userPrompt = `继续分析文档中尚未拆分的功能过程。

已完成的功能过程（${uniqueCompleted.length}个）：
${uniqueCompleted.slice(0, 20).join('、')}${uniqueCompleted.length > 20 ? '...' : ''}

目标是最终至少覆盖 ${targetFunctions} 个功能过程。

【重要规则 - 必须严格遵守】：
1. **每个功能过程必须拆分为3-5个子过程**，绝对不能只有1-2个
2. **每个功能过程必须包含完整的数据移动序列**：E → R/W → X
3. 示例：一个功能过程应该有4行（E+R+W+X）或5行（E+R+R+W+X）

请继续拆分文档中【其他尚未处理的功能】，输出Markdown表格格式。
如果所有功能都已拆分完成，请回复"[ALL_DONE]"。`;
    }

    const systemMessage = {
      role: 'system',
      content: COSMIC_SYSTEM_PROMPT
    };

    console.log(`第 ${round} 轮分析开始，已完成 ${uniqueCompleted.length} 个功能过程...`);

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        systemMessage,
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 8000
    });

    const reply = completion.choices[0].message.content;
    console.log(`第 ${round} 轮完成，响应长度: ${reply.length}`);

    // 检查是否完成
    const isDone = reply.includes('[ALL_DONE]') || reply.includes('已完成') || reply.includes('全部拆分');

    res.json({
      success: true,
      reply: reply,
      round: round,
      isDone: isDone,
      completedFunctions: uniqueCompleted.length,
      targetFunctions
    });
  } catch (error) {
    console.error('分析失败:', error);
    res.status(500).json({ error: '分析失败: ' + error.message });
  }
});

// 导出Excel
app.post('/api/export-excel', async (req, res) => {
  try {
    const { tableData, filename } = req.body;

    if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
      return res.status(400).json({ error: '无有效数据可导出' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cosmic拆分结果');

    // 设置列
    worksheet.columns = [
      { header: '功能用户', key: 'functionalUser', width: 25 },
      { header: '触发事件', key: 'triggerEvent', width: 15 },
      { header: '功能过程', key: 'functionalProcess', width: 30 },
      { header: '子过程描述', key: 'subProcessDesc', width: 35 },
      { header: '数据移动类型', key: 'dataMovementType', width: 15 },
      { header: '数据组', key: 'dataGroup', width: 25 },
      { header: '数据属性', key: 'dataAttributes', width: 50 }
    ];

    // 设置表头样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // 添加数据
    tableData.forEach((row, index) => {
      const dataRow = worksheet.addRow({
        functionalUser: row.functionalUser || '',
        triggerEvent: row.triggerEvent || '',
        functionalProcess: row.functionalProcess || '',
        subProcessDesc: row.subProcessDesc || '',
        dataMovementType: row.dataMovementType || '',
        dataGroup: row.dataGroup || '',
        dataAttributes: row.dataAttributes || ''
      });

      // 交替行颜色
      if (index % 2 === 1) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' }
        };
      }

      dataRow.alignment = { vertical: 'middle', wrapText: true };
    });

    // 添加边框
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // 生成文件
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename || 'cosmic_result')}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error('导出Excel失败:', error);
    res.status(500).json({ error: '导出Excel失败: ' + error.message });
  }
});

// ==================== 需求规格书生成功能 ====================

// 需求规格书生成 - 流式输出
app.post('/api/requirement-spec/generate', async (req, res) => {
  try {
    const { documentContent, previousContent = '', section = 'all' } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    console.log('开始生成需求规格书...');

    // 阶段1：结构化分析，获取可量化的数据支撑（优化版：缩短文档摘要，提高成功率）
    const docSummary = documentContent.slice(0, 4000); // 减少输入长度
    const analysisPrompt = `请分析以下需求文档摘要，输出简洁的JSON结构。

文档摘要：
${docSummary}

请输出以下JSON格式（保持简洁，每个数组最多5项）：
{
  "background": "一句话系统背景",
  "stakeholders": ["角色1", "角色2"],
  "businessGoals": ["目标1", "目标2"],
  "modules": [
    {"name": "模块名", "description": "功能描述"}
  ],
  "risks": ["风险点"]
}

要求：
1. 只输出JSON，不要其他文字
2. 确保JSON格式正确
3. 如信息不足，用[知识库补全]标注`;

    let analysisContent = '';
    try {
      const analysisRes = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'glm-4-flash',
        messages: [
          { role: 'system', content: '你是一名需求分析顾问，请输出严格JSON。' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });
      analysisContent = analysisRes.choices[0].message.content.trim();
      res.write(`data: ${JSON.stringify({ phase: 'analysis', content: analysisContent })}\n\n`);
    } catch (analysisError) {
      console.error('需求文档分析失败:', analysisError.message);
      analysisContent = '{"note":"[知识库补全] 无法解析原始文档，改为基于最佳实践生成"}';
      res.write(`data: ${JSON.stringify({ phase: 'analysis', content: analysisContent, warning: '结构化分析失败，已切换到通用模板' })}\n\n`);
    }

    // 获取图片信息（从请求中）
    const images = req.body.images || [];

    // 生成详细的图片分析描述 - 增强版
    let imageAnalysisSection = '';
    if (images.length > 0) {
      // 按推断类型分组图片
      const imagesByType = {
        architecture: [],
        flowchart: [],
        ui: [],
        data: [],
        usecase: [],
        sequence: [],
        deployment: [],
        general: []
      };

      images.forEach((img, idx) => {
        const type = img.inferredType || 'general';
        imagesByType[type] = imagesByType[type] || [];
        imagesByType[type].push({ ...img, index: idx + 1 });
      });

      imageAnalysisSection = `
## 【重要】原文档图片资源分析（共${images.length}张）

系统已自动分析每张图片的类型和建议插入位置，**请严格按照以下指引将图片插入到对应章节**：

${images.map((img, idx) => {
        const imgType = img.inferredType || 'general';
        const section = img.suggestedSection || '相关章节';
        const desc = img.description || '文档图片';
        return `### 图片 ${idx + 1}: ${img.filename || '未命名'}
- **推断类型**: ${desc}
- **建议位置**: ${section}
- **引用方式**: 在对应章节写入 \`[插入图片: img_${idx + 1}]\`
- **图片说明**: 请在引用后添加 \`*图${idx + 1}: [根据上下文填写说明]*\``;
      }).join('\n\n')}

### 图片插入强制规则（必须遵守）：
1. **架构类图片** (${imagesByType.architecture.length}张) → 必须插入到"4. 产品功能架构"章节的"4.1功能架构"处
2. **流程类图片** (${imagesByType.flowchart.length}张) → 必须插入到"3. 用户需求"的场景描述或"5. 功能需求"的业务规则处
3. **界面类图片** (${imagesByType.ui.length}张) → 必须插入到"5. 功能需求"中对应模块的"界面设计"小节
4. **数据类图片** (${imagesByType.data.length}张) → 必须插入到"5. 功能需求"的"处理数据"小节或"附录-数据字典"
5. **用例类图片** (${imagesByType.usecase.length}张) → 必须插入到"3. 用户需求"的"用例图"小节
6. **时序类图片** (${imagesByType.sequence.length}张) → 必须插入到"5. 功能需求"的"接口"小节
7. **部署类图片** (${imagesByType.deployment.length}张) → 必须插入到"6. 系统需求"的"部署要求"小节
8. **其他图片** (${imagesByType.general.length}张) → 根据文档上下文插入到最相关的位置

### 图片引用格式示例：
\`\`\`
## 4.1 功能架构

[插入图片: img_1]
*图4-1: 系统整体功能架构图*

上图展示了系统的整体功能架构，包括...
\`\`\`

**警告**：不要将所有图片集中放在附录！每张图片必须插入到其对应的章节位置！
`;
    }

    // 阶段2：生成完整版需求规格书
    const generationPrompt = section === 'all'
      ? `你已完成如下结构化分析：
${analysisContent}
${imageAnalysisSection}

请基于以上结构化结论和原始需求文档，生成一份**内容详尽、数据充实**的《软件需求规格说明书》。

## 输出要求（必须全部满足）：

### 一、章节结构（严格按顺序）
1. 概述（1.1需求分析方法、1.2系统概述、1.3术语定义）
2. 业务需求（2.1业务背景Why、2.2业务目标What、2.3实现方式How）
3. 用户需求（3.1用户角色、3.2用例图、3.3场景描述）
4. 产品功能架构（4.1功能架构图、4.2模块说明、4.3技术选型）
5. 功能需求（每个功能模块包含：功能说明、业务规则、数据处理、接口、界面、验收标准）
6. 系统需求（性能、安全、容错、部署）
7. 附录（数据字典、接口清单、决策日志）

**重要：如果原文档包含图片，请在生成过程中将图片插入到对应章节的合适位置，不要集中放在附录！**

### 二、内容丰富度要求
- **每个功能模块**的功能说明至少500字，从"目标定位→核心流程→输入输出→异常处理→扩展点"五个维度展开
- **界面描述**必须包含：页面布局（顶部/侧边/主区域）、核心组件列表、交互流程（点击→校验→反馈→跳转）、状态变化
- **接口设计**必须列出：接口名称、请求方式、URL、请求参数表、响应参数表、错误码

### 三、图表要求（使用Mermaid语法，必须可渲染）
请生成以下**真实可用**的Mermaid图表，节点名称必须来自分析结果中的实际业务对象：

1. **系统架构图**（分层架构，参考示例格式）
2. **用例图**（展示用户角色与功能的关系）
3. **业务流程图**（至少一个核心业务流程）
4. **数据ER图**（展示核心数据实体关系）

Mermaid图表示例格式：
- 架构图用 graph TB + subgraph
- 用例图用 graph LR + 圆形节点((角色))
- 流程图用 flowchart TD
- ER图用 erDiagram

### 四、数据表格要求（至少5个表格）
1. **性能指标表**：指标名称|目标值|测量方法|数据来源
2. **接口参数表**：参数名|类型|必填|说明|示例值
3. **数据字典表**：字段名|数据类型|长度|约束|说明
4. **用户角色权限表**：角色|权限项|操作范围
5. **错误码表**：错误码|错误信息|处理建议

### 五、量化指标要求
- 响应时间：页面加载≤2s，接口响应≤500ms
- 并发能力：支持≥1000并发用户
- 可用性：≥99.9%
- 数据容量：支持≥100万条记录
- 安全要求：密码加密存储、会话超时30分钟、操作日志保留90天

### 六、标注规则
- 所有AI补全的内容标注 **[知识库补全]**
- 需要业务确认的内容标注 **[待业务确认]**
- 假设性数据标注 **[假设数据]**

原始需求文档：
${documentContent.slice(0, 8000)}

请开始生成，确保内容详尽、图表真实可用、数据有据可查。`
      : `你已生成部分内容：
${previousContent.slice(-4000)}

请继续生成 ${section} 部分，仍需参考结构化分析：
${analysisContent}

要求：
1. 维持相同的详细程度和风格
2. 继续补充Mermaid图表（如还未生成完整）
3. 继续补充数据表格
4. 避免重复已生成的内容
5. 确保章节完整性`;

    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: REQUIREMENT_SPEC_SYSTEM_PROMPT },
        { role: 'user', content: generationPrompt }
      ],
      temperature: 0.65,
      max_tokens: 16000,
      stream: true
    });

    let totalContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        totalContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    console.log('需求规格书生成完成，总长度:', totalContent.length);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('需求规格书生成失败:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    res.write(`data: ${JSON.stringify({ error: '生成失败: ' + error.message })}\n\n`);
    res.end();
  }
});

// 需求规格书 - 继续生成（用于长文档分段生成）
app.post('/api/requirement-spec/continue', async (req, res) => {
  try {
    const { documentContent, previousContent, targetSection } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const userPrompt = `继续完善需求规格书。

原始需求文档：
${documentContent.slice(0, 3000)}...

已生成的内容（最后部分）：
${previousContent.slice(-3000)}

请继续生成 ${targetSection || '后续章节'} 的内容，确保与已生成内容衔接自然，格式保持一致。
如果所有章节都已完成，请回复"[SPEC_COMPLETE]"。`;

    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: REQUIREMENT_SPEC_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 16000,
      stream: true
    });

    let totalContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        totalContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('继续生成失败:', error);
    res.write(`data: ${JSON.stringify({ error: '生成失败: ' + error.message })}\n\n`);
    res.end();
  }
});

// ==================== 多轮完善需求规格书（增强版） ====================

// 深度思考分析图片的提示词 - 增强版：更具体的分析和位置指导
const IMAGE_ANALYSIS_PROMPT = `你是一位资深的需求文档分析师。请对以下图片进行**深度分析**，精确判断每张图片的内容类型和**必须插入的具体章节位置**。

## 图片列表
{imageList}

## 【重要】分析要求
请对每张图片进行以下**详细分析**：

### 1. 内容识别（必须具体）
- 根据图片文件名推断图片展示的具体内容
- 例如：不要只说"架构图"，要说"系统整体功能架构图，展示了前端、后端、数据库的分层结构"

### 2. 类型判断（必须准确）
- **架构图**：系统架构、功能架构、技术架构、部署架构
- **流程图**：业务流程、操作流程、数据流程
- **界面原型**：页面设计、UI原型、交互设计
- **数据模型**：ER图、数据库设计、实体关系
- **用例图**：用户角色与功能关系
- **时序图**：接口调用、系统交互

### 3. 位置建议（必须精确到小节）
- **架构类** → "4.1 功能架构" 或 "4.2 技术架构"
- **流程类** → "3.3 场景描述" 或 "5.X.1 功能说明"
- **界面类** → "5.X.5 界面设计"（X为对应功能模块编号）
- **数据类** → "5.X.3 处理数据" 或 "附录-数据字典"
- **部署类** → "6.6 部署要求"

### 4. 引用说明（必须有意义）
- 建议的图片标题要具体，如"图4-1: 低空经济监管平台整体架构图"
- 说明图片与文档内容的关联

请以JSON格式输出分析结果：
{
  "images": [
    {
      "id": "img_1",
      "filename": "xxx",
      "contentType": "具体类型如：系统功能架构图",
      "suggestedSection": "精确章节如：4.1 功能架构",
      "suggestedTitle": "图X-Y: 具体的图片标题",
      "description": "详细描述图片内容和在文档中的作用"
    }
  ]
}`;

// ==================== 按章节单独生成的提示词模板 ====================
// 【核心思路】每轮只生成一个章节，最后由代码整合
const CHAPTER_PROMPTS = {
  // 第1章：概述
  chapter1_overview: `你是资深需求分析专家。请根据原始需求文档，**只生成第1章「概述」的完整内容**。

## 原始需求文档：
{documentContent}

## 【输出要求】
只输出第1章的内容，每个小节都要有实质内容，禁止空白。

# 1. 概述

## 1.1 编写目的

本文档是[系统名称]的软件需求规格说明书，旨在明确系统的功能需求、性能需求和设计约束，为后续的系统设计、开发、测试和验收提供依据。

**预期读者**：
| 读者角色 | 阅读目的 | 关注章节 |
|----------|----------|----------|
| 产品经理 | 确认需求完整性 | 全文 |
| 开发工程师 | 理解功能实现要求 | 第5章功能需求 |
| 测试工程师 | 制定测试用例 | 第5章验收标准 |
| 项目经理 | 评估工作量和进度 | 第4章功能架构 |
| 运维工程师 | 了解部署要求 | 第6章系统需求 |

## 1.2 项目背景

**项目名称**：[从需求文档提取]

**项目来源**：[从需求文档提取或标注待确认]

**背景说明**：
（详细描述项目的业务背景、行业现状、建设必要性，至少150字）

**项目范围**：
- 本期建设范围：...
- 后续规划：...

## 1.3 系统概述

**系统定位**：[系统在整体业务架构中的位置和作用]

**核心功能**：
1. **功能一**：简要描述
2. **功能二**：简要描述
3. **功能三**：简要描述

**系统边界**：
- 系统包含：...
- 系统不包含：...

## 1.4 术语定义

| 术语 | 英文/缩写 | 定义说明 |
|------|-----------|----------|
| [术语1] | [English] | [详细定义] |
| [术语2] | [English] | [详细定义] |
| [术语3] | [English] | [详细定义] |
| [术语4] | [English] | [详细定义] |
| [术语5] | [English] | [详细定义] |

（从需求文档中提取所有专业术语，至少5个）

## 1.5 参考资料

| 序号 | 文档名称 | 版本 | 说明 |
|------|----------|------|------|
| 1 | 原始需求文档 | V1.0 | 客户提供的需求说明 |
| 2 | [相关标准/规范] | - | [说明] |
| 3 | [行业最佳实践] | - | [说明] |

请只输出第1章的完整内容：`,

  // 第2章：业务需求
  chapter2_business: `你是资深需求分析专家。请根据原始需求文档，**只生成第2章「业务需求」的完整内容**。

## 原始需求文档：
{documentContent}

## 【输出要求】
只输出第2章的内容，每个小节都要有实质内容，业务背景至少300字。

# 2. 业务需求

## 2.1 业务背景

### 2.1.1 行业现状
（描述当前行业的发展状况、技术趋势、市场环境，至少100字）

### 2.1.2 业务痛点
当前业务存在以下主要问题：

| 痛点编号 | 痛点描述 | 影响范围 | 严重程度 |
|----------|----------|----------|----------|
| P01 | [具体痛点1] | [影响的业务/人员] | 高/中/低 |
| P02 | [具体痛点2] | [影响的业务/人员] | 高/中/低 |
| P03 | [具体痛点3] | [影响的业务/人员] | 高/中/低 |

### 2.1.3 建设必要性
（说明为什么需要建设本系统，能解决什么问题，带来什么价值）

## 2.2 业务目标

| 目标编号 | 目标描述 | 可量化指标 | 优先级 | 验收标准 |
|----------|----------|------------|--------|----------|
| BG-01 | [业务目标1] | [如：效率提升30%] | 高 | [如何验证达成] |
| BG-02 | [业务目标2] | [如：成本降低20%] | 高 | [如何验证达成] |
| BG-03 | [业务目标3] | [如：覆盖率达到95%] | 中 | [如何验证达成] |
| BG-04 | [业务目标4] | [具体指标] | 中 | [如何验证达成] |
| BG-05 | [业务目标5] | [具体指标] | 低 | [如何验证达成] |

## 2.3 业务范围

### 2.3.1 系统边界

**范围内（In Scope）**：
1. [功能/业务1]
2. [功能/业务2]
3. [功能/业务3]

**范围外（Out of Scope）**：
1. [不包含的功能/业务1]
2. [不包含的功能/业务2]

**与外部系统的关系**：
| 外部系统 | 交互方式 | 数据流向 | 说明 |
|----------|----------|----------|------|
| [系统1] | API/文件/消息 | 输入/输出/双向 | [说明] |
| [系统2] | API/文件/消息 | 输入/输出/双向 | [说明] |

### 2.3.2 干系人分析

| 干系人 | 角色类型 | 关注点 | 影响程度 | 参与方式 |
|--------|----------|--------|----------|----------|
| [干系人1] | 决策者 | [关注什么] | 高 | 审批、验收 |
| [干系人2] | 使用者 | [关注什么] | 高 | 日常使用 |
| [干系人3] | 管理者 | [关注什么] | 中 | 监控、配置 |
| [干系人4] | 运维者 | [关注什么] | 中 | 部署、维护 |
| [干系人5] | 开发者 | [关注什么] | 中 | 开发、测试 |

## 2.4 业务流程

### 2.4.1 核心业务流程图

\`\`\`mermaid
flowchart TD
    A[业务发起] --> B{条件判断}
    B -->|条件1| C[处理流程1]
    B -->|条件2| D[处理流程2]
    C --> E[数据处理]
    D --> E
    E --> F{结果校验}
    F -->|通过| G[业务完成]
    F -->|不通过| H[异常处理]
    H --> A
\`\`\`

### 2.4.2 流程说明

| 步骤 | 活动名称 | 执行角色 | 输入 | 输出 | 业务规则 |
|------|----------|----------|------|------|----------|
| 1 | [活动1] | [角色] | [输入数据] | [输出数据] | [规则说明] |
| 2 | [活动2] | [角色] | [输入数据] | [输出数据] | [规则说明] |
| 3 | [活动3] | [角色] | [输入数据] | [输出数据] | [规则说明] |

请只输出第2章的完整内容：`,

  // 第3章：用户需求
  chapter3_user: `你是资深需求分析专家。请根据原始需求文档，**只生成第3章「用户需求」的完整内容**。

## 原始需求文档：
{documentContent}

## 图片信息（流程图类图片应在此章节引用）：
{imageDescriptions}

## 【输出要求】
只输出第3章的内容，用例描述要详细，每个用例都要有完整的流程说明。

# 3. 用户需求

## 3.1 用户角色

| 角色编号 | 角色名称 | 角色描述 | 主要职责 | 使用频率 | 技能要求 |
|----------|----------|----------|----------|----------|----------|
| R01 | [角色1] | [角色的定义和特征] | [主要工作职责] | 每日/每周/每月 | [需要的技能] |
| R02 | [角色2] | [角色的定义和特征] | [主要工作职责] | 每日/每周/每月 | [需要的技能] |
| R03 | [角色3] | [角色的定义和特征] | [主要工作职责] | 每日/每周/每月 | [需要的技能] |

## 3.2 用例图

\`\`\`mermaid
graph LR
    subgraph 系统边界
        UC1[用例1：具体功能名称]
        UC2[用例2：具体功能名称]
        UC3[用例3：具体功能名称]
        UC4[用例4：具体功能名称]
        UC5[用例5：具体功能名称]
    end
    
    Admin((管理员)) --> UC1
    Admin --> UC2
    User((普通用户)) --> UC3
    User --> UC4
    System((外部系统)) --> UC5
\`\`\`

## 3.3 用例描述

### 3.3.1 用例UC01：[具体用例名称]

| 项目 | 描述 |
|------|------|
| **用例编号** | UC01 |
| **用例名称** | [具体名称] |
| **参与者** | [主要参与者]、[次要参与者] |
| **前置条件** | 1. 用户已登录系统<br>2. 用户具有相应权限<br>3. [其他前置条件] |
| **后置条件** | 1. [操作完成后的状态]<br>2. [数据变化] |
| **触发条件** | [什么情况下触发此用例] |

**基本流程**：
| 步骤 | 用户操作 | 系统响应 |
|------|----------|----------|
| 1 | 用户进入[页面名称] | 系统显示[页面内容] |
| 2 | 用户输入[信息] | 系统校验输入合法性 |
| 3 | 用户点击[按钮] | 系统处理请求 |
| 4 | - | 系统返回处理结果 |
| 5 | 用户确认结果 | 系统更新状态 |

**异常流程**：
| 异常编号 | 触发条件 | 系统响应 |
|----------|----------|----------|
| E1 | 输入数据格式错误 | 提示"请输入正确格式的数据" |
| E2 | 权限不足 | 提示"您没有权限执行此操作" |
| E3 | 网络异常 | 提示"网络连接失败，请重试" |

### 3.3.2 用例UC02：[具体用例名称]
（按照UC01相同的结构继续描述其他用例）

## 3.4 场景描述

### 3.4.1 典型场景一：[场景名称]

**场景背景**：[描述场景发生的背景和上下文]

**参与角色**：[角色名称]

**场景流程**：
1. [角色]在[时间/条件]下，需要[完成什么任务]
2. [角色]打开系统，进入[功能模块]
3. [角色]执行[具体操作]
4. 系统[响应/处理]
5. [角色]获得[结果/反馈]

**场景价值**：通过本场景，[角色]可以[获得什么价值/解决什么问题]

### 3.4.2 典型场景二：[场景名称]
（继续描述其他典型场景）

{flowchartImagePlaceholder}

请只输出第3章的完整内容：`,

  // 第4章：产品功能架构
  chapter4_architecture: `你是系统架构师。请根据原始需求文档，**只生成第4章「产品功能架构」的完整内容**。

## 原始需求文档：
{documentContent}

## 图片信息（架构图类图片必须在此章节引用）：
{imageDescriptions}

## 【输出要求】
只输出第4章的内容，架构图要完整，模块说明要详细。

# 4. 产品功能架构

## 4.1 功能架构图

{architectureImagePlaceholder}

\`\`\`mermaid
graph TB
    subgraph 用户层
        A1[Web浏览器]
        A2[移动APP]
        A3[第三方系统]
    end
    
    subgraph 接入层
        B1[API网关]
        B2[负载均衡]
        B3[认证授权]
    end
    
    subgraph 应用层
        C1[功能模块1]
        C2[功能模块2]
        C3[功能模块3]
        C4[功能模块4]
    end
    
    subgraph 服务层
        D1[基础服务]
        D2[公共服务]
        D3[消息服务]
    end
    
    subgraph 数据层
        E1[(主数据库)]
        E2[(缓存)]
        E3[(文件存储)]
    end
    
    A1 --> B1
    A2 --> B1
    A3 --> B1
    B1 --> B2
    B2 --> B3
    B3 --> C1
    B3 --> C2
    B3 --> C3
    B3 --> C4
    C1 --> D1
    C2 --> D2
    C3 --> D3
    D1 --> E1
    D2 --> E2
    D3 --> E3
\`\`\`

**架构说明**：
- **用户层**：支持多种客户端接入方式
- **接入层**：统一入口，负责认证、限流、路由
- **应用层**：核心业务功能模块
- **服务层**：提供公共能力支撑
- **数据层**：数据持久化和缓存

## 4.2 功能模块说明

| 模块编号 | 模块名称 | 功能描述 | 子功能数 | 优先级 | 依赖模块 |
|----------|----------|----------|----------|--------|----------|
| M01 | [模块1名称] | [详细功能描述] | X个 | 高 | - |
| M02 | [模块2名称] | [详细功能描述] | X个 | 高 | M01 |
| M03 | [模块3名称] | [详细功能描述] | X个 | 中 | M01, M02 |
| M04 | [模块4名称] | [详细功能描述] | X个 | 中 | M02 |
| M05 | [模块5名称] | [详细功能描述] | X个 | 低 | M03 |

### 4.2.1 模块依赖关系

\`\`\`mermaid
graph LR
    M01[模块1] --> M02[模块2]
    M01 --> M03[模块3]
    M02 --> M04[模块4]
    M03 --> M05[模块5]
\`\`\`

## 4.3 技术架构

### 4.3.1 技术选型

| 层次 | 技术组件 | 版本要求 | 选型理由 |
|------|----------|----------|----------|
| 前端框架 | [如Vue/React] | [版本] | [选型理由] |
| 后端框架 | [如Spring Boot] | [版本] | [选型理由] |
| 数据库 | [如MySQL/PostgreSQL] | [版本] | [选型理由] |
| 缓存 | [如Redis] | [版本] | [选型理由] |
| 消息队列 | [如RabbitMQ/Kafka] | [版本] | [选型理由] |
| 文件存储 | [如MinIO/OSS] | [版本] | [选型理由] |

### 4.3.2 分层架构

| 层次 | 职责 | 主要组件 |
|------|------|----------|
| 表现层 | 用户界面展示、交互处理 | 页面组件、路由、状态管理 |
| 控制层 | 请求处理、参数校验、响应封装 | Controller、拦截器、过滤器 |
| 业务层 | 业务逻辑处理、事务管理 | Service、业务规则引擎 |
| 数据层 | 数据访问、持久化操作 | DAO、ORM框架、缓存 |
| 基础层 | 公共组件、工具类 | 日志、异常处理、工具类 |

### 4.3.3 数据架构

\`\`\`mermaid
erDiagram
    User ||--o{ Order : creates
    User {
        long id PK
        string username
        string password
        datetime createTime
    }
    Order ||--|{ OrderItem : contains
    Order {
        long id PK
        long userId FK
        string orderNo
        decimal totalAmount
        int status
    }
    OrderItem {
        long id PK
        long orderId FK
        long productId FK
        int quantity
        decimal price
    }
\`\`\`

请只输出第4章的完整内容：`,

  // 第5章：功能需求（按模块生成）- 【增强版】这是最重要的章节，内容必须最详细
  chapter5_functions: `你是资深需求分析专家。请根据原始需求文档，**只生成第5章「功能需求」的完整内容**。

【核心要求】第5章是需求规格书的核心章节，必须生成最详细、最完整、最专业的内容！

## 原始需求文档：
{documentContent}

## 图片信息（界面图片应在对应功能模块的界面小节引用）：
{imageDescriptions}

## 【强制输出规范】

### 规范1：功能模块识别
- 从原始需求中识别**所有功能点**，每个功能都要独立成节
- 功能命名格式：5.X [具体功能名称]（如：5.1 用户登录认证、5.2 数据采集管理）
- 禁止使用泛化名称如"基础功能"、"其他功能"

### 规范2：每个功能模块必须包含完整的6个小节
每个小节都要有实质内容，禁止空白或占位符

### 规范3：内容充实度强制要求
| 小节 | 最低要求 | 禁止事项 |
|------|----------|----------|
| 功能说明 | 300字+，含5个维度 | 禁止少于100字 |
| 业务规则 | 5条+，每条完整 | 禁止用XXX占位 |
| 处理数据 | 8行+，字段具体 | 禁止少于5行 |
| 接口设计 | 2个接口，参数完整 | 禁止缺少参数表 |
| 界面设计 | 4区域+组件+交互 | 禁止只写标题 |
| 验收标准 | 5条+，覆盖异常 | 禁止少于3条 |

## 输出格式（严格按此结构）

# 5. 功能需求

## 5.1 [从需求文档提取的第一个功能名称]

### 5.1.1 功能说明

**业务背景**：本功能模块是系统的核心组成部分，主要解决...的业务问题。在实际业务场景中，用户需要...，而传统方式存在...的痛点。

**使用场景**：
1. **场景一**：当用户需要...时，可以通过本功能...
2. **场景二**：在...情况下，系统自动...
3. **场景三**：管理员可以通过本功能...

**核心价值**：
- 提升...效率约...%
- 降低...成本
- 实现...的自动化

**操作流程**：
1. 用户首先进入...页面
2. 选择/输入...信息
3. 点击...按钮提交
4. 系统进行...处理
5. 返回...结果给用户

**异常处理**：当出现...情况时，系统会...

### 5.1.2 业务规则

| 规则编号 | 规则名称 | 规则描述 | 触发条件 | 处理方式 |
|----------|----------|----------|----------|----------|
| BR-5.1-01 | 数据有效性校验 | 输入数据必须符合格式要求 | 用户提交数据时 | 前端校验+后端二次校验 |
| BR-5.1-02 | 权限控制规则 | 不同角色具有不同操作权限 | 用户执行操作时 | 根据角色判断是否允许 |
| BR-5.1-03 | 数据唯一性约束 | 关键字段不允许重复 | 新增/修改数据时 | 查重后提示或拒绝 |
| BR-5.1-04 | 操作日志记录 | 所有关键操作需记录日志 | 执行增删改操作时 | 异步写入日志表 |
| BR-5.1-05 | 并发控制规则 | 防止数据并发修改冲突 | 多用户同时操作时 | 乐观锁/悲观锁机制 |

### 5.1.3 处理数据

| 数据项 | 类型 | 长度 | 必填 | 默认值 | 校验规则 | 说明 |
|--------|------|------|------|--------|----------|------|
| id | Long | 20 | 是 | 自增 | 正整数 | 主键ID |
| name | String | 100 | 是 | - | 非空，2-100字符 | 名称 |
| code | String | 50 | 是 | - | 唯一，字母数字 | 编码 |
| type | Integer | 2 | 是 | 1 | 枚举值1-5 | 类型 |
| status | Integer | 1 | 是 | 0 | 0或1 | 状态：0禁用1启用 |
| description | String | 500 | 否 | - | 最大500字符 | 描述信息 |
| createTime | DateTime | - | 是 | 当前时间 | 有效日期 | 创建时间 |
| updateTime | DateTime | - | 是 | 当前时间 | 有效日期 | 更新时间 |
| createBy | String | 50 | 是 | 当前用户 | 存在的用户 | 创建人 |
| remark | String | 200 | 否 | - | 最大200字符 | 备注 |

### 5.1.4 接口设计

#### 接口1：查询接口
- **接口编号**：API-5.1-01
- **请求方式**：POST
- **请求路径**：/api/v1/[模块]/query
- **接口描述**：分页查询数据列表，支持多条件筛选

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 | 示例值 |
|--------|------|------|------|--------|
| pageNum | Integer | 是 | 页码，从1开始 | 1 |
| pageSize | Integer | 是 | 每页条数，最大100 | 10 |
| name | String | 否 | 名称，支持模糊查询 | "测试" |
| status | Integer | 否 | 状态筛选 | 1 |
| startTime | String | 否 | 开始时间 | "2024-01-01" |
| endTime | String | 否 | 结束时间 | "2024-12-31" |

**响应参数：**
| 参数名 | 类型 | 说明 | 示例值 |
|--------|------|------|--------|
| code | Integer | 响应码 | 200 |
| message | String | 响应信息 | "success" |
| data.total | Long | 总记录数 | 100 |
| data.list | Array | 数据列表 | [...] |
| data.pageNum | Integer | 当前页码 | 1 |
| data.pageSize | Integer | 每页条数 | 10 |

**错误码：**
| 错误码 | 错误信息 | 处理建议 |
|--------|----------|----------|
| 200 | 操作成功 | - |
| 400 | 参数校验失败 | 检查请求参数格式 |
| 401 | 未授权访问 | 重新登录获取token |
| 403 | 无操作权限 | 联系管理员授权 |
| 500 | 服务器内部错误 | 联系技术支持 |

#### 接口2：新增/修改接口
- **接口编号**：API-5.1-02
- **请求方式**：POST
- **请求路径**：/api/v1/[模块]/save
- **接口描述**：新增或修改数据，id为空时新增，否则修改

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 | 示例值 |
|--------|------|------|------|--------|
| id | Long | 否 | 主键ID，修改时必填 | 1 |
| name | String | 是 | 名称 | "测试数据" |
| code | String | 是 | 编码 | "TEST001" |
| type | Integer | 是 | 类型 | 1 |
| status | Integer | 否 | 状态 | 1 |
| description | String | 否 | 描述 | "这是描述" |

**响应参数：**
| 参数名 | 类型 | 说明 | 示例值 |
|--------|------|------|--------|
| code | Integer | 响应码 | 200 |
| message | String | 响应信息 | "保存成功" |
| data | Long | 返回的数据ID | 1 |

### 5.1.5 界面设计

**页面布局：**
- **顶部区域**：页面标题、面包屑导航、操作按钮组（新增、批量删除、导出）
- **左侧区域**：树形分类导航（如有分类需求）
- **主体区域**：
  - 搜索条件区：包含关键字输入框、状态下拉框、时间范围选择器、查询/重置按钮
  - 数据表格区：展示数据列表，支持排序、多选、分页
  - 操作列：编辑、删除、详情等按钮
- **底部区域**：分页组件（显示总条数、页码、每页条数选择）

**核心组件：**
1. **搜索表单组件**：支持多条件组合查询，回车触发搜索
2. **数据表格组件**：支持列排序、列宽调整、固定列
3. **分页组件**：支持跳转指定页、切换每页条数
4. **弹窗表单组件**：用于新增/编辑数据，支持表单校验
5. **确认对话框组件**：用于删除等危险操作的二次确认

**交互说明：**
- 点击「新增」按钮 → 弹出新增表单弹窗 → 填写信息 → 点击确定 → 校验通过后提交 → 刷新列表
- 点击「编辑」按钮 → 弹出编辑表单弹窗（回显数据） → 修改信息 → 点击确定 → 提交修改 → 刷新列表
- 点击「删除」按钮 → 弹出确认对话框 → 确认后删除 → 刷新列表
- 输入搜索条件 → 点击「查询」或按回车 → 重新加载数据
- 点击表头排序图标 → 按该列升序/降序排列

{uiImagePlaceholder}

### 5.1.6 验收标准

| 编号 | 测试场景 | 前置条件 | 操作步骤 | 预期结果 |
|------|----------|----------|----------|----------|
| AC-5.1-01 | 正常查询数据 | 已登录系统，有查询权限 | 1.进入列表页 2.点击查询 | 正确显示数据列表，分页正常 |
| AC-5.1-02 | 条件筛选查询 | 已登录系统，存在测试数据 | 1.输入筛选条件 2.点击查询 | 只显示符合条件的数据 |
| AC-5.1-03 | 新增数据成功 | 已登录系统，有新增权限 | 1.点击新增 2.填写必填项 3.提交 | 提示成功，列表刷新显示新数据 |
| AC-5.1-04 | 新增数据校验失败 | 已登录系统 | 1.点击新增 2.不填必填项 3.提交 | 提示必填项不能为空 |
| AC-5.1-05 | 编辑数据成功 | 已登录系统，存在可编辑数据 | 1.点击编辑 2.修改信息 3.提交 | 提示成功，数据更新 |
| AC-5.1-06 | 删除数据成功 | 已登录系统，存在可删除数据 | 1.点击删除 2.确认删除 | 提示成功，数据从列表消失 |
| AC-5.1-07 | 无权限操作 | 已登录系统，无操作权限 | 1.尝试执行受限操作 | 提示无权限，操作被拒绝 |

---

## 5.2 [从需求文档提取的第二个功能名称]
（按照5.1完全相同的结构，生成完整的6个小节，内容必须具体、充实）

## 5.3 [从需求文档提取的第三个功能名称]
（继续按相同结构展开...）

【重要提醒】
1. 必须从原始需求文档中识别所有功能点，不要遗漏
2. 每个功能模块的内容必须与该功能的实际业务相关，不能照搬模板
3. 表格数据必须具体、真实，禁止使用XXX等占位符
4. 功能说明必须详细描述业务背景、场景、流程，不能简单一句话带过`,

  // 第6章：系统需求
  chapter6_system: `你是系统架构师。请根据原始需求文档，**只生成第6章「系统需求」的完整内容**。

## 原始需求文档：
{documentContent}

## 图片信息（部署图类图片应在此章节引用）：
{imageDescriptions}

## 【输出要求】
只输出第6章的内容，每个小节都要有具体的指标和说明，表格数据要完整。

# 6. 系统需求

## 6.1 假设和依赖

### 6.1.1 项目假设

| 编号 | 假设内容 | 假设依据 | 影响范围 | 风险等级 |
|------|----------|----------|----------|----------|
| A01 | 用户已具备基本的计算机操作能力 | 目标用户群体分析 | 培训成本 | 低 |
| A02 | 网络环境稳定，带宽满足要求 | 客户IT环境调研 | 系统可用性 | 中 |
| A03 | 客户能够提供必要的测试数据 | 项目合同约定 | 测试进度 | 中 |
| A04 | 第三方系统接口稳定可用 | 接口文档确认 | 集成功能 | 高 |
| A05 | 项目资源按计划到位 | 项目计划 | 项目进度 | 中 |

### 6.1.2 外部依赖

| 编号 | 依赖项 | 依赖类型 | 提供方 | 状态 |
|------|--------|----------|--------|------|
| D01 | [外部系统1]接口 | 技术依赖 | [提供方] | 已确认/待确认 |
| D02 | [基础设施] | 环境依赖 | [提供方] | 已确认/待确认 |
| D03 | [第三方服务] | 服务依赖 | [提供方] | 已确认/待确认 |

## 6.2 系统接口

### 6.2.1 外部系统接口

| 接口编号 | 接口名称 | 对接系统 | 协议 | 数据格式 | 调用方向 | 调用频率 |
|----------|----------|----------|------|----------|----------|----------|
| EXT-01 | [接口1] | [系统名] | HTTP/HTTPS | JSON | 本系统→外部 | 实时/定时 |
| EXT-02 | [接口2] | [系统名] | HTTP/HTTPS | JSON | 外部→本系统 | 实时/定时 |
| EXT-03 | [接口3] | [系统名] | WebSocket | JSON | 双向 | 实时 |

### 6.2.2 内部模块接口

\`\`\`mermaid
sequenceDiagram
    participant A as 模块A
    participant B as 模块B
    participant C as 模块C
    participant DB as 数据库
    
    A->>B: 1. 请求数据
    B->>DB: 2. 查询数据
    DB-->>B: 3. 返回结果
    B-->>A: 4. 响应数据
    A->>C: 5. 处理请求
    C-->>A: 6. 处理结果
\`\`\`

## 6.3 性能要求

| 指标类型 | 指标名称 | 目标值 | 测量条件 | 优先级 |
|----------|----------|--------|----------|--------|
| 响应时间 | 页面首次加载 | ≤3秒 | 正常网络环境 | 高 |
| 响应时间 | 页面切换 | ≤1秒 | 正常网络环境 | 高 |
| 响应时间 | 接口响应 | ≤500ms | 95%请求 | 高 |
| 响应时间 | 复杂查询 | ≤3秒 | 数据量10万级 | 中 |
| 并发能力 | 同时在线用户 | ≥1000 | 峰值时段 | 高 |
| 并发能力 | 并发请求数 | ≥500/秒 | 核心接口 | 高 |
| 吞吐量 | TPS | ≥500 | 核心业务 | 高 |
| 数据容量 | 单表数据量 | ≥1000万条 | 核心业务表 | 中 |
| 数据容量 | 总存储容量 | ≥1TB | 3年数据 | 中 |

## 6.4 安全性要求

### 6.4.1 认证授权

**认证方式**：
- 支持用户名/密码认证
- 支持短信验证码认证
- 支持第三方OAuth2.0认证（可选）
- 密码强度要求：至少8位，包含大小写字母和数字

**权限控制**：
| 权限类型 | 控制粒度 | 说明 |
|----------|----------|------|
| 功能权限 | 菜单/按钮级 | 控制用户可访问的功能 |
| 数据权限 | 行级/字段级 | 控制用户可查看的数据范围 |
| 操作权限 | 增删改查 | 控制用户可执行的操作 |

### 6.4.2 数据安全

| 安全措施 | 适用范围 | 实现方式 |
|----------|----------|----------|
| 传输加密 | 所有网络通信 | HTTPS/TLS 1.2+ |
| 存储加密 | 敏感数据字段 | AES-256加密 |
| 数据脱敏 | 展示层敏感数据 | 部分隐藏（如手机号中间4位） |
| SQL注入防护 | 所有数据库操作 | 参数化查询 |
| XSS防护 | 所有用户输入 | 输入过滤+输出编码 |

### 6.4.3 审计日志

| 日志类型 | 记录内容 | 保留期限 | 存储方式 |
|----------|----------|----------|----------|
| 登录日志 | 用户ID、IP、时间、结果 | 1年 | 数据库 |
| 操作日志 | 用户、操作、对象、时间 | 6个月 | 数据库 |
| 系统日志 | 服务状态、异常信息 | 3个月 | 文件/ELK |
| 接口日志 | 请求/响应、耗时 | 1个月 | 文件/ELK |

## 6.5 可用性要求

| 指标 | 目标值 | 计算方式 | 说明 |
|------|--------|----------|------|
| 系统可用性 | ≥99.9% | (总时间-故障时间)/总时间 | 年度指标 |
| 计划内停机 | ≤4小时/月 | 维护窗口时间 | 非工作时间 |
| RTO | ≤4小时 | 故障恢复时间 | 恢复时间目标 |
| RPO | ≤1小时 | 数据恢复点 | 最大数据丢失量 |
| MTBF | ≥720小时 | 平均故障间隔 | 系统稳定性 |
| MTTR | ≤2小时 | 平均修复时间 | 故障处理效率 |

## 6.6 部署要求

### 6.6.1 部署架构

{deployImagePlaceholder}

\`\`\`mermaid
flowchart TB
    subgraph 用户访问
        U[用户] --> CDN[CDN加速]
    end
    
    subgraph DMZ区
        CDN --> WAF[Web应用防火墙]
        WAF --> LB[负载均衡]
    end
    
    subgraph 应用区
        LB --> APP1[应用服务器1]
        LB --> APP2[应用服务器2]
        APP1 --> CACHE[(Redis集群)]
        APP2 --> CACHE
    end
    
    subgraph 数据区
        APP1 --> DB_M[(主数据库)]
        APP2 --> DB_M
        DB_M --> DB_S[(从数据库)]
        APP1 --> MQ[消息队列]
        APP2 --> MQ
    end
    
    subgraph 存储区
        APP1 --> OSS[(对象存储)]
        APP2 --> OSS
    end
\`\`\`

### 6.6.2 环境要求

| 环境类型 | 服务器角色 | 配置要求 | 数量 | 说明 |
|----------|------------|----------|------|------|
| 生产环境 | 应用服务器 | 8核16G | 2+ | 支持水平扩展 |
| 生产环境 | 数据库服务器 | 16核32G | 2 | 主从架构 |
| 生产环境 | 缓存服务器 | 8核16G | 2 | Redis集群 |
| 测试环境 | 综合服务器 | 8核16G | 1 | 测试验证 |
| 开发环境 | 综合服务器 | 4核8G | 1 | 开发调试 |

### 6.6.3 网络要求

| 网络区域 | 带宽要求 | 延迟要求 | 说明 |
|----------|----------|----------|------|
| 互联网出口 | ≥100Mbps | ≤50ms | 用户访问 |
| 内网互联 | ≥1Gbps | ≤1ms | 服务器间通信 |
| 数据库连接 | ≥1Gbps | ≤0.5ms | 应用到数据库 |

请只输出第6章的完整内容：`,

  // 第7章：附录
  chapter7_appendix: `你是技术文档专家。请根据已生成的需求规格书内容，**只生成第7章「附录」的完整内容**。

## 已生成的需求规格书内容：
{previousContent}

## 【输出要求】
只输出第7章的内容，汇总前面章节的关键信息，每个表格至少5行数据。

# 7. 附录

## 附录A：术语表

| 序号 | 术语 | 英文/缩写 | 定义说明 | 首次出现章节 |
|------|------|-----------|----------|--------------|
| 1 | [术语1] | [English] | [详细定义] | 第X章 |
| 2 | [术语2] | [English] | [详细定义] | 第X章 |
| 3 | [术语3] | [English] | [详细定义] | 第X章 |
| 4 | [术语4] | [English] | [详细定义] | 第X章 |
| 5 | [术语5] | [English] | [详细定义] | 第X章 |

（从前面章节中提取所有专业术语，至少10个）

## 附录B：接口清单汇总

| 序号 | 接口编号 | 接口名称 | 请求方式 | 请求路径 | 所属模块 | 说明 |
|------|----------|----------|----------|----------|----------|------|
| 1 | API-5.1-01 | [接口名] | POST | /api/v1/xxx | 5.1 [模块名] | [简要说明] |
| 2 | API-5.1-02 | [接口名] | POST | /api/v1/xxx | 5.1 [模块名] | [简要说明] |
| 3 | API-5.2-01 | [接口名] | GET | /api/v1/xxx | 5.2 [模块名] | [简要说明] |
| 4 | API-5.2-02 | [接口名] | DELETE | /api/v1/xxx | 5.2 [模块名] | [简要说明] |
| 5 | API-5.3-01 | [接口名] | PUT | /api/v1/xxx | 5.3 [模块名] | [简要说明] |

（汇总第5章中定义的所有接口）

## 附录C：数据实体清单

| 序号 | 实体名称 | 英文名 | 主要字段 | 关联实体 | 所属模块 |
|------|----------|--------|----------|----------|----------|
| 1 | [实体1] | [Entity1] | id, name, status... | [关联实体] | 5.X |
| 2 | [实体2] | [Entity2] | id, code, type... | [关联实体] | 5.X |
| 3 | [实体3] | [Entity3] | id, userId, amount... | [关联实体] | 5.X |
| 4 | [实体4] | [Entity4] | id, orderId, qty... | [关联实体] | 5.X |
| 5 | [实体5] | [Entity5] | id, createTime... | [关联实体] | 5.X |

（汇总第5章中涉及的所有数据实体）

## 附录D：需求追踪矩阵

| 需求编号 | 需求描述 | 来源 | 功能模块 | 优先级 | 状态 |
|----------|----------|------|----------|--------|------|
| REQ-001 | [需求描述] | 原始文档 | 5.1 [模块名] | 高 | 已定义 |
| REQ-002 | [需求描述] | 原始文档 | 5.2 [模块名] | 高 | 已定义 |
| REQ-003 | [需求描述] | 知识库补全 | 5.3 [模块名] | 中 | 待确认 |
| REQ-004 | [需求描述] | 原始文档 | 5.4 [模块名] | 中 | 已定义 |
| REQ-005 | [需求描述] | 原始文档 | 5.5 [模块名] | 低 | 已定义 |

（建立需求与功能模块的追踪关系）

## 附录E：修订记录

| 版本 | 日期 | 修订人 | 修订内容 | 审核人 |
|------|------|--------|----------|--------|
| V1.0 | {date} | AI智能体 | 初始版本，基于原始需求文档生成 | 待审核 |
| V1.1 | 待定 | - | （预留） | - |
| V1.2 | 待定 | - | （预留） | - |

## 附录F：待确认事项清单

| 序号 | 事项描述 | 所在章节 | 影响范围 | 建议处理方式 | 状态 |
|------|----------|----------|----------|--------------|------|
| 1 | [待确认事项1] | X.X | [影响的功能/模块] | [建议] | 待确认 |
| 2 | [待确认事项2] | X.X | [影响的功能/模块] | [建议] | 待确认 |
| 3 | [待确认事项3] | X.X | [影响的功能/模块] | [建议] | 待确认 |

（汇总文档中所有标注[待业务确认]的内容）

## 附录G：知识库补全内容清单

| 序号 | 补全内容 | 所在章节 | 补全依据 | 置信度 |
|------|----------|----------|----------|--------|
| 1 | [补全内容1] | X.X | 行业最佳实践 | 高/中/低 |
| 2 | [补全内容2] | X.X | 类似项目经验 | 高/中/低 |
| 3 | [补全内容3] | X.X | 技术规范 | 高/中/低 |

（汇总文档中所有标注[知识库补全]的内容）

请只输出第7章的完整内容：`
};

// 章节生成顺序配置 - 模板1（完整型需求规格说明书）
// skipEnhance: true 表示该章节不需要完善阶段，一次生成即可（优化：减少AI调用次数）
const CHAPTER_SEQUENCE = [
  { key: 'chapter1_overview', name: '第1章 概述', chapterNum: 1, skipEnhance: true },
  { key: 'chapter2_business', name: '第2章 业务需求', chapterNum: 2, skipEnhance: true },
  { key: 'chapter3_user', name: '第3章 用户需求', chapterNum: 3, skipEnhance: true },
  { key: 'chapter4_architecture', name: '第4章 产品功能架构', chapterNum: 4, skipEnhance: true },
  { key: 'chapter5_functions', name: '第5章 功能需求', chapterNum: 5, skipEnhance: true },
  { key: 'chapter6_system', name: '第6章 系统需求', chapterNum: 6, skipEnhance: true },
  { key: 'chapter7_appendix', name: '第7章 附录', chapterNum: 7, skipEnhance: true }
];

// ==================== 模板2：江苏移动项目需求文档格式 ====================

// 模板2系统提示词
const TEMPLATE2_SYSTEM_PROMPT = `你是资深需求分析师。请深度分析原始需求文档，然后按照规范格式编写项目需求文档。

【标题级别规则 - 根据编号确定标题级别】
- 编号格式为"1"、"2"、"3"等（无小数点）→ 一级标题，用 # 
- 编号格式为"1.1"、"2.1"、"3.2"等（1个小数点）→ 二级标题，用 ##
- 编号格式为"1.1.1"、"3.1.2"等（2个小数点）→ 三级标题，用 ###
- 编号格式为"1.1.1.1"等（3个小数点）→ 四级标题，用 ####

【格式规范 - 必须严格遵守】
1. 一级标题用"# 1 标题"格式，注意#后有空格，数字后有空格
2. 二级标题用"## 1.1 标题"格式
3. 三级标题用"### 1.1.1 标题"格式
4. 标题和正文之间空一行
5. 正文顶格写，不要有缩进
6. 表格前后各空一行
7. 禁止使用"XXX"、"待定"等占位符

【严格禁止】
❌ 每次只输出指定的章节，禁止输出其他章节的内容
❌ 禁止在一个章节中混入其他章节的编号（如第3章中禁止出现2.1、2.2等编号）`;

// 模板2章节提示词
const TEMPLATE2_CHAPTER_PROMPTS = {
  // 第1章：系统概述
  t2_chapter1_overview: `深度分析原始需求文档，编写第1章「系统概述」。

【原始需求文档】
{documentContent}

【输出要求】
1. 严格按照下面的格式输出
2. 标题格式：# 1 系统概述、## 1.1 背景
3. 正文顶格写，不要缩进
4. 内容简洁，每节1-3句话

【输出格式】
# 1 系统概述

基于XX数据，实现XX功能，达到XX目标。

## 1.1 背景

说明项目背景和驱动因素。

## 1.2 系统目的

说明系统要解决的核心问题。

## 1.3 客户原始需求

列出客户的关键需求点。`,

  // 第2章：需求分析
  t2_chapter2_analysis: `深度分析原始需求文档，编写第2章「需求分析」。

【原始需求文档】
{documentContent}

【输出要求】
1. 严格按照下面的格式输出
2. 功能概述用编号列表，每个功能一行
3. 正文顶格写，不要缩进

【输出格式】
# 2 需求分析

概括系统包含的主要功能模块。

## 2.1 功能概述

1. 功能1名称，简短描述功能作用。
2. 功能2名称，简短描述功能作用。
3. 功能3名称，简短描述功能作用。

## 2.2 流程示例

描述业务流程，如无则写"不涉及。"`,

  // 第3章：功能说明（核心章节）
  t2_chapter3_functions: `深度分析原始需求文档，编写第3章「功能说明」。这是最重要的章节！

【原始需求文档】
{documentContent}

【最重要 - 必须完全按照原文档的功能列表】
⚠️ 仔细阅读原始文档，找出文档中【明确列出的所有功能名称】
⚠️ 功能名称必须与原文档保持一致，不要自己编造或修改功能名称
⚠️ 不要遗漏任何一个功能！原文档有几个功能就输出几个功能
⚠️ 每个功能都要完整编写，包含所有子节
⚠️ 如果有相关图片，在适当位置插入图片引用

【严格禁止 - 必须遵守】
❌ 禁止输出第1章、第2章的任何内容
❌ 禁止输出"1 系统概述"、"2 需求分析"等其他章节
❌ 禁止自己编造功能名称，必须使用原文档中的功能名称
✅ 只输出第3章「功能说明」的内容
✅ 所有标题必须以"3"开头（如3.1、3.1.1等）
✅ 功能名称必须与原文档完全一致

【输出要求】
1. 【重要】功能名称必须与原文档完全一致，不能自己编造！
2. 每个功能必须包含：功能描述、功能界面说明、输入说明、处理说明、输出说明
3. 输出说明必须包含字段表
4. 正文顶格写，不要缩进
5. 表格前后各空一行
6. 所有章节编号必须以3开头，不允许出现1.x或2.x的编号
7. 如果有界面截图，在功能界面说明中使用 [插入图片: img_X] 格式引用

【输出格式】
# 3 功能说明

本章包含XX、XX、XX等功能模块（列出所有功能名称）。

## 3.1 第一个功能名称

功能描述，说明作用、定时任务周期、数据存储周期等。

**接口说明**

| 内容 | 备注 |
|------|------|
| 接口名称 | 具体名称 |
| 接口方式 | 文件/API等 |
| 服务器 | IP地址 |
| 推送周期 | 频率 |

### 3.1.1 功能界面说明

描述界面支持的查询和操作功能。如有界面截图，使用 [插入图片: img_X] 引用。如无界面写"不涉及，为后台任务。"

### 3.1.2 输入说明

描述数据来源。

### 3.1.3 处理说明

描述数据处理逻辑。

### 3.1.4 输出说明

生成XX表。字段说明如下：

| 序号 | 字段英文名 | 字段类型 | 字段中文名 | 样例 | 来源表 | 来源字段 | 处理规则 |
|------|------------|----------|------------|------|--------|----------|----------|
| 1 | field1 | String | 字段1 | 示例值 | 来源表名 | 来源字段名 | 处理规则 |

## 3.2 第二个功能名称
（按3.1相同格式编写）

## 3.3 第三个功能名称
（按3.1相同格式编写）

...继续编写所有功能，直到原文档中的所有功能都被覆盖...

【再次强调】
1. 只输出第3章内容，从"# 3 功能说明"开始
2. 所有子章节编号必须是3.x或3.x.x格式
3. 【绝对不能遗漏任何功能模块】
4. 如果有相关图片信息，在适当位置使用 [插入图片: img_X] 引用`,

  // 第4章：部署说明
  t2_chapter4_deploy: `深度分析原始需求文档，编写第4章「部署说明」。

【原始需求文档】
{documentContent}

【输出要求】
1. 严格按照下面的格式输出
2. 正文顶格写，不要缩进

【输出格式】
# 4 部署说明

## 4.1 功能部署路径

描述功能在系统中的部署位置和访问路径。

## 4.2 权限配置

描述功能的权限要求和用户角色。`,

  // 第5章：其他补充说明
  t2_chapter5_supplement: `综合分析原始需求文档和已生成内容，编写第5章「其他补充说明」。

【原始需求文档】
{documentContent}

【已生成内容】
{previousContent}

【输出要求】
1. 严格按照下面的格式输出
2. 正文顶格写，不要缩进
3. 待协调事项用列表形式

【输出格式】
# 5 其他补充说明

## 5.1 数据存储模型

描述数据存储周期和清理策略。

## 5.2 接口说明

汇总系统涉及的外部接口。

## 5.3 待协调事项

- 待确认事项1
- 待确认事项2`
};

// 模板2章节生成顺序配置
// skipEnhance: true 表示该章节不需要完善阶段，一次生成即可（优化：减少AI调用次数）
const TEMPLATE2_CHAPTER_SEQUENCE = [
  { key: 't2_chapter1_overview', name: '第1章 系统概述', chapterNum: 1, skipEnhance: true },
  { key: 't2_chapter2_analysis', name: '第2章 需求分析', chapterNum: 2, skipEnhance: true },
  { key: 't2_chapter3_functions', name: '第3章 功能说明', chapterNum: 3, skipEnhance: true },
  { key: 't2_chapter4_deploy', name: '第4章 部署说明', chapterNum: 4, skipEnhance: true },
  { key: 't2_chapter5_supplement', name: '第5章 其他补充说明', chapterNum: 5, skipEnhance: true }
];

// 模板2章节完善提示词
const TEMPLATE2_ENHANCE_PROMPT = `对以下章节内容进行完善，补充遗漏信息。

【当前章节内容】
{chapterContent}

【原始需求文档】
{documentContent}

【严格禁止 - 必须遵守】
❌ 禁止改变章节编号，必须保持原有的章节编号不变
❌ 禁止添加其他章节的内容（如当前是第3章，禁止输出第1章、第2章的内容）
❌ 禁止输出与当前章节编号不一致的子章节（如当前是第3章，禁止输出2.1、2.2等）
✅ 只完善当前章节的内容，保持章节结构和编号不变

【完善要求】
1. 字段表：确保每个功能的输出说明都有完整字段表，至少5个字段
2. 接口说明：如有外部接口，用表格描述
3. 处理逻辑：补充具体的处理规则和算法
4. 保持原有章节编号不变，只补充内容

【格式规范】
1. 标题级别根据编号确定：1=一级标题，1.1=二级标题，1.1.1=三级标题
2. 正文顶格写，不要缩进
3. 表格前后各空一行
4. 直接输出完善后的内容，不要输出解释

直接从章节标题开始输出（保持原有编号）：`;

// 【新增】章节完善提示词模板 - 用于第二次调用，深度扩展内容
// 【重要】输出时不要包含任何"深度完善"、"完善要求"等标记，直接输出完善后的章节内容
const CHAPTER_ENHANCE_PROMPT = `你是资深需求分析专家。请对以下章节内容进行深度完善和扩展，使其达到专业需求规格说明书的标准。

## 当前章节内容（需要完善）：
{chapterContent}

## 原始需求文档（参考）：
{documentContent}

## 图片信息：
{imageDescriptions}

## 【完善任务清单】

### 任务1：内容充实度检查与补充
对照以下标准，补充不足的内容：
| 内容类型 | 当前状态 | 目标要求 | 补充方向 |
|----------|----------|----------|----------|
| 功能说明 | 检查字数 | ≥300字 | 补充业务背景、使用场景、操作流程、核心价值、异常处理 |
| 业务规则 | 检查条数 | ≥5条 | 补充数据校验、权限控制、状态流转、并发处理规则 |
| 处理数据 | 检查行数 | ≥8行 | 补充字段类型、长度、校验规则、默认值 |
| 接口设计 | 检查完整性 | 请求+响应+错误码 | 补充缺失的参数表、示例值 |
| 界面设计 | 检查详细度 | 布局+组件+交互 | 补充页面区域划分、组件说明、交互流程 |
| 验收标准 | 检查覆盖度 | ≥5条 | 补充正常场景、异常场景、边界条件测试 |

### 任务2：表格数据具体化
- 将所有"XXX"、"待定"、"..."替换为具体内容
- 确保每个表格至少5行有效数据
- 数据要与实际业务场景相关

### 任务3：接口设计完善
- 每个接口必须包含：接口编号、请求方式、URL、描述
- 请求参数表：参数名、类型、必填、说明、示例值（至少5行）
- 响应参数表：参数名、类型、说明、示例值（至少5行）
- 错误码表：错误码、错误信息、处理建议（至少5行）

### 任务4：图片引用插入
- 在合适位置插入图片引用：[插入图片: img_X]
- 图片引用后添加图片说明：*图X-Y: 图片描述*

## 【输出规范 - 必须严格遵守】

1. **直接输出完善后的章节内容**，保持原有的章节编号和结构
2. **禁止输出任何元描述**：
   - ❌ "以下是完善后的内容"
   - ❌ "根据要求，我对章节进行了以下完善"
   - ❌ "深度完善"、"扩展内容"、"补充说明"
3. **禁止输出任何解释性文字**，只输出正式的需求规格书内容
4. **内容风格**：专业、正式、像真正的软件需求规格说明书
5. **格式要求**：保持Markdown格式，表格完整，层级清晰

## 【开始输出】
直接从章节标题开始输出完善后的内容：`;

// 深度分析图片内容（调用AI进行图片分析）
async function analyzeImagesWithAI(client, images, documentContent) {
  if (!images || images.length === 0) {
    return [];
  }

  try {
    const imageList = images.map((img, idx) =>
      `- 图片${idx + 1}: 文件名="${img.filename || '未命名'}", 原始推断类型="${img.inferredType || 'unknown'}", 建议位置="${img.suggestedSection || '未知'}"`
    ).join('\n');

    const docSummary = documentContent.slice(0, 2000);

    const prompt = IMAGE_ANALYSIS_PROMPT
      .replace('{imageList}', imageList)
      + `\n\n文档摘要（用于理解上下文）：\n${docSummary}`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是专业的需求文档分析师，请分析图片并输出JSON格式结果。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const content = response.choices[0].message.content.trim();
    // 尝试解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.images || [];
    }
    return [];
  } catch (error) {
    console.error('AI图片分析失败:', error.message);
    return [];
  }
}

// ==================== 按章节单独生成需求规格书（支持skipEnhance配置） ====================
// 【优化】根据skipEnhance配置决定是否需要完善阶段，减少AI调用次数

app.post('/api/requirement-spec/enhance', async (req, res) => {
  try {
    const {
      documentContent,
      previousContent,
      images = [],
      round = 1,
      totalRounds = 7,  // 默认7轮：7章节 × 1次（全部skipEnhance=true）
      phase = 'generate' // 'generate' 或 'enhance'
    } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 计算当前是第几个章节，以及是生成阶段还是完善阶段
    // 根据skipEnhance字段动态计算轮次
    let currentRound = 0;
    let chapterIndex = 0;
    let isEnhancePhase = false;

    for (let i = 0; i < CHAPTER_SEQUENCE.length; i++) {
      const chapter = CHAPTER_SEQUENCE[i];
      const roundsForChapter = chapter.skipEnhance ? 1 : 2;

      if (currentRound + roundsForChapter >= round) {
        chapterIndex = i;
        isEnhancePhase = !chapter.skipEnhance && (round - currentRound === 2);
        break;
      }
      currentRound += roundsForChapter;
    }

    const chapterConfig = CHAPTER_SEQUENCE[Math.min(chapterIndex, CHAPTER_SEQUENCE.length - 1)];

    // 如果是需要跳过完善阶段的章节，且当前是完善阶段，直接跳过
    if (chapterConfig.skipEnhance && isEnhancePhase) {
      res.write(`data: ${JSON.stringify({ phase: 'skip_enhance', message: `${chapterConfig.name} 不需要完善阶段，跳过` })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // 第一轮时进行深度思考分析图片
    let analyzedImages = images;
    if (round === 1 && images.length > 0) {
      res.write(`data: ${JSON.stringify({
        phase: 'thinking',
        message: '🧠 深度思考：正在分析文档中的图片内容和最佳插入位置...'
      })}\n\n`);

      const aiAnalysis = await analyzeImagesWithAI(client, images, documentContent);
      if (aiAnalysis.length > 0) {
        analyzedImages = images.map((img, idx) => {
          const analysis = aiAnalysis.find(a => a.id === `img_${idx + 1}`) || aiAnalysis[idx] || {};
          return {
            ...img,
            suggestedSection: analysis.suggestedSection || img.suggestedSection,
            suggestedTitle: analysis.suggestedTitle || img.description,
            description: analysis.description || img.description,
            contentType: analysis.contentType || img.inferredType
          };
        });

        res.write(`data: ${JSON.stringify({
          phase: 'thinking_complete',
          message: `✅ 图片分析完成，已确定${analyzedImages.length}张图片的最佳插入位置`,
          analyzedImages: analyzedImages
        })}\n\n`);
      }
    }

    // 生成图片描述（根据章节筛选相关图片）
    const chapterNum = chapterConfig.chapterNum;
    let imageDescriptions = '（本章节无相关图片）';

    const relevantImages = analyzedImages.filter(img => {
      const section = img.suggestedSection || '';
      if (chapterNum === 3) return section.includes('3.') || (img.contentType || '').includes('流程');
      if (chapterNum === 4) return section.includes('4.') || (img.contentType || '').includes('架构');
      if (chapterNum === 5) return section.includes('5.') || (img.contentType || '').includes('界面');
      if (chapterNum === 6) return section.includes('6.') || (img.contentType || '').includes('部署');
      return false;
    });

    if (relevantImages.length > 0) {
      imageDescriptions = `## 本章节相关图片（共${relevantImages.length}张）\n\n` +
        relevantImages.map((img) => {
          const originalIdx = analyzedImages.indexOf(img) + 1;
          return `- **图片${originalIdx}**: ${img.filename || '未命名'}\n  - 类型: ${img.contentType || '未知'}\n  - 建议位置: ${img.suggestedSection || '本章节'}\n  - 引用格式: \`[插入图片: img_${originalIdx}]\``;
        }).join('\n\n');
    }

    // 生成图片占位符
    const getImagePlaceholders = () => {
      const archImages = analyzedImages.filter(img => (img.contentType || '').includes('架构'));
      const uiImages = analyzedImages.filter(img => (img.contentType || '').includes('界面'));
      const deployImages = analyzedImages.filter(img => (img.contentType || '').includes('部署'));

      return {
        architectureImagePlaceholder: archImages.length > 0
          ? `[插入图片: img_${analyzedImages.indexOf(archImages[0]) + 1}]\n*图4-1: ${archImages[0].suggestedTitle || '系统架构图'}*`
          : '',
        uiImagePlaceholder: uiImages.length > 0
          ? uiImages.map((img, i) => `[插入图片: img_${analyzedImages.indexOf(img) + 1}]\n*图5-${i + 1}: ${img.suggestedTitle || '界面原型'}*`).join('\n\n')
          : '',
        deployImagePlaceholder: deployImages.length > 0
          ? `[插入图片: img_${analyzedImages.indexOf(deployImages[0]) + 1}]\n*图6-1: ${deployImages[0].suggestedTitle || '部署架构图'}*`
          : ''
      };
    };

    const placeholders = getImagePlaceholders();
    let userPrompt;
    let phaseLabel;

    if (!isEnhancePhase) {
      // ========== 第一阶段：生成基础内容 ==========
      phaseLabel = '生成';
      const promptTemplate = CHAPTER_PROMPTS[chapterConfig.key];

      if (!promptTemplate) {
        throw new Error(`未找到章节 ${chapterConfig.key} 的提示词模板`);
      }

      userPrompt = promptTemplate
        .replace('{documentContent}', documentContent.slice(0, 10000))
        .replace('{previousContent}', previousContent.slice(-8000))
        .replace('{imageDescriptions}', imageDescriptions)
        .replace('{architectureImagePlaceholder}', placeholders.architectureImagePlaceholder)
        .replace('{uiImagePlaceholder}', placeholders.uiImagePlaceholder)
        .replace('{deployImagePlaceholder}', placeholders.deployImagePlaceholder)
        .replace('{date}', new Date().toISOString().split('T')[0]);
    } else {
      // ========== 第二阶段：深度完善内容 ==========
      phaseLabel = '完善';
      userPrompt = CHAPTER_ENHANCE_PROMPT
        .replace('{chapterContent}', previousContent) // previousContent 此时是上一轮生成的章节内容
        .replace('{documentContent}', documentContent.slice(0, 6000))
        .replace('{imageDescriptions}', imageDescriptions);
    }

    console.log(`开始${phaseLabel} ${chapterConfig.name}，轮次: ${round}/${totalRounds}，阶段: ${isEnhancePhase ? '完善' : '生成'}`);

    // 发送轮次信息
    res.write(`data: ${JSON.stringify({
      phase: isEnhancePhase ? 'enhancing_chapter' : 'generating_chapter',
      round,
      totalRounds,
      chapterKey: chapterConfig.key,
      chapterName: chapterConfig.name,
      chapterIndex: chapterIndex,
      isEnhancePhase: isEnhancePhase,
      phaseLabel: phaseLabel
    })}\n\n`);

    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: REQUIREMENT_SPEC_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: isEnhancePhase ? 0.8 : 0.7, // 完善阶段稍微提高创造性
      max_tokens: 16000,
      stream: true
    });

    let totalContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        totalContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    console.log(`第 ${round} 轮完成（${phaseLabel}），生成内容长度: ${totalContent.length}`);

    // 发送完成信息
    res.write(`data: ${JSON.stringify({
      phase: 'round_complete',
      round,
      contentLength: totalContent.length,
      chapterIndex: chapterIndex,
      isEnhancePhase: isEnhancePhase
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('完善需求规格书失败:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    res.write(`data: ${JSON.stringify({ error: '完善失败: ' + error.message })}\n\n`);
    res.end();
  }
});

// ==================== 模板2：简洁型功能需求文档生成接口 ====================
// 适用于内部功能开发、快速迭代场景

app.post('/api/requirement-spec/template2/enhance', async (req, res) => {
  try {
    const {
      documentContent,
      previousContent = '',
      images = [],
      round = 1,
      totalRounds = 6,  // 第1、2、4、5章各1轮 + 第3章2轮 = 6轮
      phase = 'generate'
    } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 计算当前是第几个章节，以及是生成阶段还是完善阶段
    // 新逻辑：根据skipEnhance字段动态计算轮次
    let currentRound = 0;
    let chapterIndex = 0;
    let isEnhancePhase = false;

    for (let i = 0; i < TEMPLATE2_CHAPTER_SEQUENCE.length; i++) {
      const chapter = TEMPLATE2_CHAPTER_SEQUENCE[i];
      const roundsForChapter = chapter.skipEnhance ? 1 : 2;

      if (currentRound + roundsForChapter >= round) {
        chapterIndex = i;
        isEnhancePhase = !chapter.skipEnhance && (round - currentRound === 2);
        break;
      }
      currentRound += roundsForChapter;
    }

    const chapterConfig = TEMPLATE2_CHAPTER_SEQUENCE[Math.min(chapterIndex, TEMPLATE2_CHAPTER_SEQUENCE.length - 1)];

    // 如果是需要跳过完善阶段的章节，且当前是完善阶段，直接跳过
    if (chapterConfig.skipEnhance && isEnhancePhase) {
      res.write(`data: ${JSON.stringify({ phase: 'skip_enhance', message: `${chapterConfig.name} 不需要完善阶段，跳过` })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // 第一轮时进行深度思考分析图片
    let analyzedImages = images;
    if (round === 1 && images.length > 0) {
      res.write(`data: ${JSON.stringify({
        phase: 'thinking',
        message: '🧠 深度思考：正在分析文档中的图片内容和最佳插入位置...'
      })}\n\n`);

      const aiAnalysis = await analyzeImagesWithAI(client, images, documentContent);
      if (aiAnalysis.length > 0) {
        analyzedImages = images.map((img, idx) => {
          const analysis = aiAnalysis.find(a => a.id === `img_${idx + 1}`) || aiAnalysis[idx] || {};
          return {
            ...img,
            suggestedSection: analysis.suggestedSection || img.suggestedSection,
            suggestedTitle: analysis.suggestedTitle || img.description,
            description: analysis.description || img.description,
            contentType: analysis.contentType || img.inferredType
          };
        });

        res.write(`data: ${JSON.stringify({
          phase: 'thinking_complete',
          message: `✅ 图片分析完成，已确定${analyzedImages.length}张图片的最佳插入位置`,
          analyzedImages: analyzedImages
        })}\n\n`);
      }
    }

    // 生成图片描述（根据章节筛选相关图片）
    const chapterNum = chapterConfig.chapterNum;
    let imageDescriptions = '';

    if (analyzedImages.length > 0) {
      const relevantImages = analyzedImages.filter(img => {
        const section = img.suggestedSection || '';
        if (chapterNum === 3) return section.includes('3.') || (img.contentType || '').includes('流程') || (img.contentType || '').includes('界面');
        if (chapterNum === 4) return section.includes('4.') || (img.contentType || '').includes('部署');
        return false;
      });

      if (relevantImages.length > 0) {
        imageDescriptions = `\n\n【本章节相关图片（共${relevantImages.length}张）】\n` +
          relevantImages.map((img) => {
            const originalIdx = analyzedImages.indexOf(img) + 1;
            return `- 图片${originalIdx}: ${img.filename || '未命名'}\n  类型: ${img.contentType || '未知'}\n  建议位置: ${img.suggestedSection || '本章节'}\n  描述: ${img.description || '无'}\n  引用格式: [插入图片: img_${originalIdx}]`;
          }).join('\n');
      }
    }

    let userPrompt;
    let phaseLabel;

    if (!isEnhancePhase) {
      // ========== 第一阶段：生成基础内容 ==========
      phaseLabel = '生成';
      const promptTemplate = TEMPLATE2_CHAPTER_PROMPTS[chapterConfig.key];

      if (!promptTemplate) {
        throw new Error(`未找到章节 ${chapterConfig.key} 的提示词模板`);
      }

      // 增加文档内容长度限制，确保不会遗漏功能模块
      const docContentLimit = chapterConfig.key === 't2_chapter3_functions' ? 20000 : 15000;

      userPrompt = promptTemplate
        .replace('{documentContent}', documentContent.slice(0, docContentLimit) + imageDescriptions)
        .replace('{previousContent}', previousContent.slice(-8000))
        .replace('{date}', new Date().toISOString().split('T')[0]);
    } else {
      // ========== 第二阶段：深度完善内容 ==========
      phaseLabel = '完善';
      userPrompt = TEMPLATE2_ENHANCE_PROMPT
        .replace('{chapterContent}', previousContent)
        .replace('{documentContent}', documentContent.slice(0, 10000) + imageDescriptions);
    }

    console.log(`[模板2] 开始${phaseLabel} ${chapterConfig.name}，轮次: ${round}/${totalRounds}`);

    // 发送轮次信息
    res.write(`data: ${JSON.stringify({
      phase: isEnhancePhase ? 'enhancing_chapter' : 'generating_chapter',
      round,
      totalRounds,
      chapterKey: chapterConfig.key,
      chapterName: chapterConfig.name,
      chapterIndex: chapterIndex,
      isEnhancePhase: isEnhancePhase,
      phaseLabel: phaseLabel,
      templateType: 2
    })}\n\n`);

    // 第3章（功能说明）需要更多token，因为可能有多个功能模块
    const isChapter3 = chapterConfig.key === 't2_chapter3_functions';
    const maxTokens = isChapter3 ? 16000 : 12000;

    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: TEMPLATE2_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: isEnhancePhase ? 0.7 : 0.6,
      max_tokens: maxTokens,
      stream: true
    });

    let totalContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        totalContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    console.log(`[模板2] 第 ${round} 轮完成（${phaseLabel}），生成内容长度: ${totalContent.length}`);

    // 发送完成信息
    res.write(`data: ${JSON.stringify({
      phase: 'round_complete',
      round,
      contentLength: totalContent.length,
      chapterIndex: chapterIndex,
      isEnhancePhase: isEnhancePhase,
      templateType: 2
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('[模板2] 生成需求文档失败:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    res.write(`data: ${JSON.stringify({ error: '生成失败: ' + error.message })}\n\n`);
    res.end();
  }
});

// 获取模板信息接口
app.get('/api/requirement-spec/templates', (req, res) => {
  res.json({
    success: true,
    templates: [
      {
        id: 1,
        name: '完整型需求规格说明书',
        description: '适用于正式项目立项、招投标场景，包含7个章节：概述、业务需求、用户需求、功能架构、功能需求、系统需求、附录',
        chapters: CHAPTER_SEQUENCE.map(c => c.name),
        totalRounds: 14,
        features: ['详细业务分析', '用例图和用例描述', '完整接口设计', '界面布局设计', '验收标准']
      },
      {
        id: 2,
        name: '江苏移动项目需求文档',
        description: '参照江苏移动项目需求文档格式，包含5个章节：系统概述、需求分析、功能说明（含字段表）、部署说明、其他补充',
        chapters: TEMPLATE2_CHAPTER_SEQUENCE.map(c => c.name),
        totalRounds: 6,
        features: ['江苏移动标准格式', '功能说明含字段表', '接口说明表', '简洁直接']
      }
    ]
  });
});

// 获取缓存的图片
app.get('/api/images/:docId', (req, res) => {
  const { docId } = req.params;
  const images = extractedImagesCache.get(docId);

  if (images) {
    res.json({ success: true, images });
  } else {
    res.status(404).json({ error: '图片缓存已过期或不存在' });
  }
});

// 将中文转换为英文实体名（用于erDiagram）
function chineseToPinyin(str) {
  const commonMappings = {
    '用户': 'User', '用户信息': 'UserInfo', '用户表': 'UserTable',
    '设备': 'Device', '设备信息': 'DeviceInfo', '设备表': 'DeviceTable',
    '孪生': 'Twin', '数字孪生': 'DigitalTwin', '孪生体': 'TwinEntity',
    '模型': 'Model', '模型信息': 'ModelInfo', '模型数据': 'ModelData',
    '告警': 'Alarm', '告警信息': 'AlarmInfo', '告警记录': 'AlarmRecord',
    '日志': 'Log', '操作日志': 'OperationLog', '系统日志': 'SystemLog',
    '权限': 'Permission', '角色': 'Role', '菜单': 'Menu',
    '订单': 'Order', '订单信息': 'OrderInfo', '订单详情': 'OrderDetail',
    '产品': 'Product', '商品': 'Goods', '分类': 'Category',
    '文件': 'File', '附件': 'Attachment', '图片': 'Image',
    '配置': 'Config', '参数': 'Parameter', '设置': 'Setting',
    '任务': 'Task', '作业': 'Job', '调度': 'Schedule',
    '消息': 'Message', '通知': 'Notification', '公告': 'Notice',
    '存储设备模型数据': 'DeviceModelData', '存储设备': 'StorageDevice',
  };

  if (commonMappings[str]) return commonMappings[str];

  for (const [cn, en] of Object.entries(commonMappings)) {
    if (str.includes(cn)) {
      return en + str.replace(cn, '').replace(/[\u4e00-\u9fa5]/g, '');
    }
  }

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return 'Entity' + Math.abs(hash % 10000);
}

// 清洗Mermaid代码，修复常见语法问题
function cleanMermaidCode(code) {
  let cleaned = code.trim();

  // 移除可能的markdown标记残留
  cleaned = cleaned.replace(/^```mermaid\s*/i, '').replace(/```\s*$/, '');

  // 修复常见的中文标点问题
  cleaned = cleaned.replace(/：/g, ':').replace(/；/g, ';').replace(/，/g, ',');

  // 将中文括号替换为英文括号
  cleaned = cleaned.replace(/（/g, '(').replace(/）/g, ')');
  cleaned = cleaned.replace(/【/g, '[').replace(/】/g, ']');

  // 修复箭头格式
  cleaned = cleaned.replace(/\s*-+>\s*/g, ' --> ');
  cleaned = cleaned.replace(/\s*=+>\s*/g, ' ==> ');

  // 修复subgraph语法问题
  cleaned = cleaned.replace(/subgraph\s+([^\n\[]+)\s*\n/g, (match, name) => {
    const cleanName = name.trim();
    if (cleanName.includes(' ') || /[^\w\u4e00-\u9fa5]/.test(cleanName)) {
      return `subgraph "${cleanName}"\n`;
    }
    return match;
  });

  // 处理节点文本中的特殊字符
  cleaned = cleaned.replace(/\[([^\]]+)\]/g, (match, text) => {
    const escaped = text.replace(/"/g, "'").replace(/\|/g, '/');
    return `[${escaped}]`;
  });

  // 修复erDiagram中的中文实体名问题（关键修复！）
  if (cleaned.includes('erDiagram')) {
    cleaned = cleaned.replace(/\s*\|\|--o\{\s*/g, ' ||--o{ ');
    cleaned = cleaned.replace(/\s*\}o--\|\|\s*/g, ' }o--|| ');
    cleaned = cleaned.replace(/\s*\|\|--\|\|\s*/g, ' ||--|| ');
    cleaned = cleaned.replace(/\s*\|o--o\|\s*/g, ' |o--o| ');
    cleaned = cleaned.replace(/\s*\}o--o\{\s*/g, ' }o--o{ ');

    // 收集所有中文实体名并创建映射
    const chineseEntityPattern = /([\u4e00-\u9fa5]+)\s*(\|\|--o\{|\}o--\|\||\|\|--\|\||\|o--o\||\}o--o\{|:)/g;
    const entityMap = new Map();
    let match;
    while ((match = chineseEntityPattern.exec(cleaned)) !== null) {
      const chineseName = match[1];
      if (!entityMap.has(chineseName)) {
        entityMap.set(chineseName, chineseToPinyin(chineseName));
      }
    }

    // 也检查关系右侧的实体名
    const rightEntityPattern = /(\|\|--o\{|\}o--\|\||\|\|--\|\||\|o--o\||\}o--o\{)\s*([\u4e00-\u9fa5]+)/g;
    while ((match = rightEntityPattern.exec(cleaned)) !== null) {
      const chineseName = match[2];
      if (!entityMap.has(chineseName)) {
        entityMap.set(chineseName, chineseToPinyin(chineseName));
      }
    }

    // 替换所有中文实体名为英文
    for (const [cn, en] of entityMap) {
      const regex = new RegExp(`(^|\\s|\\{|\\|)(${cn})(\\s|\\||:)`, 'gm');
      cleaned = cleaned.replace(regex, `$1${en}$3`);
    }
  }

  // 移除空行过多的情况
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

// 将Mermaid代码转换为图片URL（使用免费的mermaid.ink服务）- 增强版
function getMermaidImageUrl(mermaidCode) {
  try {
    // 清洗mermaid代码
    const cleanCode = cleanMermaidCode(mermaidCode);
    // 使用base64编码（URL安全）
    const encoded = Buffer.from(cleanCode, 'utf-8').toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    // mermaid.ink 免费服务
    return `https://mermaid.ink/img/${encoded}?type=png&bgColor=white`;
  } catch (e) {
    console.error('Mermaid URL生成失败:', e.message);
    return null;
  }
}

// Markdown转Word HTML - 增强版（完整格式支持）
function markdownToWordHtml(markdown) {
  let html = markdown;

  // 0. 预处理：统一换行符
  html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1. 处理Mermaid图表 - 转换为图片（增强版）
  let mermaidCount = 0;
  html = html.replace(/```mermaid\n([\s\S]*?)```/g, (match, code) => {
    mermaidCount++;
    const imgUrl = getMermaidImageUrl(code);
    if (imgUrl) {
      return `
<div style="text-align:center;margin:20pt 0;page-break-inside:avoid;border:1pt solid #e0e0e0;padding:15pt;background:#fafafa;">
  <img src="${imgUrl}" alt="图表${mermaidCount}" style="max-width:95%;height:auto;"/>
  <p style="font-size:9pt;color:#666;margin-top:8pt;font-style:italic;">图表 ${mermaidCount}</p>
</div>`;
    }
    // 如果无法生成图片URL，保留代码块并美化显示
    return `
<div style="background:#f8f9fa;border:1pt solid #dee2e6;border-radius:4pt;padding:12pt;margin:15pt 0;page-break-inside:avoid;">
  <p style="font-weight:bold;color:#495057;margin-bottom:8pt;font-size:10pt;">📊 图表 ${mermaidCount} (Mermaid)</p>
  <pre style="font-size:8pt;white-space:pre-wrap;color:#212529;background:#fff;padding:8pt;border:1pt solid #ced4da;border-radius:3pt;overflow-x:auto;">${code.trim()}</pre>
  <p style="font-size:8pt;color:#6c757d;margin-top:6pt;">提示: 可复制上述代码到 mermaid.live 在线查看图表</p>
</div>`;
  });

  // 1.5 处理Markdown图片语法 ![alt](url) - 支持base64 dataUrl
  let imgCount = 0;
  html = html.replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, (match, alt, dataUrl) => {
    imgCount++;
    return `
<div style="text-align:center;margin:20pt 0;page-break-inside:avoid;">
  <img src="${dataUrl}" alt="${alt || '图片' + imgCount}" style="max-width:500px;width:90%;height:auto;border:1px solid #ddd;"/>
  <p style="font-size:10pt;color:#666;margin-top:8pt;">${alt || '图 ' + imgCount}</p>
</div>`;
  });

  // 2. 处理Markdown表格 - 增强版（支持多种格式，自适应内容）

  // 预处理：修复被换行打断的分隔行
  // 将类似 |---|---|\n---| 的情况合并为 |---|---|---|
  html = html.replace(/(\|[-:\s]+)\n([-:\s|]+\|)/g, '$1$2');
  html = html.replace(/(\|[-:\s|]+)\n([-:\s]+\|)/g, '$1$2');

  // 先处理标准格式的表格
  html = html.replace(/\|(.+)\|\s*\n\|[-:\s|]+\|\s*\n((?:\|.+\|\s*\n?)+)/g, (match, header, body) => {
    // 正确解析表头：先处理可能的首尾|，再按|分割，过滤空字符串
    let cleanHeader = header.trim();
    if (cleanHeader.startsWith('|')) cleanHeader = cleanHeader.substring(1);
    if (cleanHeader.endsWith('|')) cleanHeader = cleanHeader.substring(0, cleanHeader.length - 1);
    const headerCells = cleanHeader.split('|').map(h => h.trim()).filter(h => h !== '');
    const columnCount = headerCells.length;

    return convertTableToHtml(headerCells, body, columnCount);
  });

  // 处理分隔行被截断的异常表格（分隔行可能跨多行）
  html = html.replace(/\|([^|\n]+(?:\|[^|\n]+)+)\|\s*\n((?:[-:\s|]+\n?)+)((?:\|[^|\n]+(?:\|[^|\n]+)*\|\s*\n?)+)/g, (match, header, separator, body) => {
    // 检查分隔行是否只包含 -、:、|、空格、换行
    const cleanSep = separator.replace(/[\n\r]/g, '');
    if (!/^[-:\s|]+$/.test(cleanSep) || cleanSep.length < 3) {
      return match; // 不是表格分隔行，保持原样
    }
    // 正确解析表头
    let cleanHeader = header.trim();
    if (cleanHeader.startsWith('|')) cleanHeader = cleanHeader.substring(1);
    if (cleanHeader.endsWith('|')) cleanHeader = cleanHeader.substring(0, cleanHeader.length - 1);
    const headerCells = cleanHeader.split('|').map(h => h.trim()).filter(h => h !== '');
    const columnCount = headerCells.length;

    return convertTableToHtml(headerCells, body, columnCount);
  });

  // 表格转HTML的通用函数
  function convertTableToHtml(headerCells, body, columnCount) {
    // 解析表格行
    const rows = body.trim().split('\n').filter(row => row.includes('|')).map(row => {
      // 去掉行首的|和行尾的|，然后按|分割
      let cleanRow = row.trim();
      // 去掉开头的|
      if (cleanRow.startsWith('|')) {
        cleanRow = cleanRow.substring(1);
      }
      // 去掉结尾的|
      if (cleanRow.endsWith('|')) {
        cleanRow = cleanRow.substring(0, cleanRow.length - 1);
      }
      // 按|分割并trim每个单元格
      const cells = cleanRow.split('|').map(c => c.trim());

      // 过滤掉分隔行（只包含-、:、空格的行）
      if (cells.every(c => /^[-:\s]*$/.test(c))) {
        return null; // 标记为分隔行，后面过滤掉
      }

      // 确保每行的列数与表头一致
      while (cells.length < columnCount) {
        cells.push('');
      }
      return cells.slice(0, columnCount);
    }).filter(row => row !== null); // 过滤掉分隔行

    // 根据列数动态调整字体大小和内边距
    let fontSize = '10pt';
    let cellPadding = '6pt 8pt';
    let headerPadding = '6pt 8pt';

    if (columnCount >= 8) {
      fontSize = '8pt';
      cellPadding = '4pt 4pt';
      headerPadding = '4pt 4pt';
    } else if (columnCount >= 6) {
      fontSize = '9pt';
      cellPadding = '5pt 6pt';
      headerPadding = '5pt 6pt';
    }

    let table = `
<table style="border-collapse:collapse;width:100%;margin:12pt 0;font-size:${fontSize};page-break-inside:auto;table-layout:auto;word-break:break-word;">
  <thead>
    <tr>`;
    headerCells.forEach(h => {
      table += `
      <th style="border:1pt solid #000;padding:${headerPadding};background-color:#4472C4;color:white;font-weight:bold;text-align:center;white-space:nowrap;">${h}</th>`;
    });
    table += `
    </tr>
  </thead>
  <tbody>`;
    rows.forEach((row, idx) => {
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f2f2f2';
      table += `
    <tr style="background-color:${bgColor};">`;
      for (let i = 0; i < columnCount; i++) {
        const cellContent = row[i] || '';
        table += `
      <td style="border:1pt solid #000;padding:${cellPadding};vertical-align:top;word-wrap:break-word;">${cellContent}</td>`;
      }
      table += `
    </tr>`;
    });
    table += `
  </tbody>
</table>`;
    return table;
  }


  // 3. 处理代码块（非Mermaid）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const langLabel = lang ? `<span style="font-size:8pt;color:#6c757d;float:right;">${lang}</span>` : '';
    return `
<div style="margin:12pt 0;page-break-inside:avoid;">
  <pre style="background:#f8f9fa;border:1pt solid #dee2e6;border-radius:4pt;padding:10pt;font-family:'Consolas','Courier New',monospace;font-size:9pt;white-space:pre-wrap;overflow-x:auto;line-height:1.5;">${langLabel}${code.trim()}</pre>
</div>`;
  });

  // 4. 处理行内代码
  html = html.replace(/`([^`]+)`/g, '<code style="background:#e9ecef;padding:2pt 4pt;border-radius:2pt;font-family:Consolas,monospace;font-size:9pt;color:#c7254e;">$1</code>');

  // 5. 处理标题 - 根据编号自动确定标题级别
  // 规则：1=一级, 1.1=二级, 1.1.1=三级, 1.1.1.1=四级
  const getHeadingLevelByNumber = (title) => {
    // 匹配标题开头的编号，如 "1 ", "1.1 ", "1.1.1 ", "3.1.2 " 等
    const match = title.match(/^(\d+(?:\.\d+)*)\s/);
    if (!match) return null;
    const numberPart = match[1];
    // 计算层级：根据点的数量确定
    const dotCount = (numberPart.match(/\./g) || []).length;
    return dotCount + 1; // 1=一级, 1.1=二级(1个点), 1.1.1=三级(2个点)
  };

  // 标题样式配置
  const headingStyles = {
    1: 'font-size:22pt;font-weight:bold;color:#1f4e79;border-bottom:3pt solid #4472C4;padding-bottom:8pt;margin-top:30pt;margin-bottom:15pt;page-break-after:avoid;',
    2: 'font-size:16pt;font-weight:bold;color:#2e75b6;border-bottom:1.5pt solid #9dc3e6;padding-bottom:5pt;margin-top:24pt;margin-bottom:12pt;page-break-after:avoid;',
    3: 'font-size:14pt;font-weight:bold;color:#404040;margin-top:18pt;margin-bottom:9pt;page-break-after:avoid;',
    4: 'font-size:12pt;font-weight:bold;color:#595959;margin-top:14pt;margin-bottom:7pt;',
    5: 'font-size:11pt;font-weight:bold;color:#7f7f7f;margin-top:10pt;margin-bottom:5pt;',
    6: 'font-size:10.5pt;font-weight:bold;color:#8c8c8c;margin-top:8pt;margin-bottom:4pt;'
  };

  // 先处理带编号的标题（根据编号自动确定级别）
  // 匹配 # 后面跟着数字编号的标题
  html = html.replace(/^(#{1,6})\s+(\d+(?:\.\d+)*\s+.+)$/gm, (match, hashes, titleContent) => {
    const level = getHeadingLevelByNumber(titleContent);
    if (level && level >= 1 && level <= 6) {
      const style = headingStyles[level];
      return `\n<h${level} style="${style}">${titleContent}</h${level}>`;
    }
    // 如果没有匹配到编号，使用原始#数量确定级别
    const hashLevel = hashes.length;
    const style = headingStyles[hashLevel] || headingStyles[6];
    return `\n<h${hashLevel} style="${style}">${titleContent}</h${hashLevel}>`;
  });

  // 再处理不带编号的标题（使用原始#数量）
  html = html.replace(/^(#{1,6})\s+([^\d].*)$/gm, (match, hashes, titleContent) => {
    const level = hashes.length;
    const style = headingStyles[level] || headingStyles[6];
    return `\n<h${level} style="${style}">${titleContent}</h${level}>`;
  });

  // 6. 处理粗体、斜体、删除线
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:bold;">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em style="font-style:italic;">$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<del style="text-decoration:line-through;color:#999;">$1</del>');

  // 7. 处理列表 - 改进版（支持嵌套）
  // 无序列表
  const ulPattern = /((?:^[\t ]*[-*+] .+$\n?)+)/gm;
  html = html.replace(ulPattern, (match) => {
    const items = match.trim().split('\n').map(line => {
      const indent = line.match(/^[\t ]*/)[0].length;
      const content = line.replace(/^[\t ]*[-*+] /, '');
      const marginLeft = indent > 0 ? `margin-left:${indent * 12}pt;` : '';
      return `<li style="margin:5pt 0;${marginLeft}">${content}</li>`;
    }).join('');
    return `<ul style="margin:10pt 0 10pt 20pt;padding-left:15pt;list-style-type:disc;">${items}</ul>`;
  });

  // 有序列表
  const olPattern = /((?:^[\t ]*\d+\. .+$\n?)+)/gm;
  html = html.replace(olPattern, (match) => {
    const items = match.trim().split('\n').map(line => {
      const indent = line.match(/^[\t ]*/)[0].length;
      const content = line.replace(/^[\t ]*\d+\. /, '');
      const marginLeft = indent > 0 ? `margin-left:${indent * 12}pt;` : '';
      return `<li style="margin:5pt 0;${marginLeft}">${content}</li>`;
    }).join('');
    return `<ol style="margin:10pt 0 10pt 20pt;padding-left:15pt;">${items}</ol>`;
  });

  // 8. 处理引用块
  html = html.replace(/^> (.+)$/gm, `
<blockquote style="border-left:4pt solid #4472C4;padding:10pt 15pt;margin:15pt 0;background:#f8f9fa;color:#495057;font-style:italic;">$1</blockquote>`);

  // 9. 处理水平线
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:2pt solid #dee2e6;margin:20pt 0;"/>');
  html = html.replace(/^\*\*\*+$/gm, '<hr style="border:none;border-top:2pt solid #dee2e6;margin:20pt 0;"/>');

  // 10. 处理链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#0563c1;text-decoration:underline;">$1</a>');

  // 11. 处理特殊标记（知识库补全、待确认等）
  html = html.replace(/\[知识库补全\]/g, '<span style="background:#fff3cd;color:#856404;padding:2pt 6pt;border-radius:3pt;font-size:9pt;">[知识库补全]</span>');
  html = html.replace(/\[待业务确认\]/g, '<span style="background:#f8d7da;color:#721c24;padding:2pt 6pt;border-radius:3pt;font-size:9pt;">[待业务确认]</span>');
  html = html.replace(/\[假设数据\]/g, '<span style="background:#d4edda;color:#155724;padding:2pt 6pt;border-radius:3pt;font-size:9pt;">[假设数据]</span>');

  // 12. 处理段落和换行
  html = html.split('\n\n').map(para => {
    para = para.trim();
    if (!para) return '';
    // 跳过已经是HTML标签的内容
    if (para.match(/^<(h[1-6]|ul|ol|table|pre|div|blockquote|hr)/i)) {
      return para;
    }
    // 处理普通段落
    return `<p style="margin:10pt 0;text-align:justify;text-indent:0;line-height:1.8;font-size:12pt;">${para.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');

  return html;
}

// 导出Word文档 - 需求规格书（增强版，支持图片嵌入）
app.post('/api/export-word', async (req, res) => {
  try {
    const { content, filename, title, images = [] } = req.body;

    if (!content) {
      return res.status(400).json({ error: '无内容可导出' });
    }

    // 转换Markdown为Word HTML
    let htmlContent = markdownToWordHtml(content);

    // 处理图片引用标记 [插入图片: img_X]，记录已使用的图片
    const usedImageIndices = new Set();
    htmlContent = htmlContent.replace(/\[插入图片:\s*img_(\d+)\]/g, (match, imgNum) => {
      const imgIndex = parseInt(imgNum) - 1;
      if (images[imgIndex] && images[imgIndex].dataUrl) {
        usedImageIndices.add(imgIndex);
        // 【修改】限制图片最大宽度为450px（约6英寸），确保不超出页面
        return `
<div style="text-align:center;margin:15pt 0;page-break-inside:avoid;">
  <img src="${images[imgIndex].dataUrl}" alt="文档图片${imgNum}" style="max-width:450px;width:80%;height:auto;border:1px solid #ddd;"/>
  <p style="font-size:10pt;color:#666;margin-top:5pt;">图${imgNum}: ${images[imgIndex].filename || '文档图片'}</p>
</div>`;
      }
      return match; // 如果图片不存在，保留原标记
    });

    // 【改动】不再将未使用的图片添加到附录，只保留正文中引用的图片
    // 记录未使用的图片数量（仅用于日志）
    const unusedCount = images.filter((img, idx) => !usedImageIndices.has(idx) && img.dataUrl).length;
    if (unusedCount > 0) {
      console.log(`Word导出：${usedImageIndices.size}张图片已插入正文，${unusedCount}张未使用的图片已忽略`);
    }

    // 文档标题
    const docTitle = title || filename || '需求规格说明书';

    // 当前日期
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

    // 统计文档信息
    const wordCount = content.length;
    const tableCount = (content.match(/\|.+\|/g) || []).length;
    const imageCount = images.length;
    const mermaidCount = (content.match(/```mermaid/g) || []).length;

    // 构建完整的Word兼容HTML文档 - 增强版
    const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>${docTitle}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
      <w:TrackMoves>false</w:TrackMoves>
      <w:TrackFormatting/>
      <w:ValidateAgainstSchemas/>
      <w:SaveIfXMLInvalid>false</w:SaveIfXMLInvalid>
      <w:IgnoreMixedContent>false</w:IgnoreMixedContent>
      <w:AlwaysShowPlaceholderText>false</w:AlwaysShowPlaceholderText>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page { 
      size: A4; 
      margin: 2.54cm 3.17cm 2.54cm 3.17cm;
      mso-header-margin: 1.5cm;
      mso-footer-margin: 1.5cm;
    }
    @page Section1 { mso-header: h1; mso-footer: f1; }
    @page CoverPage { mso-header: none; mso-footer: none; }
    div.Section1 { page: Section1; }
    div.CoverPage { page: CoverPage; }
    body { 
      font-family: "微软雅黑", "Microsoft YaHei", "SimSun", sans-serif; 
      font-size: 12pt; 
      line-height: 1.6;
      color: #333;
    }
    /* 封面样式 */
    .cover-page {
      text-align: center;
      padding-top: 120pt;
      page-break-after: always;
      min-height: 700pt;
    }
    .cover-logo {
      margin-bottom: 60pt;
    }
    .cover-title {
      font-size: 32pt;
      font-weight: bold;
      color: #1f4e79;
      margin-bottom: 20pt;
      letter-spacing: 2pt;
    }
    .cover-subtitle {
      font-size: 18pt;
      color: #4472C4;
      margin-bottom: 40pt;
      font-weight: normal;
    }
    .cover-english {
      font-size: 14pt;
      color: #666;
      font-style: italic;
      margin-bottom: 80pt;
    }
    .cover-info-table {
      margin: 0 auto;
      border-collapse: collapse;
      width: 60%;
    }
    .cover-info-table td {
      padding: 8pt 15pt;
      font-size: 11pt;
      border-bottom: 1pt solid #ddd;
    }
    .cover-info-table td:first-child {
      color: #666;
      text-align: right;
      width: 40%;
    }
    .cover-info-table td:last-child {
      color: #333;
      text-align: left;
      font-weight: bold;
    }
    /* 修订历史样式 */
    .revision-page {
      page-break-after: always;
    }
    .revision-title {
      font-size: 16pt;
      font-weight: bold;
      color: #1f4e79;
      text-align: center;
      margin-bottom: 20pt;
      border-bottom: 2pt solid #4472C4;
      padding-bottom: 10pt;
    }
    /* 目录样式 */
    .toc-page {
      page-break-after: always;
    }
    .toc-title {
      font-size: 18pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 25pt;
      color: #1f4e79;
    }
    .toc-hint {
      font-size: 10pt;
      color: #888;
      text-align: center;
      margin-bottom: 20pt;
      font-style: italic;
    }
    /* 页眉页脚 */
    .header { font-size: 9pt; color: #888; border-bottom: 1pt solid #ddd; padding-bottom: 5pt; }
    .footer { font-size: 9pt; color: #888; text-align: center; border-top: 1pt solid #ddd; padding-top: 5pt; }
    /* 正文内容样式 */
    .document-content {
      line-height: 1.8;
    }
    /* 图片容器样式 */
    .image-container {
      text-align: center;
      margin: 20pt 0;
      page-break-inside: avoid;
    }
    .image-container img {
      max-width: 100%;
      height: auto;
      border: 1pt solid #ddd;
    }
    .image-caption {
      font-size: 10pt;
      color: #666;
      margin-top: 8pt;
      font-style: italic;
    }
  </style>
</head>
<body>
  <!-- 封面 -->
  <div class="CoverPage">
    <div class="cover-page">
      <div class="cover-logo">
        <div style="width:80pt;height:80pt;margin:0 auto;background:linear-gradient(135deg,#4472C4,#1f4e79);border-radius:10pt;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:36pt;color:white;font-weight:bold;">📋</span>
        </div>
      </div>
      <div class="cover-title">${docTitle}</div>
      <div class="cover-subtitle">软件需求规格说明书</div>
      <div class="cover-english">Software Requirements Specification (SRS)</div>
      
      <table class="cover-info-table">
        <tr><td>文档版本</td><td>V1.0</td></tr>
        <tr><td>文档状态</td><td>初稿</td></tr>
        <tr><td>创建日期</td><td>${dateStr}</td></tr>
        <tr><td>文档字数</td><td>约 ${Math.round(wordCount / 1000)}K 字</td></tr>
        <tr><td>包含图片</td><td>${imageCount} 张</td></tr>
        <tr><td>包含图表</td><td>${mermaidCount} 个</td></tr>
        <tr><td>生成方式</td><td>AI智能体自动生成</td></tr>
      </table>
      
      <div style="position:absolute;bottom:60pt;left:0;right:0;text-align:center;">
        <p style="font-size:10pt;color:#aaa;">本文档由需求文档助手智能生成</p>
      </div>
    </div>
  </div>
  
  <!-- 修订历史 -->
  <div class="revision-page">
    <div class="revision-title">修订历史</div>
    <table style="width:100%;border-collapse:collapse;margin-top:20pt;">
      <thead>
        <tr style="background:#4472C4;color:white;">
          <th style="border:1pt solid #000;padding:10pt;width:15%;">版本</th>
          <th style="border:1pt solid #000;padding:10pt;width:20%;">日期</th>
          <th style="border:1pt solid #000;padding:10pt;width:20%;">修订人</th>
          <th style="border:1pt solid #000;padding:10pt;width:45%;">修订内容</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1pt solid #000;padding:8pt;text-align:center;">V1.0</td>
          <td style="border:1pt solid #000;padding:8pt;text-align:center;">${dateStr}</td>
          <td style="border:1pt solid #000;padding:8pt;text-align:center;">AI智能体</td>
          <td style="border:1pt solid #000;padding:8pt;">初稿，基于原始需求文档自动生成</td>
        </tr>
        <tr style="background:#f9f9f9;">
          <td style="border:1pt solid #000;padding:8pt;text-align:center;color:#999;">V1.1</td>
          <td style="border:1pt solid #000;padding:8pt;text-align:center;color:#999;">待定</td>
          <td style="border:1pt solid #000;padding:8pt;text-align:center;color:#999;">-</td>
          <td style="border:1pt solid #000;padding:8pt;color:#999;">（预留）</td>
        </tr>
      </tbody>
    </table>
    
    <div style="margin-top:40pt;">
      <p style="font-size:11pt;font-weight:bold;color:#1f4e79;margin-bottom:10pt;">文档说明</p>
      <ul style="font-size:10pt;color:#666;line-height:2;">
        <li>本文档基于上传的原始需求文档，由AI智能体自动分析生成</li>
        <li>标注 <span style="background:#fff3cd;color:#856404;padding:2pt 4pt;">[知识库补全]</span> 的内容为AI基于行业最佳实践补充</li>
        <li>标注 <span style="background:#f8d7da;color:#721c24;padding:2pt 4pt;">[待业务确认]</span> 的内容需要业务方确认</li>
        <li>标注 <span style="background:#d4edda;color:#155724;padding:2pt 4pt;">[假设数据]</span> 的内容为假设性数据，需根据实际情况调整</li>
        <li>文档中的Mermaid图表在Word中显示为图片，如需编辑请使用在线工具</li>
      </ul>
    </div>
  </div>
  
  <!-- 目录页 -->
  <div class="toc-page">
    <div class="toc-title">目 录</div>
    <p class="toc-hint">（在Word中可使用"引用→目录"功能自动生成可跳转目录）</p>
    <div style="font-size:11pt;line-height:2.2;">
      <p>1. 概述 ......................................................... 1</p>
      <p style="margin-left:20pt;">1.1 需求分析方法</p>
      <p style="margin-left:20pt;">1.2 系统概述</p>
      <p style="margin-left:20pt;">1.3 术语定义</p>
      <p>2. 业务需求 .................................................... 2</p>
      <p>3. 用户需求 .................................................... 3</p>
      <p style="margin-left:20pt;">3.1 用户角色</p>
      <p style="margin-left:20pt;">3.2 用例图</p>
      <p style="margin-left:20pt;">3.3 场景描述</p>
      <p>4. 产品功能架构 ................................................ 4</p>
      <p>5. 功能需求 .................................................... 5</p>
      <p>6. 系统需求 .................................................... 6</p>
      <p>7. 附录 ........................................................ 7</p>
    </div>
  </div>
  
  <div class="Section1">
    <!-- 正文内容 -->
    <div class="document-content">
      ${htmlContent}
    </div>
    
    <!-- 文档结束标记 -->
    <div style="margin-top:50pt;padding-top:25pt;border-top:3pt solid #4472C4;text-align:center;">
      <p style="font-size:14pt;color:#1f4e79;font-weight:bold;margin-bottom:10pt;">— 文档结束 —</p>
      <p style="font-size:10pt;color:#666;">本文档共包含约 ${Math.round(wordCount / 1000)}K 字，${imageCount} 张图片，${mermaidCount} 个图表</p>
      <p style="font-size:9pt;color:#aaa;margin-top:15pt;">生成时间: ${dateStr} | 由需求文档助手AI智能体自动生成</p>
      <p style="font-size:8pt;color:#ccc;margin-top:5pt;">如有问题，请联系文档管理员或重新生成</p>
    </div>
  </div>
</body>
</html>`;

    // 设置响应头
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(docTitle)}.doc`);
    res.send(Buffer.from(wordHtml, 'utf-8'));
  } catch (error) {
    console.error('导出Word失败:', error);
    res.status(500).json({ error: '导出Word失败: ' + error.message });
  }
});

// ========== 图表生成API - AI生成HTML+CSS图表并转换为图片 ==========

/**
 * 生成用例图API
 * POST /api/generate-diagram/usecase
 * Body: { functions: [{name, description}], systemName, returnType: 'html' | 'image' }
 */
app.post('/api/generate-diagram/usecase', async (req, res) => {
  try {
    const { functions = [], systemName = '系统', returnType = 'html', actors: providedActors } = req.body;
    
    console.log(`📊 [用例图生成] 功能数量: ${functions.length}, 返回类型: ${returnType}`);
    
    const client = getOpenAIClient();
    
    let actors = providedActors;
    let useCases = [];
    
    // 如果没有提供actors，调用AI分析
    if (!actors || actors.length === 0) {
      if (client) {
        // 调用AI分析用例结构
        const prompt = `${USE_CASE_DIAGRAM_PROMPT}

## 功能列表
${functions.map((f, i) => `${i + 1}. ${f.name || f.title}: ${f.description || ''}`).join('\n')}

## 系统名称
${systemName}`;

        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'glm-4-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2000
        });

        const aiResponse = completion.choices[0].message.content;
        const parsed = extractUseCaseJSON(aiResponse);
        
        if (parsed) {
          actors = parsed.actors || [];
          useCases = parsed.useCases || [];
        }
      }
      
      // 如果AI分析失败，使用默认值
      if (!actors || actors.length === 0) {
        actors = [
          { name: '管理员', description: '系统管理人员' },
          { name: '普通用户', description: '系统使用者' }
        ];
        useCases = functions.map(f => ({
          name: f.name || f.title,
          actor: '普通用户',
          description: f.description || ''
        }));
      }
    } else {
      // 使用提供的actors，从functions生成useCases
      useCases = functions.map(f => ({
        name: f.name || f.title,
        actor: actors[0]?.name || '用户',
        description: f.description || ''
      }));
    }
    
    // 生成HTML用例图
    const htmlDiagram = generateHTMLUseCaseDiagram(actors, useCases, systemName);
    
    if (returnType === 'image') {
      // 转换为图片
      const imageBuffer = await htmlToImage(htmlDiagram, { width: 900, height: 700 });
      
      if (imageBuffer) {
        const dataUrl = bufferToDataUrl(imageBuffer);
        res.json({
          success: true,
          type: 'image',
          dataUrl,
          html: htmlDiagram,
          actors,
          useCases
        });
      } else {
        // 如果转换失败，返回HTML
        res.json({
          success: true,
          type: 'html',
          html: htmlDiagram,
          message: 'Puppeteer未安装，返回HTML格式。安装命令: npm install puppeteer',
          actors,
          useCases
        });
      }
    } else {
      // 直接返回HTML
      res.json({
        success: true,
        type: 'html',
        html: htmlDiagram,
        actors,
        useCases
      });
    }
    
  } catch (error) {
    console.error('用例图生成失败:', error);
    res.status(500).json({ error: '用例图生成失败: ' + error.message });
  }
});

/**
 * 生成流程图API
 * POST /api/generate-diagram/flowchart
 * Body: { dataMovements: [...], processName, returnType: 'html' | 'image' }
 */
app.post('/api/generate-diagram/flowchart', async (req, res) => {
  try {
    const { dataMovements = [], processName = '功能过程', returnType = 'html' } = req.body;
    
    console.log(`📊 [流程图生成] 数据移动数量: ${dataMovements.length}`);
    
    const htmlDiagram = generateHTMLFlowchart(dataMovements, processName);
    
    if (returnType === 'image') {
      const imageBuffer = await htmlToImage(htmlDiagram, { width: 600, height: 800 });
      
      if (imageBuffer) {
        const dataUrl = bufferToDataUrl(imageBuffer);
        res.json({ success: true, type: 'image', dataUrl, html: htmlDiagram });
      } else {
        res.json({ success: true, type: 'html', html: htmlDiagram, message: 'Puppeteer未安装，返回HTML格式' });
      }
    } else {
      res.json({ success: true, type: 'html', html: htmlDiagram });
    }
    
  } catch (error) {
    console.error('流程图生成失败:', error);
    res.status(500).json({ error: '流程图生成失败: ' + error.message });
  }
});

/**
 * 生成时序图API
 * POST /api/generate-diagram/sequence
 * Body: { dataMovements: [...], processName, returnType: 'html' | 'image' }
 */
app.post('/api/generate-diagram/sequence', async (req, res) => {
  try {
    const { dataMovements = [], processName = '功能过程', returnType = 'html' } = req.body;
    
    console.log(`📊 [时序图生成] 数据移动数量: ${dataMovements.length}`);
    
    const htmlDiagram = generateHTMLSequenceDiagram(dataMovements, processName);
    
    if (returnType === 'image') {
      const imageBuffer = await htmlToImage(htmlDiagram, { width: 700, height: 600 });
      
      if (imageBuffer) {
        const dataUrl = bufferToDataUrl(imageBuffer);
        res.json({ success: true, type: 'image', dataUrl, html: htmlDiagram });
      } else {
        res.json({ success: true, type: 'html', html: htmlDiagram, message: 'Puppeteer未安装，返回HTML格式' });
      }
    } else {
      res.json({ success: true, type: 'html', html: htmlDiagram });
    }
    
  } catch (error) {
    console.error('时序图生成失败:', error);
    res.status(500).json({ error: '时序图生成失败: ' + error.message });
  }
});

/**
 * 批量生成多种图表
 * POST /api/generate-diagram/batch
 * Body: { functions, dataMovements, systemName, diagramTypes: ['usecase', 'flowchart', 'sequence'] }
 */
app.post('/api/generate-diagram/batch', async (req, res) => {
  try {
    const { 
      functions = [], 
      dataMovements = [], 
      systemName = '系统',
      processName = '功能过程',
      diagramTypes = ['usecase'],
      returnType = 'html'
    } = req.body;
    
    console.log(`📊 [批量图表生成] 类型: ${diagramTypes.join(', ')}`);
    
    const results = {};
    
    for (const type of diagramTypes) {
      try {
        if (type === 'usecase') {
          // 生成用例图
          const client = getOpenAIClient();
          let actors = [{ name: '用户', description: '系统使用者' }];
          let useCases = functions.map(f => ({
            name: f.name || f.title,
            actor: '用户'
          }));
          
          if (client && functions.length > 0) {
            const prompt = `${USE_CASE_DIAGRAM_PROMPT}\n\n## 功能列表\n${functions.map((f, i) => `${i + 1}. ${f.name || f.title}`).join('\n')}\n\n## 系统名称\n${systemName}`;
            const completion = await client.chat.completions.create({
              model: process.env.OPENAI_MODEL || 'glm-4-flash',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.3,
              max_tokens: 2000
            });
            const parsed = extractUseCaseJSON(completion.choices[0].message.content);
            if (parsed) {
              actors = parsed.actors || actors;
              useCases = parsed.useCases || useCases;
            }
          }
          
          const html = generateHTMLUseCaseDiagram(actors, useCases, systemName);
          
          if (returnType === 'image') {
            const imageBuffer = await htmlToImage(html, { width: 900, height: 700 });
            results.usecase = {
              type: 'usecase',
              html,
              dataUrl: imageBuffer ? bufferToDataUrl(imageBuffer) : null
            };
          } else {
            results.usecase = { type: 'usecase', html };
          }
          
        } else if (type === 'flowchart') {
          const html = generateHTMLFlowchart(dataMovements, processName);
          if (returnType === 'image') {
            const imageBuffer = await htmlToImage(html, { width: 600, height: 800 });
            results.flowchart = {
              type: 'flowchart',
              html,
              dataUrl: imageBuffer ? bufferToDataUrl(imageBuffer) : null
            };
          } else {
            results.flowchart = { type: 'flowchart', html };
          }
          
        } else if (type === 'sequence') {
          const html = generateHTMLSequenceDiagram(dataMovements, processName);
          if (returnType === 'image') {
            const imageBuffer = await htmlToImage(html, { width: 700, height: 600 });
            results.sequence = {
              type: 'sequence',
              html,
              dataUrl: imageBuffer ? bufferToDataUrl(imageBuffer) : null
            };
          } else {
            results.sequence = { type: 'sequence', html };
          }
        }
      } catch (typeError) {
        console.error(`生成${type}图表失败:`, typeError.message);
        results[type] = { type, error: typeError.message };
      }
    }
    
    res.json({ success: true, diagrams: results });
    
  } catch (error) {
    console.error('批量图表生成失败:', error);
    res.status(500).json({ error: '批量图表生成失败: ' + error.message });
  }
});

// AI智能去重 - 分析前面数据组内容，结合子过程关键字生成新名称
// 例如："用户信息" 重复时，根据子过程"删除用户"生成 "用户信息删除表"
async function aiGenerateUniqueName(originalName, subProcessDesc, functionalProcess, existingNames) {
  const client = getOpenAIClient();
  if (!client) {
    // 如果没有API，使用本地提取方式
    return generateUniqueNameLocal(originalName, subProcessDesc);
  }

  try {
    const prompt = `你是一个数据命名专家。现在有一个数据组/数据属性名称"${originalName}"与已有名称重复。

上下文信息：
- 功能过程：${functionalProcess}
- 子过程描述：${subProcessDesc}
- 已存在的类似名称：${existingNames.slice(0, 5).join(', ')}

请根据子过程描述的业务含义，直接生成一个新的完整名称，将原名称与子过程的关键动作/对象结合。

要求：
1. 不要使用括号，直接将关键词融入名称
2. 新名称要体现子过程的具体业务动作
3. 只输出新名称本身，不要其他解释
4. 名称要简洁，不超过15个字

示例：
- 原名称"用户信息"，子过程"删除用户记录" -> 用户信息删除表
- 原名称"设备数据"，子过程"读取设备状态" -> 设备状态读取数据
- 原名称"告警记录"，子过程"写入告警处理结果" -> 告警处理结果记录
- 原名称"订单信息"，子过程"查询历史订单" -> 历史订单查询信息`;

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 50
    });

    const newName = completion.choices[0].message.content.trim();
    // 清理可能的多余内容
    const cleanName = newName.replace(/["'\n\r]/g, '').slice(0, 20);
    return cleanName || generateUniqueNameLocal(originalName, subProcessDesc);
  } catch (error) {
    console.log('AI生成名称失败，使用本地提取:', error.message);
    return generateUniqueNameLocal(originalName, subProcessDesc);
  }
}

// 本地名称生成（备用方案）- 将原名称与子过程关键词结合（用于数据组）
function generateUniqueNameLocal(originalName, subProcessDesc = '') {
  // 从子过程描述中提取关键动词和名词
  const cleaned = subProcessDesc
    .replace(/[\d]/g, '')
    .replace(/[，。、《》（）()？：；\-·]/g, ' ')
    .trim();

  if (!cleaned) {
    return originalName + '扩展表';
  }

  // 常见动词列表
  const actionWords = ['查询', '读取', '写入', '删除', '更新', '新增', '修改', '获取', '提交', '保存', '导出', '导入', '分析', '统计', '处理', '审核', '验证', '确认'];

  // 提取动词
  let action = '';
  for (const word of actionWords) {
    if (cleaned.includes(word)) {
      action = word;
      break;
    }
  }

  // 提取名词（去掉动词后的内容）
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const noun = tokens.find(t => t.length >= 2 && !actionWords.includes(t)) || '';

  // 组合新名称
  if (action && noun) {
    return originalName + action + noun;
  } else if (action) {
    return originalName + action + '表';
  } else if (noun) {
    return originalName + noun + '表';
  } else {
    // 直接取子过程描述的前几个字
    const prefix = tokens.slice(0, 2).map(t => t.slice(0, 3)).join('');
    return originalName + (prefix || '扩展') + '表';
  }
}

// AI智能去重 - 专门用于数据属性，使用更多字段组合
async function aiGenerateUniqueAttrName(originalName, subProcessDesc, functionalProcess, existingNames, dataGroup) {
  const client = getOpenAIClient();
  if (!client) {
    return generateUniqueAttrNameLocal(originalName, subProcessDesc, dataGroup);
  }

  try {
    const prompt = `你是一个数据属性命名专家。现在有一个数据属性名称"${originalName}"与已有名称重复。

上下文信息：
- 功能过程：${functionalProcess}
- 子过程描述：${subProcessDesc}
- 所属数据组：${dataGroup}
- 已存在的类似名称：${existingNames.slice(0, 5).join(', ')}

请根据上下文信息，生成一个新的数据属性名称。

要求：
1. 不要使用括号，直接将关键词融入名称
2. 新名称要体现数据属性的具体特征（如ID、类型、参数、版本、状态等）
3. 可以结合数据组名称、子过程动作来区分
4. 只输出新名称本身，不要其他解释
5. 名称要简洁，不超过15个字

示例：
- 原名称"模型ID"，子过程"查询模型信息"，数据组"模型数据" -> 查询模型标识
- 原名称"设备类型"，子过程"更新设备状态"，数据组"设备信息" -> 设备状态类型
- 原名称"模型数据"，子过程"读取模型版本"，数据组"模型信息" -> 模型版本数据
- 原名称"设备参数"，子过程"导出设备配置"，数据组"设备导出" -> 导出配置参数`;

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 50
    });

    const newName = completion.choices[0].message.content.trim();
    const cleanName = newName.replace(/["'\n\r]/g, '').slice(0, 20);
    return cleanName || generateUniqueAttrNameLocal(originalName, subProcessDesc, dataGroup);
  } catch (error) {
    console.log('AI生成属性名称失败，使用本地提取:', error.message);
    return generateUniqueAttrNameLocal(originalName, subProcessDesc, dataGroup);
  }
}

// 本地属性名称生成（备用方案）- 使用更多字段组合
function generateUniqueAttrNameLocal(originalName, subProcessDesc = '', dataGroup = '') {
  const cleaned = subProcessDesc
    .replace(/[\d]/g, '')
    .replace(/[，。、《》（）()？：；\-·]/g, ' ')
    .trim();

  // 属性相关的后缀词
  const attrSuffixes = ['标识', '编号', '类型', '参数', '版本', '状态', '配置', '属性', '字段', '值'];
  // 常见动词列表
  const actionWords = ['查询', '读取', '写入', '删除', '更新', '新增', '修改', '获取', '提交', '保存', '导出', '导入', '分析', '统计', '处理', '审核', '验证', '确认'];

  // 提取动词
  let action = '';
  for (const word of actionWords) {
    if (cleaned.includes(word)) {
      action = word;
      break;
    }
  }

  // 从数据组中提取关键词
  const groupKeyword = dataGroup.replace(/[数据表信息记录]/g, '').slice(0, 4);

  // 随机选择一个属性后缀
  const randomSuffix = attrSuffixes[Math.floor(Math.random() * attrSuffixes.length)];

  // 组合新名称 - 使用不同于数据组的组合方式
  if (action && groupKeyword) {
    return action + groupKeyword + randomSuffix;
  } else if (action) {
    return action + originalName + randomSuffix;
  } else if (groupKeyword) {
    return groupKeyword + originalName.slice(0, 4) + randomSuffix;
  } else {
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const prefix = tokens.slice(0, 2).map(t => t.slice(0, 2)).join('');
    return (prefix || '扩展') + originalName + randomSuffix;
  }
}

// 解析Markdown表格为结构化数据
app.post('/api/parse-table', async (req, res) => {
  try {
    const { markdown } = req.body;

    if (!markdown) {
      return res.status(400).json({ error: '无Markdown内容' });
    }

    // 提取表格内容
    const tableMatch = markdown.match(/\|[^\n]+\|[\s\S]*?\|[^\n]+\|/g);
    if (!tableMatch) {
      return res.status(400).json({ error: '未找到有效的Markdown表格' });
    }

    const rawLines = markdown.split('\n');
    const lines = rawLines.filter(line => line.trim().startsWith('|'));

    if (lines.length < 3) {
      return res.status(400).json({ error: '表格数据不完整，请检查 Markdown 内容' });
    }

    // 跳过表头和分隔行
    const dataLines = lines.slice(2);

    let currentFunctionalUser = '';
    let currentTriggerEvent = '';
    let currentFunctionalProcess = '';
    const pendingRows = [];

    const sanitizeText = (value = '') => value.replace(/-/g, '·').replace(/\s+/g, ' ').trim();

    const normalizeCells = (line) => {
      // 保留所有单元格，包括空的（用于合并单元格）
      const rawCells = line.split('|');
      // 去掉首尾的空字符串（由于 | 开头和结尾产生）
      if (rawCells.length > 0 && rawCells[0].trim() === '') rawCells.shift();
      if (rawCells.length > 0 && rawCells[rawCells.length - 1].trim() === '') rawCells.pop();
      return rawCells.map(cell => cell.trim());
    };

    dataLines.forEach((line, rowIdx) => {
      const cells = normalizeCells(line);
      console.log(`行 ${rowIdx}: cells.length=${cells.length}, cells=`, cells.slice(0, 7));

      // 只要有足够的列就处理（合并单元格时前几列可能为空）
      if (cells.length >= 4) {
        // 处理合并单元格情况
        if (cells[0]) currentFunctionalUser = cells[0];
        if (cells[1]) currentTriggerEvent = cells[1];
        if (cells[2]) currentFunctionalProcess = cells[2];

        let subProcessDesc = cells[3] || '';
        let dataMovementType = cells[4] || '';
        let dataGroup = cells[5] || '';
        let dataAttributes = cells[6] || '';

        const moveSet = new Set(['E', 'R', 'W', 'X']);
        const normalizedMove = (dataMovementType || '').toUpperCase();
        if (!moveSet.has(normalizedMove)) {
          const idx = cells.findIndex(cell => moveSet.has((cell || '').toUpperCase()));
          if (idx !== -1) {
            dataMovementType = (cells[idx] || '').toUpperCase();
            subProcessDesc = cells[idx - 1] || subProcessDesc;
            dataGroup = cells[idx + 1] || dataGroup;
            const attrCells = cells.slice(idx + 2);
            dataAttributes = attrCells.filter(Boolean).join(' | ') || dataAttributes;
          }
        } else {
          dataMovementType = normalizedMove;
        }

        // 如果仍然缺失，尝试从行数推断
        if (!dataMovementType) {
          const fallbackIdx = cells.findIndex(cell => moveSet.has((cell || '').toUpperCase()));
          if (fallbackIdx !== -1) {
            dataMovementType = (cells[fallbackIdx] || '').toUpperCase();
          }
        }

        // 如果数据组或数据属性缺失，自动拼接功能过程+子过程描述，尽量保持唯一
        if (!dataGroup) {
          dataGroup = `${currentFunctionalProcess || '功能过程'}·${subProcessDesc || '数据'}`;
        }

        if (!dataAttributes) {
          dataAttributes = `${currentFunctionalProcess || '功能过程'}ID | ${subProcessDesc || '子过程'}字段 | 记录时间`;
        }

        dataGroup = sanitizeText(dataGroup);
        dataAttributes = sanitizeText(dataAttributes);

        // 记录待处理的行数据，稍后统一处理重复
        pendingRows.push({
          functionalUser: cells[0] || currentFunctionalUser,
          triggerEvent: cells[1] || currentTriggerEvent,
          functionalProcess: cells[2] || currentFunctionalProcess,
          subProcessDesc,
          dataMovementType,
          dataGroup,
          dataAttributes,
          rowIdx
        });
      }
    });

    // 第二遍：处理重复的数据组和数据属性（调用AI智能去重）
    const tableData = [];
    const seenGroupsMap = new Map(); // 记录已出现的数据组及其来源
    const seenAttrsMap = new Map();  // 记录已出现的数据属性及其来源

    for (const row of pendingRows) {
      let { dataGroup, dataAttributes, subProcessDesc, functionalProcess } = row;

      // 处理数据组重复 - 直接结合关键词生成新名称，不使用括号
      const groupKey = dataGroup.toLowerCase();
      if (seenGroupsMap.has(groupKey)) {
        const existingNames = Array.from(seenGroupsMap.values()).map(v => v.name);
        // 调用AI生成新的完整名称（关键词+原内容结合）
        const newName = await aiGenerateUniqueName(dataGroup, subProcessDesc, functionalProcess, existingNames);
        console.log(`数据组去重: "${dataGroup}" -> "${newName}"`);
        dataGroup = newName;
      }
      seenGroupsMap.set(dataGroup.toLowerCase(), { name: dataGroup, desc: subProcessDesc });

      // 处理数据属性重复 - 将新生成的字段添加到原有字段中，并打乱顺序
      const attrKey = dataAttributes.toLowerCase();
      if (seenAttrsMap.has(attrKey)) {
        const existingNames = Array.from(seenAttrsMap.values()).map(v => v.name);
        // 调用专门的属性去重函数，生成新字段名
        const newFieldName = await aiGenerateUniqueAttrName(dataAttributes, subProcessDesc, functionalProcess, existingNames, dataGroup);

        // 将原有字段拆分成数组（支持 | 或 , 或 、 分隔）
        let fieldsArray = dataAttributes.split(/[|,、]/).map(f => f.trim()).filter(Boolean);

        // 将新生成的字段添加到数组中
        fieldsArray.push(newFieldName);

        // 打乱字段顺序（Fisher-Yates 洗牌算法）
        for (let i = fieldsArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [fieldsArray[i], fieldsArray[j]] = [fieldsArray[j], fieldsArray[i]];
        }

        // 重新组合成字符串
        const newDataAttributes = fieldsArray.join(', ');
        console.log(`数据属性去重: "${dataAttributes}" -> "${newDataAttributes}"`);
        dataAttributes = newDataAttributes;
      }
      seenAttrsMap.set(dataAttributes.toLowerCase(), { name: dataAttributes, desc: subProcessDesc });

      tableData.push({
        ...row,
        dataGroup,
        dataAttributes
      });
    }

    res.json({ success: true, tableData });
  } catch (error) {
    console.error('解析表格失败:', error);
    res.status(500).json({ error: '解析表格失败: ' + error.message });
  }
});

// 静态资源托管（生产模式）
const CLIENT_DIST_PATH = path.join(__dirname, '../client/dist');
if (fs.existsSync(CLIENT_DIST_PATH)) {
  app.use(express.static(CLIENT_DIST_PATH));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
  });
} else {
  console.warn('⚠️  未检测到 client/dist 构建目录，生产环境将无法提供前端静态资源');
}

// ==================== 架构图生成功能 ====================
const diagramGenerator = require('./diagramGenerator');

// 架构图生成提示词 - 深度分析版
const DEEP_ARCHITECTURE_ANALYSIS_PROMPT = `你是一位资深的系统架构师和需求分析专家。请对用户提供的需求文档进行**深度分析**，然后生成一个专业的分层架构图。

## 分析步骤

### 第一步：识别系统层级
从需求文档中识别出以下层级（至少3层，最多5层）：
- **展示层/应用层**：用户界面、前端应用、移动端
- **业务层/服务层**：业务逻辑、核心服务、业务模块
- **数据层**：数据存储、缓存、消息队列
- **基础设施层**：部署环境、监控、安全
- **外部接口层**：第三方系统、外部API

### 第二步：识别功能模块
从需求文档中提取所有功能模块，按业务域分组：
- 每个层级至少包含2-4个模块
- 模块名称要具体、有业务含义
- 相关模块用subgraph分组

### 第三步：识别数据流向
分析模块间的调用关系和数据流向

## 输出要求

请输出以下JSON格式的分析结果：
\`\`\`json
{
  "systemName": "系统名称",
  "layers": [
    {
      "name": "层级名称",
      "type": "application|service|data|infrastructure",
      "groups": [
        {
          "name": "分组名称",
          "modules": ["模块1", "模块2", "模块3"]
        }
      ]
    }
  ],
  "dataFlows": [
    {"from": "层级1", "to": "层级2", "description": "数据流说明"}
  ]
}
\`\`\`

然后基于分析结果，生成Mermaid架构图代码：
\`\`\`mermaid
graph TB
    subgraph 应用层
        ...
    end
    ...
\`\`\`

## 风格要求（参考企业级架构图）
1. 使用subgraph嵌套表示层级和分组
2. 节点ID用英文（如A1, B2），显示名称用中文
3. 使用direction LR让同层模块横向排列
4. 层级间用箭头表示数据流向
5. 颜色通过style定义（可选）`;

// 生成架构图 - AI分析 + Kroki渲染
app.post('/api/diagram/generate', async (req, res) => {
  try {
    const { documentContent, diagramType = 'layered', outputFormat = 'svg' } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    console.log('开始生成架构图，文档长度:', documentContent?.length || 0);

    // 第一步：AI深度分析并生成Mermaid代码
    const analysisPrompt = `${DEEP_ARCHITECTURE_ANALYSIS_PROMPT}

## 原始需求文档：
${documentContent?.slice(0, 6000) || '无文档内容'}

请进行深度分析并生成架构图。`;

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是一位专业的系统架构师，擅长分析需求文档并绘制清晰的架构图。' },
        { role: 'user', content: analysisPrompt }
      ],
      temperature: 0.5,
      max_tokens: 4000
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('AI分析完成，响应长度:', aiResponse.length);

    // 提取Mermaid代码
    let mermaidCode = diagramGenerator.extractMermaidCode(aiResponse);

    if (!mermaidCode) {
      // 如果AI没有生成有效的Mermaid代码，使用默认模板
      console.log('AI未生成有效Mermaid代码，使用默认模板');
      mermaidCode = diagramGenerator.generateDefaultArchitectureMermaid('系统');
    }

    // 第二步：调用Kroki API渲染图片
    let imageBuffer = null;
    let imageUrl = null;

    try {
      imageBuffer = await diagramGenerator.generateDiagramWithKroki('mermaid', mermaidCode, outputFormat);
      console.log('Kroki渲染成功，图片大小:', imageBuffer.length);

      // 转换为base64
      const base64Image = Buffer.from(imageBuffer).toString('base64');
      const mimeType = outputFormat === 'png' ? 'image/png' : 'image/svg+xml';
      imageUrl = `data:${mimeType};base64,${base64Image}`;
    } catch (krokiError) {
      console.error('Kroki渲染失败:', krokiError.message);
      // 返回Mermaid代码让前端渲染
    }

    // 提取JSON分析结果（如果有）
    let analysisJson = null;
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        analysisJson = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.log('JSON解析失败，跳过');
      }
    }

    res.json({
      success: true,
      mermaidCode,
      imageUrl,
      imageFormat: outputFormat,
      analysis: analysisJson,
      aiResponse: aiResponse.slice(0, 2000) // 返回部分AI响应用于调试
    });

  } catch (error) {
    console.error('架构图生成失败:', error);
    res.status(500).json({ error: '架构图生成失败: ' + error.message });
  }
});

// 直接渲染Mermaid代码为图片
app.post('/api/diagram/render', async (req, res) => {
  try {
    const { mermaidCode, outputFormat = 'svg' } = req.body;

    if (!mermaidCode) {
      return res.status(400).json({ error: '请提供Mermaid代码' });
    }

    const imageBuffer = await diagramGenerator.generateDiagramWithKroki('mermaid', mermaidCode, outputFormat);

    const mimeType = outputFormat === 'png' ? 'image/png' : 'image/svg+xml';
    res.setHeader('Content-Type', mimeType);
    res.send(imageBuffer);

  } catch (error) {
    console.error('图片渲染失败:', error);
    res.status(500).json({ error: '图片渲染失败: ' + error.message });
  }
});

// 获取Kroki渲染URL（用于直接嵌入）
app.post('/api/diagram/url', async (req, res) => {
  try {
    const { mermaidCode, outputFormat = 'svg' } = req.body;

    if (!mermaidCode) {
      return res.status(400).json({ error: '请提供Mermaid代码' });
    }

    const encoded = diagramGenerator.encodeDiagram(mermaidCode);
    const url = `${diagramGenerator.KROKI_BASE_URL}/mermaid/${outputFormat}/${encoded}`;

    res.json({ success: true, url });

  } catch (error) {
    console.error('生成URL失败:', error);
    res.status(500).json({ error: '生成URL失败: ' + error.message });
  }
});

// ==================== COSMIC Excel 转 需求规格说明书 功能 ====================

// 模板深度分析系统提示词 - 增强版：多维度深度理解模板
const TEMPLATE_ANALYSIS_PROMPT = `你是一名资深需求分析专家和文档结构分析师。请对用户上传的需求规格说明书模板进行**多维度深度分析**，不仅要识别结构，更要**理解每个章节的内容要求和写作规范**。

## 【核心分析维度】

### 维度1：文档整体结构分析
1. **识别文档类型**：是需求规格说明书、软件设计文档、还是其他类型
2. **识别章节层级**：分析有多少级层级（1级、2级、3级、4级等）
3. **识别编号规则**：
   - 编号格式（如 1、1.1、1.1.1 或 第一章、1.1节 等）
   - 编号与标题之间的分隔符（空格、点号、顿号等）
4. **识别文档风格**：正式/半正式、技术性/业务性

### 维度2：每个章节的深度理解
对于模板中的**每一个章节**，你需要分析：
1. **章节目的**：这个章节要解决什么问题？要传达什么信息？
2. **内容要求**：
   - 需要包含哪些具体内容点？
   - 内容的详细程度要求（概述级/详细级/完整级）
   - 是否需要具体的数据、指标、参数？
3. **格式要求**：
   - 是纯文本、表格、列表、还是混合格式？
   - 如果是表格，表头是什么？有多少列？
   - 如果是列表，是有序还是无序？
4. **示例内容**：如果模板中有示例内容，完整提取出来
5. **与其他章节的关系**：是否引用其他章节？是否被其他章节引用？

### 维度3：功能需求章节的特殊分析
功能需求章节通常是最复杂的，需要特别分析：
1. **层级结构**：
   - 第1级：通常是"功能需求"或"系统功能"
   - 第2级：可能是"子系统"、"功能模块"、"业务域"等
   - 第3级：可能是"功能模块"、"功能单元"等
   - 第4级：可能是"功能过程"、"功能点"、"用例"等
2. **功能过程的内容模板**：
   - 每个功能过程需要包含哪些子节？（如：功能说明、业务规则、处理数据、接口设计等）
   - 每个子节的内容格式是什么？
   - 是否需要图表？需要什么类型的图表？
3. **数据表结构**：
   - 处理数据表的表头是什么？
   - 接口参数表的表头是什么？

### 维度4：特殊章节识别
识别以下特殊章节（如果存在）：
1. **内部逻辑文件（ILF）**：数据存储相关
2. **外部逻辑文件（ELF）**：外部数据引用
3. **外部接口文件（EIF）**：系统接口
4. **工作量调整因子**：复杂度评估
5. **非功能需求**：性能、安全、可用性等
6. **术语表/词汇表**：专业术语定义

### 维度5：写作规范提取
1. **用语规范**：使用的专业术语、动词时态、人称
2. **描述深度**：每个功能需要描述到什么程度
3. **禁止事项**：模板中明确禁止或不推荐的写法

## 【输出要求】完整的JSON分析结果
\`\`\`json
{
  "documentInfo": {
    "templateName": "模板名称",
    "documentType": "需求规格说明书/软件设计文档/其他",
    "totalChapters": "总章节数",
    "maxLevel": "最大层级深度",
    "writingStyle": "正式技术文档/半正式/其他"
  },
  "numberingRules": {
    "format": "编号格式描述（如：阿拉伯数字点分隔）",
    "separator": "编号内部分隔符（如.）",
    "titleSeparator": "编号与标题分隔符（如空格或点号）",
    "examples": ["1 引言", "1.1 目的", "1.1.1 详细说明"]
  },
  "allChapters": [
    {
      "number": "章节编号（保留原格式）",
      "title": "章节标题（保留原文）",
      "level": 1,
      "purpose": "这个章节的目的是什么",
      "contentRequirements": ["需要包含的内容点1", "需要包含的内容点2"],
      "formatType": "text/table/list/mixed",
      "tableStructure": {
        "headers": ["表头1", "表头2"],
        "description": "表格用途说明"
      },
      "sampleContent": "模板中的示例内容（如果有）",
      "relatedChapters": ["相关章节编号"]
    }
  ],
  "functionalChapter": {
    "number": "功能需求章节编号（如5）",
    "title": "功能需求章节标题",
    "hierarchyLevels": "实际层级数量（如2表示只有 5.功能需求 → 5.1.XXX功能 两级）",
    "levelDefinitions": {
      "level1": {
        "name": "功能需求",
        "description": "顶层功能需求章节",
        "numberFormat": "5",
        "example": "5 功能需求 或 5.功能需求"
      },
      "level2": {
        "name": "功能过程/功能点",
        "description": "具体的功能（如果模板只有2级，这就是最小粒度）",
        "numberFormat": "5.1",
        "example": "5.1.XXX功能（功能编号）"
      },
      "level3": {
        "name": "如果有第3级才填写",
        "description": "可选",
        "numberFormat": "5.1.1",
        "example": "可选"
      },
      "level4": {
        "name": "如果有第4级才填写",
        "description": "可选",
        "numberFormat": "5.1.1.1",
        "example": "可选"
      }
    },
    "processContentTemplate": {
      "sections": ["从模板中提取的子节标题数组，如：功能说明、业务规则、处理数据等"],
      "sectionsDetailed": [
        {
          "name": "子节标题（从模板中提取）",
          "number": "子节编号（从模板中提取）",
          "purpose": "子节的目的（从模板中理解）",
          "format": "text/table/list（从模板中识别）"
        }
      ],
      "diagramRequirements": {
        "needsSequenceDiagram": true,
        "needsFlowchart": false,
        "diagramPlacement": "在操作流程部分"
      }
    }
  },
  "specialSections": {
    "nonFunctionalRequirements": {
      "exists": true,
      "number": "章节编号",
      "subsections": ["性能需求", "安全需求", "可用性需求"]
    },
    "dataRequirements": {
      "exists": true,
      "number": "章节编号",
      "tableHeaders": ["数据项", "类型", "说明"]
    },
    "interfaceRequirements": {
      "exists": true,
      "number": "章节编号",
      "tableHeaders": ["接口名称", "接口类型", "说明"]
    },
    "glossary": {
      "exists": false,
      "number": "",
      "format": ""
    }
  },
  "writingGuidelines": {
    "terminology": ["使用的专业术语"],
    "verbTense": "现在时/将来时",
    "perspective": "第三人称",
    "detailLevel": "详细描述每个功能的输入、处理、输出",
    "prohibitions": ["禁止使用的表述方式"]
  },
  "templateExamples": {
    "functionalProcessExample": "从模板中提取的完整功能过程示例",
    "tableExamples": ["表格示例1", "表格示例2"]
  }
}
\`\`\`

## 【关键要求】
1. **逐字逐句阅读模板**，不要遗漏任何章节
2. **理解每个章节的意图**，不仅仅是识别标题
3. **提取所有示例内容**，这是生成时最重要的参考
4. **保留原始格式**，包括编号、标点、空格等
5. **识别隐含要求**，如模板中暗示但未明确说明的内容要求

## 【核心要求】完全动态提取，不能使用任何预设值！

### 1. 功能过程子节结构识别
- 找到模板中功能过程（最小粒度的功能单元）下面的子节结构
- **完整提取所有子节的标题**，放入 processContentTemplate.sections 数组
- sections 数组必须是字符串数组，如：["子节1标题", "子节2标题", ...]
- **不同的模板可能有完全不同的子节结构，必须从模板原文中提取！**

### 2. 层级深度识别
- 仔细分析功能需求章节的层级结构
- hierarchyLevels 表示从功能需求章节到最小功能单元的层级数
- 例如：
  - 3.功能需求 → 3.1.XXX功能 = 2级
  - 5.功能需求 → 5.1.子系统 → 5.1.1.功能 = 3级
  - 3.功能需求 → 3.1.子系统 → 3.1.1.模块 → 3.1.1.1.功能 = 4级

### 3. 章节编号格式识别
- 识别模板使用的编号格式（如 1.1、1.1.1 或 第一章、1.1节 等）
- 识别编号与标题之间的分隔符（空格、点号、顿号等）

### 4. 所有章节提取
- 提取模板中的**每一个章节标题**
- 包括功能需求之前的章节（前置章节）和之后的章节（后置章节）
- 这些信息将用于动态生成完整的需求规格说明书`;

// COSMIC 功能过程深度分析提示词
const COSMIC_FUNCTION_ANALYSIS_PROMPT = `你是一名资深软件需求分析专家。请根据COSMIC功能点数据，深度分析以下功能过程，生成详细的功能需求描述。

## 分析要求
1. **深度理解功能过程**：理解每个功能过程的业务目标、使用场景、操作流程
2. **数据移动分析**：根据E(输入)、R(读取)、W(写入)、X(输出)推导完整业务流程
3. **数据组/属性分析**：从数据组和数据属性提取数据模型、接口参数
4. **业务规则推导**：根据功能过程推导出具体的业务规则

## 输出要求（每个功能过程）
- 功能说明：包含业务背景、使用场景、操作流程，内容充实具体
- 业务规则：列出具体可执行的业务规则
- 处理数据表：包含字段名、类型、说明、来源
- 接口设计：请求参数、响应参数、错误码
- 验收标准：列出测试用例和验收条件

## 时序图/流程图生成要求
当需要生成时序图时，请使用Mermaid语法，格式如下：
\`\`\`mermaid
sequenceDiagram
    participant 用户
    participant 系统
    participant 数据库
    用户->>系统: E-输入请求
    系统->>数据库: R-读取数据
    数据库-->>系统: 返回数据
    系统->>数据库: W-写入数据
    系统-->>用户: X-输出结果
\`\`\`

根据数据移动序列（E→R→W→X）生成对应的时序图：
- E (Entry): 用户向系统发送请求
- R (Read): 系统从数据库读取数据
- W (Write): 系统向数据库写入数据
- X (eXit): 系统向用户返回结果

## 严格禁止
❌ 使用"XXX"、"待定"、"..."等占位符
❌ 使用"请参考"、"详见"、"同上"等回避语
❌ 使用"至少XX字"、"AI生成"、"知识库补全"等字眼
❌ 内容空洞、缺乏具体细节
❌ 输出任何元描述或提示性文字`;

// 解析COSMIC Excel文件
async function parseCosmicExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Excel文件中没有找到工作表');
  }

  const data = [];
  const headers = [];
  let headerRowIndex = 1;

  // 定义字段匹配规则（按优先级排序的关键词）
  const fieldMatchers = {
    functionalUser: ['功能用户', '用户', 'functional user', 'user'],
    triggerEvent: ['触发事件', '触发', 'trigger', 'event'],
    functionalProcess: ['功能过程', '过程名称', '过程', 'functional process', 'process'],
    subProcessDesc: ['子过程', '子过程描述', '描述', 'sub process', 'subprocess', 'description'],
    dataMovementType: ['数据移动类型', '数据移动', '移动类型', '类型', 'data movement', 'movement type', 'type', 'e/r/w/x'],
    dataGroup: ['数据组', '数据组名', 'data group', 'group'],
    dataAttributes: ['数据属性', '属性', 'data attribute', 'attribute']
  };

  // 列索引映射
  const columnMap = {};

  // 查找表头行（包含COSMIC相关关键词的行）
  worksheet.eachRow((row, rowNumber) => {
    if (headerRowIndex !== 1) return; // 已找到表头，跳过

    const rowValues = row.values.slice(1); // 去掉第一个空元素
    const rowText = rowValues.map(v => String(v || '').toLowerCase()).join(' ');

    // 检查是否包含COSMIC相关关键词
    const isHeaderRow = rowText.includes('功能过程') ||
      rowText.includes('数据移动') ||
      rowText.includes('functional') ||
      rowText.includes('触发事件') ||
      rowText.includes('数据组') ||
      rowText.includes('子过程');

    if (isHeaderRow) {
      headerRowIndex = rowNumber;
      rowValues.forEach((cell, idx) => {
        const headerText = String(cell || '').trim();
        headers[idx] = headerText;

        // 根据表头内容匹配字段
        const headerLower = headerText.toLowerCase();
        for (const [field, keywords] of Object.entries(fieldMatchers)) {
          if (!columnMap[field]) { // 只匹配第一个找到的
            for (const keyword of keywords) {
              if (headerLower.includes(keyword.toLowerCase())) {
                columnMap[field] = idx;
                console.log(`列映射: "${headerText}" (列${idx}) -> ${field}`);
                break;
              }
            }
          }
        }
      });
    }
  });

  // 如果没有找到表头，尝试使用第一行作为表头
  if (headers.length === 0) {
    const firstRow = worksheet.getRow(1);
    const rowValues = firstRow.values.slice(1);
    rowValues.forEach((cell, idx) => {
      headers[idx] = String(cell || '').trim();
    });
    headerRowIndex = 1;
  }

  // 如果仍然没有列映射，使用默认顺序（兼容旧格式）
  if (Object.keys(columnMap).length === 0) {
    console.log('未找到匹配的表头，使用默认列顺序');
    columnMap.functionalUser = 0;
    columnMap.triggerEvent = 1;
    columnMap.functionalProcess = 2;
    columnMap.subProcessDesc = 3;
    columnMap.dataMovementType = 4;
    columnMap.dataGroup = 5;
    columnMap.dataAttributes = 6;
  }

  console.log('最终列映射:', columnMap);
  console.log('表头:', headers);

  // 解析数据行
  let currentFunctionalUser = '';
  let currentTriggerEvent = '';
  let currentFunctionalProcess = '';

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIndex) return; // 跳过表头

    const rowValues = row.values.slice(1);
    if (rowValues.every(v => !v || String(v).trim() === '')) return; // 跳过空行

    // 处理合并单元格 - 根据列映射获取值
    const getValue = (field) => {
      const idx = columnMap[field];
      if (idx === undefined) return '';
      const val = rowValues[idx];
      return val ? String(val).trim() : '';
    };

    // 更新当前值（处理合并单元格）
    if (getValue('functionalUser')) currentFunctionalUser = getValue('functionalUser');
    if (getValue('triggerEvent')) currentTriggerEvent = getValue('triggerEvent');
    if (getValue('functionalProcess')) currentFunctionalProcess = getValue('functionalProcess');

    const rowData = {
      functionalUser: currentFunctionalUser,
      triggerEvent: currentTriggerEvent,
      functionalProcess: currentFunctionalProcess,
      subProcessDesc: getValue('subProcessDesc'),
      dataMovementType: getValue('dataMovementType').toUpperCase(),
      dataGroup: getValue('dataGroup'),
      dataAttributes: getValue('dataAttributes')
    };

    // 只添加有效数据行（至少有功能过程或子过程描述）
    if (rowData.functionalProcess || rowData.subProcessDesc || rowData.dataMovementType) {
      data.push(rowData);
    }
  });

  return {
    headers,
    columnMap, // 返回列映射信息，方便前端显示
    data,
    rowCount: data.length,
    functionalProcesses: [...new Set(data.map(d => d.functionalProcess).filter(Boolean))]
  };
}

// 解析Word模板结构 - 增强版：提取章节内容和格式特征
// 支持 .docx 和 .doc 格式
async function parseWordTemplate(buffer, fileExtension = '.docx') {
  let text = '';
  let htmlContent = '';

  if (fileExtension === '.doc') {
    // 使用 word-extractor 解析 .doc 格式
    try {
      const extracted = await wordExtractor.extract(buffer);
      text = extracted.getBody() || '';
      // .doc 格式没有HTML，使用纯文本
      console.log(`解析 .doc 文件成功，提取文本长度: ${text.length}`);
    } catch (e) {
      console.error('word-extractor 解析失败:', e.message);
      throw new Error('无法解析 .doc 文件，请尝试转换为 .docx 格式');
    }
  } else {
    // 使用 mammoth 解析 .docx 格式
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;

    // 同时提取HTML以获取更多格式信息
    try {
      const htmlResult = await mammoth.convertToHtml({ buffer });
      htmlContent = htmlResult?.value || '';
    } catch (e) {
      console.log('HTML提取失败，继续使用纯文本');
    }
  }

  // 分析模板结构
  const sections = [];
  const lines = text.split('\n');
  const seenNumbers = new Set(); // 用于去重

  // 【增强】多种章节标题识别模式
  const sectionPatterns = [
    // 标准格式：1.1 标题 或 1.1. 标题
    /^(\d{1,2}(?:\.\d{1,3})*)\s*[、.．]\s*(.+?)$/,
    // 空格分隔：1.1 标题
    /^(\d{1,2}(?:\.\d{1,3})*)\s+([^\d\t].+?)$/,
    // 带括号或冒号：1.1)标题 或 1.1:标题
    /^(\d{1,2}(?:\.\d{1,3})*)[)）:：]\s*(.+?)$/,
    // 紧密格式：1.1标题（编号后直接跟中文）
    /^(\d{1,2}(?:\.\d{1,3})*)([\u4e00-\u9fa5].{1,50})$/,
  ];

  // 存储每个章节的内容
  const sectionContents = new Map();
  let currentSection = null;
  let currentContent = [];

  console.log(`[parseWordTemplate] 开始解析，总行数: ${lines.length}`);

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentSection) currentContent.push('');
      return;
    }

    // 尝试所有模式匹配
    let match = null;
    for (const pattern of sectionPatterns) {
      match = trimmed.match(pattern);
      if (match) break;
    }

    if (match) {
      const number = match[1];
      // 【修复】清理标题末尾的页码数字（如 "业务规则、模型和算法 10" -> "业务规则、模型和算法"）
      const title = match[2].trim().replace(/\s+\d{1,4}\s*$/, '').trim();
      
      // 验证章节编号的合理性（允许从0开始，如 0.前言）
      const numParts = number.split('.');
      const isValidSection = numParts.every(part => {
        const num = parseInt(part);
        return num >= 0 && num <= 99;
      });

      // 验证标题有效性
      const isValidTitle = title.length >= 2 && 
                           title.length <= 100 && 
                           !/^\d+$/.test(title) &&
                           !/^[-=_]{3,}$/.test(title);

      // 去重检查
      const isDuplicate = seenNumbers.has(number);

      if (isValidSection && isValidTitle && !isDuplicate) {
        seenNumbers.add(number);
        
        // 保存上一个章节的内容
        if (currentSection) {
          sectionContents.set(currentSection.number, currentContent.join('\n').trim());
        }

        const level = numParts.length;
        currentSection = {
          number: number,
          title: title,
          level,
          lineIndex: idx
        };
        sections.push(currentSection);
        currentContent = [];
        
        // 打印前20个章节用于调试
        if (sections.length <= 20) {
          console.log(`[parseWordTemplate] 识别章节 ${sections.length}: ${number} ${title} (Level ${level})`);
        }
        return;
      }
    }

    // 收集当前章节的内容
    if (currentSection) {
      currentContent.push(trimmed);
    }
  });
  
  console.log(`[parseWordTemplate] 解析完成，共识别 ${sections.length} 个章节`);

  // 保存最后一个章节的内容
  if (currentSection) {
    sectionContents.set(currentSection.number, currentContent.join('\n').trim());
  }

  // 为每个章节添加内容摘要和格式特征
  sections.forEach(section => {
    const content = sectionContents.get(section.number) || '';
    section.contentSnippet = content.slice(0, 500); // 内容摘要
    section.contentLength = content.length;

    // 识别内容格式特征
    section.hasTable = content.includes('|') && content.includes('---');
    section.hasList = /^[\-\*\d]+[\.、\)]\s/.test(content);
    section.hasCode = content.includes('```');
  });

  // 提取功能需求章节的完整示例（用于模仿）
  let functionalExampleContent = '';
  const funcSection = sections.find(s =>
    s.title.includes('功能') && s.level === 1
  );
  if (funcSection) {
    // 找到功能需求章节下的第一个完整功能过程示例
    const funcIdx = sections.indexOf(funcSection);
    for (let i = funcIdx + 1; i < sections.length && i < funcIdx + 10; i++) {
      const s = sections[i];
      if (s.level <= funcSection.level) break; // 超出功能需求章节范围
      if (s.level >= 3) { // 功能过程级别
        const content = sectionContents.get(s.number);
        if (content && content.length > 200) {
          functionalExampleContent = `### ${s.number} ${s.title}\n\n${content}`;
          break;
        }
      }
    }
  }

  return {
    fullText: text,
    htmlContent: htmlContent,
    sections,
    sectionCount: sections.length,
    sectionContents: Object.fromEntries(sectionContents), // 转为普通对象以便JSON序列化
    functionalExampleContent // 用于生成时参考的完整示例
  };
}

// 上传并解析COSMIC Excel
app.post('/api/cosmic-to-spec/parse-excel', uploadMultiple.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传Excel文件' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return res.status(400).json({ error: '请上传Excel文件（.xlsx或.xls格式）' });
    }

    console.log(`解析COSMIC Excel: ${req.file.originalname}, 大小: ${req.file.size} bytes`);

    const result = await parseCosmicExcel(req.file.buffer);

    res.json({
      success: true,
      filename: req.file.originalname,
      fileSize: req.file.size,
      ...result
    });
  } catch (error) {
    console.error('解析COSMIC Excel失败:', error);
    res.status(500).json({ error: '解析Excel失败: ' + error.message });
  }
});

// 上传需求规格说明书模板
app.post('/api/cosmic-to-spec/upload-template', uploadMultiple.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传Word模板文件' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.docx' && ext !== '.doc') {
      return res.status(400).json({ error: '请上传Word文档（.docx或.doc格式）' });
    }

    console.log(`上传模板: ${req.file.originalname}, 大小: ${req.file.size} bytes, 格式: ${ext}`);

    // 解析模板结构（传入文件扩展名以选择正确的解析器）
    const templateInfo = await parseWordTemplate(req.file.buffer, ext);

    // 生成模板ID并保存（统一保存为原始扩展名）
    const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const templatePath = path.join(TEMPLATES_DIR, `${templateId}${ext}`);

    // 保存模板文件到磁盘
    fs.writeFileSync(templatePath, req.file.buffer);

    // 保存模板信息到缓存
    const templateData = {
      id: templateId,
      filename: req.file.originalname,
      fileSize: req.file.size,
      uploadTime: new Date().toISOString(),
      path: templatePath,
      ...templateInfo
    };
    specTemplatesCache.set(templateId, templateData);

    // 保存元数据到磁盘（用于服务器重启后恢复）
    const metaPath = path.join(TEMPLATES_DIR, `${templateId}.json`);
    fs.writeFileSync(metaPath, JSON.stringify({
      id: templateId,
      filename: req.file.originalname,
      fileSize: req.file.size,
      uploadTime: templateData.uploadTime,
      sectionCount: templateInfo.sectionCount,
      sections: templateInfo.sections
    }, null, 2));

    res.json({
      success: true,
      template: {
        id: templateId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        sections: templateInfo.sections,
        sectionCount: templateInfo.sectionCount
      }
    });
  } catch (error) {
    console.error('上传模板失败:', error);
    res.status(500).json({ error: '上传模板失败: ' + error.message });
  }
});

// 获取已保存的模板列表
app.get('/api/cosmic-to-spec/templates', async (req, res) => {
  try {
    // 从磁盘读取模板列表
    const templates = [];

    if (fs.existsSync(TEMPLATES_DIR)) {
      const files = fs.readdirSync(TEMPLATES_DIR);
      for (const file of files) {
        // 支持 .docx 和 .doc 两种格式
        if (file.endsWith('.docx') || file.endsWith('.doc')) {
          const ext = path.extname(file);
          const templateId = file.replace(ext, '');
          const cached = specTemplatesCache.get(templateId);

          if (cached) {
            templates.push({
              id: cached.id,
              filename: cached.filename,
              fileSize: cached.fileSize,
              uploadTime: cached.uploadTime,
              sectionCount: cached.sectionCount,
              fileFormat: ext // 返回文件格式信息
            });
          } else {
            // 从文件系统恢复，同时尝试读取元数据文件
            const filePath = path.join(TEMPLATES_DIR, file);
            const metaPath = path.join(TEMPLATES_DIR, `${templateId}.json`);
            const stats = fs.statSync(filePath);

            let templateData = {
              id: templateId,
              filename: file,
              fileSize: stats.size,
              uploadTime: stats.mtime.toISOString(),
              sectionCount: 0,
              fileFormat: ext
            };

            // 尝试读取元数据
            if (fs.existsSync(metaPath)) {
              try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                templateData = { ...templateData, ...meta };
              } catch (e) {
                console.error('读取模板元数据失败:', e);
              }
            }

            // 恢复到缓存
            specTemplatesCache.set(templateId, templateData);
            templates.push(templateData);
          }
        }
      }
    }

    res.json({ success: true, templates });
  } catch (error) {
    console.error('获取模板列表失败:', error);
    res.status(500).json({ error: '获取模板列表失败: ' + error.message });
  }
});

// 删除模板
app.delete('/api/cosmic-to-spec/templates/:id', (req, res) => {
  try {
    const templateId = req.params.id;
    // 支持 .docx 和 .doc 两种格式
    const templatePathDocx = path.join(TEMPLATES_DIR, `${templateId}.docx`);
    const templatePathDoc = path.join(TEMPLATES_DIR, `${templateId}.doc`);
    const metaPath = path.join(TEMPLATES_DIR, `${templateId}.json`);
    const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_analysis.json`);

    // 删除模板文件（支持两种格式）
    if (fs.existsSync(templatePathDocx)) {
      fs.unlinkSync(templatePathDocx);
    }
    if (fs.existsSync(templatePathDoc)) {
      fs.unlinkSync(templatePathDoc);
    }
    // 同时删除元数据文件
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }
    // 删除分析结果文件
    if (fs.existsSync(analysisPath)) {
      fs.unlinkSync(analysisPath);
    }
    specTemplatesCache.delete(templateId);

    res.json({ success: true, message: '模板已删除' });
  } catch (error) {
    console.error('删除模板失败:', error);
    res.status(500).json({ error: '删除模板失败: ' + error.message });
  }
});

// ==================== 新增：深度模板分析API ====================
// 让用户在生成前预览系统对模板的理解，并可以修正

// 深度分析模板 - 用户可预览和确认
app.post('/api/cosmic-to-spec/analyze-template', async (req, res) => {
  try {
    const { templateId } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: '请选择模板' });
    }

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 【修复】获取模板 - 支持 .docx 和 .doc 两种格式
    let templatePath = path.join(TEMPLATES_DIR, `${templateId}.docx`);
    let ext = '.docx';
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(TEMPLATES_DIR, `${templateId}.doc`);
      ext = '.doc';
    }
    if (!fs.existsSync(templatePath)) {
      res.write(`data: ${JSON.stringify({ error: '模板文件不存在' })}\n\n`);
      res.end();
      return;
    }

    const buffer = fs.readFileSync(templatePath);
    console.log(`[模板分析] 读取模板文件: ${templatePath}, 大小: ${buffer.length} 字节`);

    res.write(`data: ${JSON.stringify({ phase: 'parsing', message: '📄 正在解析模板文件...' })}\n\n`);

    // 增强版模板解析 - 传入文件扩展名
    const templateInfo = await parseWordTemplate(buffer, ext);
    console.log(`[模板分析] 解析完成: 识别到 ${templateInfo.sectionCount} 个章节`);
    console.log(`[模板分析] 章节列表:`, templateInfo.sections?.slice(0, 10).map(s => `${s.number} ${s.title}`));

    res.write(`data: ${JSON.stringify({
      phase: 'parsed',
      message: `✅ 模板解析完成：识别到 ${templateInfo.sectionCount} 个章节`,
      sections: templateInfo.sections
    })}\n\n`);

    res.write(`data: ${JSON.stringify({ phase: 'analyzing', message: '🧠 AI正在深度分析模板结构...' })}\n\n`);

    // 多轮AI分析以获得更准确的理解
    const analysis = await deepAnalyzeTemplateMultiRound(client, templateInfo);

    if (!analysis) {
      res.write(`data: ${JSON.stringify({ error: 'AI分析失败，请重试' })}\n\n`);
      res.end();
      return;
    }

    // 保存分析结果
    const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_analysis.json`);
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

    // 更新缓存
    const cachedTemplate = specTemplatesCache.get(templateId) || {};
    cachedTemplate.analysis = analysis;
    cachedTemplate.functionalExampleContent = templateInfo.functionalExampleContent;
    specTemplatesCache.set(templateId, cachedTemplate);

    res.write(`data: ${JSON.stringify({
      phase: 'complete',
      message: '✅ 模板深度分析完成',
      analysis: analysis
    })}\n\n`);

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('深度分析模板失败:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    res.write(`data: ${JSON.stringify({ error: '分析失败: ' + error.message })}\n\n`);
    res.end();
  }
});

// 多轮深度分析模板 - 增强版：3轮深度分析，彻底理解模板结构
async function deepAnalyzeTemplateMultiRound(client, templateInfo) {
  const { fullText, sections, sectionContents, functionalExampleContent } = templateInfo;

  console.log('[模板深度分析] 开始3轮深度分析...');

  try {
    // ========== 第一轮：整体结构分析 ==========
    console.log('[模板深度分析] 第1轮：整体结构分析');
    const round1Prompt = `你是专业的需求文档分析师。请【彻底分析】以下需求规格说明书模板的整体结构。

## 模板完整内容：
${fullText.slice(0, 15000)}

## 已识别的章节结构：
${sections.map(s => `${'  '.repeat(s.level - 1)}${s.number} ${s.title}`).join('\n')}

## 【重要任务】你必须精确分析：
1. 确认所有章节的编号格式（如：1、1.1、1.1.1 还是 1.、1.1.、1.1.1.）
2. 确认所有章节标题的精确文字（一字不差）
3. 识别哪个章节是功能需求章节（通常包含"功能"字样）
4. 识别功能需求章节之前的所有章节（前置章节）
5. 识别功能需求章节之后的所有章节（后置章节）

请输出JSON格式：
\`\`\`json
{
  "documentStyle": "文档风格描述",
  "numberFormat": "章节编号格式，如: X.X.X 或 X.X.X.",
  "titleSeparator": "编号与标题之间的分隔符，如: 空格、点、顿号",
  "allChaptersDetailed": [
    {"number": "1", "title": "精确的章节标题", "level": 1, "purpose": "章节目的"},
    {"number": "1.1", "title": "子章节标题", "level": 2, "purpose": "子章节目的"}
  ],
  "functionalChapterNumber": "功能需求章节的精确编号",
  "functionalChapterTitle": "功能需求章节的精确标题",
  "headerChapters": ["功能需求之前的章节编号列表"],
  "footerChapters": ["功能需求之后的章节编号列表"],
  "specialFeatures": ["文档特殊特征列表"]
}
\`\`\``;

    const round1Response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是专业的需求文档分析师。请精确分析文档结构，所有章节标题必须与原文完全一致。' },
        { role: 'user', content: round1Prompt }
      ],
      temperature: 0.1,
      max_tokens: 6000
    });

    let round1Result = {};
    const round1Match = round1Response.choices[0].message.content.match(/```json\s*([\s\S]*?)```/);
    if (round1Match) {
      try {
        round1Result = JSON.parse(round1Match[1]);
        console.log('[模板深度分析] 第1轮完成：识别到', round1Result.allChaptersDetailed?.length || 0, '个章节');
      } catch (e) {
        console.log('[模板深度分析] 第1轮JSON解析失败，使用默认值');
      }
    }

    // ========== 第二轮：功能需求章节深度分析 ==========
    console.log('[模板深度分析] 第2轮：功能需求章节深度分析');
    const funcChapterNum = round1Result.functionalChapterNumber || '5';
    const funcChapterTitle = round1Result.functionalChapterTitle || '功能需求';

    // 找到功能需求章节的内容
    let funcContent = '';
    for (const [num, content] of Object.entries(sectionContents || {})) {
      if (num.startsWith(funcChapterNum)) {
        funcContent += `\n\n### ${num}\n${content}`;
      }
    }

    const round2Prompt = `你是专业的需求文档分析师。请【深度分析】功能需求章节的结构和内容模式。

## 功能需求章节内容（编号: ${funcChapterNum}）：
${funcContent.slice(0, 10000) || fullText.slice(0, 10000)}

## 模板中的完整功能过程示例：
${functionalExampleContent || '（请从上面的内容中提取）'}

## 【重要任务】你必须精确分析：
1. 功能需求的层级深度（2层、3层还是4层？）
   - 2层：功能需求→功能过程（如：5.1 XXX功能）
   - 3层：功能需求→功能模块→功能过程（如：5.1 XXX模块→5.1.1 XXX功能）
   - 4层：功能需求→子系统→功能模块→功能过程
2. 每个功能过程下面的子节结构（最重要！）
   - 子节的精确名称（如：功能说明、业务规则、处理数据等）
   - 子节的编号格式（如：5.1.1、5.1.2）
   - 子节的内容要求（文本描述、表格、列表等）
3. 表格的表头格式（如果有）
4. 提取一个完整的功能过程示例

请输出JSON格式：
\`\`\`json
{
  "hierarchyLevels": 2,
  "hierarchyStructure": {
    "level1": {"name": "功能需求", "numberFormat": "5"},
    "level2": {"name": "功能过程", "numberFormat": "5.1"},
    "level3": {"name": "子节", "numberFormat": "5.1.1"}
  },
  "processContentTemplate": {
    "sections": ["功能说明", "业务规则", "处理数据", "接口", "界面", "验收标准"],
    "sectionsDetailed": [
      {"name": "功能说明", "purpose": "描述功能的业务背景和使用场景", "format": "text"},
      {"name": "业务规则", "purpose": "描述业务逻辑和约束条件", "format": "list"},
      {"name": "处理数据", "purpose": "描述涉及的数据字段", "format": "table"}
    ],
    "dataTableHeaders": ["字段名", "类型", "长度", "说明", "是否必填"],
    "numberSeparator": "."
  },
  "fullProcessExample": "完整的功能过程内容示例（保持原始格式）",
  "writingGuidelines": "写作风格指南"
}
\`\`\``;

    const round2Response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是专业的需求文档分析师。请深度分析功能需求的格式，子节名称必须与模板完全一致。' },
        { role: 'user', content: round2Prompt }
      ],
      temperature: 0.1,
      max_tokens: 8000
    });

    let round2Result = {};
    const round2Match = round2Response.choices[0].message.content.match(/```json\s*([\s\S]*?)```/);
    if (round2Match) {
      try {
        round2Result = JSON.parse(round2Match[1]);
        console.log('[模板深度分析] 第2轮完成：识别到', round2Result.processContentTemplate?.sections?.length || 0, '个子节');
      } catch (e) {
        console.log('[模板深度分析] 第2轮JSON解析失败，使用默认值');
      }
    }

    // ========== 第三轮：子节结构精确提取 ==========
    console.log('[模板深度分析] 第3轮：子节结构精确提取');
    const round3Prompt = `你是专业的需求文档分析师。请【精确提取】功能过程的子节结构。

## 这是模板中功能需求章节的内容：
${funcContent.slice(0, 12000) || fullText.slice(0, 12000)}

## 第二轮分析识别到的子节：
${JSON.stringify(round2Result.processContentTemplate?.sections || [], null, 2)}

## 【最重要的任务】请精确提取每个子节的：
1. 精确名称（必须与模板原文完全一致，一字不差！）
2. 编号格式（如：5.1.1、5.1.2 还是 5.1.1.、5.1.2.）
3. 内容格式要求（文本、表格、列表、混合）
4. 示例内容（从模板中提取真实示例）

**请仔细检查模板原文，子节名称可能是：**
- 功能说明 / 功能描述 / 功能概述
- 业务规则 / 业务规则、模型和算法
- 处理数据 / 数据项说明 / 数据字段
- 接口 / 接口说明 / 外部接口
- 界面 / 界面要求 / 用户界面
- 验收标准 / 验收条件 / 测试要点

请输出JSON格式：
\`\`\`json
{
  "extractedSections": [
    {
      "name": "精确的子节名称（从模板复制）",
      "purpose": "子节的目的",
      "format": "text/table/list/mixed",
      "sampleContent": "从模板提取的示例内容（前200字）"
    }
  ],
  "sectionNumberFormat": "子节编号格式，如 X.X.X",
  "sectionNumberSeparator": "编号分隔符，如 . 或 、",
  "confidence": "high/medium/low",
  "notes": "任何需要注意的特殊情况"
}
\`\`\``;

    const round3Response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是专业的需求文档分析师。请精确提取子节结构，名称必须与模板原文完全一致！' },
        { role: 'user', content: round3Prompt }
      ],
      temperature: 0.1,
      max_tokens: 6000
    });

    let round3Result = {};
    const round3Match = round3Response.choices[0].message.content.match(/```json\s*([\s\S]*?)```/);
    if (round3Match) {
      try {
        round3Result = JSON.parse(round3Match[1]);
        console.log('[模板深度分析] 第3轮完成：精确提取到', round3Result.extractedSections?.length || 0, '个子节');
      } catch (e) {
        console.log('[模板深度分析] 第3轮JSON解析失败，使用第2轮结果');
      }
    }

    // ========== 合并分析结果 ==========
    console.log('[模板深度分析] 合并3轮分析结果...');
    
    // 使用第3轮更精确的子节结果，如果没有则回退到第2轮
    // 【修复】清理子节名称末尾的页码数字
    const finalSections = (round3Result.extractedSections?.map(s => s.name) || 
                          round2Result.processContentTemplate?.sections || [])
                          .map(s => typeof s === 'string' ? s.replace(/\s+\d{1,4}\s*$/, '').trim() : s);
    const finalSectionsDetailed = (round3Result.extractedSections || 
                                   round2Result.processContentTemplate?.sectionsDetailed || [])
                                   .map(s => ({...s, name: s.name?.replace(/\s+\d{1,4}\s*$/, '').trim()}));

    // 合并章节信息
    const allChaptersFromAI = round1Result.allChaptersDetailed || [];
    const mergedChapters = allChaptersFromAI.length > 0 ? allChaptersFromAI : sections;
    
    // 为章节添加level信息（如果AI没有提供），同时清理标题末尾的页码
    mergedChapters.forEach(c => {
      if (!c.level && c.number) {
        c.level = c.number.split('.').filter(Boolean).length;
      }
      // 【修复】清理标题末尾的页码数字
      if (c.title) {
        c.title = c.title.replace(/\s+\d{1,4}\s*$/, '').trim();
      }
    });

    // 构建 functionalChapter 对象
    const functionalChapter = {
      number: funcChapterNum,
      title: funcChapterTitle,
      hierarchyLevels: round2Result.hierarchyLevels || 2,
      processContentTemplate: {
        sections: finalSections,
        sectionsDetailed: finalSectionsDetailed,
        dataTableHeaders: round2Result.processContentTemplate?.dataTableHeaders || [],
        numberSeparator: round3Result.sectionNumberSeparator || round2Result.processContentTemplate?.numberSeparator || '.'
      }
    };
    
    const result = {
      documentStyle: round1Result.documentStyle || '正式、详细',
      numberFormat: round1Result.numberFormat || 'X.X.X',
      titleSeparator: round1Result.titleSeparator || ' ',
      mainChapters: round1Result.allChaptersDetailed || [],
      functionalChapterNumber: funcChapterNum,
      functionalChapterTitle: funcChapterTitle,
      functionalChapter: functionalChapter,
      headerChapterNumbers: round1Result.headerChapters || [],
      footerChapterNumbers: round1Result.footerChapters || [],
      specialFeatures: round1Result.specialFeatures || [],
      hierarchyLevels: round2Result.hierarchyLevels || 2,
      hierarchyStructure: round2Result.hierarchyStructure || {},
      processContentTemplate: functionalChapter.processContentTemplate,
      fullProcessExample: round2Result.fullProcessExample || functionalExampleContent || '',
      writingGuidelines: round2Result.writingGuidelines || '',
      originalTemplateText: fullText,
      sections: mergedChapters.length > sections.length ? mergedChapters : sections,
      allChapters: mergedChapters.length > sections.length ? mergedChapters : sections,
      analysisTime: new Date().toISOString(),
      analysisVersion: '3.0'
    };

    console.log('[模板深度分析] 完成！');
    console.log(`  - 章节总数: ${result.allChapters.length}`);
    console.log(`  - 功能需求章节: ${funcChapterNum} ${funcChapterTitle}`);
    console.log(`  - 子节结构: ${finalSections.join('、')}`);
    console.log(`  - 层级深度: ${result.hierarchyLevels}`);

    return result;

  } catch (error) {
    console.error('[模板深度分析] 失败:', error);
    return null;
  }
}

// 获取已保存的模板分析结果
app.get('/api/cosmic-to-spec/templates/:id/analysis', async (req, res) => {
  try {
    const templateId = req.params.id;
    const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_analysis.json`);

    if (fs.existsSync(analysisPath)) {
      const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
      res.json({ success: true, analysis });
    } else {
      res.json({ success: false, message: '该模板尚未进行深度分析' });
    }
  } catch (error) {
    console.error('获取模板分析失败:', error);
    res.status(500).json({ error: '获取模板分析失败: ' + error.message });
  }
});

// 用户修正模板分析结果
app.post('/api/cosmic-to-spec/templates/:id/analysis', async (req, res) => {
  try {
    const templateId = req.params.id;
    const { analysis } = req.body;

    if (!analysis) {
      return res.status(400).json({ error: '请提供分析结果' });
    }

    const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_analysis.json`);
    analysis.lastModified = new Date().toISOString();
    analysis.userModified = true;

    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

    // 更新缓存
    const cachedTemplate = specTemplatesCache.get(templateId) || {};
    cachedTemplate.analysis = analysis;
    specTemplatesCache.set(templateId, cachedTemplate);

    res.json({ success: true, message: '分析结果已保存' });
  } catch (error) {
    console.error('保存模板分析失败:', error);
    res.status(500).json({ error: '保存失败: ' + error.message });
  }
});

// 深度分析模板结构 - 增强版：两阶段深度分析
async function analyzeTemplateWithAI(client, templateText, progressCallback = null) {
  try {
    // ========== 第一阶段：结构分析 ==========
    if (progressCallback) progressCallback('phase1', '正在进行第一阶段：文档结构分析...');

    const phase1Prompt = `${TEMPLATE_ANALYSIS_PROMPT}

## 【完整模板原文】请仔细阅读并分析：
${templateText.slice(0, 20000)}

${templateText.length > 20000 ? `\n...(模板内容过长，已截断，总长度: ${templateText.length}字符)` : ''}

请输出完整的JSON分析结果：`;

    const phase1Response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        {
          role: 'system',
          content: `你是专业的需求文档分析师。你的任务是对模板进行**多维度深度分析**：
1. 不仅要识别章节标题，更要理解每个章节的**内容要求**和**写作规范**
2. 特别关注功能需求章节的**层级结构**和**内容模板**
3. 提取所有**示例内容**，这是最重要的参考
4. 识别**表格结构**，包括表头和用途
5. 分析**写作风格**和**用语规范**`
        },
        { role: 'user', content: phase1Prompt }
      ],
      temperature: 0.1,
      max_tokens: 12000
    });

    const phase1Content = phase1Response.choices[0].message.content.trim();
    console.log('模板分析第一阶段响应长度:', phase1Content.length);

    let analysis = null;
    const jsonMatch = phase1Content.match(/```json\s*([\s\S]*?)```/) || phase1Content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      analysis = JSON.parse(jsonStr);
    }

    if (!analysis) {
      console.error('第一阶段分析失败：无法解析JSON');
      return null;
    }

    // ========== 第二阶段：功能过程内容模板深度分析 ==========
    if (progressCallback) progressCallback('phase2', '正在进行第二阶段：功能过程内容模板深度分析...');

    // 从模板中提取功能过程的示例内容
    const funcProcessExample = extractFunctionalProcessExample(templateText);

    if (funcProcessExample) {
      const phase2Prompt = `你是需求文档分析专家。请深度分析以下**功能过程示例**，提取其**内容模板**。

## 【功能过程示例原文】
${funcProcessExample}

## 【分析任务】
请分析这个功能过程示例，提取：
1. **子节结构**：功能过程下有哪些子节？（如：功能说明、业务规则、处理数据等）
2. **每个子节的格式**：是文本、表格还是列表？
3. **表格的表头**：如果有表格，表头是什么？
4. **内容要点**：每个子节需要包含哪些内容要点？
5. **写作风格**：使用什么样的语言风格？

## 【输出格式】JSON
\`\`\`json
{
  "processContentTemplate": {
    "sections": [
      {
        "name": "子节名称",
        "titleFormat": "子节标题的格式（如：##### 功能说明）",
        "format": "text/table/list",
        "tableHeaders": ["表头1", "表头2"],
        "contentPoints": ["内容要点1", "内容要点2"],
        "sampleContent": "示例内容片段"
      }
    ],
    "overallStructure": "整体结构描述",
    "writingStyle": "写作风格描述"
  }
}
\`\`\``;

      try {
        const phase2Response = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'glm-4-flash',
          messages: [
            { role: 'system', content: '你是需求文档分析专家，擅长提取文档的内容模板和写作规范。' },
            { role: 'user', content: phase2Prompt }
          ],
          temperature: 0.1,
          max_tokens: 4000
        });

        const phase2Content = phase2Response.choices[0].message.content.trim();
        const phase2Match = phase2Content.match(/```json\s*([\s\S]*?)```/) || phase2Content.match(/\{[\s\S]*\}/);

        if (phase2Match) {
          const phase2Json = JSON.parse(phase2Match[1] || phase2Match[0]);
          // 合并第二阶段分析结果
          if (phase2Json.processContentTemplate) {
            analysis.functionalChapter = analysis.functionalChapter || {};
            analysis.functionalChapter.processContentTemplate = phase2Json.processContentTemplate;
          }
          console.log('第二阶段分析完成：功能过程内容模板已提取');
        }
      } catch (e) {
        console.log('第二阶段分析失败，使用第一阶段结果:', e.message);
      }
    }

    // ========== 第三阶段：提取关键示例内容 ==========
    if (progressCallback) progressCallback('phase3', '正在提取关键示例内容...');

    // 提取模板中的所有表格示例
    const tableExamples = extractTableExamples(templateText);
    analysis.templateExamples = analysis.templateExamples || {};
    analysis.templateExamples.tableExamples = tableExamples;
    analysis.templateExamples.functionalProcessExample = funcProcessExample || '';

    // 保存原始模板文本到分析结果中，供后续生成使用
    analysis.originalTemplateText = templateText;
    analysis.analysisVersion = '3.0'; // 标记为深度增强版分析
    analysis.analysisTime = new Date().toISOString();

    // ========== 【核心修复】确保 allChapters 和 functionalChapterNumber 被正确设置 ==========
    // 如果 AI 没有返回 allChapters，从模板文本中自动解析
    if (!analysis.allChapters || analysis.allChapters.length === 0) {
      analysis.allChapters = parseChaptersFromText(templateText);
      console.log('[兜底解析] 从模板文本中解析出章节:', analysis.allChapters.length);
    }
    
    // 确保 sections 字段也存在
    if (!analysis.sections) {
      analysis.sections = analysis.allChapters;
    }
    
    // 确保 functionalChapterNumber 被正确设置
    if (!analysis.functionalChapterNumber) {
      // 从 allChapters 中查找功能需求章节
      const funcChapter = analysis.allChapters.find(c => 
        c.title?.includes('功能需求') || c.title?.includes('功能要求')
      );
      if (funcChapter) {
        analysis.functionalChapterNumber = funcChapter.number.split('.')[0];
        console.log('[兜底检测] 从章节中检测到功能需求章节编号:', analysis.functionalChapterNumber);
      } else {
        analysis.functionalChapterNumber = '5'; // 大多数模板是5
        console.log('[兜底默认] 使用默认功能需求章节编号: 5');
      }
    }
    
    // 确保 functionalChapter 对象存在
    if (!analysis.functionalChapter) {
      analysis.functionalChapter = {};
    }
    analysis.functionalChapter.number = analysis.functionalChapterNumber;
    
    // 尝试设置功能需求章节标题
    const funcChapterInfo = analysis.allChapters.find(c => 
      c.number === analysis.functionalChapterNumber || 
      c.title?.includes('功能需求')
    );
    if (funcChapterInfo) {
      analysis.functionalChapter.title = funcChapterInfo.title;
    }

    // ========== 第四阶段（新增）：章节完整性验证与补全 ==========
    if (progressCallback) progressCallback('phase4', '正在进行第四阶段：章节完整性验证...');
    
    // 使用正则从原文中提取所有章节标题进行交叉验证
    const textChapters = parseChaptersFromTextEnhanced(templateText);
    const aiChapterNumbers = new Set(analysis.allChapters.map(c => c.number));
    const missingChapters = textChapters.filter(c => !aiChapterNumbers.has(c.number));
    
    if (missingChapters.length > 0) {
      console.log(`[章节验证] 发现 ${missingChapters.length} 个AI遗漏的章节，正在补充...`);
      // 合并遗漏的章节
      analysis.allChapters = mergeAndSortChapters(analysis.allChapters, missingChapters);
      analysis.sections = analysis.allChapters;
      console.log(`[章节验证] 补充后章节总数: ${analysis.allChapters.length}`);
    }

    // ========== 第五阶段（新增）：功能过程子节深度验证 ==========
    if (progressCallback) progressCallback('phase5', '正在进行第五阶段：功能过程子节深度验证...');
    
    // 从模板文本中直接提取功能过程的子节结构
    const extractedSubSections = extractFunctionalSubSectionsFromText(templateText, analysis.functionalChapterNumber);
    
    // 如果AI分析的子节结构不完整，使用文本提取的结果补充
    const aiSubSections = analysis.functionalChapter?.processContentTemplate?.sections || [];
    const aiSubSectionNames = new Set(aiSubSections.map(s => typeof s === 'string' ? s : (s.name || '')));
    
    if (extractedSubSections.length > aiSubSectionNames.size) {
      console.log(`[子节验证] AI识别 ${aiSubSectionNames.size} 个子节，文本提取 ${extractedSubSections.length} 个子节`);
      analysis.functionalChapter = analysis.functionalChapter || {};
      analysis.functionalChapter.processContentTemplate = analysis.functionalChapter.processContentTemplate || {};
      analysis.functionalChapter.processContentTemplate.sections = extractedSubSections.map(s => ({
        name: s.title,
        number: s.number,
        format: s.hasTable ? 'table' : (s.hasList ? 'list' : 'text'),
        titleFormat: s.titleFormat || `### ${s.number}. ${s.title}`
      }));
      console.log(`[子节验证] 已更新功能过程子节结构:`, extractedSubSections.map(s => s.title));
    }

    console.log('模板深度分析完成:', {
      章节数: analysis.allChapters?.length || 0,
      功能需求章节: analysis.functionalChapter?.number || '未识别',
      功能需求标题: analysis.functionalChapter?.title || '未识别',
      功能过程子节数: analysis.functionalChapter?.processContentTemplate?.sections?.length || 0,
      表格示例数: tableExamples.length,
      分析版本: analysis.analysisVersion
    });

    return analysis;
  } catch (error) {
    console.error('AI分析模板失败:', error.message);
    return null;
  }
}

// 从模板文本中解析章节结构（兜底函数）
function parseChaptersFromText(templateText) {
  const lines = templateText.split('\n');
  const chapters = [];
  
  // 章节编号正则表达式：匹配 "1. 引言"、"1.1 概述"、"1.1.1 背景" 等格式
  const chapterRegex = /^(\d+(?:\.\d+)*)[.\s、]+(.+?)$/;
  
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(chapterRegex);
    
    if (match) {
      const number = match[1];
      const title = match[2].trim();
      const level = number.split('.').length;
      
      // 排除过长的标题（可能是正文）和过深的层级
      if (title.length <= 50 && level <= 6) {
        chapters.push({
          number,
          title,
          level
        });
      }
    }
  }
  
  console.log(`[parseChaptersFromText] 从文本中解析出 ${chapters.length} 个章节`);
  return chapters;
}

/**
 * 【增强版】从模板文本中解析章节结构 - 使用多种正则模式提高识别率
 */
function parseChaptersFromTextEnhanced(templateText) {
  const lines = templateText.split('\n');
  const chapters = [];
  const seenNumbers = new Set();
  
  // 多种章节编号格式的正则表达式
  const patterns = [
    /^(\d+(?:\.\d+)*)[.\s、]+(.+?)$/,                    // 1. 标题 或 1.1 标题
    /^(\d+(?:\.\d+)*)\s+([^\d\t][^\t]{1,50})$/,          // 1.1 标题（中间空格）
    /^第(\d+)章\s*(.+?)$/,                               // 第1章 标题
    /^(\d+(?:\.\d+)*)[、．.]\s*(.+?)$/,                  // 1、标题 或 1．标题
    /^##+\s*(\d+(?:\.\d+)*)[.\s、]*(.+?)$/,              // ## 1.1 标题（Markdown格式）
  ];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 2) continue;
    
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        let number = match[1];
        let title = match[2].trim();
        
        // 处理"第X章"格式
        if (pattern.source.includes('第')) {
          number = match[1]; // 只是数字
        }
        
        // 排除无效标题
        if (title.length < 2 || title.length > 60) continue;
        if (/^\d+$/.test(title)) continue; // 标题不能是纯数字
        if (/^[-=_]{3,}$/.test(title)) continue; // 排除分隔线
        
        const level = number.split('.').length;
        if (level > 6) continue; // 层级不能太深
        
        // 去重
        if (!seenNumbers.has(number)) {
          seenNumbers.add(number);
          chapters.push({
            number,
            title,
            level
          });
        }
        break; // 匹配成功后跳出内层循环
      }
    }
  }
  
  // 按编号排序
  chapters.sort((a, b) => {
    const aParts = a.number.split('.').map(Number);
    const bParts = b.number.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal !== bVal) return aVal - bVal;
    }
    return 0;
  });
  
  console.log(`[parseChaptersFromTextEnhanced] 从文本中解析出 ${chapters.length} 个章节`);
  return chapters;
}

/**
 * 合并并排序章节列表
 */
function mergeAndSortChapters(existingChapters, newChapters) {
  const merged = [...existingChapters];
  const existingNumbers = new Set(existingChapters.map(c => c.number));
  
  for (const chapter of newChapters) {
    if (!existingNumbers.has(chapter.number)) {
      merged.push(chapter);
      existingNumbers.add(chapter.number);
    }
  }
  
  // 按编号排序
  merged.sort((a, b) => {
    const aParts = a.number.split('.').map(Number);
    const bParts = b.number.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal !== bVal) return aVal - bVal;
    }
    return 0;
  });
  
  return merged;
}

/**
 * 【新增】从模板文本中直接提取功能过程的子节结构
 * 这个函数会找到功能需求章节下第一个功能过程的子节，并提取其标题
 */
function extractFunctionalSubSectionsFromText(templateText, funcChapterNum = '5') {
  const lines = templateText.split('\n');
  const subSections = [];
  let inFunctionalSection = false;
  let foundFirstProcess = false;
  let firstProcessNumber = null;
  
  // 构建正则表达式
  const funcStartRegex = new RegExp(`^${funcChapterNum}[.\\s、]`);
  const processRegex = new RegExp(`^(${funcChapterNum}\\.\\d+)[.\\s、]+(.+)`);
  const subSectionRegex = new RegExp(`^(${funcChapterNum}\\.\\d+\\.\\d+)[.\\s、]+(.+)`);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // 检测功能需求章节开始
    if (funcStartRegex.test(trimmed) && trimmed.includes('功能')) {
      inFunctionalSection = true;
      continue;
    }
    
    if (!inFunctionalSection) continue;
    
    // 检测功能过程（如 5.1 XXX功能）
    const processMatch = trimmed.match(processRegex);
    if (processMatch && !foundFirstProcess) {
      foundFirstProcess = true;
      firstProcessNumber = processMatch[1];
      continue;
    }
    
    // 如果已经找到第一个功能过程，检测其子节
    if (foundFirstProcess && firstProcessNumber) {
      const expectedSubSectionPrefix = firstProcessNumber + '.';
      
      // 如果遇到下一个功能过程（如 5.2），停止收集
      const nextProcessMatch = trimmed.match(processRegex);
      if (nextProcessMatch && nextProcessMatch[1] !== firstProcessNumber) {
        break;
      }
      
      // 检测子节（如 5.1.1 功能说明）
      const subSectionMatch = trimmed.match(subSectionRegex);
      if (subSectionMatch && subSectionMatch[1].startsWith(expectedSubSectionPrefix)) {
        const number = subSectionMatch[1];
        const title = subSectionMatch[2].trim();
        
        // 检测格式特征
        const nextLines = lines.slice(lines.indexOf(line) + 1, lines.indexOf(line) + 10).join('\n');
        const hasTable = nextLines.includes('|') && nextLines.split('|').length > 3;
        const hasList = /^[\-\*\d]+[\.、\)]\s/.test(nextLines);
        
        subSections.push({
          number,
          title,
          level: number.split('.').length,
          hasTable,
          hasList,
          titleFormat: `### ${number}. ${title}`
        });
      }
    }
    
    // 检测是否离开功能需求章节
    const nextChapterMatch = trimmed.match(/^(\d+)[.\s、]/);
    if (nextChapterMatch && parseInt(nextChapterMatch[1]) > parseInt(funcChapterNum)) {
      break;
    }
  }
  
  console.log(`[extractFunctionalSubSectionsFromText] 提取到 ${subSections.length} 个子节:`, 
    subSections.map(s => s.title).join('、'));
  return subSections;
}

/**
 * 【核心修复】修正AI输出中的错误子节编号
 * AI经常忽略正确的编号要求，输出如 5.1.1 而不是 5.7.1
 * 这个函数会检测并修正所有错误的子节编号
 * 
 * @param {string} content - AI生成的内容
 * @param {string} correctPrefix - 正确的功能过程编号前缀（如 "5.7"）
 * @param {string} separator - 编号分隔符（如 "."）
 * @param {Array} expectedSections - 期望的子节名称列表
 * @returns {string} 修正后的内容
 */
function fixSubSectionNumbers(content, correctPrefix, separator, expectedSections) {
  if (!content || !correctPrefix || !expectedSections || expectedSections.length === 0) {
    return content;
  }
  
  let fixedContent = content;
  let fixCount = 0;
  
  // 提取正确前缀的各部分
  const prefixParts = correctPrefix.split('.');
  const baseChapterNum = prefixParts[0]; 
  const correctProcessNum = prefixParts[1];
  
  // 遍历每个期望的子节，强制修正其编号
  expectedSections.forEach((sectionName, idx) => {
    const subSectionNum = idx + 1;
    const correctSectionNum = `${correctPrefix}${separator}${subSectionNum}`;
    
    // 提取核心名称
    const coreName = sectionName.replace(/[（(][^）)]*[）)]/g, '').trim();
    const escapedName = coreName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 匹配任何类似的标题： 5.X.Y 核心名称
    // 宽松匹配：允许中间有任意数字，允许名称前后有其他字符
    const pattern = new RegExp(
      `(#{2,6}\\s*)${baseChapterNum}\\s*[.．]\\s*\\d+\\s*[.．]\\s*\\d+([.．、\\s]+.*${escapedName})`,
      'gi'
    );
    
    fixedContent = fixedContent.replace(pattern, (match, prefix, suffix) => {
      const corrected = `${prefix}${correctSectionNum}${suffix}`;
      if (match !== corrected) {
        fixCount++;
        return corrected;
      }
      return match;
    });
  });
  
  // 额外通用修正：修正单纯的 5.1.1 格式 (如果它显然是错误的)
  // 仅当明确知道它应该是第几个子节时才修正 (基于位置或顺序很难确定，这里保守处理)
  
  if (fixCount > 0) {
    console.log(`[fixSubSectionNumbers] 修正了 ${fixCount} 处错误的子节编号，正确前缀: ${correctPrefix}`);
  }
  
  return fixedContent;
}

/**
 * 【核心修复】重组AI输出的内容，确保子节标题和内容匹配
 * AI经常把内容放错位置，这个函数会根据内容特征重新组织
 * 
 * 问题场景：AI生成的内容整体错位，例如：
 * - 5.6.4 接口 → 显示的是业务规则内容
 * - 5.6.5 界面 → 显示的是接口表格
 * - 5.6.6 验收标准 → 显示的是界面内容
 * 
 * 解决方案：基于内容特征智能匹配，而不是仅依赖编号
 * 
 * @param {string} content - AI生成的内容
 * @param {string} prefix - 功能过程编号前缀（如 "5.4"）
 * @param {Array} expectedSections - 期望的子节名称列表
 * @param {string} separator - 编号分隔符
 * @returns {string} 重组后的内容
 */
function reorganizeContent(content, prefix, expectedSections, separator = '.') {
  if (!content || !prefix || !expectedSections || expectedSections.length === 0) {
    return content;
  }
  
  console.log(`[reorganizeContent] 开始重组内容，前缀: ${prefix}, 子节数: ${expectedSections.length}`);
  
  // 【关键修复】定义每种子节类型的内容特征关键词
  // 用于智能识别内容应该属于哪个子节
  // 增强版：优化关键词以避免冲突，提高识别准确率
  const sectionContentFeatures = {
    '功能说明': {
      // 【修复】收窄关键词范围，避免误吸收其他子节内容
      // 【关键修复】操作流程应该属于功能说明，不应被重新分配
      keywords: [
        '使用场景', '功能目的', '功能描述', '业务背景', '前置条件', '后置条件',
        '功能概述', '功能目标', '业务价值', '用户故事', '功能旨在'
      ],
      patterns: [
        /功能[用于是旨]/, /本功能.*[允许支持实现]/, /该功能.*[用于实现]/, /功能目的[：:]/,
        /操作流程[：:]/, /步骤\d+[：:.]/, /用户.*[进入输入点击选择]/, /系统.*[显示提示返回]/
      ],
      weight: 0.9,  // 降低权重，避免误吸收
      // 排他性关键词：如果出现这些，则不是功能说明
      excludePatterns: [/验收标准\d+/, /请求参数[：:]/, /响应参数[：:]/, /规则\d+[：:]/, /标准\d+[：:]/, /\|\s*字段[名]?\s*\|/]
    },
    '业务规则': {
      keywords: ['规则1', '规则2', '规则3', '规则4', '规则5', '规则：', '校验规则', '权限控制', '数据校验', '业务约束', '约束条件', '限制条件', '业务逻辑', '模型', '算法'],
      patterns: [/规则\d+[：:．.\s]/, /[•·-]\s*规则\d*[：:]/, /必须[满足符合]/, /不[能允许得]超过/, /需要[验证校验]/, /BR-\d+/],
      weight: 1.5,  // 提高权重
      excludePatterns: [/验收标准\d+/]
    },
    '处理数据': {
      keywords: ['字段名', '字段说明', '数据字典', '主键', '外键', '是否必填', '数据类型', '数据项', '数据表'],
      patterns: [/\|\s*字段[名]?\s*\|/, /\|\s*类型\s*\|/, /\|\s*长度\s*\|/, /\|\s*\w+\s*\|\s*(int|Integer|String|VARCHAR|TEXT|DATETIME)/i, /\|\s*说明\s*\|/],
      weight: 1.6,  // 表格特征非常明显，权重最高
      excludePatterns: [/请求参数/, /响应参数/]
    },
    '接口': {
      keywords: ['请求参数', '响应参数', '接口地址', 'API', 'URL', 'HTTP', 'POST', 'GET', '错误码', '状态码', '返回值', '请求方法', '响应结果', '接口说明', '入参', '出参', '生成请求接口', '数据读取接口', '数据写入接口', '报告输出接口'],
      patterns: [/请求参数[：:]/, /响应参数[：:]/, /错误码[：:]/, /\d{3}[：:]\s*[操作请求]/, /200[：:]\s*[操作成功]/, /400[：:]\s*[请求参数]/, /接口[：:]/],
      weight: 1.5,
      excludePatterns: []
    },
    '界面': {
      // 增加界面特有关键词，包括界面操作描述
      keywords: ['界面布局', '页面元素', '交互元素', '按钮', '输入框', '下拉框', '表单', '弹窗', '页面设计', '界面设计', '用户界面', 'UI', '交互设计', '编辑页面', '列表页面', '详情页面', '管理界面', '登录界面', '管理员界面', '简单的页面', '后台管理界面', '界 供'],
      patterns: [/界面[包含显示提供]/, /页面[布局设计包含]/, /用户[点击输入选择进入].*[按钮页面界面]/, /显示.*[信息列表]/, /界面.*[遵循风格]/, /[登录编辑详情管理].*界面/, /界\s*供/, /管理员界面/],
      weight: 1.4,
      excludePatterns: [/验收标准\d+/, /规则\d+[：:]/]
    },
    '验收标准': {
      // 验收标准有非常明确的格式特征
      keywords: ['验收标准', '测试用例', '预期结果', '边界条件', '用例编号', '测试场景', '验收条件', '通过标准', '功能验收', '验收标准1', '验收标准2', '验收标准3', '验收标准4', '验收标准5', '标准1', '标准2', '标准3', '标准4', '标准5', '功能正常执行', '数据正确保存'],
      patterns: [/验收标准\d+[：:]/, /[•·-]\s*验收标准\d+/, /验收\d+[：:]/, /测试[用例场景][：:]/, /预期[结果输出][：:]/, /标准\d+[：:]/, /功能正常执行/],
      weight: 1.7,  // 验收标准格式最明确，权重最高
      excludePatterns: []
    }
  };
  
  // 解析内容，提取每个子节的标题和内容
  // 【增强】支持多种标题格式，包括被截断的标题
  // 构建灵活的前缀正则 (允许 5. 1 这种空格)
  const flexiblePrefix = prefix.split('.').join('\\s*\\.\\s*');
  
  const sectionPatterns = [
    // Standard format: ### 5.1.1 功能说明
    new RegExp(
      `(#{2,6}\\s*${flexiblePrefix}\\s*\\.\\s*(\\d+)[.．、\\s]+([^\\n]+))\\n([\\s\\S]*?)(?=#{2,6}\\s*${flexiblePrefix}\\s*\\.\\s*\\d+|$)`,
      'g'
    ),
    // No # format: 5.1.1 功能说明 or 5.1.1. 功能说明
    new RegExp(
      `((?:^|\\n)\\s*${flexiblePrefix}\\s*\\.\\s*(\\d+)[.．、\\s]+([^\\n]+))\\n([\\s\\S]*?)(?=(?:^|\\n)\\s*${flexiblePrefix}\\s*\\.\\s*\\d+|$)`,
      'gm'
    )
  ];
  
  const parsedSections = [];
  let match;
  
  // 尝试多种模式匹配
  for (const sectionPattern of sectionPatterns) {
    let loopCount = 0;
    while ((match = sectionPattern.exec(content)) !== null && loopCount++ < 50) {
      const sectionNum = parseInt(match[2]);
      // 【修改】Allow duplicate additions, merge later
      parsedSections.push({
        fullTitle: match[1].trim(),
        sectionNum: sectionNum,
        sectionName: match[3].trim(),
        content: match[4].trim(),
        originalIndex: parsedSections.length
      });
    }
    if (parsedSections.length > 0) break; // 如果找到了就不用尝试其他模式
  }
  
  // 按子节编号排序
  parsedSections.sort((a, b) => a.sectionNum - b.sectionNum);

  // 【健壮性】过滤/合并异常的短标题（如 "验"），避免错位
  if (parsedSections.length > 0) {
    const cleaned = [];
    parsedSections.forEach((p, idx) => {
      const name = (p.sectionName || '').trim();
      // 判断标题是否有效：长度>=2 且 与期望子节至少部分匹配
      const maybeMatchesExpected = expectedSections.some(sec => {
        if (!sec) return false;
        const secClean = sec.replace(/\s+/g, '');
        const nameClean = name.replace(/\s+/g, '');
        return (
          sec.includes(nameClean) ||
          nameClean.includes(secClean.slice(0, 2)) ||
          secClean.includes(nameClean)
        );
      });

      if (name.length >= 2 && maybeMatchesExpected) {
        cleaned.push(p);
      } else {
        // 将异常标题的内容合并到前一个合法子节，避免生成孤立段
        if (cleaned.length > 0) {
          cleaned[cleaned.length - 1].content += '\n\n' + p.content;
        } else {
          // 如果没有前一个，就保留但标记为默认名称，防止后续崩溃
          p.sectionName = name || '内容';
          cleaned.push(p);
        }
      }
    });
    parsedSections.length = 0;
    parsedSections.push(...cleaned);
  }

  // 【新增】按编号强制校正标题文本，与期望子节对齐，避免残缺标题如“验”
  if (parsedSections.length > 0) {
    parsedSections.forEach(p => {
      const expectedName = expectedSections[p.sectionNum - 1];
      if (!expectedName) return;
      const expectedClean = expectedName.replace(/\s+/g, '');
      const nameClean = (p.sectionName || '').replace(/\s+/g, '');
      const similar =
        nameClean.length >= 2 &&
        (nameClean.includes(expectedClean.slice(0, 2)) || expectedClean.includes(nameClean));
      if (!similar) {
        p.sectionName = expectedName;
        // 同步更新 fullTitle 中的标题文本（保留编号和#级别）
        p.fullTitle = p.fullTitle.replace(/(\d+\s*[.．、\s]+\s*)(.+)$/, `$1${expectedName}`);
      }
    });
  }

  if (parsedSections.length === 0) {
    // console.log(`[reorganizeContent] 未能解析出子节，返回原内容`);
    return content;
  }
  
  console.log(`[reorganizeContent] 解析出 ${parsedSections.length} 个子节: ${parsedSections.map(p => `${p.sectionNum}:${p.sectionName.slice(0,4)}`).join(', ')}`);
  
  // 【核心逻辑】基于内容特征检测每个子节的内容是否正确
  // 计算每个解析出的内容与每个期望子节的匹配分数
  function calculateMatchScore(contentText, sectionType) {
    if (!contentText || !sectionType) return 0;
    
    let score = 0;
    // const contentLower = contentText.toLowerCase();
    
    // 遍历所有子节类型，找到最匹配的
    for (const [typeName, features] of Object.entries(sectionContentFeatures)) {
      if (sectionType.includes(typeName) || typeName.includes(sectionType.replace(/[、，,]/g, '').slice(0, 4))) {
        // 关键词匹配
        for (const keyword of features.keywords) {
          if (contentText.includes(keyword)) {
            score += 10;
          }
        }
        // 正则模式匹配
        for (const pattern of features.patterns) {
          if (pattern.test(contentText)) {
            score += 15;
          }
        }
        break;
      }
    }
    
    return score;
  }
  
  // 【关键函数】检测内容的实际类型
  // 基于内容特征关键词和模式，返回最匹配的子节类型名称
  function detectActualSectionType(contentText, expectedSections = []) {
    if (!contentText || contentText.trim().length === 0) return null;
    
    // 仅在期望子节列表范围内做识别，降低误判
    const allTypes = Object.keys(sectionContentFeatures);
    const candidateTypes = (expectedSections || [])
      .map(name => {
        const clean = (name || '').replace(/[．.\s]/g, '');
        return allTypes.find(type =>
          (name && name.includes(type)) ||
          (clean && type.includes(clean.slice(0, 4))) ||
          (clean && clean.includes(type.replace(/[、，,]/g, '').slice(0, 4)))
        );
      })
      .filter(Boolean);
    const typePool = candidateTypes.length > 0 ? Array.from(new Set(candidateTypes)) : allTypes;
    
    let bestMatch = null;
    let bestScore = 0;
    let secondScore = 0;
    
    for (const typeName of typePool) {
      const features = sectionContentFeatures[typeName];
      let score = 0;
      
      // 检查排他性模式
      let excluded = false;
      if (features.excludePatterns) {
        for (const pattern of features.excludePatterns) {
          if (pattern.test(contentText)) {
            excluded = true;
            break;
          }
        }
      }
      if (excluded) continue;
      
      // 关键词匹配
      for (const keyword of features.keywords) {
        if (contentText.includes(keyword)) {
          score += 10;
        }
      }
      
      // 正则模式匹配
      for (const pattern of features.patterns) {
        if (pattern.test(contentText)) {
          score += 15;
        }
      }
      
      // 应用权重
      score *= (features.weight || 1.0);
      
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        bestMatch = typeName;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }
    
    // 【关键修复】大幅提高阈值，避免误判导致内容重新分配
    // 只有在非常确定内容类型错误时才进行重组
    const strongEnough = bestScore >= 40;            // 大幅提高基础可信度阈值
    const clearMargin = bestScore - secondScore >= 20; // 大幅提高领先幅度要求
    
    // 【修复】对"功能说明"类型禁用自动检测，避免误判
    // 功能说明内容多样化，容易误判，不应该被自动重新分配
    if (bestMatch === '功能说明') {
      return null; // 禁用功能说明的自动检测，避免误判
    }
    
    return strongEnough && clearMargin ? bestMatch : null;
  }
  
  // 【增强】检查子节名称是否与内容类型匹配
  // 支持复合名称如 "业务规则、模型和算法"
  function sectionNameMatchesType(sectionName, contentType) {
    if (!sectionName || !contentType) return false;
    
    // 直接包含检查
    if (sectionName.includes(contentType)) return true;
    if (contentType.includes(sectionName.slice(0, 4))) return true;
    
    // 特殊映射：处理复合名称
    const typeAliases = {
      '业务规则': ['规则', '模型', '算法', '业务逻辑'],
      '处理数据': ['数据', '字段', '数据表'],
      '功能说明': ['说明', '描述', '概述'],
      '接口': ['接口', 'API', '服务'],
      '界面': ['界面', 'UI', '页面', '交互'],
      '验收标准': ['验收', '标准', '测试', '用例']
    };
    
    const aliases = typeAliases[contentType] || [];
    for (const alias of aliases) {
      if (sectionName.includes(alias)) return true;
    }
    
    return false;
  }
  
  // 【关键修复】大幅提高内容错位检测的阈值，避免误判
  // 只有在非常明确的情况下才进行内容重组
  let hasContentMismatch = false;
  const contentMapping = new Map(); // 存储内容应该属于哪个子节
  let mismatchCount = 0;
  
  parsedSections.forEach((parsed, idx) => {
    const expectedSectionName = expectedSections[parsed.sectionNum - 1] || '';
    const actualType = detectActualSectionType(parsed.content, expectedSections);
    
    // 【修复】只有当检测到明确的内容类型且与标题完全不匹配时才标记为错位
    if (actualType) {
      const titleMatchesContent = sectionNameMatchesType(expectedSectionName, actualType);
      
      if (!titleMatchesContent) {
        mismatchCount++;
        console.log(`[reorganizeContent] 检测到可能的内容错位: 子节 ${parsed.sectionNum} "${expectedSectionName}" 的内容可能是 "${actualType}" 类型`);
        
        // 找到这个内容应该属于哪个子节
        for (let i = 0; i < expectedSections.length; i++) {
          const targetSection = expectedSections[i];
          if (sectionNameMatchesType(targetSection, actualType)) {
            contentMapping.set(parsed.content, i + 1); // 存储正确的子节编号
            break;
          }
        }
      }
    }
  });
  
  // 【关键修复】只有当大部分子节都错位时才进行重组（至少50%以上）
  // 避免因为个别误判导致整体内容被错误重组
  if (mismatchCount > 0 && mismatchCount >= parsedSections.length * 0.5) {
    hasContentMismatch = true;
    console.log(`[reorganizeContent] 检测到严重的内容错位（${mismatchCount}/${parsedSections.length}个子节），将进行智能重组`);
  } else if (mismatchCount > 0) {
    console.log(`[reorganizeContent] 检测到少量可能的错位（${mismatchCount}/${parsedSections.length}个子节），但不足以触发重组，保持原有结构`);
  }
  
  // 【修复】只有在检测到严重内容错位时才进行智能重组
  if (hasContentMismatch) {
    console.log(`[reorganizeContent] 检测到内容错位，开始智能重组...`);
    
    // 【新增】构建用于清理内容中残留子节标题的正则
    const flexPrefixForClean = prefix.split('.').join('\\s*\\.\\s*');
    const subSectionTitlePattern = new RegExp(
      `#{2,6}\\s*${flexPrefixForClean}\\s*\\.\\s*\\d+[.．、\\s]+[^\\n]*\\n?`,
      'g'
    );
    
    // 创建一个新的内容映射，基于内容特征而不是编号
    const reorganizedContents = new Array(expectedSections.length).fill('');
    const processedIndices = new Set(); // 记录已处理的parsedSections索引
    
    // 1. 基于内容特征的智能分配
    parsedSections.forEach((parsed, pIdx) => {
      const actualType = detectActualSectionType(parsed.content, expectedSections);
      let matched = false;
      
      if (actualType) {
        for (let i = 0; i < expectedSections.length; i++) {
          const targetSection = expectedSections[i];
          if (sectionNameMatchesType(targetSection, actualType)) {
            // 【修复】清理内容中残留的子节标题，避免重复输出
            const cleanedContent = parsed.content.replace(subSectionTitlePattern, '').trim();
            reorganizedContents[i] += (reorganizedContents[i] ? '\n\n' : '') + cleanedContent;
            processedIndices.add(pIdx);
            matched = true;
            break;
          }
        }
      }
    });
    
    // 2. 对于没有匹配到的内容，按原编号放置（兜底）
    parsedSections.forEach((parsed, pIdx) => {
      if (!processedIndices.has(pIdx) && parsed.sectionNum <= expectedSections.length) {
        const targetIdx = parsed.sectionNum - 1;
        // 【修复】清理内容中残留的子节标题
        const cleanedContent = parsed.content.replace(subSectionTitlePattern, '').trim();
        reorganizedContents[targetIdx] += (reorganizedContents[targetIdx] ? '\n\n' : '') + cleanedContent;
      }
    });
    
    // 3. 构建最终输出
    let reorganized = '';
    const dotCount = (prefix.match(/\./g) || []).length;
    const headingLevel = Math.min(dotCount + 3, 6);
    const hashes = '#'.repeat(headingLevel);
    
    expectedSections.forEach((section, idx) => {
      const sectionNum = `${prefix}${separator}${idx + 1}`;
      reorganized += `${hashes} ${sectionNum} ${section}\n\n`;
      
      if (reorganizedContents[idx]) {
        reorganized += reorganizedContents[idx] + '\n\n';
      } else {
        reorganized += generateDefaultContent(section, '') + '\n\n';
      }
    });
    
    console.log(`[reorganizeContent] 智能重组完成`);
    return reorganized;
  }
  
  // 【关键修复】禁用funcDescMarkers逻辑，避免误判导致内容错位
  // 操作流程等内容应该保留在原位置，不应被强制移动到功能说明
  // 如果没有检测到错位，直接使用原有逻辑，不进行额外的内容重分配
  
  // 重组内容 - 保持原有结构，不进行内容重分配
  let reorganized = '';
  const dotCount = (prefix.match(/\./g) || []).length;
  const headingLevel = Math.min(dotCount + 3, 6);
  const hashes = '#'.repeat(headingLevel);
  
  // 【修复】构建用于清理内容中残留子节标题的正则
  const flexPrefixForClean = prefix.split('.').join('\\s*\\.\\s*');
  const subSectionTitlePattern = new RegExp(
    `#{2,6}\\s*${flexPrefixForClean}\\s*\\.\\s*\\d+[.．、\\s]+[^\\n]*\\n?`,
    'g'
  );
  
  expectedSections.forEach((section, idx) => {
    const sectionNum = `${prefix}${separator}${idx + 1}`;
    reorganized += `${hashes} ${sectionNum} ${section}\n\n`;
    
    const matchedParsed = parsedSections.find(p => p.sectionNum === idx + 1);
    
    if (matchedParsed && matchedParsed.content) {
      // 【修复】清理内容中残留的子节标题，避免重复输出
      const cleanedContent = matchedParsed.content.replace(subSectionTitlePattern, '').trim();
      reorganized += cleanedContent + '\n\n';
    } else {
      reorganized += generateDefaultContent(section, '') + '\n\n';
    }
  });
  
  console.log(`[reorganizeContent] 重组完成`);
  return reorganized;
}

/**
 */
function generateDefaultContent(sectionName, processName) {
  if (sectionName.includes('功能说明') || sectionName.includes('功能描述')) {
    return `本功能用于${processName || '相关操作'}。\n\n**操作流程：**\n1. 用户进入功能界面\n2. 执行相关操作\n3. 系统处理并返回结果`;
  } else if (sectionName.includes('业务规则') || sectionName.includes('规则')) {
    return `- 规则1：数据必须符合系统要求\n- 规则2：操作需要相应权限`;
  } else if (sectionName.includes('处理数据') || sectionName.includes('数据')) {
    return `| 字段名 | 类型 | 说明 |\n|--------|------|------|\n| id | Integer | 主键ID |`;
  } else if (sectionName.includes('接口')) {
    return `本功能涉及的接口将在详细设计阶段定义。`;
  } else if (sectionName.includes('界面')) {
    return `界面设计遵循系统统一风格。`;
  } else if (sectionName.includes('验收') || sectionName.includes('标准')) {
    return `- 功能正常执行，无报错\n- 数据正确保存和展示`;
  }
  return `（${sectionName}内容待完善）`;
}

/**
 * 【核心修复】移除AI输出中错误的功能过程标题
 * AI经常在生成5.9的内容时，错误地输出5.1的标题
 * 这个函数会检测并移除所有与当前功能过程编号不匹配的功能过程标题
 * 
 * @param {string} content - AI生成的内容
 * @param {string} correctPrefix - 正确的功能过程编号（如 "5.9"）
 * @param {string} funcChapterNum - 功能需求章节编号（如 "5"）
 * @returns {string} 清理后的内容
 */
function removeWrongProcessTitles(content, correctPrefix, funcChapterNum) {
  if (!content || !correctPrefix || !funcChapterNum) {
    return content;
  }
  
  let fixedContent = content;
  let removeCount = 0;
  
  // 提取正确的功能过程编号
  const correctProcessNum = correctPrefix.split('.')[1]; // 如 "9"
  const flexibleFuncChapter = funcChapterNum.split('').join('\\s*');
  
  // 匹配所有功能过程级别的标题（如 5.1、5.2 等，但不是 5.1.1 这样的子节）
  // 格式：### 5.1 XXX功能 或 5.1 XXX功能
  const wrongProcessPattern = new RegExp(
    `(^|\\n)(\\s*#{1,4}\\s*)?${flexibleFuncChapter}\\s*[.．]\\s*(\\d+)(?!\\s*[.．]\\s*\\d)([.．、\\s]+[^\\n]*)(\\n|$)`,
    'gm'
  );
  
  fixedContent = fixedContent.replace(wrongProcessPattern, (match, lineStart, hashes, processNum, rest, lineEnd) => {
    // 如果是错误的功能过程编号，移除整行
    if (processNum !== correctProcessNum) {
      removeCount++;
      console.log(`[removeWrongProcessTitles] 移除错误的功能过程标题: ${funcChapterNum}.${processNum}${rest.trim().substring(0, 30)}...`);
      return lineStart || ''; // 保留换行符
    }
    return match;
  });
  
  // 额外处理：移除错误的子节标题（如在5.9内容中出现5.1.1）
  // 匹配 5.X.Y 格式，其中 X 不等于正确的功能过程编号
  const wrongSubSectionPattern = new RegExp(
    `(^|\\n)(\\s*#{1,6}\\s*)?${flexibleFuncChapter}\\s*[.．]\\s*(\\d+)\\s*[.．]\\s*(\\d+)([.．、\\s]+[^\\n]*)(\\n|$)`,
    'gm'
  );
  
  fixedContent = fixedContent.replace(wrongSubSectionPattern, (match, lineStart, hashes, processNum, subNum, rest, lineEnd) => {
    // 如果是错误的功能过程编号下的子节，移除整行
    if (processNum !== correctProcessNum) {
      removeCount++;
      console.log(`[removeWrongProcessTitles] 移除错误的子节标题: ${funcChapterNum}.${processNum}.${subNum}${rest.trim().substring(0, 20)}...`);
      return lineStart || '';
    }
    return match;
  });
  
  // 处理更深层级的错误编号（如 5.1.1.1）
  const wrongDeepPattern = new RegExp(
    `(^|\\n)(\\s*#{1,6}\\s*)?${flexibleFuncChapter}\\s*[.．]\\s*(\\d+)\\s*[.．]\\s*\\d+\\s*[.．]\\s*\\d+([.．、\\s]+[^\\n]*)(\\n|$)`,
    'gm'
  );
  
  fixedContent = fixedContent.replace(wrongDeepPattern, (match, lineStart, hashes, processNum, rest, lineEnd) => {
    if (processNum !== correctProcessNum) {
      removeCount++;
      console.log(`[removeWrongProcessTitles] 移除错误的深层子节标题`);
      return lineStart || '';
    }
    return match;
  });
  
  if (removeCount > 0) {
    console.log(`[removeWrongProcessTitles] 共移除了 ${removeCount} 处错误的标题，正确前缀: ${correctPrefix}`);
  }
  
  return fixedContent;
}

/**
 * 【核心修复】移除AI输出中的重复子节
 * AI有时会输出重复的子节内容，需要检测并移除
 * 
 * @param {string} content - AI生成的内容
 * @param {string} prefix - 功能过程编号前缀（如 "5.11"）
 * @param {Array} expectedSections - 期望的子节名称列表
 * @returns {string} 去重后的内容
 */
function removeDuplicateSections(content, prefix, expectedSections) {
  if (!content || !prefix || !expectedSections || expectedSections.length === 0) {
    return content;
  }
  
  let fixedContent = content;
  let removeCount = 0;
  
  // 构建灵活的前缀正则 (允许 5. 1 这种空格)
  const flexiblePrefix = prefix.split('.').join('\\s*\\.\\s*');
  
  // 检测每个子节是否出现了多次
  expectedSections.forEach((sectionName, idx) => {
    const sectionNum = idx + 1;
    // 提取核心名称，避免符号影响匹配
    const coreName = sectionName.replace(/[（(][^）)]*[）)]/g, '').trim();
    const escapedSectionName = coreName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flexibleName = escapedSectionName.split('').join('\\s*');
    
    // 构建匹配子节标题的正则表达式 (更宽容)
    const sectionPattern = new RegExp(
      `(#{2,6}\\s*${flexiblePrefix}\\s*\\.\\s*${sectionNum}[.．、\\s]+.*${flexibleName}.*[\\s\\n]+)`,
      'gi'
    );
    
    const matches = fixedContent.match(sectionPattern);
    if (matches && matches.length > 1) {
      console.log(`[去重] 检测到子节 ${prefix}.${sectionNum} ${sectionName} 出现了 ${matches.length} 次`);
      
      // 找到每个匹配的位置
      let positions = [];
      let searchStart = 0;
      for (let i = 0; i < matches.length; i++) {
        const pos = fixedContent.indexOf(matches[i], searchStart);
        if (pos !== -1) {
          positions.push({ start: pos, match: matches[i] });
          searchStart = pos + matches[i].length;
        }
      }
      
      // 保留第一次出现，移除后续重复的标题行
      if (positions.length > 1) {
        // 从后往前移除
        for (let i = positions.length - 1; i >= 1; i--) {
          const currentPos = positions[i];
          const matchLength = currentPos.match.length;
          
          // 只移除标题行，不移除后面的内容（除非是纯空白）
          fixedContent = fixedContent.slice(0, currentPos.start) + fixedContent.slice(currentPos.start + matchLength);
          removeCount++;
          console.log(`[去重] 移除了重复的子节标题 ${prefix}.${sectionNum} ${sectionName}`);
        }
      }
    }
  });
  
  // 额外检测：移除连续重复的子节模式
  // 例如：5.11.1 -> 5.11.2 -> 5.11.1 -> 5.11.2 这种模式
  // 【修复】只匹配行首的子节标题，避免误匹配内容中的引用
  const allSectionPattern = new RegExp(
    `(^|\\n)(#{2,6}\\s*${flexiblePrefix}\\s*\\.\\s*(\\d+)[.．、\\s]+[^\\n]+)`,
    'gm'
  );
  
  const allMatches = [...fixedContent.matchAll(allSectionPattern)];
  // 【修复】只有当检测到的子节数量明显超过期望数量时才进行去重（允许一定的误差）
  if (allMatches.length > expectedSections.length * 1.5) {
    console.log(`[去重] 检测到子节总数 ${allMatches.length} 明显超过期望数量 ${expectedSections.length}`);
    
    // 记录每个子节编号的首次出现位置
    const firstOccurrence = new Map();
    const toRemoveRanges = [];
    
    for (let i = 0; i < allMatches.length; i++) {
      const match = allMatches[i];
      const sectionNum = match[3]; // 【修复】调整捕获组索引
      const fullMatch = match[2]; // 完整的标题行
      
      // 【修复】只处理真正的子节标题（以#开头的行），跳过内容中的引用
      if (!fullMatch.trim().startsWith('#')) {
        continue;
      }
      
      if (firstOccurrence.has(sectionNum)) {
        // 这是重复的子节，标记为需要移除
        const startPos = match.index + (match[1]?.length || 0); // 跳过换行符
        let endPos = fixedContent.length;
        
        // 找到下一个子节的位置作为结束点
        if (i + 1 < allMatches.length) {
          endPos = allMatches[i + 1].index + (allMatches[i + 1][1]?.length || 0);
        }
        
        toRemoveRanges.push({ start: startPos, end: endPos });
      } else {
        firstOccurrence.set(sectionNum, match.index);
      }
    }
    
    // 从后往前移除
    toRemoveRanges.reverse().forEach(range => {
      fixedContent = fixedContent.slice(0, range.start) + fixedContent.slice(range.end);
      removeCount++;
    });
  }
  
  if (removeCount > 0) {
    console.log(`[removeDuplicateSections] 共移除了 ${removeCount} 处重复的子节`);
  }
  
  return fixedContent;
}

/**
 * 【核心修复】移除子节标题下方的重复文本标题
 * AI有时会在Markdown标题后面又输出一个纯文本形式的标题（可能带空格）
 * 例如：### 5.2.1 功能说明 后面跟着 "5.2.1    功 能 说 明" 这样的文本
 * 
 * @param {string} content - AI生成的内容
 * @param {string} prefix - 功能过程编号前缀（如 "5.2"）
 * @param {Array} expectedSections - 期望的子节名称列表
 * @returns {string} 清理后的内容
 */
function removeTextDuplicateTitles(content, prefix, expectedSections) {
  if (!content || !prefix || !expectedSections || expectedSections.length === 0) {
    return content;
  }
  
  let fixedContent = content;
  let removeCount = 0;
  
  // 遍历每个子节，检查是否有重复的文本标题
  expectedSections.forEach((sectionName, idx) => {
    const sectionNum = idx + 1;
    const fullSectionNum = `${prefix}.${sectionNum}`;
    
    // 构建匹配子节名称的正则（支持名称中间有空格的情况）
    // 例如："功能说明" 可能被写成 "功 能 说 明"
    const sectionChars = sectionName.split('');
    const spacedPattern = sectionChars.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    
    // 匹配模式：在Markdown标题行之后，紧跟着一个纯文本形式的编号+标题
    // 例如：### 5.2.1 功能说明\n5.2.1    功 能 说 明\n
    const patterns = [
      // 模式1：编号 + 带空格的标题（如 "5.2.1    功 能 说 明"）
      new RegExp(
        `(#{2,6}\\s*${fullSectionNum.replace(/\./g, '\\.')}[.．、\\s]+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n)` +
        `(\\s*${fullSectionNum.replace(/\./g, '\\.')}[\\s　]+${spacedPattern}[：:]*\\s*\n)`,
        'gi'
      ),
      // 模式2：编号 + 原标题（如 "5.2.1 功能说明："）
      new RegExp(
        `(#{2,6}\\s*${fullSectionNum.replace(/\./g, '\\.')}[.．、\\s]+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n)` +
        `(\\s*${fullSectionNum.replace(/\./g, '\\.')}[.．、\\s]+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[：:]*\\s*\n)`,
        'gi'
      ),
      // 模式3：只有带空格的标题（如 "功 能 说 明："）
      new RegExp(
        `(#{2,6}\\s*${fullSectionNum.replace(/\./g, '\\.')}[.．、\\s]+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n)` +
        `(\\s*${spacedPattern}[：:]*\\s*\n)`,
        'gi'
      ),
      // 模式4：只有原标题（如 "功能说明："）- 紧跟在Markdown标题后
      new RegExp(
        `(#{2,6}\\s*${fullSectionNum.replace(/\./g, '\\.')}[.．、\\s]+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n)` +
        `(\\s*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[：:]+\\s*\n)`,
        'gi'
      )
    ];
    
    patterns.forEach(pattern => {
      const matches = fixedContent.match(pattern);
      if (matches) {
        fixedContent = fixedContent.replace(pattern, '$1');
        removeCount++;
        console.log(`[文本标题去重] 移除了子节 ${fullSectionNum} ${sectionName} 下的重复文本标题`);
      }
    });
  });
  
  // 额外处理：移除任何紧跟在Markdown标题后的纯编号行
  // 例如：### 5.2.1 功能说明\n5.2.1\n
  const numberOnlyPattern = new RegExp(
    `(#{2,6}\\s*${prefix.replace(/\./g, '\\.')}\\.(\\d+)[^\n]+\n)(\\s*${prefix.replace(/\./g, '\\.')}\\.(\\d+)\\s*\n)`,
    'gi'
  );
  
  let match;
  while ((match = numberOnlyPattern.exec(fixedContent)) !== null) {
    if (match[2] === match[4]) { // 编号相同
      fixedContent = fixedContent.replace(match[0], match[1]);
      removeCount++;
      console.log(`[文本标题去重] 移除了重复的编号行: ${prefix}.${match[2]}`);
    }
  }
  
  if (removeCount > 0) {
    console.log(`[removeTextDuplicateTitles] 共移除了 ${removeCount} 处重复的文本标题`);
  }
  
  return fixedContent;
}

/**
 * 【核心修复】移除子节内容中出现的错位子节标题
 * AI有时会在一个子节的内容区域输出另一个子节的标题（通常是前一个子节）
 * 例如：在 "5.1.4 接口" 的内容中输出 "5.1.3 处理数据" 的标题
 * 
 * 这个函数会检测并移除这些错位的标题行
 * 
 * @param {string} content - AI生成的内容
 * @param {string} prefix - 功能过程编号前缀（如 "5.1"）
 * @param {Array} expectedSections - 期望的子节名称列表
 * @returns {string} 清理后的内容
 */
function removeMisplacedSectionTitles(content, prefix, expectedSections) {
  if (!content || !prefix || !expectedSections || expectedSections.length === 0) {
    return content;
  }
  
  let fixedContent = content;
  let removeCount = 0;
  
  // 首先，找到所有子节标题的位置
  const sectionPositions = [];
  
  for (let idx = 0; idx < expectedSections.length; idx++) {
    const sectionNum = idx + 1;
    const sectionName = expectedSections[idx];
    const fullSectionNum = `${prefix}.${sectionNum}`;
    const escapedSectionName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 匹配Markdown标题格式的子节
    const mdPattern = new RegExp(
      `#{2,6}\\s*${fullSectionNum.replace(/\./g, '\\.')}[.．、\\s]+${escapedSectionName}`,
      'gi'
    );
    
    let match;
    while ((match = mdPattern.exec(fixedContent)) !== null) {
      sectionPositions.push({
        idx: idx,
        sectionNum: sectionNum,
        sectionName: sectionName,
        fullSectionNum: fullSectionNum,
        position: match.index,
        length: match[0].length,
        isMarkdown: true
      });
    }
  }
  
  // 按位置排序
  sectionPositions.sort((a, b) => a.position - b.position);
  
  // 检查每个子节区域内是否有其他子节的标题（非Markdown格式）
  for (let i = 0; i < sectionPositions.length; i++) {
    const currentSection = sectionPositions[i];
    const nextSection = sectionPositions[i + 1];
    
    // 当前子节的内容区域
    const contentStart = currentSection.position + currentSection.length;
    const contentEnd = nextSection ? nextSection.position : fixedContent.length;
    const sectionContent = fixedContent.slice(contentStart, contentEnd);
    
    // 检查这个区域内是否有任何子节的纯文本标题（包括当前子节自己的重复标题）
    for (let j = 0; j < expectedSections.length; j++) {
      const otherSectionNum = j + 1;
      const otherSectionName = expectedSections[j];
      const otherFullSectionNum = `${prefix}.${otherSectionNum}`;
      const escapedOtherName = otherSectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // 匹配纯文本格式的子节标题（不是Markdown标题）
      // 例如：5.1.3 处理数据 或 5.1.3. 处理数据
      const textTitlePatterns = [
        // 编号 + 标题（行首）
        new RegExp(
          `(^|\\n)(\\s*)${otherFullSectionNum.replace(/\./g, '\\.')}[.．、\\s]+${escapedOtherName}[：:]*\\s*(?=\\n|$)`,
          'gim'
        ),
        // 编号 + 标题（带表格标记）
        new RegExp(
          `(^|\\n)(\\s*)${otherFullSectionNum.replace(/\./g, '\\.')}[.．、\\s]+${escapedOtherName}[：:]*\\s*\\n\\s*\\|`,
          'gim'
        )
      ];
      
      for (const pattern of textTitlePatterns) {
        const matches = sectionContent.match(pattern);
        if (matches) {
          // 找到了错位的标题，需要移除
          for (const matchStr of matches) {
            // 计算在原内容中的位置
            const posInSection = sectionContent.indexOf(matchStr);
            if (posInSection !== -1) {
              const absolutePos = contentStart + posInSection;
              
              // 检查这不是一个Markdown标题（避免误删）
              const lineStart = fixedContent.lastIndexOf('\n', absolutePos) + 1;
              const lineContent = fixedContent.slice(lineStart, absolutePos + matchStr.length);
              
              if (!lineContent.trim().startsWith('#')) {
                // 这是一个纯文本标题，需要移除
                // 只移除标题行，保留后面的内容
                const titleEndPos = absolutePos + matchStr.length;
                const beforeTitle = fixedContent.slice(0, absolutePos);
                const afterTitle = fixedContent.slice(titleEndPos);
                
                // 保留换行符
                const preserveNewline = matchStr.startsWith('\n') ? '\n' : '';
                fixedContent = beforeTitle + preserveNewline + afterTitle;
                
                removeCount++;
                const isSameSection = (j === currentSection.idx);
                const logType = isSameSection ? '重复标题移除' : '错位标题移除';
                console.log(`[${logType}] 在子节 ${currentSection.fullSectionNum} ${currentSection.sectionName} 中移除了${isSameSection ? '重复' : '错位'}的标题: ${otherFullSectionNum} ${otherSectionName}`);
                
                // 更新后续位置（因为内容变短了）
                const removedLength = matchStr.length - preserveNewline.length;
                for (let k = i + 1; k < sectionPositions.length; k++) {
                  if (sectionPositions[k].position > absolutePos) {
                    sectionPositions[k].position -= removedLength;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  // 额外检查：移除内容中出现的任何与当前子节编号不匹配的子节标题行
  // 这是一个更激进的清理，只处理明显错误的情况
  const allSectionTitlePattern = new RegExp(
    `(^|\\n)(\\s*)(${prefix.replace(/\./g, '\\.')}\\.(\\d+))[.．、\\s]+([^\\n|#]+?)(?=\\n|$)`,
    'gm'
  );
  
  // 收集所有匹配
  const allMatches = [...fixedContent.matchAll(allSectionTitlePattern)];
  
  // 检查每个匹配是否在正确的位置
  for (let i = allMatches.length - 1; i >= 0; i--) {
    const match = allMatches[i];
    const matchedSectionNum = parseInt(match[4]);
    const matchedTitle = match[5].trim();
    const matchPosition = match.index;
    
    // 检查这个标题行前面是否有一个Markdown标题
    const lineStart = fixedContent.lastIndexOf('\n', matchPosition) + 1;
    const lineContent = fixedContent.slice(lineStart, matchPosition + match[0].length);
    
    // 如果这行以#开头，跳过（这是正确的Markdown标题）
    if (lineContent.trim().startsWith('#')) {
      continue;
    }
    
    // 找到这个位置属于哪个子节
    let belongsToSection = -1;
    for (let j = 0; j < sectionPositions.length; j++) {
      const sectionStart = sectionPositions[j].position;
      const sectionEnd = sectionPositions[j + 1]?.position || fixedContent.length;
      
      if (matchPosition >= sectionStart && matchPosition < sectionEnd) {
        belongsToSection = sectionPositions[j].sectionNum;
        break;
      }
    }
    
    // 如果这个标题的编号与它所在的子节不匹配，移除它
    if (belongsToSection !== -1 && matchedSectionNum !== belongsToSection) {
      // 检查标题内容是否与期望的子节名称匹配
      const expectedName = expectedSections[matchedSectionNum - 1];
      if (expectedName && matchedTitle.includes(expectedName.slice(0, 4))) {
        // 这确实是一个错位的子节标题，移除它
        const fullMatch = match[0];
        const preserveNewline = fullMatch.startsWith('\n') ? '\n' : '';
        fixedContent = fixedContent.slice(0, matchPosition) + preserveNewline + fixedContent.slice(matchPosition + fullMatch.length);
        removeCount++;
        console.log(`[错位标题移除] 移除了位置错误的子节标题: ${prefix}.${matchedSectionNum} ${matchedTitle} (应在子节${belongsToSection}中)`);
      }
    }
  }
  
  if (removeCount > 0) {
    console.log(`[removeMisplacedSectionTitles] 共移除了 ${removeCount} 处错位的子节标题`);
  }
  
  return fixedContent;
}

/**
 * 【核心修复】修正前置章节中AI输出的错误编号
 * AI经常输出错误的编号格式，如 "1." 而不是 "2.1"
 * 
 * @param {string} content - AI生成的内容
 * @param {string} chapterNumber - 当前章节编号（如 "2"）
 * @param {Array} subChapters - 期望的子章节列表
 * @returns {string} 修正后的内容
 */
function fixHeaderChapterNumbers(content, chapterNumber, subChapters) {
  if (!content || !chapterNumber || !subChapters || subChapters.length === 0) {
    return content;
  }
  
  let fixedContent = content;
  let fixCount = 0;
  
  // 遍历每个期望的子章节
  subChapters.forEach((subChapter, idx) => {
    const correctNumber = subChapter.number; // 如 "2.1"
    const subChapterTitle = subChapter.title;
    const escapedTitle = subChapterTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 构建匹配错误编号的正则表达式
    const wrongPatterns = [
      // 匹配 ### 1. 标题 这样的格式（错误的编号）
      new RegExp(`(#{2,6}\\s*)(\\d+)[.．、\\s]+(${escapedTitle})`, 'gi'),
      // 匹配 1. 标题 这样的格式（纯文本）
      new RegExp(`(^|\\n)(\\s*)(\\d+)[.．、\\s]+(${escapedTitle})`, 'gi'),
    ];
    
    wrongPatterns.forEach((pattern, patternIdx) => {
      fixedContent = fixedContent.replace(pattern, (match, ...groups) => {
        let wrongNum;
        if (patternIdx === 0) {
          wrongNum = groups[1]; // 第二个捕获组是错误的编号
        } else {
          wrongNum = groups[2]; // 第三个捕获组是错误的编号
        }
        
        // 检查是否是错误的编号（不包含点号的简单数字）
        if (!wrongNum.includes('.') && wrongNum !== correctNumber) {
          // 替换为正确的编号
          const corrected = match.replace(
            new RegExp(`(\\d+)([.．、\\s]+)(${escapedTitle})`),
            `${correctNumber}$2${subChapterTitle}`
          );
          if (match !== corrected) {
            fixCount++;
          }
          return corrected;
        }
        return match;
      });
    });
  });
  
  // 额外处理：修正任何简单数字编号为正确的层级编号
  // 例如将 "1. 重保容量管理" 修正为 "2.1 重保容量管理"
  const simpleNumberPattern = new RegExp(
    `(#{2,6}\\s*|^|\\n)(\\s*)(\\d+)[.．、]\\s*([^\\n]+)`,
    'gm'
  );
  
  fixedContent = fixedContent.replace(simpleNumberPattern, (match, prefix, space, num, title) => {
    // 检查是否是简单数字编号（1-99）且标题匹配某个子章节
    const matchingSubChapter = subChapters.find(sc => 
      sc.title && title.trim().startsWith(sc.title.trim().substring(0, 10))
    );
    
    if (matchingSubChapter && !num.includes('.')) {
      const corrected = `${prefix}${space}${matchingSubChapter.number} ${title}`;
      if (match !== corrected) {
        fixCount++;
      }
      return corrected;
    }
    return match;
  });
  
  if (fixCount > 0) {
    console.log(`[fixHeaderChapterNumbers] 修正了 ${fixCount} 处错误的章节编号，章节: ${chapterNumber}`);
  }
  
  return fixedContent;
}

// 从模板文本中提取功能过程示例
function extractFunctionalProcessExample(templateText) {
  const lines = templateText.split('\n');
  let inFunctionalSection = false;
  let functionalStartLevel = 0;
  let exampleContent = [];
  let foundExample = false;

  // 查找功能需求章节中的第一个完整功能过程示例
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 识别功能需求章节开始
    if (/^[3-9][\.\s、].*功能/.test(line) || /功能需求/.test(line)) {
      inFunctionalSection = true;
      const match = line.match(/^(\d+)/);
      if (match) functionalStartLevel = match[1].split('.').length;
      continue;
    }

    if (inFunctionalSection) {
      // 检查是否是功能过程级别（通常是3-4级标题）
      const levelMatch = line.match(/^(\d+(?:\.\d+){2,})\s*[、.\s]/);
      if (levelMatch) {
        const level = levelMatch[1].split('.').length;
        if (level >= 3 && !foundExample) {
          // 开始收集功能过程示例
          foundExample = true;
          exampleContent = [line];
          continue;
        } else if (foundExample && level <= 3) {
          // 遇到下一个同级或更高级标题，停止收集
          break;
        }
      }

      if (foundExample) {
        exampleContent.push(line);
        // 收集足够的内容后停止（约500行或遇到下一个主要章节）
        if (exampleContent.length > 100) {
          break;
        }
      }
    }

    // 检查是否离开功能需求章节
    if (inFunctionalSection && /^[4-9][\.\s、]/.test(line) && !/功能/.test(line)) {
      break;
    }
  }

  const result = exampleContent.join('\n').trim();
  return result.length > 100 ? result : null;
}

// 从模板文本中提取表格示例
function extractTableExamples(templateText) {
  const tables = [];
  const lines = templateText.split('\n');
  let currentTable = [];
  let inTable = false;

  for (const line of lines) {
    // 检测表格行（包含多个|分隔符或制表符分隔的内容）
    if (line.includes('|') && line.split('|').length >= 3) {
      inTable = true;
      currentTable.push(line.trim());
    } else if (line.includes('\t') && line.split('\t').length >= 3) {
      inTable = true;
      currentTable.push(line.trim());
    } else if (inTable) {
      // 表格结束
      if (currentTable.length >= 2) {
        tables.push(currentTable.join('\n'));
      }
      currentTable = [];
      inTable = false;
    }
  }

  // 处理最后一个表格
  if (currentTable.length >= 2) {
    tables.push(currentTable.join('\n'));
  }

  return tables.slice(0, 10); // 最多返回10个表格示例
}

/**
 * 【核心修复】从 sections 数组中自动提取功能过程的子节结构
 * 这个函数会分析模板的 sections，找到功能需求章节下功能过程的子节标题
 * 例如：从 [{number: "5.1.1", title: "功能说明"}, {number: "5.1.2", title: "业务规则"}...]
 * 提取出 ["功能说明", "业务规则、模型和算法", "处理数据", "接口", "界面", "验收标准"]
 */
function extractFunctionalProcessSectionsFromTemplate(sections, funcChapterNum = '5') {
  if (!sections || !Array.isArray(sections)) {
    console.log('[模板子节提取] sections 无效');
    return null;
  }

  // 策略1：找到功能需求章节下的第一个功能过程（如 5.1），然后提取它的子节（5.1.1, 5.1.2...）
  const funcChapterPattern = new RegExp(`^${funcChapterNum}\\.\\d+$`); // 匹配 5.1, 5.2 等
  const funcProcessPattern = new RegExp(`^${funcChapterNum}\\.\\d+\\.\\d+$`); // 匹配 5.1.1, 5.1.2 等

  // 找到第一个功能过程（如 5.1）
  const firstFuncProcess = sections.find(s => funcChapterPattern.test(s.number));
  if (!firstFuncProcess) {
    console.log(`[模板子节提取] 未找到功能过程，模式: ${funcChapterPattern}`);
    return null;
  }

  const processNumber = firstFuncProcess.number; // 如 "5.1"
  console.log(`[模板子节提取] 找到第一个功能过程: ${processNumber} ${firstFuncProcess.title}`);

  // 提取该功能过程下的所有子节
  const subSectionPattern = new RegExp(`^${processNumber.replace('.', '\\.')}\\.\\d+$`);
  const subSections = sections.filter(s => subSectionPattern.test(s.number));

  if (subSections.length === 0) {
    console.log(`[模板子节提取] 功能过程 ${processNumber} 下未找到子节`);
    return null;
  }

  // 【修复】清理子节标题末尾的页码数字
  const sectionNames = subSections.map(s => s.title.replace(/\s+\d{1,4}\s*$/, '').trim());
  console.log(`[模板子节提取] 成功提取 ${sectionNames.length} 个子节:`, sectionNames);

  return {
    processExample: {
      number: processNumber,
      title: firstFuncProcess.title.replace(/\s+\d{1,4}\s*$/, '').trim()
    },
    sections: sectionNames,
    sectionsDetailed: subSections.map(s => ({
      number: s.number,
      name: s.title.replace(/\s+\d{1,4}\s*$/, '').trim(),
      format: s.hasTable ? 'table' : (s.hasList ? 'list' : 'text')
    })),
    hierarchyLevels: 2 // 5.功能需求 -> 5.1.XXX功能 = 2级（简单结构）
  };
}

/**
 * 【核心修复】分析模板的层级深度
 * 返回功能需求章节的实际层级数
 */
function analyzeTemplateHierarchyLevels(sections, funcChapterNum = '5') {
  if (!sections || !Array.isArray(sections)) return 4; // 默认4级

  // 找到功能需求章节下的所有子章节
  const funcSections = sections.filter(s => s.number.startsWith(funcChapterNum + '.'));
  if (funcSections.length === 0) return 4;

  // 计算最大层级深度
  let maxDepth = 1;
  for (const section of funcSections) {
    const depth = section.number.split('.').length;
    if (depth > maxDepth) maxDepth = depth;
  }

  // 分析层级结构
  // 如果最大深度是3（如 5.1.1），可能是：
  //   - 5.功能需求 -> 5.1.功能 -> 5.1.1.子节（2级功能 + 子节）
  //   - 5.功能需求 -> 5.1.子系统 -> 5.1.1.功能（3级功能）
  
  // 检查第3层是否像子节（功能说明、业务规则等）
  const level3Sections = funcSections.filter(s => s.number.split('.').length === 3);
  const subSectionKeywords = ['功能说明', '业务规则', '处理数据', '接口', '界面', '验收', '数据', '说明'];
  
  let isSubSection = false;
  for (const section of level3Sections.slice(0, 6)) {
    if (subSectionKeywords.some(kw => section.title.includes(kw))) {
      isSubSection = true;
      break;
    }
  }

  if (isSubSection && maxDepth === 3) {
    // 5.功能需求 -> 5.1.功能 -> 5.1.1.子节 = 2级功能结构
    console.log('[层级分析] 识别为2级功能结构（有子节）');
    return 2;
  } else if (maxDepth >= 4) {
    // 5.功能需求 -> 5.1.子系统 -> 5.1.1.模块 -> 5.1.1.1.功能 = 4级
    console.log('[层级分析] 识别为4级功能结构');
    return 4;
  } else if (maxDepth === 3) {
    // 5.功能需求 -> 5.1.子系统 -> 5.1.1.功能 = 3级
    console.log('[层级分析] 识别为3级功能结构');
    return 3;
  } else {
    // 5.功能需求 -> 5.1.功能 = 2级（无子节）
    console.log('[层级分析] 识别为2级功能结构（无子节）');
    return 2;
  }
}

// 根据模板分析结果生成章节内容的提示词
function buildTemplateBasedPrompt(templateAnalysis, chapterInfo, cosmicData, previousContent) {
  const { originalTemplateText } = templateAnalysis;

  // 构建COSMIC数据摘要
  const cosmicSummary = Object.entries(cosmicData).map(([process, rows]) => {
    const dataMovements = rows.map(r => `${r.dataMovementType}: ${r.subProcessDesc}`).join('; ');
    const dataGroups = [...new Set(rows.map(r => r.dataGroup).filter(Boolean))].join(', ');
    return `- ${process}: ${dataMovements} | 数据组: ${dataGroups}`;
  }).slice(0, 30).join('\n');

  return `你是专业的需求规格说明书撰写专家。请**严格按照模板格式**生成内容。

## 【核心要求】严格遵循模板格式
你必须完全按照用户上传的模板格式来生成内容，包括：
1. **章节编号格式**：与模板完全一致（如1、1.1、1.1.1等）
2. **章节标题**：与模板完全一致
3. **表格结构**：使用模板中定义的表头
4. **内容风格**：与模板的写作风格一致

## 【模板原文参考】
${originalTemplateText?.slice(0, 8000) || '无模板'}

## 【模板结构分析】
${JSON.stringify(templateAnalysis.allChapters?.slice(0, 20) || [], null, 2)}

## 【当前任务】生成章节: ${chapterInfo.number} ${chapterInfo.title}

## 【COSMIC功能点数据】
${cosmicSummary}

## 【已生成内容】（保持连贯）
${previousContent?.slice(-2000) || '（这是第一部分）'}

## 【输出要求】
1. 只输出当前章节的内容
2. 严格使用模板中的编号格式和标题
3. 表格必须使用模板中定义的表头结构
4. 内容要具体、专业，不要使用占位符
5. 如果是功能需求章节，根据COSMIC数据填充具体功能

请开始生成：`;
}

// 对功能过程进行智能分类（识别子系统和功能模块）
async function classifyFunctionalProcesses(client, functionalProcesses, templateAnalysis) {
  try {
    const funcChapter = templateAnalysis?.functionalChapter || {};
    const structure = funcChapter.structure || {};

    // 取前几个功能过程名称作为示例
    const exampleProcesses = functionalProcesses.slice(0, Math.min(3, functionalProcesses.length));

    const prompt = `你是需求分析专家。请根据以下功能过程名称，智能分类到对应的子系统和功能模块中。

## 功能过程列表（共${functionalProcesses.length}个，必须全部分类）：
${functionalProcesses.map((fp, idx) => `${idx + 1}. ${fp}`).join('\n')}

## 分类要求：
1. 【重要】必须将上述所有${functionalProcesses.length}个功能过程全部分类，不能遗漏任何一个
2. 【重要】功能过程名称必须与上面列表中的名称【完全一致】，直接复制粘贴，不能修改、简化或省略
3. 【禁止】使用"功能过程1"、"功能过程2"这样的占位符，必须使用实际名称
4. 根据功能过程名称的语义，推断它属于哪个子系统（一级分类）
5. 在子系统下，再推断它属于哪个功能模块（二级分类）
6. 如果无法确定子系统，放入"通用功能"子系统
7. 相似功能应该归到同一个模块下

## 输出格式（JSON）：
\`\`\`json
{
  "classification": {
    "子系统名称": {
      "功能模块名称": ["${exampleProcesses[0] || '实际功能过程名称1'}", "${exampleProcesses[1] || '实际功能过程名称2'}"]
    }
  },
  "totalCount": ${functionalProcesses.length}
}
\`\`\`

【再次强调】数组中必须填写实际的功能过程名称（如"${exampleProcesses[0] || '查询用户信息'}"），禁止使用"功能过程X"这样的占位符！

请输出分类结果：`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是专业的需求分析师，擅长对功能进行合理分类。你必须确保所有功能过程都被分类，不能遗漏。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 8000
    });

    const content = response.choices[0].message.content.trim();
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const result = JSON.parse(jsonStr);

      // 验证分类结果，确保所有功能过程都被包含
      const classifiedProcesses = new Set();
      if (result.classification) {
        for (const [subsystem, modules] of Object.entries(result.classification)) {
          for (const [moduleName, processes] of Object.entries(modules)) {
            if (Array.isArray(processes)) {
              processes.forEach(p => classifiedProcesses.add(p));
            }
          }
        }
      }

      // 找出遗漏的功能过程
      const missingProcesses = functionalProcesses.filter(fp => !classifiedProcesses.has(fp));

      if (missingProcesses.length > 0) {
        console.log(`分类遗漏了 ${missingProcesses.length} 个功能过程，正在补充...`);
        // 将遗漏的功能过程添加到"未分类功能"模块
        if (!result.classification['通用功能']) {
          result.classification['通用功能'] = {};
        }
        if (!result.classification['通用功能']['未分类功能']) {
          result.classification['通用功能']['未分类功能'] = [];
        }
        result.classification['通用功能']['未分类功能'].push(...missingProcesses);
      }

      console.log(`功能过程分类完成: 原始${functionalProcesses.length}个, 分类后${classifiedProcesses.size + missingProcesses.length}个`);
      return result;
    }
    return null;
  } catch (error) {
    console.error('功能过程分类失败:', error.message);
    return null;
  }
}

// 根据COSMIC数据和模板生成需求规格说明书 - 分批调用版本
app.post('/api/cosmic-to-spec/generate', async (req, res) => {
  try {
    const { cosmicData, templateId, columnMapping } = req.body;

    if (!cosmicData || !cosmicData.data || cosmicData.data.length === 0) {
      return res.status(400).json({ error: '请先上传COSMIC Excel数据' });
    }

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 获取模板信息和深度分析结果
    let templateText = '';
    let templateAnalysis = null;
    let savedAnalysis = null;
    let fullProcessExample = '';

    if (templateId) {
      // 首先检查是否有已保存的深度分析结果
      const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_analysis.json`);
      if (fs.existsSync(analysisPath)) {
        try {
          savedAnalysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
          templateText = savedAnalysis.originalTemplateText || '';
          fullProcessExample = savedAnalysis.fullProcessExample || '';
          
          // 【修复】清理已保存分析结果中的页码数字
          const cleanPageNumber = (str) => str ? str.replace(/\s+\d{1,4}\s*$/, '').trim() : str;
          if (savedAnalysis.allChapters) {
            savedAnalysis.allChapters.forEach(c => { if (c.title) c.title = cleanPageNumber(c.title); });
          }
          if (savedAnalysis.sections) {
            savedAnalysis.sections.forEach(c => { if (c.title) c.title = cleanPageNumber(c.title); });
          }
          if (savedAnalysis.processContentTemplate?.sections) {
            savedAnalysis.processContentTemplate.sections = savedAnalysis.processContentTemplate.sections.map(s => 
              typeof s === 'string' ? cleanPageNumber(s) : s
            );
          }
          if (savedAnalysis.functionalChapter?.processContentTemplate?.sections) {
            savedAnalysis.functionalChapter.processContentTemplate.sections = 
              savedAnalysis.functionalChapter.processContentTemplate.sections.map(s => 
                typeof s === 'string' ? cleanPageNumber(s) : s
              );
          }
          if (savedAnalysis.functionalChapter?.processContentTemplate?.sectionsDetailed) {
            savedAnalysis.functionalChapter.processContentTemplate.sectionsDetailed.forEach(s => {
              if (s.name) s.name = cleanPageNumber(s.name);
            });
          }
          
          console.log('使用已保存的深度分析结果（已清理页码）');
        } catch (e) {
          console.log('读取分析结果失败，将重新分析');
        }
      }

      // 如果没有分析结果，从缓存或文件获取模板并进行深度分析
      if (!savedAnalysis) {
        console.log('[生成] 没有找到已保存的分析结果，尝试加载模板并分析...');
        
        const templateInfo = specTemplatesCache.get(templateId);
        let templateBuffer = null;
        let ext = '.docx';
        
        if (templateInfo) {
          templateText = templateInfo.fullText || '';
          fullProcessExample = templateInfo.functionalExampleContent || '';
        } else {
          // 支持 .docx 和 .doc 两种格式
          let templatePath = path.join(TEMPLATES_DIR, `${templateId}.docx`);
          ext = '.docx';
          if (!fs.existsSync(templatePath)) {
            templatePath = path.join(TEMPLATES_DIR, `${templateId}.doc`);
            ext = '.doc';
          }
          if (fs.existsSync(templatePath)) {
            templateBuffer = fs.readFileSync(templatePath);
            const parsed = await parseWordTemplate(templateBuffer, ext);
            templateText = parsed.fullText;
            fullProcessExample = parsed.functionalExampleContent || '';
            
            // 【关键兜底】如果有模板文本但没有分析结果，自动进行深度分析并保存
            if (templateText && templateText.length > 100) {
              console.log('[生成] 自动触发模板深度分析...');
              try {
                const deepAnalysis = await deepAnalyzeTemplateMultiRound(client, parsed);
                if (deepAnalysis) {
                  savedAnalysis = deepAnalysis;
                  // 保存分析结果供下次使用
                  const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_analysis.json`);
                  fs.writeFileSync(analysisPath, JSON.stringify(deepAnalysis, null, 2));
                  console.log('[生成] 模板深度分析完成并保存');
                }
              } catch (analyzeError) {
                console.error('[生成] 模板深度分析失败:', analyzeError.message);
              }
            }
          }
        }
      }
    }

    // 按功能过程分组
    const groupedByProcess = {};
    const mappedData = cosmicData.data;
    mappedData.forEach(row => {
      const process = row.functionalProcess || '未分类';
      if (!groupedByProcess[process]) {
        groupedByProcess[process] = [];
      }
      groupedByProcess[process].push(row);
    });

    const functionalProcesses = Object.keys(groupedByProcess);
    const totalProcesses = functionalProcesses.length;
    const BATCH_SIZE = 5; // 每批处理5个功能过程
    const totalBatches = Math.ceil(totalProcesses / BATCH_SIZE);

    console.log(`开始生成需求规格说明书: ${totalProcesses} 个功能过程, 分 ${totalBatches + 2} 批处理`);
    console.log(`模板示例长度: ${fullProcessExample?.length || 0} 字符`);

    // ========== 第一阶段：检查/执行模板分析 ==========
    res.write(`data: ${JSON.stringify({
      phase: 'analyzing_template',
      message: '🧠 深度分析模板结构（识别层级标题）...',
      currentStep: 1,
      totalSteps: totalBatches + 3
    })}\n\n`);

    // 优先使用已保存的分析结果
    if (savedAnalysis) {
      templateAnalysis = savedAnalysis;
      // 【增强日志】输出模板分析的关键信息
      const sectionsCount = savedAnalysis.allChapters?.length || savedAnalysis.sections?.length || 0;
      const funcChapterInfo = savedAnalysis.functionalChapter || {};
      console.log(`[模板分析] 使用已保存的分析结果:`);
      console.log(`  - 章节数量: ${sectionsCount}`);
      console.log(`  - 功能需求章节编号: ${savedAnalysis.functionalChapterNumber}`);
      console.log(`  - 功能需求子节: ${funcChapterInfo.processContentTemplate?.sections?.join('、') || '未识别'}`);
      console.log(`  - 前5个章节:`, (savedAnalysis.allChapters || savedAnalysis.sections || []).slice(0, 5).map(c => `${c.number} ${c.title}`));
      
      res.write(`data: ${JSON.stringify({
        phase: 'template_analyzed',
        message: `✅ 使用已保存的模板分析结果（${sectionsCount}个章节）`,
        templateAnalysis: {
          documentStyle: savedAnalysis.documentStyle,
          hierarchyStructure: savedAnalysis.hierarchyStructure,
          processContentTemplate: savedAnalysis.processContentTemplate,
          sectionsCount: sectionsCount,
          functionalChapterNumber: savedAnalysis.functionalChapterNumber
        }
      })}\n\n`);
    } else if (templateText) {
      console.log(`[模板分析] 没有已保存的分析结果，进行实时分析...`);
      templateAnalysis = await analyzeTemplateWithAI(client, templateText);
      if (templateAnalysis) {
        const sectionsCount = templateAnalysis.allChapters?.length || 0;
        console.log(`[模板分析] 实时分析完成: ${sectionsCount} 个章节`);
        res.write(`data: ${JSON.stringify({
          phase: 'template_analyzed',
          message: `✅ 模板分析完成: ${sectionsCount} 个章节`,
          templateAnalysis: templateAnalysis
        })}\n\n`);
      }
    } else {
      console.log(`[模板分析] 没有模板文本，将使用默认结构`);
    }

    // ========== 第1.5阶段：对功能过程进行智能分类 ==========
    res.write(`data: ${JSON.stringify({
      phase: 'classifying_processes',
      message: '📊 智能分类功能过程（识别子系统/功能模块）...',
      currentStep: 2,
      totalSteps: totalBatches + 3
    })}\n\n`);

    let processClassification = null;
    if (functionalProcesses.length > 0) {
      processClassification = await classifyFunctionalProcesses(client, functionalProcesses, templateAnalysis);
      if (processClassification) {
        const subsystemCount = Object.keys(processClassification.classification || {}).length;
        res.write(`data: ${JSON.stringify({
          phase: 'processes_classified',
          message: `✅ 分类完成: ${subsystemCount} 个子系统`,
          classification: processClassification
        })}\n\n`);
      }
    }

    // ========== 第二阶段：生成非功能需求章节（按模板格式） ==========
    res.write(`data: ${JSON.stringify({
      phase: 'generating_header',
      message: '📝 生成文档前置章节...',
      currentStep: 3,
      totalSteps: totalBatches + 3
    })}\n\n`);

    // 构建分类后的功能过程概览
    let classifiedOverview = '';
    if (processClassification && processClassification.classification) {
      const classification = processClassification.classification;
      let subsystemIdx = 1;
      for (const [subsystem, modules] of Object.entries(classification)) {
        classifiedOverview += `\n### ${subsystemIdx}. ${subsystem}\n`;
        let moduleIdx = 1;
        for (const [moduleName, processes] of Object.entries(modules)) {
          classifiedOverview += `  ${subsystemIdx}.${moduleIdx}. ${moduleName}\n`;
          processes.forEach((p, pIdx) => {
            classifiedOverview += `    ${subsystemIdx}.${moduleIdx}.${pIdx + 1}. ${p}\n`;
          });
          moduleIdx++;
        }
        subsystemIdx++;
      }
    } else {
      classifiedOverview = functionalProcesses.map((fp, idx) => `${idx + 1}. ${fp}`).join('\n');
    }

    // 【核心修复】获取功能需求章节编号 - 多种方式尝试
    // 优先级1: 从 savedAnalysis 中读取（深度分析结果）
    // 优先级2: 从 templateAnalysis 中读取
    // 优先级3: 从 sections 中自动检测
    let funcChapterNum = 
      savedAnalysis?.functionalChapterNumber || 
      templateAnalysis?.functionalChapterNumber || 
      templateAnalysis?.functionalChapter?.number;
    
    // 如果上述方式都没有获取到，从 sections 中自动检测
    if (!funcChapterNum) {
      const sectionsToCheck = savedAnalysis?.sections || templateAnalysis?.sections || templateAnalysis?.allChapters || [];
      const funcSection = sectionsToCheck.find(s => 
        s.title?.includes('功能需求') || s.title?.includes('功能要求')
      );
      if (funcSection) {
        funcChapterNum = funcSection.number.split('.')[0]; // 取第一级编号
        console.log(`[自动检测] 从 sections 中检测到功能需求章节: ${funcSection.number} ${funcSection.title}`);
      }
    }
    
    // 最终默认值
    funcChapterNum = funcChapterNum || '5'; // 默认改为5，因为大多数模板是5
    console.log(`【功能需求章节编号】: ${funcChapterNum}`);
    console.log(`【分析来源】savedAnalysis.functionalChapterNumber=${savedAnalysis?.functionalChapterNumber}, templateAnalysis.functionalChapterNumber=${templateAnalysis?.functionalChapterNumber}`);

    // ========== 动态构建前置章节列表（从模板分析结果中获取） ==========
    let headerChaptersList = '';
    const allChapters = templateAnalysis?.allChapters || savedAnalysis?.allChapters || savedAnalysis?.sections || [];
    
    console.log(`[动态章节] allChapters 数量: ${allChapters.length}`);
    console.log(`[动态章节] allChapters 前5个:`, allChapters.slice(0, 5).map(c => `${c.number} ${c.title}`));

    // 【修复】找到功能需求章节的位置 - 精确匹配一级章节
    const funcChapterIndex = allChapters.findIndex(c => {
      // 必须是一级章节
      if (c.level !== 1) return false;
      
      // 编号精确匹配
      const numMatch = c.number?.replace(/\.$/, '') === funcChapterNum || 
                       c.number === funcChapterNum;
      // 标题匹配（必须是"功能需求"而不是"功能架构"等）
      const titleMatch = c.title?.includes('功能需求') || 
                         c.title?.includes('功能要求');
      return numMatch || titleMatch;
    });
    
    console.log(`[动态章节] 匹配到的功能需求章节:`, funcChapterIndex >= 0 ? allChapters[funcChapterIndex] : 'NOT FOUND');
    
    console.log(`[动态章节] funcChapterNum: ${funcChapterNum}, funcChapterIndex: ${funcChapterIndex}`);

    // 获取功能需求章节之前的所有一级章节（前置章节）
    let headerChapters = [];
    if (funcChapterIndex > 0) {
      headerChapters = allChapters.slice(0, funcChapterIndex);
    } else if (funcChapterIndex === -1 && allChapters.length > 0) {
      // 如果没找到功能需求章节，尝试根据编号分割
      const funcNum = parseInt(funcChapterNum);
      headerChapters = allChapters.filter(c => {
        const chapterNum = parseInt(c.number?.split('.')[0]);
        return chapterNum < funcNum;
      });
      console.log(`[动态章节] 兜底提取前置章节: ${headerChapters.length} 个`);
    }
    
    console.log(`[动态章节] 前置章节数量: ${headerChapters.length}`);

    if (headerChapters.length > 0) {
      // 【增强】构建更详细的章节列表，包含层级信息
      headerChaptersList = headerChapters.map(c => {
        const prefix = c.level === 1 ? '#' : c.level === 2 ? '##' : '###';
        const purpose = c.purpose ? ` - ${c.purpose}` : '';
        return `${prefix} ${c.number} ${c.title}${purpose}`;
      }).join('\n');
      console.log('从模板分析结果中获取到前置章节:', headerChapters.length);
      console.log('前置章节列表:', headerChapters.map(c => `${c.number} ${c.title}`).join(', '));
    } else {
      console.log('【警告】未能从模板分析结果中获取到前置章节！');
    }

    // 【增强】获取功能需求章节的标题
    const funcChapterTitle = allChapters.find(c => 
      c.number === funcChapterNum || c.number?.startsWith(funcChapterNum + '.')
    )?.title || '功能需求';
    console.log(`[动态章节] 功能需求章节标题: ${funcChapterNum} ${funcChapterTitle}`);

    let fullContent = '';

    // ========== 【核心改进】按章节逐个生成前置内容，确保格式一致 ==========
    // 只取一级章节（避免重复生成子章节）
    const level1HeaderChapters = headerChapters.filter(c => c.level === 1);
    console.log(`[前置章节] 一级章节数量: ${level1HeaderChapters.length}`);

    // 从功能列表中提取用于图表生成的信息
    const functionsForDiagram = (functionalProcesses || []).map(item => ({
      name: item.process || item.functionalProcess || item.name || '',
      description: item.description || ''
    }));

    for (const chapter of level1HeaderChapters) {
      // 获取该一级章节下的所有子章节
      const chapterPrefix = chapter.number + '.';
      const subChapters = headerChapters.filter(c => 
        c.number?.startsWith(chapterPrefix) && c.level > chapter.level
      );
      
      // 【代码显式输出章节标题】确保格式完全一致
      const chapterTitle = `\n## ${chapter.number} ${chapter.title}\n\n`;
      fullContent += chapterTitle;
      res.write(`data: ${JSON.stringify({ content: chapterTitle })}\n\n`);

      // 构建该章节的子节列表
      let subChaptersList = '';
      if (subChapters.length > 0) {
        subChaptersList = subChapters.map(s => `- ${s.number} ${s.title}`).join('\n');
      }

      // 【图表检测】检测是否包含需要生成图表的子节
      const diagramSubChapters = subChapters.filter(s => 
        s.title?.includes('用例图') || 
        s.title?.includes('流程图') || 
        s.title?.includes('时序图') ||
        s.title?.includes('架构图') ||
        s.title?.includes('功能架构') ||
        s.title?.includes('数据流图') ||
        s.title?.includes('象限图')
      );
      
      console.log(`[图表检测] 章节 ${chapter.number} 检测到 ${diagramSubChapters.length} 个图表子节:`, diagramSubChapters.map(s => s.title));

      // 为每个一级章节单独生成内容
      const chapterPrompt = `你是专业的需求规格说明书撰写专家。请为以下章节生成内容。

## 当前章节
- 编号: ${chapter.number}
- 标题: ${chapter.title}

${subChapters.length > 0 ? `## 该章节包含的子节（必须全部输出）：
${subChaptersList}

请严格按照上述子节结构输出，每个子节标题格式为：### 编号 标题` : ''}

${diagramSubChapters.length > 0 ? `## 【特别说明】以下子节包含图表，请在对应位置只写简短说明，图表将自动插入：
${diagramSubChapters.map(s => `- ${s.number} ${s.title}：写一句简短说明即可，如"下图展示了系统用例图："，图表由系统自动生成` ).join('\n')}` : ''}

## 项目背景（用于填充内容）
本项目包含以下主要功能模块：
${classifiedOverview.slice(0, 2000)}

## 【重要规则】
1. 不要输出当前章节的标题（已由系统输出）
2. ${subChapters.length > 0 ? '必须按照子节列表逐个输出，子节标题格式：### 编号 标题' : '直接输出该章节的内容'}
3. 内容要专业、具体、充实
4. 不要使用"待补充"等模糊表述

请直接开始输出内容：`;

      const chapterStream = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'glm-4-flash',
        messages: [
          { role: 'system', content: '你是专业的需求规格说明书撰写专家。直接输出内容，不要输出章节主标题。' },
          { role: 'user', content: chapterPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        stream: true
      });

      let chapterContent = '';
      for await (const chunk of chapterStream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          chapterContent += content;
        }
      }
      
      // 【核心修复】修正AI输出中的错误子节编号
      if (subChapters.length > 0) {
        chapterContent = fixHeaderChapterNumbers(chapterContent, chapter.number, subChapters);
      }
      
      // 输出修正后的内容
      if (chapterContent.trim()) {
        fullContent += chapterContent;
        res.write(`data: ${JSON.stringify({ content: chapterContent })}\n\n`);
      }

      // 【图表自动生成】使用两阶段深度分析：1.深度思考 2.生成JSON 3.渲染HTML
      for (const diagramChapter of diagramSubChapters) {
        try {
          let diagramHtml = '';
          const diagramTitle = diagramChapter.title;
          const systemName = processClassification?.systemName || functionalProcesses[0]?.systemName || '系统';
          
          // 【增强】构建更详细的功能列表，包含COSMIC数据
          const functionsText = functionsForDiagram.map((f, i) => {
            let funcDesc = `${i + 1}. ${f.name}`;
            if (f.description) funcDesc += `: ${f.description}`;
            // 如果有数据移动信息，添加操作类型
            const processData = groupedByProcess[f.name] || [];
            if (processData.length > 0) {
              const operations = processData.map(d => d.dataMovementType).filter(Boolean);
              const uniqueOps = [...new Set(operations)];
              if (uniqueOps.length > 0) {
                const opNames = uniqueOps.map(op => {
                  if (op === 'E') return '入口';
                  if (op === 'X') return '出口';
                  if (op === 'R') return '读取';
                  if (op === 'W') return '写入';
                  return op;
                });
                funcDesc += ` [操作: ${opNames.join('/')}]`;
              }
              // 添加功能用户信息
              const user = processData[0]?.functionalUser;
              if (user) funcDesc += ` [用户: ${user}]`;
            }
            return funcDesc;
          }).join('\n');
          
          console.log(`[图表数据] 为 ${diagramTitle} 准备了 ${functionsForDiagram.length} 个功能`);
          
          if (diagramTitle.includes('用例图')) {
            console.log(`📊 [深度分析用例图] ${diagramChapter.number} ${diagramTitle}`);
            res.write(`data: ${JSON.stringify({ content: '\n\n> 🤔 正在深度分析用例图...\n' })}\n\n`);
            
            try {
              // 第一阶段：深度思考分析
              const thinkingPrompt = `${USE_CASE_THINKING_PROMPT}\n\n## 系统名称\n${systemName}\n\n## 功能需求列表\n${functionsText}`;
              const thinkingResponse = await client.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'glm-4-flash',
                messages: [{ role: 'user', content: thinkingPrompt }],
                temperature: 0.5,
                max_tokens: 3000
              });
              const thinkingResult = thinkingResponse.choices[0].message.content;
              console.log(`✅ 用例图深度分析完成，长度: ${thinkingResult.length}`);
              
              // 第二阶段：生成JSON
              const generatePrompt = USE_CASE_DIAGRAM_PROMPT.replace('{THINKING_RESULT}', thinkingResult) + 
                `\n\n## 功能列表\n${functionsText}\n\n## 系统名称\n${systemName}`;
              const generateResponse = await client.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'glm-4-flash',
                messages: [{ role: 'user', content: generatePrompt }],
                temperature: 0.3,
                max_tokens: 3000
              });
              const parsed = extractDiagramJSON(generateResponse.choices[0].message.content);
              
              if (parsed) {
                diagramHtml = generateUseCaseDiagramFromAnalysis(parsed, systemName);
                console.log(`✅ 用例图生成成功，包含 ${parsed.actors?.length || 0} 个参与者, ${parsed.useCases?.length || 0} 个用例`);
              } else {
                // 降级到简单版本
                console.log('⚠️ JSON解析失败，使用简单版本');
                diagramHtml = generateHTMLUseCaseDiagram(
                  [{ name: '用户', description: '系统使用者' }],
                  functionsForDiagram.slice(0, 15).map(f => ({ name: f.name, actor: '用户' })),
                  systemName
                );
              }
            } catch (aiError) {
              console.log('AI分析用例失败，使用简单版本:', aiError.message);
              diagramHtml = generateHTMLUseCaseDiagram(
                [{ name: '用户', description: '系统使用者' }],
                functionsForDiagram.slice(0, 15).map(f => ({ name: f.name, actor: '用户' })),
                systemName
              );
            }
            
          } else if (diagramTitle.includes('象限图')) {
            console.log(`📊 [深度分析象限图] ${diagramChapter.number} ${diagramTitle}`);
            res.write(`data: ${JSON.stringify({ content: '\n\n> 🤔 正在深度分析优先级象限图...\n' })}\n\n`);
            
            try {
              // 第一阶段：深度思考分析
              const thinkingPrompt = `${QUADRANT_THINKING_PROMPT}\n\n## 功能需求列表\n${functionsText}`;
              const thinkingResponse = await client.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'glm-4-flash',
                messages: [{ role: 'user', content: thinkingPrompt }],
                temperature: 0.5,
                max_tokens: 3000
              });
              const thinkingResult = thinkingResponse.choices[0].message.content;
              console.log(`✅ 象限图深度分析完成，长度: ${thinkingResult.length}`);
              
              // 第二阶段：生成JSON
              const generatePrompt = QUADRANT_DIAGRAM_PROMPT.replace('{THINKING_RESULT}', thinkingResult) + 
                `\n\n## 功能列表\n${functionsText}`;
              const generateResponse = await client.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'glm-4-flash',
                messages: [{ role: 'user', content: generatePrompt }],
                temperature: 0.3,
                max_tokens: 3000
              });
              const parsed = extractDiagramJSON(generateResponse.choices[0].message.content);
              
              if (parsed) {
                diagramHtml = generateQuadrantDiagramFromAnalysis(parsed);
                console.log(`✅ 象限图生成成功`);
              } else {
                console.log('⚠️ JSON解析失败，使用简单版本');
                diagramHtml = generatePriorityQuadrantDiagram(functionsForDiagram);
              }
            } catch (aiError) {
              console.log('AI分析象限图失败，使用简单版本:', aiError.message);
              diagramHtml = generatePriorityQuadrantDiagram(functionsForDiagram);
            }
            
          } else if (diagramTitle.includes('架构图') || diagramTitle.includes('功能架构')) {
            console.log(`📊 [深度分析架构图] ${diagramChapter.number} ${diagramTitle}`);
            res.write(`data: ${JSON.stringify({ content: '\n\n> 🤔 正在深度分析功能架构图...\n' })}\n\n`);
            
            try {
              // 第一阶段：深度思考分析
              const thinkingPrompt = `${ARCHITECTURE_THINKING_PROMPT}\n\n## 系统名称\n${systemName}\n\n## 功能需求列表\n${functionsText}`;
              const thinkingResponse = await client.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'glm-4-flash',
                messages: [{ role: 'user', content: thinkingPrompt }],
                temperature: 0.5,
                max_tokens: 3000
              });
              const thinkingResult = thinkingResponse.choices[0].message.content;
              console.log(`✅ 架构图深度分析完成，长度: ${thinkingResult.length}`);
              
              // 第二阶段：生成JSON
              const generatePrompt = ARCHITECTURE_DIAGRAM_PROMPT_V2.replace('{THINKING_RESULT}', thinkingResult) + 
                `\n\n## 功能列表\n${functionsText}\n\n## 系统名称\n${systemName}`;
              const generateResponse = await client.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'glm-4-flash',
                messages: [{ role: 'user', content: generatePrompt }],
                temperature: 0.3,
                max_tokens: 3000
              });
              const parsed = extractDiagramJSON(generateResponse.choices[0].message.content);
              
              if (parsed) {
                diagramHtml = generateArchitectureDiagramFromAnalysis(parsed);
                console.log(`✅ 架构图生成成功，包含 ${parsed.layers?.length || 0} 个层级`);
              } else {
                console.log('⚠️ JSON解析失败，使用简单版本');
                diagramHtml = generateFunctionArchitectureDiagram(functionsForDiagram, systemName);
              }
            } catch (aiError) {
              console.log('AI分析架构图失败，使用简单版本:', aiError.message);
              diagramHtml = generateFunctionArchitectureDiagram(functionsForDiagram, systemName);
            }
            
          } else if (diagramTitle.includes('流程图') || diagramTitle.includes('业务流程')) {
            console.log(`📊 [自动生成流程图] ${diagramChapter.number} ${diagramTitle}`);
            const sampleDataMovements = [
              { dataMovementType: 'E', subProcessDesc: '用户发起请求' },
              { dataMovementType: 'R', subProcessDesc: '查询相关数据' },
              { dataMovementType: 'W', subProcessDesc: '保存处理结果' },
              { dataMovementType: 'X', subProcessDesc: '返回操作结果' }
            ];
            diagramHtml = generateHTMLFlowchart(sampleDataMovements, '业务流程');
          }
          
          if (diagramHtml) {
            // 直接输出HTML图表（前端预览时渲染，导出Word时用html2canvas转图片）
            // 使用特殊标记包裹，便于前端识别和处理
            const diagramInsert = `\n\n<!-- DIAGRAM_START:${diagramTitle} -->\n${diagramHtml}\n<!-- DIAGRAM_END -->\n\n`;
            
            fullContent += diagramInsert;
            res.write(`data: ${JSON.stringify({ content: diagramInsert })}\n\n`);
            console.log(`✅ 图表HTML已插入: ${diagramTitle}`);
          }
        } catch (diagramError) {
          console.error(`生成图表失败 ${diagramChapter.title}:`, diagramError.message);
        }
      }
    }

    // 输出功能需求章节标题
    const funcChapterHeader = `\n## ${funcChapterNum} ${funcChapterTitle}\n\n`;
    fullContent += funcChapterHeader;
    res.write(`data: ${JSON.stringify({ content: funcChapterHeader })}\n\n`);

    // ========== 第三阶段：按层级结构分批生成功能需求 ==========
    // 【核心修复】优先从 sections 中分析层级深度，而不是依赖可能不存在的 AI 分析结果
    const sectionsForAnalysis = savedAnalysis?.sections || templateAnalysis?.sections || templateAnalysis?.allChapters || [];
    
    // 使用新的层级分析函数
    let templateHierarchyLevels = analyzeTemplateHierarchyLevels(sectionsForAnalysis, funcChapterNum);
    
    // 如果 AI 分析结果中有明确的层级信息，作为参考
    if (templateAnalysis?.functionalChapter?.hierarchyLevels) {
      const aiHierarchy = templateAnalysis.functionalChapter.hierarchyLevels;
      console.log(`AI分析的层级深度: ${aiHierarchy}, 代码分析的层级深度: ${templateHierarchyLevels}`);
      // 优先使用代码分析的结果（更可靠）
    }

    // 如果模板只有2级（如 5.功能需求 → 5.1.XXX功能），则不使用子系统/模块分类
    const useSimpleStructure = templateHierarchyLevels <= 2;
    console.log(`模板层级深度: ${templateHierarchyLevels}, 使用简单结构: ${useSimpleStructure}`);
    
    // 【核心修复】从 sections 中提取功能过程的子节结构
    const extractedProcessTemplate = extractFunctionalProcessSectionsFromTemplate(sectionsForAnalysis, funcChapterNum);
    if (extractedProcessTemplate) {
      console.log(`从模板中提取到功能过程子节: ${extractedProcessTemplate.sections.join('、')}`);
    }

    // 如果有分类结果且模板支持多级结构，按子系统/功能模块/功能过程的层级生成
    if (processClassification && processClassification.classification && !useSimpleStructure) {
      const classification = processClassification.classification;
      const subsystems = Object.entries(classification);
      let globalProcessIdx = 0;

      // 全局记录已生成的子系统和模块标题，防止跨批次重复
      const generatedSubsystems = new Set();
      const generatedModules = new Set();

      for (let subsysIdx = 0; subsysIdx < subsystems.length; subsysIdx++) {
        const [subsystemName, modules] = subsystems[subsysIdx];
        const moduleEntries = Object.entries(modules);

        // 收集当前子系统下的所有功能过程，并分配固定编号
        const subsystemProcesses = [];
        let moduleIdx = 1;
        for (const [moduleName, processes] of moduleEntries) {
          let processIdx = 1;
          for (const processName of processes) {
            // 尝试精确匹配，如果失败则尝试模糊匹配
            let processData = groupedByProcess[processName];
            if (!processData || processData.length === 0) {
              // 模糊匹配：查找包含该名称的功能过程
              const matchedKey = Object.keys(groupedByProcess).find(key =>
                key.includes(processName) || processName.includes(key) ||
                key.replace(/\s+/g, '') === processName.replace(/\s+/g, '')
              );
              if (matchedKey) {
                processData = groupedByProcess[matchedKey];
                console.log(`模糊匹配: "${processName}" -> "${matchedKey}"`);
              }
            }

            subsystemProcesses.push({
              subsystem: subsystemName,
              module: moduleName,
              process: processName,
              data: processData || [],
              // 预分配固定编号，确保跨批次一致
              subsysNum: subsysIdx + 1,
              moduleNum: moduleIdx,
              processNum: processIdx
            });
            processIdx++;
          }
          moduleIdx++;
        }

        // 从模板分析结果中获取标题格式
        const funcStructure = templateAnalysis?.functionalChapter?.structure || {};
        const level2Format = funcStructure.level2 || {};
        const level3Format = funcStructure.level3 || {};
        const level4Format = funcStructure.level4 || {};
        const numberSeparator = templateAnalysis?.functionalChapter?.numberSeparator || '.';
        const titleSeparator = templateAnalysis?.functionalChapter?.titleSeparator || '.';

        // 根据模板格式构建标题的函数
        const buildTitle = (level, numbers, name) => {
          const numStr = numbers.join(numberSeparator);
          // 根据模板中的实际格式构建标题
          const levelFormat = funcStructure[`level${level}`] || {};
          const titleFormat = levelFormat.titleFormat || '';

          // 如果模板中有示例，分析其格式
          if (titleFormat) {
            // 从示例中提取格式，如 "3.1.营销管理子系统" -> 编号后有点号
            if (titleFormat.match(/\d+\.\d+\./)) {
              return `${numStr}${titleSeparator}${name}`;
            }
          }
          return `${numStr}${titleSeparator}${name}`;
        };

        // 判断是否需要输出子系统标题（只在第一个批次输出）
        const needSubsystemTitle = !generatedSubsystems.has(subsystemName);
        if (needSubsystemTitle) {
          generatedSubsystems.add(subsystemName);
          // 根据模板格式构建子系统标题
          const subsysNumbers = [funcChapterNum, subsysIdx + 1];
          const subsystemTitleText = buildTitle(2, subsysNumbers, subsystemName);
          const subsystemTitle = `\n## ${subsystemTitleText}\n\n`;
          fullContent += subsystemTitle;
          res.write(`data: ${JSON.stringify({ content: subsystemTitle })}\n\n`);
        }

        // 分批处理当前子系统的功能过程
        for (let batchStart = 0; batchStart < subsystemProcesses.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, subsystemProcesses.length);
          const batchItems = subsystemProcesses.slice(batchStart, batchEnd);
          globalProcessIdx += batchItems.length;

          res.write(`data: ${JSON.stringify({
            phase: 'generating_functions',
            message: `🔄 生成 ${subsystemName} (${batchStart + 1}-${batchEnd}/${subsystemProcesses.length})...`,
            currentStep: subsysIdx + 4,
            totalSteps: totalBatches + 3,
            batchInfo: {
              start: globalProcessIdx - batchItems.length + 1,
              end: globalProcessIdx,
              total: totalProcesses,
              subsystem: subsystemName
            }
          })}\n\n`);

          // 检查当前批次需要输出哪些模块标题
          const modulesToOutput = [];
          for (const item of batchItems) {
            const moduleKey = `${item.subsystem}::${item.module}`;
            if (!generatedModules.has(moduleKey)) {
              generatedModules.add(moduleKey);
              modulesToOutput.push({
                name: item.module,
                num: item.moduleNum
              });
            }
          }

          // 先输出模块标题（由代码控制，根据模板格式动态构建）
          for (const mod of modulesToOutput) {
            const moduleNumbers = [funcChapterNum, subsysIdx + 1, mod.num];
            const moduleTitleText = buildTitle(3, moduleNumbers, mod.name);
            const moduleTitle = `\n### ${moduleTitleText}\n\n`;
            fullContent += moduleTitle;
            res.write(`data: ${JSON.stringify({ content: moduleTitle })}\n\n`);
          }

          // 构建当前批次的详细信息，包含固定编号（根据模板格式）
          const batchDetails = batchItems.map((item, idx) => {
            const rows = item.data;
            const dataMovements = rows.map(r => `  - ${r.dataMovementType}: ${r.subProcessDesc}`).join('\n') || '  - 无数据移动记录';
            const dataGroups = [...new Set(rows.map(r => r.dataGroup).filter(Boolean))].join(', ') || '待定义';
            const dataAttrs = [...new Set(rows.flatMap(r => (r.dataAttributes || '').split(/[,|、]/).map(a => a.trim())).filter(Boolean))].join(', ') || '待定义';

            // 根据模板格式构建编号
            const processNumbers = [funcChapterNum, item.subsysNum, item.moduleNum, item.processNum];
            const fullNum = processNumbers.join(numberSeparator);

            return `【功能过程 ${fullNum}】${item.process}
- 功能用户: ${rows[0]?.functionalUser || '系统用户'}
- 触发事件: ${rows[0]?.triggerEvent || '用户操作'}
- 数据移动序列:
${dataMovements}
- 涉及数据组: ${dataGroups}
- 数据属性: ${dataAttrs}`;
          }).join('\n\n');

          // 构建每个功能过程的标题列表（根据模板格式）
          const processTitles = batchItems.map(item => {
            const processNumbers = [funcChapterNum, item.subsysNum, item.moduleNum, item.processNum];
            const fullNum = processNumbers.join(numberSeparator);
            return `- ${fullNum}${titleSeparator}${item.process}`;
          }).join('\n');

          // 根据模板分析结果构建功能过程的内容格式
          const processTemplate = templateAnalysis?.functionalChapter?.processTemplate || {};
          // 【修复】清理子节名称末尾的页码数字
          const templateSections = (processTemplate.sections || ['功能说明', '业务规则', '处理数据表', '接口设计', '验收标准'])
            .map(s => typeof s === 'string' ? s.replace(/\s+\d{1,4}\s*$/, '').trim() : s);
          const dataTableHeaders = processTemplate.dataTableHeaders || ['字段名', '类型', '长度', '说明', '来源'];

          // 构建基于模板的输出格式说明
          let templateFormatGuide = '';
          if (templateAnalysis?.originalTemplateText) {
            templateFormatGuide = `
## 【核心要求】严格按照模板格式生成
请参考以下模板原文的格式和风格：
${templateAnalysis.originalTemplateText.slice(0, 4000)}

模板中功能过程的子节结构：${templateSections.join('、')}
模板中数据表的表头：${dataTableHeaders.join(' | ')}
`;
          }

          // 根据模板分析结果获取子节标题格式
          const sectionTitleFormat = processTemplate.sectionTitleFormat || '##### ';

          // 检查模板是否需要时序图/流程图
          const needsDiagram = templateAnalysis?.functionalChapter?.processTemplate?.needsDiagram ||
            templateSections.some(s => s.includes('时序') || s.includes('流程图') || s.includes('示意图') || s.includes('交互图'));

          // 为每个功能过程预先输出标题（由代码控制，确保格式稳定）
          for (const item of batchItems) {
            const processNumbers = [funcChapterNum, item.subsysNum, item.moduleNum, item.processNum];
            const fullNum = processNumbers.join(numberSeparator);
            // 【修正】根据编号层级动态确定标题级别
            const processDotCount = (fullNum.match(/\./g) || []).length;
            const processHeadingLevel = Math.min(processDotCount + 2, 6);
            const processHashes = '#'.repeat(processHeadingLevel);
            // 【修复】编号和标题之间用空格分隔，不要用分隔符
            const processTitle = `\n${processHashes} ${fullNum} ${item.process}\n\n`;
            fullContent += processTitle;
            res.write(`data: ${JSON.stringify({ content: processTitle })}\n\n`);

            // 为每个功能过程单独生成内容（提高稳定性）
            const rows = item.data;
            const dataMovements = rows.map(r => `  - ${r.dataMovementType}: ${r.subProcessDesc}`).join('\n') || '  - 无数据移动记录';
            const dataGroups = [...new Set(rows.map(r => r.dataGroup).filter(Boolean))].join(', ') || '待定义';
            const dataAttrs = [...new Set(rows.flatMap(r => (r.dataAttributes || '').split(/[,|、]/).map(a => a.trim())).filter(Boolean))].join(', ') || '待定义';

            const processDetail = `功能过程：${item.process}
- 功能用户: ${rows[0]?.functionalUser || '系统用户'}
- 触发事件: ${rows[0]?.triggerEvent || '用户操作'}
- 数据移动序列:
${dataMovements}
- 涉及数据组: ${dataGroups}
- 数据属性: ${dataAttrs}`;

            // 根据 COSMIC 数据生成HTML+CSS时序图（用于插入Word文档）
            const htmlSequenceDiagram = generateHTMLSequenceDiagram(rows, item.process);
            const htmlFlowchart = generateHTMLFlowchart(rows, item.process);

            // ========== 【增强】执行快速深度思考 ==========
            let deepThinkingInsight = '';
            // 【移除深度思考】直接生成功能内容，不再进行额外的深度思考调用

            // 获取模板的内容格式（表格形式 vs 普通文本形式）
            const contentFormat = processTemplate.contentFormat || 'text';
            const contentTableStructure = processTemplate.contentTableStructure || null;

            // 构建单个功能过程的提示词（不包含标题，标题已由代码输出）
            // 获取完整示例（优先使用深度分析结果中的示例）
            const exampleContent = savedAnalysis?.fullProcessExample ||
              templateAnalysis?.fullProcessExample ||
              fullProcessExample || '';
            const writingGuidelines = savedAnalysis?.writingGuidelines ||
              templateAnalysis?.writingGuidelines ||
              '专业、详细、具体';
            const processContentTemplate = savedAnalysis?.processContentTemplate ||
              templateAnalysis?.processContentTemplate ||
              processTemplate;

            // ========== 【核心修复】从模板分析结果中提取子节结构 ==========
            // 优先级1：使用前面从 sections 自动提取的子节结构
            let finalSections = [];
            
            if (extractedProcessTemplate && extractedProcessTemplate.sections && extractedProcessTemplate.sections.length > 0) {
              finalSections = extractedProcessTemplate.sections;
              console.log(`[复杂结构子节来源] 从 sections 自动提取:`, finalSections);
            }
            // 优先级2：从 AI 分析结果获取
            else {
              let templateSectionsFromAnalysis = [];
              if (savedAnalysis?.functionalChapter?.processContentTemplate?.sections) {
                templateSectionsFromAnalysis = savedAnalysis.functionalChapter.processContentTemplate.sections;
              } else if (templateAnalysis?.functionalChapter?.processContentTemplate?.sections) {
                templateSectionsFromAnalysis = templateAnalysis.functionalChapter.processContentTemplate.sections;
              } else if (processContentTemplate?.sections) {
                templateSectionsFromAnalysis = processContentTemplate.sections;
              }

              // 如果sections是对象数组，提取name字段
              finalSections = templateSectionsFromAnalysis.map(s =>
                typeof s === 'string' ? s : (s.name || s.title || '')
              ).filter(Boolean);
              
              console.log(`[复杂结构子节来源] 从 AI 分析结果:`, finalSections);
            }

            // 如果仍然没有获取到子节，使用模板中已识别的子节（不使用硬编码默认值）
            if (finalSections.length === 0 && templateSections && templateSections.length > 0) {
              finalSections = templateSections;
              console.log(`[复杂结构子节来源] 使用 templateSections 变量:`, finalSections);
            }

            // 【修复】清理子节名称末尾的页码数字
            finalSections = finalSections.map(s => s.replace(/\s+\d{1,4}\s*$/, '').trim());

            // 构建单个功能过程的提示词
            let singleProcessPrompt = `你是专业的需求规格说明书撰写专家。

## 【最高优先级 - 必须严格遵守的格式要求】

### 关键规则1：子节标题是强制性的
- ✅ **必须输出所有子节标题**（如 "##### 5.3.1 功能说明"、"##### 5.3.2 业务规则"）
- ✅ **每个子节都要有完整的标题行**（5个#号 + 空格 + 编号 + 空格 + 名称）
- ❌ **绝对禁止省略子节标题**

### 关键规则2：不要输出功能过程主标题
- ❌ 不要输出功能过程的主标题（如 "## 5.3 查询小区保障性用户预测结果"），这个标题已由系统生成
- ✅ 只输出子节标题和内容

### 关键规则3：子节标题格式
- 格式：##### 编号 名称
- 示例：##### ${processNumbers.join(numberSeparator)}.1 功能说明
- 5个#号，后跟空格，再跟编号，再跟空格，最后是名称

## 功能过程详情：
${processDetail}

${deepThinkingInsight}

## 【内容丰富度要求】
- 功能说明着重描述：功能描述（做什么）、操作流程（怎么做，步骤要清晰具体）
- 业务规则要全面：数据校验、权限控制、状态转换、异常处理等维度
- 验收标准要具体：正常流程、异常流程、边界条件都要覆盖
- 数据字段要详细：包含字段说明、类型、约束、示例

`;

            // 如果有完整示例，添加到提示词中作为参考
            if (exampleContent && exampleContent.length > 100) {
              singleProcessPrompt += `## 【参考示例】请严格模仿以下示例的格式、深度、语气和内容结构：

${exampleContent.slice(0, 3000)}

## 【写作要求】
${writingGuidelines}
- 内容要专业、详细、有深度
- 不要使用"待补充"、"至少XX字"、"AI生成"等模糊表述
- 每个子节的内容都要实质性填写

`;
            }

            // ========== 根据模板子节结构生成内容格式 ==========
            // 根据模板的内容格式生成对应的输出格式
            if (contentFormat === 'table' && contentTableStructure) {
              // 表格形式：如模板中的 功能描述|描述 两列表格
              const tableHeaders = contentTableStructure.headers || ['功能描述', '描述'];
              const tableRows = contentTableStructure.rows || ['功能目的', '使用场景', '操作流程'];

              singleProcessPrompt += `## 【输出格式】请使用以下表格形式输出：

| ${tableHeaders[0]} | ${tableHeaders[1]} |
|------|------|
`;
              tableRows.forEach(row => {
                if (row.includes('新增') || row.includes('添加')) {
                  singleProcessPrompt += `| ${row} | 功能目的：允许用户...。使用场景：当...时。操作流程：1. 用户... 2. 系统... 3. ... |
`;
                } else if (row.includes('修改') || row.includes('编辑')) {
                  singleProcessPrompt += `| ${row} | 功能目的：允许用户修改...。使用场景：当...需要变更时。操作流程：1. 用户选择... 2. 修改... 3. 保存... |
`;
                } else if (row.includes('删除')) {
                  singleProcessPrompt += `| ${row} | 功能目的：允许用户删除...。使用场景：当...不再需要时。操作流程：1. 用户选择... 2. 确认删除... 3. 系统删除... |
`;
                } else {
                  singleProcessPrompt += `| ${row} | （根据功能过程详情填写具体内容） |
`;
                }
              });

              singleProcessPrompt += `
请根据上述功能过程详情，填写表格中每一行的具体内容。每个单元格的内容要包含：功能目的、使用场景、操作流程。
`;
            } else {
              // 普通文本形式：使用模板中的子节标题
              const headersToUse = processContentTemplate?.dataTableHeaders || dataTableHeaders;

              // 获取功能过程编号前缀，用于生成子节编号
              const processNumbers = [funcChapterNum, item.subsysNum, item.moduleNum, item.processNum];
              const processNumPrefix = processNumbers.join(numberSeparator);

              singleProcessPrompt += `\n## 【必须严格按照以下结构输出 - 共${finalSections.length}个子节】\n\n`;
              singleProcessPrompt += `模板要求的子节：${finalSections.join('、')}\n\n`;
              singleProcessPrompt += `### 输出格式示例（必须完全按照此格式）：\n\n`;
              
              // 为前3个子节生成完整示例
              for (let i = 0; i < Math.min(3, finalSections.length); i++) {
                singleProcessPrompt += `##### ${processNumPrefix}.${i+1} ${finalSections[i]}\n`;
                singleProcessPrompt += `（这里写${finalSections[i]}的具体内容）\n\n`;
              }
              
              if (finalSections.length > 3) {
                singleProcessPrompt += `...（后续子节以此类推）\n\n`;
              }
              
              singleProcessPrompt += `### 强制要求：\n`;
              singleProcessPrompt += `1. 必须输出全部${finalSections.length}个子节，一个都不能少\n`;
              singleProcessPrompt += `2. 每个子节必须以 "##### ${processNumPrefix}.X 子节名称" 开头\n`;
              singleProcessPrompt += `3. 子节之间用空行分隔\n`;
              singleProcessPrompt += `4. 不要输出任何其他格式的标题\n\n`;

              // 根据模板中的子节结构生成格式指南
              finalSections.forEach((section, idx) => {
                const sectionNum = `${processNumPrefix}.${idx + 1}`;
                const sectionTitle = `##### ${sectionNum}. ${section}`;

                if (section.includes('数据') || section.includes('处理数据')) {
                  singleProcessPrompt += `${sectionTitle}

| ${headersToUse.join(' | ')} |
|${headersToUse.map(() => '------').join('|')}|
| 字段1 | 类型 | 长度 | 说明 | 来源 |
（根据功能需要列出相关字段）

`;
                } else if (section.includes('规则') || section.includes('业务规则') || section.includes('模型') || section.includes('算法')) {
                  singleProcessPrompt += `${sectionTitle}

**业务规则：**
规则1：所有绘制的轮廓必须合法描述。
规则2：场景名称、所属区域、绘制人等信息必须完整填写。
规则3：系统需对输入数据进行校验，确保数据的准确性和完整性。
规则4：只有授权用户才能访问和修改重保场景轮廓数据。

**模型和算法：**
（如有相关的数据模型、计算模型或算法，在此详细描述）

`;
                } else if (section.includes('接口')) {
                  singleProcessPrompt += `${sectionTitle}

**请求参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| param1 | string | 是 | 说明 |

**响应参数：**
| 参数名 | 类型 | 说明 |
|--------|------|------|
| result | object | 返回结果 |

`;
                } else if (section.includes('界面')) {
                  singleProcessPrompt += `${sectionTitle}

界面布局说明：
- 界面元素1：描述
- 界面元素2：描述
（如有必要可以描述界面原型图）

`;
                } else if (section.includes('验收') || section.includes('测试') || section.includes('标准')) {
                  singleProcessPrompt += `${sectionTitle}

1. 验收标准1：达到什么条件可以判断功能完成
2. 验收标准2：具体的验收条件
（列出验收标准）

`;
                } else if (section.includes('说明') || section.includes('功能说明')) {
                  singleProcessPrompt += `${sectionTitle}

**功能目的：** 描述该功能的业务目的

**使用场景：** 描述用户在什么情况下使用该功能

**操作流程：**
1. 用户执行操作1
2. 系统响应
3. 用户执行操作2
...

【注意】操作流程、使用场景等都是功能说明的内容，不要为它们单独创建子节标题

`;
                } else if (section.includes('时序') || section.includes('流程图') || section.includes('示意图') || section.includes('交互图')) {
                  singleProcessPrompt += `${sectionTitle}\n\n${htmlSequenceDiagram}\n\n`;
                } else {
                  singleProcessPrompt += `${sectionTitle}

（根据功能过程详情填写具体内容）

`;
                }
              });
            }

            // 如果模板需要图表，添加HTML时序图
            if (needsDiagram && htmlSequenceDiagram) {
              singleProcessPrompt += `\n\n**操作时序图：**\n\n${htmlSequenceDiagram}`;
            }

            singleProcessPrompt += `\n\n## 【最终检查清单 - 输出前必须确认】

### 格式检查：
- [ ] 每个子节都有 "##### X.X.X 名称" 格式的标题
- [ ] 使用了5个#号（#####），不是2个、3个或4个
- [ ] 编号格式正确：${fullNum}.1、${fullNum}.2、${fullNum}.3...
- [ ] 子节之间有空行分隔
- [ ] 没有输出功能过程主标题（## ${fullNum} XXX）

### 内容检查：
- [ ] 所有${finalSections.length}个子节都已输出
- [ ] 每个子节都有实质性内容，不是空的
- [ ] 表格格式正确，使用标准Markdown
- [ ] 没有"待补充"、"根据实际情况"等模糊表述

### 禁止事项：
- ❌ 禁止省略任何子节标题
- ❌ 禁止重复输出同一个子节
- ❌ 禁止使用错误的编号
- ❌ 禁止输出目录列表

现在请严格按照上述要求输出内容：`;

            const singleStream = await client.chat.completions.create({
              model: process.env.OPENAI_MODEL || 'glm-4-flash',
              messages: [
                { role: 'system', content: COSMIC_FUNCTION_ANALYSIS_PROMPT },
                { role: 'user', content: singleProcessPrompt }
              ],
              temperature: 0.3,  // 降低温度，提高输出稳定性和一致性
              max_tokens: 8000,
              stream: true
            });

            // 收集当前功能过程的完整内容，用于后处理
            let processContent = '';
            for await (const chunk of singleStream) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                processContent += content;
              }
            }
            
            // 【后处理】过滤AI可能输出的重复功能过程标题
            // 【修复】增强正则匹配，支持更多格式变体
            const escapedItemProcess = item.process.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // 提取功能名称的核心部分（去掉括号内容）用于更宽松的匹配
            const coreItemProcess = item.process.replace(/[（(][^）)]*[）)]/g, '').trim();
            const escapedCoreItemProcess = coreItemProcess.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const titlePatterns = [
              // 匹配完整功能名称（带括号）
              new RegExp(`^\\s*#{1,4}\\s*${fullNum.replace(/\./g, '\\.')}[.．、\\s]*${escapedItemProcess}[\\s\\n]*`, 'i'),
              // 匹配核心功能名称（不带括号）
              new RegExp(`^\\s*#{1,4}\\s*${fullNum.replace(/\./g, '\\.')}[.．、\\s]*${escapedCoreItemProcess}[\\s\\n]*`, 'i'),
              // 匹配纯编号开头
              new RegExp(`^\\s*#{1,4}\\s*${fullNum.replace(/\./g, '\\.')}[.．、\\s]+[^\\n]*\\n`, 'i'),
              // 匹配无#号的标题格式
              new RegExp(`^\\s*${fullNum.replace(/\./g, '\\.')}[.．、\\s]*${escapedItemProcess}[\\s\\n]*`, 'i'),
              new RegExp(`^\\s*${fullNum.replace(/\./g, '\\.')}[.．、\\s]*${escapedCoreItemProcess}[\\s\\n]*`, 'i')
            ];
            
            let cleanedContent = processContent;
            for (const pattern of titlePatterns) {
              const match = cleanedContent.match(pattern);
              if (match) {
                // 确保只移除功能过程标题，不移除子节标题
                const matchedText = match[0];
                // 检查匹配的内容是否包含子节编号（如 5.1.1.1）
                if (!matchedText.match(/\d+\.\d+\.\d+\.\d+/)) {
                  cleanedContent = cleanedContent.replace(pattern, '');
                  console.log(`[标题过滤-复杂结构] 移除了重复的功能过程标题: ${fullNum} ${item.process}`);
                  break;
                }
              }
            }
            
            // 【核心修复0】移除AI输出中错误的功能过程标题（如在5.9内容中出现5.1）
            cleanedContent = removeWrongProcessTitles(cleanedContent, fullNum, funcChapterNum);
            
            // 【核心修复0.5】重组内容，确保子节标题和内容匹配
            if (finalSections && finalSections.length > 0) {
              cleanedContent = reorganizeContent(cleanedContent, fullNum, finalSections, '.');
            }
            
            // 【核心修复1】移除AI输出中的重复子节
            if (finalSections && finalSections.length > 0) {
              cleanedContent = removeDuplicateSections(cleanedContent, fullNum, finalSections);
            }
            
            // 【核心修复1.5】移除子节标题下方的重复文本标题
            if (finalSections && finalSections.length > 0) {
              cleanedContent = removeTextDuplicateTitles(cleanedContent, fullNum, finalSections);
            }
            
            // 【核心修复1.6】移除子节内容中出现的错位子节标题
            if (finalSections && finalSections.length > 0) {
              cleanedContent = removeMisplacedSectionTitles(cleanedContent, fullNum, finalSections);
            }
            
            // 【核心修复2】修正AI输出中的错误子节编号
            if (finalSections && finalSections.length > 0) {
              cleanedContent = fixSubSectionNumbers(cleanedContent, fullNum, '.', finalSections);
            }
            
            // 输出清理后的内容
            if (cleanedContent.trim()) {
              fullContent += cleanedContent;
              res.write(`data: ${JSON.stringify({ content: cleanedContent })}\n\n`);
            }

            fullContent += '\n\n---\n\n';
            res.write(`data: ${JSON.stringify({ content: '\n\n---\n\n' })}\n\n`);
          }
        }
      }
    } else {
      // 使用简单结构（适用于模板层级较少的情况，如 5.功能需求 → 5.1.XXX功能）
      // 严格按照模板的子节结构生成每个功能过程
      console.log('使用简单结构生成功能需求');

      // ========== 【核心修复】完全动态：优先使用从 sections 自动提取的子节结构 ==========
      let finalSectionsForSimple = [];
      let sectionsDetailedForSimple = [];
      let needsRealTimeExtraction = false;

      // 优先级1: 使用前面从 sections 自动提取的子节结构（最可靠）
      if (extractedProcessTemplate && extractedProcessTemplate.sections && extractedProcessTemplate.sections.length > 0) {
        finalSectionsForSimple = extractedProcessTemplate.sections;
        sectionsDetailedForSimple = extractedProcessTemplate.sectionsDetailed || [];
        console.log('[子节来源] 从 sections 自动提取:', finalSectionsForSimple);
      }
      // 优先级2: 从 savedAnalysis 的 AI 分析结果中获取
      else if (savedAnalysis?.functionalChapter?.processContentTemplate?.sections) {
        const aiSections = savedAnalysis.functionalChapter.processContentTemplate.sections;
        finalSectionsForSimple = aiSections.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean);
        sectionsDetailedForSimple = savedAnalysis.functionalChapter.processContentTemplate.sectionsDetailed || [];
        console.log('[子节来源] 从 savedAnalysis AI分析结果:', finalSectionsForSimple);
      }
      // 优先级3: 从 templateAnalysis 的 AI 分析结果中获取
      else if (templateAnalysis?.functionalChapter?.processContentTemplate?.sections) {
        const aiSections = templateAnalysis.functionalChapter.processContentTemplate.sections;
        finalSectionsForSimple = aiSections.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean);
        sectionsDetailedForSimple = templateAnalysis.functionalChapter.processContentTemplate.sectionsDetailed || [];
        console.log('[子节来源] 从 templateAnalysis AI分析结果:', finalSectionsForSimple);
      }
      // 优先级4: 从 processContentTemplate 中获取
      else if (templateAnalysis?.processContentTemplate?.sections) {
        const aiSections = templateAnalysis.processContentTemplate.sections;
        finalSectionsForSimple = aiSections.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean);
        console.log('[子节来源] 从 processContentTemplate:', finalSectionsForSimple);
      }

      // 如果所有方式都无法获取子节，标记需要实时提取
      if (finalSectionsForSimple.length === 0) {
        needsRealTimeExtraction = true;
        console.log('[子节来源] 无法自动提取，将使用AI实时提取');
      }

      // 【修复】清理子节名称末尾的页码数字（如 "业务规则、模型和算法 10" -> "业务规则、模型和算法"）
      finalSectionsForSimple = finalSectionsForSimple.map(s => s.replace(/\s+\d{1,4}\s*$/, '').trim());

      console.log('最终子节结构:', finalSectionsForSimple);
      console.log('是否需要实时提取:', needsRealTimeExtraction);

      // 获取编号分隔符
      const numberSeparator = templateAnalysis?.numberingRules?.separator ||
        templateAnalysis?.functionalChapter?.numberSeparator || '.';

      // 逐个生成功能过程
      for (let processIdx = 0; processIdx < totalProcesses; processIdx++) {
        const processName = functionalProcesses[processIdx];
        const rows = groupedByProcess[processName] || [];
        const processNum = processIdx + 1;
        const fullNum = `${funcChapterNum}${numberSeparator}${processNum}`;

        res.write(`data: ${JSON.stringify({
          phase: 'generating_functions',
          message: `🔄 生成功能 ${fullNum} ${processName}...`,
          currentStep: processIdx + 4,
          totalSteps: totalProcesses + 3,
          batchInfo: { start: processIdx + 1, end: processIdx + 1, total: totalProcesses }
        })}\n\n`);

        // 输出功能过程标题（如：5.1.XXX功能（功能编号））
        // 【修正】根据编号层级确定正确的标题级别
        // fullNum 如 "5.1" 有1个点，应该是三级标题(###)
        const dotCount = (fullNum.match(/\./g) || []).length;
        const headingLevel = Math.min(dotCount + 2, 6); // ## 是一级，### 是二级，以此类推
        const headingHashes = '#'.repeat(headingLevel);
        // 【修复】编号和标题之间用空格分隔，不要用分隔符
        const processTitle = `\n${headingHashes} ${fullNum} ${processName}\n\n`;
        fullContent += processTitle;
        res.write(`data: ${JSON.stringify({ content: processTitle })}\n\n`);

        // 准备COSMIC数据
        const dataMovements = rows.map(r => `  - ${r.dataMovementType}: ${r.subProcessDesc}`).join('\n') || '  - 无数据移动记录';
        const dataGroups = [...new Set(rows.map(r => r.dataGroup).filter(Boolean))].join(', ') || '待定义';
        const dataAttrs = [...new Set(rows.flatMap(r => (r.dataAttributes || '').split(/[,|、]/).map(a => a.trim())).filter(Boolean))].join(', ') || '待定义';

        const processDetail = `功能过程：${processName}
- 功能用户: ${rows[0]?.functionalUser || '系统用户'}
- 触发事件: ${rows[0]?.triggerEvent || '用户操作'}
- 数据移动序列:
${dataMovements}
- 涉及数据组: ${dataGroups}
- 数据属性: ${dataAttrs}`;

        // 【移除深度思考】直接生成功能内容，不再进行额外的深度思考调用
        let deepThinkingInsightSimple = '';

        // ========== 完全动态构建子节提示词 ==========
        let sectionsPrompt = '';

        if (needsRealTimeExtraction) {
          // 如果没有从分析结果中获取到子节，让AI从模板原文中实时提取
          sectionsPrompt = `## 【重要】请从模板原文中识别功能过程的子节结构

你需要：
1. 仔细阅读下面的模板原文
2. 找到功能过程（如 X.1.XXX功能）下面的子节结构
3. 按照模板中的子节结构生成内容

**不要使用任何预设的子节结构，必须从模板原文中提取！**

`;
        } else {
          // 【核心修复】优先使用前面提取的 sectionsDetailedForSimple
          const sectionsDetailed = sectionsDetailedForSimple.length > 0 
            ? sectionsDetailedForSimple 
            : (savedAnalysis?.functionalChapter?.processContentTemplate?.sectionsDetailed ||
               templateAnalysis?.functionalChapter?.processContentTemplate?.sectionsDetailed || []);

          // 【修复】简化提示词，只输出一次子节结构，避免AI混乱导致重复输出
          sectionsPrompt = `## 【子节结构要求 - 严格按顺序输出，每个子节只输出一次！】\n`;
          sectionsPrompt += `本功能必须包含以下${finalSectionsForSimple.length}个子节，按顺序逐个输出：\n\n`;
          
          finalSectionsForSimple.forEach((section, idx) => {
            const sectionNum = `${fullNum}${numberSeparator}${idx + 1}`;
            const sectionDotCount = (sectionNum.match(/\./g) || []).length;
            const sectionHeadingLevel = Math.min(sectionDotCount + 2, 6);
            const sectionHashes = '#'.repeat(sectionHeadingLevel);
            
            // 尝试从详细信息中获取该子节的描述
            const sectionDetail = sectionsDetailed.find(s => s.name === section || s.title === section);
            const sectionFormat = sectionDetail?.format || 'text';
            
            sectionsPrompt += `${idx + 1}. ${sectionHashes} ${sectionNum} ${section}`;
            // 为每个子节添加内容说明
            if (section.includes('功能说明') || section.includes('功能描述')) {
              sectionsPrompt += `
   【功能说明包含以下内容，全部写在这个子节内，不要分开！】
   - 功能目的：描述该功能的业务目的
   - 使用场景：描述用户在什么情况下使用该功能（写在功能说明内，不是单独的子节！）
   - 操作流程：描述用户操作步骤（写在功能说明内，不是单独的子节！）`;
            } else if (section.includes('业务规则') || section.includes('规则')) {
              sectionsPrompt += `（列出业务规则，如数据校验、权限控制等，用编号列表格式。注意：不要在这里写使用场景或操作流程！）`;
            } else if (section.includes('处理数据') || section.includes('数据')) {
              sectionsPrompt += `（用表格列出数据字段。注意：不要在这里写操作流程！）`;
            } else if (section.includes('接口')) {
              sectionsPrompt += `（描述接口信息）`;
            } else if (section.includes('界面')) {
              sectionsPrompt += `（描述界面要求）`;
            } else if (section.includes('验收') || section.includes('标准')) {
              sectionsPrompt += `（列出验收标准，用编号列表格式）`;
            }
            sectionsPrompt += `\n`;
          });
          
          sectionsPrompt += `\n【严格警告】
1. 每个子节只能输出一次，不要重复！
2. 子节编号必须使用 ${fullNum}.X 格式（如 ${fullNum}.1、${fullNum}.2），不要使用其他编号！
3. 不要输出任何 5.1.X 或其他错误编号的标题！
4. 输出完${finalSectionsForSimple.length}个子节后立即停止，不要继续输出！
5. 【重要】"使用场景"和"操作流程"必须写在"功能说明"子节内，不要放到其他子节！
\n\n`;
        }

        // 获取模板示例
        const exampleContent = savedAnalysis?.templateExamples?.functionalProcessExample ||
          templateAnalysis?.templateExamples?.functionalProcessExample ||
          fullProcessExample || '';

        // 获取模板原文片段作为格式参考（减少长度避免AI混乱）
        const templateTextSnippet = needsRealTimeExtraction
          ? (templateAnalysis?.originalTemplateText?.slice(0, 5000) || templateText?.slice(0, 3000) || '')
          : (templateAnalysis?.originalTemplateText?.slice(0, 2000) || templateText?.slice(0, 1000) || '');

        // 构建子节输出规范（只有在已知子节结构时才指定）
        const sectionOutputSpec = finalSectionsForSimple.length > 0
          ? `- 严格按照模板的子节结构输出：${finalSectionsForSimple.join('、')}\n- 子节标题格式必须与模板一致`
          : `- 从模板原文中识别子节结构，并严格按照该结构输出\n- 子节标题格式必须与模板一致`;

        const singleProcessPrompt = `你是专业的需求规格说明书撰写专家。

## 【最高优先级 - 必须严格遵守的格式要求】

### 关键规则1：子节标题是强制性的
- ✅ **必须输出所有子节标题**（如 "##### ${fullNum}.1 功能说明"、"##### ${fullNum}.2 业务规则"）
- ✅ **每个子节都要有完整的标题行**（5个#号 + 空格 + 编号 + 空格 + 名称）
- ❌ **绝对禁止省略子节标题**

### 关键规则2：不要输出功能过程主标题
- ❌ 不要输出功能过程的主标题（如 "## ${fullNum} XXX功能"），这个标题已由系统生成
- ✅ 只输出子节标题和内容

### 关键规则3：子节标题格式
- 格式：##### 编号 名称
- 示例：##### ${fullNum}.1 功能说明
- 5个#号，后跟空格，再跟编号，再跟空格，最后是名称

## 功能过程详情（COSMIC数据）：
${processDetail}

${deepThinkingInsightSimple}

## 【内容丰富度要求】
- 功能说明着重描述：功能描述（做什么）、操作流程（怎么做，步骤要清晰具体）
- 业务规则要全面：数据校验、权限控制、状态转换、异常处理等维度
- 验收标准要具体：正常流程、异常流程、边界条件都要覆盖
- 数据字段要详细：包含字段说明、类型、约束、示例

## 【模板原文】这是用户上传的模板，你必须严格按照这个模板的格式生成：

${templateTextSnippet}

${exampleContent ? `## 【功能过程示例】请严格模仿以下示例的结构和风格：

${exampleContent.slice(0, 2000)}

` : ''}

${sectionsPrompt}

## 【最终检查清单 - 输出前必须确认】

### 格式检查：
- [ ] 每个子节都有 "##### ${fullNum}.X 名称" 格式的标题
- [ ] 使用了5个#号（#####），不是2个、3个或4个
- [ ] 编号格式正确：${fullNum}.1、${fullNum}.2、${fullNum}.3...
- [ ] 子节之间有空行分隔
- [ ] 没有输出功能过程主标题（## ${fullNum} XXX）

### 内容检查：
- [ ] 所有${finalSectionsForSimple.length}个子节都已输出
- [ ] 每个子节都有实质性内容，不是空的
- [ ] 表格格式正确，使用标准Markdown
- [ ] 没有"待补充"、"根据实际情况"等模糊表述
- [ ] 内容与模板风格一致

### 禁止事项：
- ❌ 禁止省略任何子节标题
- ❌ 禁止重复输出同一个子节
- ❌ 禁止使用错误的编号
- ❌ 禁止输出目录列表

现在请严格按照上述要求输出内容：`;

        const singleStream = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'glm-4-flash',
          messages: [
            { role: 'system', content: COSMIC_FUNCTION_ANALYSIS_PROMPT },
            { role: 'user', content: singleProcessPrompt }
          ],
          temperature: 0.3,  // 降低温度，提高输出稳定性和一致性
          max_tokens: 8000,
          stream: true
        });

        // 收集当前功能过程的完整内容，用于后处理
        let processContent = '';
        for await (const chunk of singleStream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            processContent += content;
          }
        }
        
        // 【后处理】过滤AI可能输出的重复功能过程标题
        // 【修复】增强正则匹配，支持更多格式变体
        const escapedProcessName = processName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // 提取功能名称的核心部分（去掉括号内容）用于更宽松的匹配
        const coreProcessName = processName.replace(/[（(][^）)]*[）)]/g, '').trim();
        const escapedCoreProcessName = coreProcessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const titlePatterns = [
          // 匹配完整功能名称（带括号）
          new RegExp(`^\\s*#{1,4}\\s*${fullNum.replace(/\./g, '\\.')}[.．、\\s]*${escapedProcessName}[\\s\\n]*`, 'i'),
          // 匹配核心功能名称（不带括号）
          new RegExp(`^\\s*#{1,4}\\s*${fullNum.replace(/\./g, '\\.')}[.．、\\s]*${escapedCoreProcessName}[\\s\\n]*`, 'i'),
          // 匹配纯编号开头
          new RegExp(`^\\s*#{1,4}\\s*${fullNum.replace(/\./g, '\\.')}[.．、\\s]+[^\\n]*\\n`, 'i'),
          // 匹配无#号的标题格式
          new RegExp(`^\\s*${fullNum.replace(/\./g, '\\.')}[.．、\\s]*${escapedProcessName}[\\s\\n]*`, 'i'),
          new RegExp(`^\\s*${fullNum.replace(/\./g, '\\.')}[.．、\\s]*${escapedCoreProcessName}[\\s\\n]*`, 'i')
        ];
        
        let cleanedContent = processContent;
        for (const pattern of titlePatterns) {
          const match = cleanedContent.match(pattern);
          if (match) {
            // 确保只移除功能过程标题，不移除子节标题
            const matchedText = match[0];
            // 检查匹配的内容是否包含子节编号（如 5.1.1）
            if (!matchedText.match(/\d+\.\d+\.\d+/)) {
              cleanedContent = cleanedContent.replace(pattern, '');
              console.log(`[标题过滤] 移除了重复的功能过程标题: ${fullNum} ${processName}`);
              break;
            }
          }
        }
        
        // 【新增】检测并过滤异常的目录结构输出
        // 如果内容看起来像是目录（包含大量连续的章节编号），则标记为异常
        const tocPattern = /(\d+\.\d+(\.\d+)?[.、\s]+[^\n]+\n){5,}/;
        const hasExcessiveNumbers = (cleanedContent.match(/\d+\.\d+\.\d+/g) || []).length > 20;
        if (tocPattern.test(cleanedContent) || hasExcessiveNumbers) {
          console.log(`[异常检测] 功能 ${fullNum} ${processName} 输出疑似目录结构，将重新生成简化内容`);
          // 生成简化的占位内容
          cleanedContent = '';
          finalSectionsForSimple.forEach((section, idx) => {
            const sectionNum = `${fullNum}${numberSeparator}${idx + 1}`;
            const sectionDotCount = (sectionNum.match(/\./g) || []).length;
            const sectionHeadingLevel = Math.min(sectionDotCount + 2, 6);
            const sectionHashes = '#'.repeat(sectionHeadingLevel);
            cleanedContent += `${sectionHashes} ${sectionNum} ${section}\n\n`;
            // 根据子节类型生成基本内容
            if (section.includes('功能说明') || section.includes('功能描述')) {
              cleanedContent += `本功能用于${processName}，支持用户进行相关操作。\n\n**操作流程：**\n1. 用户进入功能界面\n2. 执行${processName}操作\n3. 系统处理并返回结果\n\n`;
            } else if (section.includes('业务规则')) {
              cleanedContent += `- 规则1：数据必须符合系统要求\n- 规则2：操作需要相应权限\n- 规则3：异常情况需要提示用户\n\n`;
            } else if (section.includes('处理数据') || section.includes('数据')) {
              cleanedContent += `| 字段名 | 类型 | 说明 |\n|--------|------|------|\n| id | Integer | 主键ID |\n| name | String | 名称 |\n| status | Integer | 状态 |\n\n`;
            } else if (section.includes('接口')) {
              cleanedContent += `本功能涉及的接口将在详细设计阶段定义。\n\n`;
            } else if (section.includes('界面')) {
              cleanedContent += `界面设计遵循系统统一风格，具体布局在UI设计阶段确定。\n\n`;
            } else if (section.includes('验收标准')) {
              cleanedContent += `- 功能正常执行，无报错\n- 数据正确保存和展示\n- 异常情况有明确提示\n\n`;
            } else {
              cleanedContent += `（${section}内容待完善）\n\n`;
            }
          });
        }
        
        // 【核心修复】检查并补充缺失的子节标题
        if (finalSectionsForSimple.length > 0) {
          let contentWithSections = cleanedContent;
          let missingSections = [];
          
          // 检查每个子节标题是否存在
          for (let idx = 0; idx < finalSectionsForSimple.length; idx++) {
            const section = finalSectionsForSimple[idx];
            const sectionNum = `${fullNum}${numberSeparator}${idx + 1}`;
            // 【修复】放宽匹配条件，支持更多格式
            const sectionPatterns = [
              // 匹配完整编号+名称
              new RegExp(`#{2,6}\\s*${sectionNum.replace(/\./g, '\\.')}[.．、\\s]+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
              // 匹配编号（不要求名称完全一致）
              new RegExp(`#{2,6}\\s*${sectionNum.replace(/\./g, '\\.')}[.．、\\s]+`, 'i'),
              // 匹配名称（不要求编号）
              new RegExp(`#{2,6}\\s*[\\d.]+[.．、\\s]+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
              // 匹配纯名称
              new RegExp(`#{2,6}\\s*${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
            ];
            
            const hasSection = sectionPatterns.some(p => p.test(contentWithSections));
            if (!hasSection) {
              missingSections.push({ idx, section, sectionNum });
              console.log(`[子节缺失] ${sectionNum} ${section} 未找到`);
            }
          }
          
          // 【核心修复】如果所有子节都缺失，强制添加子节标题
          if (missingSections.length === finalSectionsForSimple.length) {
            console.log(`[子节补充] 功能 ${fullNum} ${processName} 所有子节都缺失，强制添加子节标题`);
            
            // 尝试按内容段落分割并添加子节标题
            let reconstructedContent = '';
            // 过滤掉空段落和已有的标题行
            const paragraphs = cleanedContent.split(/\n\n+/).filter(p => {
              const trimmed = p.trim();
              return trimmed && !trimmed.match(/^#{1,6}\s*\d/);
            });
            
            // 为每个子节添加标题
            for (let idx = 0; idx < finalSectionsForSimple.length; idx++) {
              const section = finalSectionsForSimple[idx];
              const sectionNum = `${fullNum}${numberSeparator}${idx + 1}`;
              const sectionDotCount = (sectionNum.match(/\./g) || []).length;
              const sectionHeadingLevel = Math.min(sectionDotCount + 2, 6);
              const sectionHashes = '#'.repeat(sectionHeadingLevel);
              
              // 添加子节标题
              reconstructedContent += `${sectionHashes} ${sectionNum} ${section}\n\n`;
              
              // 如果有对应的段落内容，添加它
              if (paragraphs[idx]) {
                reconstructedContent += `${paragraphs[idx]}\n\n`;
              } else {
                // 根据子节类型生成默认内容
                if (section.includes('功能说明') || section.includes('功能描述')) {
                  reconstructedContent += `本功能用于${processName}。\n\n`;
                } else if (section.includes('业务规则')) {
                  reconstructedContent += `- 规则1：数据必须符合系统要求\n- 规则2：操作需要相应权限\n\n`;
                } else if (section.includes('处理数据') || section.includes('数据')) {
                  reconstructedContent += `| 字段名 | 类型 | 说明 |\n|--------|------|------|\n| id | Integer | 主键ID |\n\n`;
                } else if (section.includes('接口')) {
                  reconstructedContent += `本功能涉及的接口将在详细设计阶段定义。\n\n`;
                } else if (section.includes('界面')) {
                  reconstructedContent += `界面设计遵循系统统一风格。\n\n`;
                } else if (section.includes('验收标准')) {
                  reconstructedContent += `- 功能正常执行，无报错\n- 数据正确保存和展示\n\n`;
                } else {
                  reconstructedContent += `（${section}内容待完善）\n\n`;
                }
              }
            }
            
            // 添加剩余段落
            for (let idx = finalSectionsForSimple.length; idx < paragraphs.length; idx++) {
              reconstructedContent += paragraphs[idx] + '\n\n';
            }
            cleanedContent = reconstructedContent;
          }
          // 如果只有部分子节缺失，尝试插入缺失的子节
          else if (missingSections.length > 0) {
            console.log(`[子节补充] 功能 ${fullNum} ${processName} 有 ${missingSections.length} 个子节缺失`);
            
            // 在内容末尾添加缺失的子节
            for (const missing of missingSections) {
              const sectionDotCount = (missing.sectionNum.match(/\./g) || []).length;
              const sectionHeadingLevel = Math.min(sectionDotCount + 2, 6);
              const sectionHashes = '#'.repeat(sectionHeadingLevel);
              
              cleanedContent += `\n${sectionHashes} ${missing.sectionNum} ${missing.section}\n\n`;
              
              // 根据子节类型生成默认内容
              if (missing.section.includes('功能说明')) {
                cleanedContent += `本功能用于${processName}。\n\n`;
              } else if (missing.section.includes('业务规则')) {
                cleanedContent += `- 规则1：数据必须符合系统要求\n\n`;
              } else if (missing.section.includes('数据')) {
                cleanedContent += `| 字段名 | 类型 | 说明 |\n|--------|------|------|\n| id | Integer | 主键ID |\n\n`;
              } else {
                cleanedContent += `（内容待完善）\n\n`;
              }
            }
          }
        }
        
        // 【核心修复0】移除AI输出中错误的功能过程标题（如在5.9内容中出现5.1）
        cleanedContent = removeWrongProcessTitles(cleanedContent, fullNum, funcChapterNum);
        
        // 【核心修复0.5】重组内容，确保子节标题和内容匹配
        if (finalSectionsForSimple.length > 0) {
          cleanedContent = reorganizeContent(cleanedContent, fullNum, finalSectionsForSimple, numberSeparator);
        }
        
        // 【核心修复1】移除AI输出中的重复子节
        if (finalSectionsForSimple.length > 0) {
          cleanedContent = removeDuplicateSections(cleanedContent, fullNum, finalSectionsForSimple);
        }
        
        // 【核心修复1.5】移除子节标题下方的重复文本标题
        if (finalSectionsForSimple.length > 0) {
          cleanedContent = removeTextDuplicateTitles(cleanedContent, fullNum, finalSectionsForSimple);
        }
        
        // 【核心修复1.6】移除子节内容中出现的错位子节标题
        if (finalSectionsForSimple.length > 0) {
          cleanedContent = removeMisplacedSectionTitles(cleanedContent, fullNum, finalSectionsForSimple);
        }
        
        // 【核心修复2】修正AI输出中的错误子节编号
        // AI经常忽略正确的编号要求，输出如 5.1.1 而不是 5.7.1
        if (finalSectionsForSimple.length > 0) {
          cleanedContent = fixSubSectionNumbers(cleanedContent, fullNum, numberSeparator, finalSectionsForSimple);
        }
        
        // 【调试日志】检查最终内容中的子节数量
        const finalSubSectionCount = (cleanedContent.match(/#{2,6}\s*\d+\.\d+\.\d+/g) || []).length;
        console.log(`[内容检查] 功能 ${fullNum} ${processName}: 内容长度=${cleanedContent.length}, 子节数量=${finalSubSectionCount}, 期望子节=${finalSectionsForSimple.length}`);
        
        if (finalSubSectionCount < finalSectionsForSimple.length) {
          console.log(`[警告] 功能 ${fullNum} ${processName} 的子节数量(${finalSubSectionCount})小于期望(${finalSectionsForSimple.length})`);
        }
        
        // 输出清理后的内容
        if (cleanedContent.trim()) {
          fullContent += cleanedContent;
          res.write(`data: ${JSON.stringify({ content: cleanedContent })}\n\n`);
        }

        fullContent += '\n\n';
      }
    }

    // ========== 第四阶段：生成后置章节 ==========
    res.write(`data: ${JSON.stringify({
      phase: 'generating_footer',
      message: '📝 生成文档后置章节...',
      currentStep: totalBatches + 2,
      totalSteps: totalBatches + 2
    })}\n\n`);

    // 构建功能过程列表用于后置章节
    const processListForFooter = functionalProcesses.map((fp, idx) => `${idx + 1}. ${fp}`).join('\n');

    // 【修复】从模板分析结果中获取后置章节信息 - 使用更宽松的匹配逻辑
    const funcChapterIdx = allChapters.findIndex(c => {
      const numMatch = c.number?.replace(/\.$/, '') === funcChapterNum || 
                       c.number?.startsWith(funcChapterNum + '.') ||
                       c.number === funcChapterNum;
      const titleMatch = c.title?.includes('功能需求') || 
                         c.title?.includes('功能要求') ||
                         (c.title?.includes('功能') && c.level === 1);
      return numMatch || titleMatch;
    });
    
    // 获取功能需求章节之后的一级章节（后置章节）
    let footerChapters = [];
    if (funcChapterIdx >= 0) {
      // 只取一级章节，避免把功能需求的子章节也算进去
      footerChapters = allChapters.slice(funcChapterIdx + 1).filter(c => c.level === 1);
    } else if (allChapters.length > 0) {
      // 兜底：根据编号提取
      const funcNum = parseInt(funcChapterNum);
      footerChapters = allChapters.filter(c => {
        const chapterNum = parseInt(c.number?.split('.')[0]);
        return c.level === 1 && chapterNum > funcNum;
      });
    }
    
    console.log(`[动态章节] 后置章节数量: ${footerChapters.length}`);
    console.log(`[动态章节] 后置章节:`, footerChapters.map(c => `${c.number} ${c.title}`));

    // 构建后置章节的详细结构说明（包含层级信息）
    let footerChaptersList = '';
    if (footerChapters.length > 0) {
      footerChaptersList = footerChapters.map(c => {
        const prefix = c.level === 1 ? '#' : c.level === 2 ? '##' : '###';
        const purpose = c.purpose ? ` - ${c.purpose}` : '';
        return `${prefix} ${c.number} ${c.title}${purpose}`;
      }).join('\n');
      console.log('从模板分析结果中获取到后置章节:', footerChapters.length);
    } else {
      footerChaptersList = '（模板中未识别到后置章节，请从模板原文中提取）';
    }

    const footerPrompt = templateText ? `请**严格按照用户上传的模板格式**，生成需求规格说明书的后置章节（功能需求之后的所有内容）。

## 【核心要求】你必须完全按照模板的章节结构生成，不能自己发明章节！

## 【模板分析结果】以下是从用户模板中识别出的后置章节结构：
${footerChaptersList}

## 【模板原文参考】请仔细阅读并严格遵循（后半部分）：
${templateText.slice(-8000)}

## 【特殊章节信息】（如果模板中有这些章节，必须按模板格式生成）：
${templateAnalysis?.specialSections ? JSON.stringify(templateAnalysis.specialSections, null, 2) : '无特殊元素'}

## 已生成的功能过程列表（共${totalProcesses}个）：
${processListForFooter}

## 生成要求：
1. **严格按照模板格式**：标题层级、编号方式、表格结构都要与模板一致
2. 如果模板中有"内部逻辑文件"、"外部逻辑文件"、"接口需求"等特殊章节，必须按模板格式生成
3. 如果模板中有"工作量调整因子"、"非功能性特征"等章节，必须按模板格式生成
4. 内容要具体，不要使用占位符
5. 不要重复生成功能需求章节的内容

请生成后置章节：` : `你是资深需求分析专家。

## 【注意】没有上传模板，使用通用格式

由于用户没有上传模板，请根据已生成的功能需求内容，生成合适的后置章节（如系统需求、附录等）。

## 已生成的功能过程列表（共${totalProcesses}个）：
${processListForFooter}

请生成后置章节：`;

    const footerStream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是专业的需求规格说明书撰写专家。' },
        { role: 'user', content: footerPrompt }
      ],
      temperature: 0.7,
      max_tokens: 6000,
      stream: true
    });

    for await (const chunk of footerStream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    console.log('需求规格说明书生成完成，总长度:', fullContent.length);

    res.write(`data: ${JSON.stringify({
      phase: 'complete',
      message: '✅ 生成完成',
      contentLength: fullContent.length,
      totalProcesses: totalProcesses
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('生成需求规格说明书失败:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    res.write(`data: ${JSON.stringify({ error: '生成失败: ' + error.message })}\n\n`);
    res.end();
  }
});

// 按章节深度生成需求规格说明书
app.post('/api/cosmic-to-spec/generate-chapter', async (req, res) => {
  try {
    const { cosmicData, templateId, chapterIndex, previousContent, totalChapters } = req.body;

    if (!cosmicData || !cosmicData.data || cosmicData.data.length === 0) {
      return res.status(400).json({ error: '请先上传COSMIC Excel数据' });
    }

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 获取模板信息
    let templateInfo = null;
    if (templateId) {
      templateInfo = specTemplatesCache.get(templateId);
      if (!templateInfo) {
        const templatePath = path.join(TEMPLATES_DIR, `${templateId}.docx`);
        if (fs.existsSync(templatePath)) {
          const buffer = fs.readFileSync(templatePath);
          const parsed = await parseWordTemplate(buffer);
          templateInfo = { sections: parsed.sections, fullText: parsed.fullText };
        }
      }
    }

    // 按功能过程分组
    const groupedByProcess = {};
    cosmicData.data.forEach(row => {
      const process = row.functionalProcess || '未分类';
      if (!groupedByProcess[process]) {
        groupedByProcess[process] = [];
      }
      groupedByProcess[process].push(row);
    });

    // 构建COSMIC数据摘要
    const cosmicSummary = Object.entries(groupedByProcess).map(([process, rows]) => {
      const dataMovements = rows.map(r => `${r.dataMovementType}: ${r.subProcessDesc}`).join('\n    ');
      const dataGroups = [...new Set(rows.map(r => r.dataGroup).filter(Boolean))].join(', ');
      const dataAttrs = [...new Set(rows.flatMap(r => (r.dataAttributes || '').split(/[,|、]/).map(a => a.trim())).filter(Boolean))].slice(0, 10).join(', ');

      return `功能过程: ${process}
  功能用户: ${rows[0]?.functionalUser || '用户'}
  触发事件: ${rows[0]?.triggerEvent || '用户触发'}
  数据移动: ${dataMovements}
  数据组: ${dataGroups}
  数据属性: ${dataAttrs}`;
    }).join('\n\n');

    // 确定当前章节
    const chapters = templateInfo?.sections?.filter(s => s.level === 1) || [
      { number: '1', title: '概述' },
      { number: '2', title: '业务需求' },
      { number: '3', title: '用户需求' },
      { number: '4', title: '功能架构' },
      { number: '5', title: '功能需求' },
      { number: '6', title: '系统需求' },
      { number: '7', title: '附录' }
    ];

    const currentChapter = chapters[chapterIndex] || chapters[0];

    console.log(`生成第 ${chapterIndex + 1}/${totalChapters} 章: ${currentChapter.title}`);

    res.write(`data: ${JSON.stringify({
      phase: 'generating_chapter',
      chapterIndex,
      chapterTitle: currentChapter.title,
      totalChapters
    })}\n\n`);

    // 构建章节生成提示词
    const chapterPrompt = `你是资深需求分析专家。请根据COSMIC功能点数据，生成需求规格说明书的第${currentChapter.number}章「${currentChapter.title}」。

## COSMIC功能点数据

${cosmicSummary}

## 已生成的内容（参考上下文）

${previousContent ? previousContent.slice(-3000) : '（这是第一章）'}

## 输出要求

1. 只输出第${currentChapter.number}章的内容
2. 标题格式：# ${currentChapter.number} ${currentChapter.title}
3. 内容要详细、专业、可落地
4. 如果是功能需求章节，每个功能过程都要详细展开
5. 使用Markdown格式，表格完整

请开始生成第${currentChapter.number}章：`;

    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: COSMIC_TO_SPEC_SYSTEM_PROMPT },
        { role: 'user', content: chapterPrompt }
      ],
      temperature: 0.7,
      max_tokens: 16000,
      stream: true
    });

    let totalContent = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        totalContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    console.log(`第 ${chapterIndex + 1} 章生成完成，长度: ${totalContent.length}`);

    res.write(`data: ${JSON.stringify({
      phase: 'chapter_complete',
      chapterIndex,
      contentLength: totalContent.length
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('生成章节失败:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    res.write(`data: ${JSON.stringify({ error: '生成失败: ' + error.message })}\n\n`);
    res.end();
  }
});

// 导出需求规格说明书为Word - 使用纯HTML格式
app.post('/api/cosmic-to-spec/export-word', async (req, res) => {
  try {
    const { content, filename, templateId } = req.body;

    console.log('=== 导出Word请求 ===');
    console.log('内容长度:', content ? content.length : 0);
    console.log('内容前500字符:', content ? content.substring(0, 500) : '无内容');
    console.log('文件名:', filename);

    if (!content) {
      return res.status(400).json({ error: '没有可导出的内容' });
    }

    // 构建完整的HTML内容
    let htmlBody = convertMarkdownToWordHtml(content);

    console.log('转换后HTML长度:', htmlBody.length);
    console.log('转换后HTML前500字符:', htmlBody.substring(0, 500));

    // 使用纯HTML格式，Word可以直接打开
    let htmlContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Microsoft Word 15">
  <!--[if gte mso 9]>
  <xml>
    <o:DocumentProperties>
      <o:Title>需求规格说明书</o:Title>
    </o:DocumentProperties>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:SpellingState>Clean</w:SpellingState>
      <w:GrammarState>Clean</w:GrammarState>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    /* 页面设置 */
    @page {
      size: 210mm 297mm;
      margin: 2.54cm 2.54cm 2.54cm 2.54cm;
    }
    @page Section1 {
      mso-header-margin: 1.5cm;
      mso-footer-margin: 1.5cm;
      mso-paper-source: 0;
    }
    div.Section1 {
      page: Section1;
    }
    
    /* 基础样式 */
    body {
      font-family: '宋体', SimSun, '微软雅黑', sans-serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
      margin: 0;
      padding: 0;
    }
    
    /* 标题样式 */
    h1 {
      font-family: '黑体', SimHei, sans-serif;
      font-size: 18pt;
      font-weight: bold;
      color: #000;
      text-align: center;
      margin: 24pt 0 18pt 0;
      page-break-after: avoid;
    }
    h2 {
      font-family: '黑体', SimHei, sans-serif;
      font-size: 15pt;
      font-weight: bold;
      color: #000;
      margin: 18pt 0 12pt 0;
      page-break-after: avoid;
    }
    h3 {
      font-family: '黑体', SimHei, sans-serif;
      font-size: 14pt;
      font-weight: bold;
      color: #000;
      margin: 14pt 0 10pt 0;
      page-break-after: avoid;
    }
    h4 {
      font-family: '黑体', SimHei, sans-serif;
      font-size: 12pt;
      font-weight: bold;
      color: #000;
      margin: 12pt 0 8pt 0;
    }
    h5 {
      font-family: '黑体', SimHei, sans-serif;
      font-size: 12pt;
      font-weight: bold;
      color: #333;
      margin: 10pt 0 6pt 0;
    }
    
    /* 段落样式 */
    p {
      font-family: '宋体', SimSun, sans-serif;
      font-size: 12pt;
      margin: 6pt 0;
      text-align: justify;
      text-indent: 24pt;
      line-height: 1.5;
    }
    
    /* 表格样式 - 关键修复 */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12pt 0;
      font-size: 10.5pt;
      table-layout: fixed;
      word-wrap: break-word;
    }
    th {
      border: 1px solid #000;
      padding: 6pt 4pt;
      background-color: #4472C4;
      color: #fff;
      font-weight: bold;
      text-align: center;
      vertical-align: middle;
      font-size: 10.5pt;
    }
    td {
      border: 1px solid #000;
      padding: 4pt 4pt;
      text-align: left;
      vertical-align: top;
      font-size: 10.5pt;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    tr.even-row td {
      background-color: #f2f2f2;
    }
    
    /* 列表样式 */
    ul, ol {
      margin: 8pt 0 8pt 24pt;
      padding-left: 0;
    }
    li {
      margin: 4pt 0;
      text-indent: 0;
      line-height: 1.5;
    }
    
    /* 代码样式 */
    code {
      font-family: 'Courier New', Consolas, monospace;
      background-color: #f5f5f5;
      padding: 1pt 3pt;
      font-size: 10pt;
    }
    pre {
      font-family: 'Courier New', Consolas, monospace;
      background-color: #f5f5f5;
      padding: 10pt;
      border: 1px solid #ddd;
      font-size: 9pt;
      white-space: pre-wrap;
      word-wrap: break-word;
      margin: 10pt 0;
    }
    
    /* 引用样式 */
    blockquote {
      border-left: 3pt solid #4472C4;
      padding-left: 12pt;
      margin: 10pt 0 10pt 12pt;
      color: #555;
      font-style: italic;
    }
    
    /* 分隔线 */
    hr {
      border: none;
      border-top: 1px solid #ccc;
      margin: 12pt 0;
    }
    
    /* 强调样式 */
    strong {
      font-weight: bold;
    }
    em {
      font-style: italic;
    }
  </style>
</head>
<body>
<div class="Section1">
${htmlBody}
</div>
</body>
</html>`;

    // 设置响应头 - 使用.doc扩展名
    const safeFilename = (filename || '需求规格说明书').replace(/[<>:"/\\|?*]/g, '_');
    res.setHeader('Content-Type', 'application/msword; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}.doc`);
    res.send(Buffer.from(htmlContent, 'utf-8'));

  } catch (error) {
    console.error('导出Word失败:', error);
    res.status(500).json({ error: '导出失败: ' + error.message });
  }
});

// 【新增】根据章节编号修正标题层级
function normalizeHeadingLevels(markdown) {
  const lines = markdown.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // 匹配Markdown标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const currentHashes = headingMatch[1];
      const titleContent = headingMatch[2].trim();
      
      // 从标题内容中提取章节编号
      const numberMatch = titleContent.match(/^(\d+(?:\.\d+)*)[.、．\s]/);
      if (numberMatch) {
        const chapterNumber = numberMatch[1];
        const dotCount = (chapterNumber.match(/\./g) || []).length;
        
        // 根据编号中的点数确定正确的层级
        // 5 -> 一级(##), 5.1 -> 二级(###), 5.1.1 -> 三级(####)
        let correctLevel = dotCount + 2; // ## 是一级章节
        if (correctLevel > 6) correctLevel = 6;
        if (correctLevel < 2) correctLevel = 2;
        
        const correctHashes = '#'.repeat(correctLevel);
        
        // 如果层级不对，修正它
        if (currentHashes !== correctHashes) {
          console.log(`[层级修正] "${titleContent}" 从 ${currentHashes.length}级 修正为 ${correctLevel}级`);
          line = `${correctHashes} ${titleContent}`;
        }
      }
    }
    
    result.push(line);
  }
  
  return result.join('\n');
}

// Markdown转Word HTML的辅助函数
function convertMarkdownToWordHtml(markdown) {
  // 【新增】先修正标题层级
  let html = normalizeHeadingLevels(markdown);

  // 统一换行符
  html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 处理代码块（先处理，避免被其他规则影响）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const escapedCode = code.trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre><code>${escapedCode}</code></pre>`;
  });

  // 处理行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 处理Markdown图片语法 ![alt](dataUrl) - 支持base64
  let imgCount = 0;
  html = html.replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, (match, alt, dataUrl) => {
    imgCount++;
    return `
<div style="text-align:center;margin:20pt 0;page-break-inside:avoid;">
  <img src="${dataUrl}" alt="${alt || '图片' + imgCount}" style="max-width:500px;width:90%;height:auto;border:1px solid #ddd;"/>
  <p style="font-size:10pt;color:#666;margin-top:8pt;">${alt || '图 ' + imgCount}</p>
</div>`;
  });

  // 处理表格 - 增强版，支持更多格式
  const tableRegex = /(?:^|\n)(\|[^\n]+\|)\n(\|[-:\s|]+\|)\n((?:\|[^\n]+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, headerRow, sepRow, bodyRows) => {
    // 解析表头 - 更健壮的解析
    let headerCells = headerRow.trim();
    if (headerCells.startsWith('|')) headerCells = headerCells.substring(1);
    if (headerCells.endsWith('|')) headerCells = headerCells.slice(0, -1);
    const headers = headerCells.split('|').map(c => c.trim());

    // 解析表体
    const bodyLines = bodyRows.trim().split('\n').filter(row => row.includes('|'));
    const rows = bodyLines.map(row => {
      let cells = row.trim();
      if (cells.startsWith('|')) cells = cells.substring(1);
      if (cells.endsWith('|')) cells = cells.slice(0, -1);
      return cells.split('|').map(c => c.trim());
    });

    // 计算列宽（均分）
    const colCount = headers.length;
    const colWidth = Math.floor(100 / colCount);

    let table = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;table-layout:fixed;">`;

    // 定义列宽
    table += '<colgroup>';
    for (let i = 0; i < colCount; i++) {
      table += `<col style="width:${colWidth}%;">`;
    }
    table += '</colgroup>';

    // 表头
    table += '<thead><tr>';
    headers.forEach(h => {
      table += `<th style="background-color:#4472C4;color:#fff;font-weight:bold;text-align:center;padding:6pt 4pt;border:1px solid #000;">${h}</th>`;
    });
    table += '</tr></thead>';

    // 表体
    table += '<tbody>';
    rows.forEach((row, idx) => {
      const bgColor = idx % 2 === 1 ? ' style="background-color:#f2f2f2;"' : '';
      table += `<tr${bgColor}>`;
      for (let i = 0; i < colCount; i++) {
        const cellContent = row[i] || '';
        table += `<td style="border:1px solid #000;padding:4pt;vertical-align:top;word-wrap:break-word;">${cellContent}</td>`;
      }
      table += '</tr>';
    });
    table += '</tbody></table>\n';

    return table;
  });

  // 处理标题（从h5到h1，避免误匹配）
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 处理粗体和斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 处理水平线
  html = html.replace(/^---+$/gm, '<hr/>');
  html = html.replace(/^\*\*\*+$/gm, '<hr/>');

  // 处理无序列表
  html = html.replace(/((?:^[\t ]*[-*+] .+$\n?)+)/gm, (match) => {
    const items = match.trim().split('\n').map(line => {
      const content = line.replace(/^[\t ]*[-*+] /, '');
      return `<li>${content}</li>`;
    }).join('');
    return `<ul>${items}</ul>`;
  });

  // 处理有序列表
  html = html.replace(/((?:^[\t ]*\d+\. .+$\n?)+)/gm, (match) => {
    const items = match.trim().split('\n').map(line => {
      const content = line.replace(/^[\t ]*\d+\. /, '');
      return `<li>${content}</li>`;
    }).join('');
    return `<ol>${items}</ol>`;
  });

  // 处理引用块
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // 处理段落 - 改进版
  const blocks = html.split('\n\n');
  html = blocks.map(para => {
    para = para.trim();
    if (!para) return '';
    // 跳过已经是HTML标签的内容
    if (para.match(/^<(h[1-6]|ul|ol|table|pre|div|blockquote|hr|thead|tbody)/i)) {
      return para;
    }
    // 跳过表格相关内容
    if (para.startsWith('<table') || para.includes('</table>')) {
      return para;
    }
    // 处理普通段落
    return `<p>${para.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');

  // 清理多余的空标签
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p><table/g, '<table');
  html = html.replace(/<\/table><\/p>/g, '</table>');

  return html;
}

// ==================== 新增：需求文档深度解析功能 ====================

// 深度解析需求文档 - 提取功能需求、业务规则、数据需求等
async function parseRequirementDocument(buffer, fileExtension = '.docx') {
  let text = '';
  let images = [];

  if (fileExtension === '.doc') {
    try {
      const extracted = await wordExtractor.extract(buffer);
      text = extracted.getBody() || '';
      console.log(`解析 .doc 需求文档成功，提取文本长度: ${text.length}`);
    } catch (e) {
      console.error('word-extractor 解析失败:', e.message);
      throw new Error('无法解析 .doc 文件，请尝试转换为 .docx 格式');
    }
  } else {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
    // 提取图片
    images = await extractImagesFromDocx(buffer);
    console.log(`解析 .docx 需求文档成功，提取文本长度: ${text.length}, 图片数: ${images.length}`);
  }

  // 分析文档结构
  const lines = text.split('\n');
  const sections = [];
  const sectionContents = new Map();
  let currentSection = null;
  let currentContent = [];

  // 章节标题识别模式 - 增强版：更严格的匹配
  // 匹配：1、1.1、1.1.1 等格式，后跟中文/英文标题
  const sectionPattern = /^(\d{1,2}(?:\.\d{1,3})*)\s*[、.．]?\s+([^\d\t\n][^\t\n]{1,50})$/;
  
  // 非章节内容黑名单（页码、表格序号等常见误匹配模式）
  const blacklistPatterns = [
    /^第?\d+页$/,                    // 页码：第1页、1页
    /^共\d+页$/,                     // 共X页
    /^\d+\/\d+$/,                    // 页码：1/10
    /^表\s*\d/,                      // 表1、表 1
    /^图\s*\d/,                      // 图1、图 1
    /^序号$/i,                       // 表格表头
    /^编号$/,                        // 表格表头
    /^\d+\s*[、,，]\s*\d+/,          // 列表如 "1、2、3"
    /^[\d\s,.，。、]+$/,             // 纯数字和标点
    /^[-—_=]+$/,                     // 分隔线
  ];
  
  // 验证是否为有效的章节标题
  const isValidChapterTitle = (title, number) => {
    if (!title || title.length < 2) return false;
    if (/^\d+$/.test(title)) return false;  // 纯数字
    if (/^[a-zA-Z]$/.test(title)) return false;  // 单个字母
    
    // 检查黑名单
    const fullText = `${number} ${title}`;
    for (const pattern of blacklistPatterns) {
      if (pattern.test(title) || pattern.test(fullText)) {
        return false;
      }
    }
    
    // 标题应该以中文字符、英文字母或特定符号开头
    if (!/^[\u4e00-\u9fa5a-zA-Z【（(]/.test(title)) {
      return false;
    }
    
    return true;
  };
  
  // 用于检测层级连续性的辅助变量
  let lastLevel1 = 0;  // 上一个一级章节编号
  let expectedNumbers = new Set();  // 预期的章节编号集合

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentSection) currentContent.push('');
      return;
    }

    const match = trimmed.match(sectionPattern);
    if (match) {
      const numberStr = match[1];
      const numParts = numberStr.split('.');
      
      // 验证编号的合理性
      const isValidSection = numParts.every(part => {
        const num = parseInt(part);
        return num >= 0 && num <= 99;
      });
      
      const title = match[2].trim();
      const level = numParts.length;
      
      // 增强验证：检查标题有效性 + 层级连续性
      if (isValidSection && isValidChapterTitle(title, numberStr)) {
        // 层级连续性检查：一级章节编号应该递增或保持
        if (level === 1) {
          const currentNum = parseInt(numParts[0]);
          // 允许一级章节从0-9开始，之后应该是连续或跳跃不超过3
          if (sections.length > 0 && currentNum > lastLevel1 + 3 && lastLevel1 > 0) {
            // 跳跃过大，可能是误匹配（如页码）
            if (currentSection) currentContent.push(trimmed);
            return;
          }
          lastLevel1 = currentNum;
        }
        
        // 保存上一个章节的内容
        if (currentSection) {
          sectionContents.set(currentSection.number, currentContent.join('\n').trim());
        }
        
        currentSection = {
          number: numberStr,
          title: title,
          level,
          lineIndex: idx
        };
        sections.push(currentSection);
        currentContent = [];
        return;
      }
    }
    
    if (currentSection) {
      currentContent.push(trimmed);
    }
  });

  if (currentSection) {
    sectionContents.set(currentSection.number, currentContent.join('\n').trim());
  }

  // 为每个章节添加内容
  sections.forEach(section => {
    section.content = sectionContents.get(section.number) || '';
    section.contentLength = section.content.length;
  });

  // 提取功能需求列表
  const functionalRequirements = [];
  const funcSection = sections.find(s =>
    s.title.includes('功能') && (s.level === 1 || s.level === 2)
  );

  if (funcSection) {
    const funcIdx = sections.indexOf(funcSection);
    for (let i = funcIdx + 1; i < sections.length; i++) {
      const s = sections[i];
      if (s.level <= funcSection.level) break;

      // 收集功能过程级别的需求
      if (s.level === funcSection.level + 1 || s.level === funcSection.level + 2) {
        functionalRequirements.push({
          number: s.number,
          title: s.title,
          content: s.content,
          level: s.level
        });
      }
    }
  }

  // 提取业务规则
  const businessRules = [];
  const rulePatterns = [
    /业务规则[：:]\s*([\s\S]*?)(?=\n\n|\n\d+\.|$)/gi,
    /规则\d+[：:]\s*(.*)/gi,
    /BR-\d+[：:]\s*(.*)/gi
  ];

  for (const section of sections) {
    if (section.content) {
      for (const pattern of rulePatterns) {
        let match;
        while ((match = pattern.exec(section.content)) !== null) {
          businessRules.push({
            section: section.title,
            rule: match[1].trim()
          });
        }
      }
    }
  }

  // 提取数据需求
  const dataRequirements = [];
  const dataSection = sections.find(s =>
    s.title.includes('数据') || s.title.includes('字段') || s.title.includes('属性')
  );
  if (dataSection) {
    dataRequirements.push({
      section: dataSection.title,
      content: dataSection.content
    });
  }

  // 提取接口需求
  const interfaceRequirements = [];
  const interfaceSection = sections.find(s =>
    s.title.includes('接口') || s.title.includes('API')
  );
  if (interfaceSection) {
    interfaceRequirements.push({
      section: interfaceSection.title,
      content: interfaceSection.content
    });
  }

  // 提取非功能需求
  const nonFunctionalRequirements = [];
  const nfrKeywords = ['性能', '安全', '可用性', '可靠性', '兼容性', '可维护性'];
  for (const section of sections) {
    if (nfrKeywords.some(kw => section.title.includes(kw))) {
      nonFunctionalRequirements.push({
        type: section.title,
        content: section.content
      });
    }
  }

  return {
    fullText: text,
    sections,
    sectionCount: sections.length,
    functionalRequirements,
    businessRules,
    dataRequirements,
    interfaceRequirements,
    nonFunctionalRequirements,
    images: images.map(img => ({
      id: img.id,
      filename: img.filename,
      mimeType: img.mimeType,
      dataUrl: img.dataUrl,
      inferredType: img.inferredType,
      suggestedSection: img.suggestedSection
    })),
    imageCount: images.length,
    // 文档概要信息
    summary: {
      totalSections: sections.length,
      functionalCount: functionalRequirements.length,
      businessRuleCount: businessRules.length,
      hasDataRequirements: dataRequirements.length > 0,
      hasInterfaceRequirements: interfaceRequirements.length > 0,
      hasNonFunctionalRequirements: nonFunctionalRequirements.length > 0
    }
  };
}

// ==================== 【增强版】需求文档多阶段深度分析 ====================
// 类似于模板分析的多阶段深度思考，确保准确理解需求文档的所有内容

/**
 * 多阶段深度分析需求文档 - 动态驱动的完全理解
 * @param {Object} client - OpenAI客户端
 * @param {string} documentText - 文档全文
 * @param {Array} sections - 已解析的章节结构
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Object} 深度分析结果
 */
async function deepAnalyzeRequirementDocWithAI(client, documentText, sections, progressCallback = null) {
  console.log('========== 开始需求文档多阶段深度分析 ==========');
  const analysisStartTime = Date.now();
  
  try {
    // ========== 第一阶段：整体结构和项目概览分析 ==========
    if (progressCallback) progressCallback('phase1', '🔍 第一阶段：分析文档整体结构和项目概览...');
    console.log('[需求文档分析] 第一阶段：整体结构分析');

    const phase1Prompt = `你是资深的需求分析专家和软件架构师。请对以下需求文档进行**第一阶段深度分析**：理解文档的整体结构和项目概览。

## 【需求文档内容】（前20000字）
${documentText.slice(0, 20000)}

## 【已识别的章节结构】
${sections.slice(0, 50).map(s => `${'  '.repeat(s.level - 1)}[${s.number}] ${s.title}`).join('\n')}

## 【第一阶段分析任务】
请深入分析并提取以下信息，以JSON格式返回：

\`\`\`json
{
  "projectOverview": {
    "projectName": "项目名称（从文档中准确提取）",
    "projectCode": "项目编号（如有）",
    "version": "版本号（如有）",
    "description": "项目描述（200字以内，概括项目的核心目标和价值）",
    "background": "项目背景（100字以内）",
    "objectives": ["项目目标1", "项目目标2"],
    "scope": "系统范围和边界描述"
  },
  "documentStructure": {
    "documentType": "文档类型（如：需求规格说明书、用户需求文档、产品需求文档等）",
    "totalChapters": "章节总数",
    "mainChapters": [
      {"number": "章节号", "title": "章节标题", "purpose": "章节目的描述"}
    ],
    "functionalChapterNumber": "功能需求所在的章节编号（如：3、4、5）",
    "hasAppendix": false,
    "specialSections": ["特殊章节列表，如：内部逻辑文件、外部接口文件等"]
  },
  "stakeholders": {
    "targetUsers": [
      {"role": "用户角色名称", "description": "角色描述", "responsibilities": ["职责1", "职责2"]}
    ],
    "systemActors": ["系统参与者，如：外部系统、第三方服务"],
    "administrators": ["管理员角色"]
  },
  "domainAnalysis": {
    "businessDomain": "业务领域描述",
    "keyTerms": [
      {"term": "术语", "definition": "定义"}
    ],
    "businessProcesses": ["核心业务流程1", "核心业务流程2"]
  }
}
\`\`\`

请确保：
1. 从文档中**准确提取**信息，不要臆造
2. 识别文档的**层级结构**和**组织方式**
3. 提取所有**关键术语**及其定义
4. 识别**功能需求章节**的位置`;

    const phase1Response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        {
          role: 'system',
          content: '你是专业的需求分析师，擅长深度分析需求文档。请准确提取文档信息，不要添加文档中没有的内容。'
        },
        { role: 'user', content: phase1Prompt }
      ],
      temperature: 0.2,
      max_tokens: 6000
    });

    const phase1Content = phase1Response.choices[0]?.message?.content?.trim() || '';
    console.log('[需求文档分析] 第一阶段响应长度:', phase1Content.length);

    let phase1Analysis = {};
    const phase1Match = phase1Content.match(/```json\s*([\s\S]*?)```/) || phase1Content.match(/\{[\s\S]*\}/);
    if (phase1Match) {
      try {
        phase1Analysis = JSON.parse(phase1Match[1] || phase1Match[0]);
      } catch (e) {
        console.error('[需求文档分析] 第一阶段JSON解析失败:', e.message);
      }
    }

    // ========== 第二阶段：功能需求深度分析 ==========
    if (progressCallback) progressCallback('phase2', '📋 第二阶段：深度分析功能需求...');
    console.log('[需求文档分析] 第二阶段：功能需求深度分析');

    // 找到功能需求章节的内容
    const funcChapterNum = phase1Analysis.documentStructure?.functionalChapterNumber || '3';
    const funcSections = sections.filter(s => s.number.startsWith(funcChapterNum + '.') || s.number === funcChapterNum);
    
    // 提取功能需求相关内容
    let functionalContent = '';
    for (const section of funcSections) {
      if (section.content) {
        functionalContent += `\n\n【${section.number} ${section.title}】\n${section.content}`;
      }
    }
    if (!functionalContent) {
      functionalContent = documentText.slice(0, 25000);
    }

    const phase2Prompt = `你是功能需求分析专家。请对以下功能需求内容进行**深度分析**。

## 【功能需求内容】
${functionalContent.slice(0, 25000)}

## 【第二阶段分析任务】
请深入分析每个功能需求，提取详细信息：

\`\`\`json
{
  "functionalRequirements": [
    {
      "id": "功能编号（从文档提取）",
      "name": "功能名称",
      "category": "所属模块/子系统",
      "description": "功能描述（详细说明该功能做什么）",
      "priority": "优先级（高/中/低，如文档中有说明）",
      "actors": ["涉及的用户角色"],
      "preconditions": ["前置条件"],
      "postconditions": ["后置条件"],
      "mainFlow": ["主要操作步骤1", "步骤2"],
      "alternativeFlows": ["备选流程"],
      "exceptionFlows": ["异常流程"],
      "businessRules": ["适用的业务规则"],
      "dataInputs": ["输入数据项"],
      "dataOutputs": ["输出数据项"],
      "interfaces": {
        "userInterface": "界面描述（如有）",
        "systemInterface": "系统接口描述（如有）"
      },
      "acceptanceCriteria": ["验收标准"],
      "constraints": ["约束条件"],
      "dependencies": ["依赖的其他功能"]
    }
  ],
  "functionalModules": [
    {
      "name": "模块名称",
      "description": "模块描述",
      "functions": ["包含的功能列表"],
      "subModules": ["子模块（如有）"]
    }
  ],
  "functionalHierarchy": {
    "levels": 2,
    "structure": "描述功能需求的层级结构（如：模块->功能->子功能）"
  },
  "crossCuttingConcerns": ["跨功能关注点，如：权限控制、日志记录"]
}
\`\`\`

请确保：
1. **完整提取**每个功能需求的所有细节
2. 准确识别功能之间的**依赖关系**
3. 提取功能的**业务规则**和**验收标准**
4. 识别功能的**输入输出数据**`;

    const phase2Response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        {
          role: 'system',
          content: '你是功能需求分析专家，擅长提取完整的功能需求信息。请从文档中准确提取，不要遗漏任何功能。'
        },
        { role: 'user', content: phase2Prompt }
      ],
      temperature: 0.2,
      max_tokens: 10000
    });

    const phase2Content = phase2Response.choices[0]?.message?.content?.trim() || '';
    console.log('[需求文档分析] 第二阶段响应长度:', phase2Content.length);

    let phase2Analysis = {};
    const phase2Match = phase2Content.match(/```json\s*([\s\S]*?)```/) || phase2Content.match(/\{[\s\S]*\}/);
    if (phase2Match) {
      try {
        phase2Analysis = JSON.parse(phase2Match[1] || phase2Match[0]);
      } catch (e) {
        console.error('[需求文档分析] 第二阶段JSON解析失败:', e.message);
      }
    }

    // ========== 第三阶段：数据需求和接口分析 ==========
    if (progressCallback) progressCallback('phase3', '💾 第三阶段：分析数据需求和接口...');
    console.log('[需求文档分析] 第三阶段：数据需求和接口分析');

    const phase3Prompt = `你是数据架构师和接口设计专家。请从以下需求文档中提取**数据需求**和**接口需求**。

## 【文档内容】
${documentText.slice(0, 20000)}

## 【第三阶段分析任务】
请深入分析数据和接口需求：

\`\`\`json
{
  "dataRequirements": {
    "dataEntities": [
      {
        "name": "数据实体名称",
        "description": "描述",
        "attributes": [
          {"name": "属性名", "type": "数据类型", "constraints": "约束条件", "description": "描述"}
        ],
        "relationships": ["与其他实体的关系"]
      }
    ],
    "dataFlows": [
      {"source": "数据来源", "target": "数据目标", "data": "数据内容", "frequency": "频率"}
    ],
    "dataVolume": "数据量估算",
    "dataRetention": "数据保留策略",
    "dataSecurity": "数据安全要求"
  },
  "interfaceRequirements": {
    "externalInterfaces": [
      {
        "name": "接口名称",
        "type": "接口类型（API/文件/消息等）",
        "direction": "方向（输入/输出/双向）",
        "protocol": "协议",
        "dataFormat": "数据格式",
        "externalSystem": "对接的外部系统",
        "description": "接口描述",
        "frequency": "调用频率"
      }
    ],
    "userInterfaces": [
      {
        "name": "界面名称",
        "type": "界面类型（Web/移动/桌面）",
        "description": "界面描述",
        "mainElements": ["主要元素"],
        "userActions": ["用户操作"]
      }
    ],
    "hardwareInterfaces": ["硬件接口需求"],
    "softwareInterfaces": ["软件接口需求"]
  },
  "integrationPoints": [
    {
      "externalSystem": "外部系统名称",
      "integrationMethod": "集成方式",
      "dataExchanged": ["交换的数据"],
      "securityRequirements": "安全要求"
    }
  ]
}
\`\`\`

请确保：
1. 识别所有**数据实体**及其**属性**
2. 提取所有**外部接口**需求
3. 分析**数据流向**和**集成点**`;

    const phase3Response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        {
          role: 'system',
          content: '你是数据架构师，擅长分析数据需求和接口设计。请从文档中准确提取相关信息。'
        },
        { role: 'user', content: phase3Prompt }
      ],
      temperature: 0.2,
      max_tokens: 6000
    });

    const phase3Content = phase3Response.choices[0]?.message?.content?.trim() || '';
    console.log('[需求文档分析] 第三阶段响应长度:', phase3Content.length);

    let phase3Analysis = {};
    const phase3Match = phase3Content.match(/```json\s*([\s\S]*?)```/) || phase3Content.match(/\{[\s\S]*\}/);
    if (phase3Match) {
      try {
        phase3Analysis = JSON.parse(phase3Match[1] || phase3Match[0]);
      } catch (e) {
        console.error('[需求文档分析] 第三阶段JSON解析失败:', e.message);
      }
    }

    // ========== 第四阶段：业务规则和非功能需求分析 ==========
    if (progressCallback) progressCallback('phase4', '📏 第四阶段：分析业务规则和非功能需求...');
    console.log('[需求文档分析] 第四阶段：业务规则和非功能需求分析');

    const phase4Prompt = `你是业务分析师和系统架构师。请从以下需求文档中提取**业务规则**和**非功能需求**。

## 【文档内容】
${documentText.slice(0, 20000)}

## 【第四阶段分析任务】
请深入分析业务规则和非功能需求：

\`\`\`json
{
  "businessRules": [
    {
      "id": "规则编号",
      "name": "规则名称",
      "category": "规则分类（计算规则/验证规则/权限规则/流程规则等）",
      "description": "规则详细描述",
      "condition": "触发条件",
      "action": "执行动作",
      "priority": "优先级",
      "relatedFunctions": ["关联的功能"]
    }
  ],
  "businessProcesses": [
    {
      "name": "流程名称",
      "description": "流程描述",
      "steps": ["步骤1", "步骤2"],
      "participants": ["参与角色"],
      "triggers": ["触发条件"],
      "outcomes": ["预期结果"]
    }
  ],
  "nonFunctionalRequirements": {
    "performance": {
      "responseTime": "响应时间要求",
      "throughput": "吞吐量要求",
      "concurrency": "并发用户数",
      "dataVolume": "数据处理量",
      "specificRequirements": ["具体性能要求"]
    },
    "security": {
      "authentication": "认证要求",
      "authorization": "授权要求",
      "dataEncryption": "数据加密要求",
      "auditLogging": "审计日志要求",
      "specificRequirements": ["具体安全要求"]
    },
    "reliability": {
      "availability": "可用性要求（如：99.9%）",
      "recoverability": "可恢复性要求",
      "faultTolerance": "容错要求",
      "backupRequirements": "备份要求"
    },
    "usability": {
      "userFriendliness": "易用性要求",
      "accessibility": "可访问性要求",
      "localization": "本地化要求"
    },
    "maintainability": {
      "modifiability": "可修改性要求",
      "testability": "可测试性要求",
      "documentation": "文档要求"
    },
    "compatibility": {
      "browsers": ["支持的浏览器"],
      "devices": ["支持的设备"],
      "operatingSystems": ["支持的操作系统"],
      "integrations": ["需要兼容的系统"]
    }
  },
  "constraints": {
    "technical": ["技术约束"],
    "business": ["业务约束"],
    "regulatory": ["法规约束"],
    "resource": ["资源约束"]
  },
  "assumptions": ["假设条件"],
  "dependencies": ["外部依赖"]
}
\`\`\`

请确保：
1. 完整提取所有**业务规则**
2. 识别所有**非功能需求**类别
3. 提取**约束条件**和**假设**`;

    const phase4Response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        {
          role: 'system',
          content: '你是业务分析师，擅长提取业务规则和非功能需求。请从文档中准确提取相关信息。'
        },
        { role: 'user', content: phase4Prompt }
      ],
      temperature: 0.2,
      max_tokens: 6000
    });

    const phase4Content = phase4Response.choices[0]?.message?.content?.trim() || '';
    console.log('[需求文档分析] 第四阶段响应长度:', phase4Content.length);

    let phase4Analysis = {};
    const phase4Match = phase4Content.match(/```json\s*([\s\S]*?)```/) || phase4Content.match(/\{[\s\S]*\}/);
    if (phase4Match) {
      try {
        phase4Analysis = JSON.parse(phase4Match[1] || phase4Match[0]);
      } catch (e) {
        console.error('[需求文档分析] 第四阶段JSON解析失败:', e.message);
      }
    }

    // ========== 第五阶段：生成综合分析报告 ==========
    if (progressCallback) progressCallback('phase5', '📊 第五阶段：生成综合分析报告...');
    console.log('[需求文档分析] 第五阶段：生成综合分析报告');

    // 合并所有阶段的分析结果
    const comprehensiveAnalysis = {
      // 分析元数据
      analysisVersion: '2.0-deep',
      analysisTime: new Date().toISOString(),
      analysisPhases: 5,
      analysisDuration: Date.now() - analysisStartTime,
      
      // 第一阶段：项目概览
      projectName: phase1Analysis.projectOverview?.projectName || '未识别项目名',
      projectDescription: phase1Analysis.projectOverview?.description || '',
      projectCode: phase1Analysis.projectOverview?.projectCode || '',
      projectVersion: phase1Analysis.projectOverview?.version || '',
      projectBackground: phase1Analysis.projectOverview?.background || '',
      projectObjectives: phase1Analysis.projectOverview?.objectives || [],
      systemScope: phase1Analysis.projectOverview?.scope || '',
      
      // 文档结构
      documentStructure: phase1Analysis.documentStructure || {},
      functionalChapterNumber: phase1Analysis.documentStructure?.functionalChapterNumber || '3',
      
      // 利益相关者
      userRoles: (phase1Analysis.stakeholders?.targetUsers || []).map(u => u.role),
      stakeholders: phase1Analysis.stakeholders || {},
      
      // 领域分析
      domainAnalysis: phase1Analysis.domainAnalysis || {},
      keyTerms: phase1Analysis.domainAnalysis?.keyTerms || [],
      businessProcesses: phase1Analysis.domainAnalysis?.businessProcesses || [],
      
      // 第二阶段：功能需求
      functionalRequirements: phase2Analysis.functionalRequirements || [],
      functionalModules: phase2Analysis.functionalModules || [],
      functionalHierarchy: phase2Analysis.functionalHierarchy || {},
      crossCuttingConcerns: phase2Analysis.crossCuttingConcerns || [],
      
      // 第三阶段：数据和接口
      dataRequirements: phase3Analysis.dataRequirements || {},
      dataEntities: phase3Analysis.dataRequirements?.dataEntities || [],
      interfaceRequirements: phase3Analysis.interfaceRequirements || {},
      integrationPoints: phase3Analysis.integrationPoints || [],
      
      // 第四阶段：业务规则和非功能需求
      businessRules: phase4Analysis.businessRules || [],
      keyBusinessRules: (phase4Analysis.businessRules || []).slice(0, 10).map(r => r.description || r.name),
      nonFunctionalRequirements: phase4Analysis.nonFunctionalRequirements || {},
      constraints: phase4Analysis.constraints || {},
      assumptions: phase4Analysis.assumptions || [],
      dependencies: phase4Analysis.dependencies || [],
      
      // 统计摘要
      summary: {
        totalFunctionalRequirements: (phase2Analysis.functionalRequirements || []).length,
        totalModules: (phase2Analysis.functionalModules || []).length,
        totalDataEntities: (phase3Analysis.dataRequirements?.dataEntities || []).length,
        totalExternalInterfaces: (phase3Analysis.interfaceRequirements?.externalInterfaces || []).length,
        totalBusinessRules: (phase4Analysis.businessRules || []).length,
        totalUserRoles: (phase1Analysis.stakeholders?.targetUsers || []).length,
        hasNonFunctionalRequirements: Object.keys(phase4Analysis.nonFunctionalRequirements || {}).length > 0,
        analysisQuality: calculateAnalysisQuality(phase1Analysis, phase2Analysis, phase3Analysis, phase4Analysis)
      }
    };

    // 打印分析摘要
    console.log('========== 需求文档深度分析完成 ==========');
    console.log('分析用时:', comprehensiveAnalysis.analysisDuration, 'ms');
    console.log('项目名称:', comprehensiveAnalysis.projectName);
    console.log('功能需求数:', comprehensiveAnalysis.summary.totalFunctionalRequirements);
    console.log('功能模块数:', comprehensiveAnalysis.summary.totalModules);
    console.log('数据实体数:', comprehensiveAnalysis.summary.totalDataEntities);
    console.log('业务规则数:', comprehensiveAnalysis.summary.totalBusinessRules);
    console.log('分析质量评分:', comprehensiveAnalysis.summary.analysisQuality);

    return comprehensiveAnalysis;

  } catch (error) {
    console.error('[需求文档分析] 深度分析失败:', error.message);
    // 返回降级结果
    return {
      analysisVersion: '2.0-deep-fallback',
      analysisTime: new Date().toISOString(),
      error: error.message,
      projectName: '分析失败',
      projectDescription: '',
      userRoles: [],
      functionalModules: [],
      functionalRequirements: [],
      dataEntities: [],
      businessRules: [],
      nonFunctionalRequirements: {},
      summary: {
        totalFunctionalRequirements: 0,
        analysisQuality: 'failed'
      }
    };
  }
}

/**
 * 计算分析质量评分
 */
function calculateAnalysisQuality(phase1, phase2, phase3, phase4) {
  let score = 0;
  let maxScore = 0;

  // 第一阶段评分
  if (phase1.projectOverview?.projectName) score += 10;
  if (phase1.projectOverview?.description) score += 5;
  if (phase1.stakeholders?.targetUsers?.length > 0) score += 10;
  if (phase1.documentStructure?.mainChapters?.length > 0) score += 10;
  maxScore += 35;

  // 第二阶段评分
  const funcCount = phase2.functionalRequirements?.length || 0;
  if (funcCount > 0) score += Math.min(20, funcCount * 2);
  if (phase2.functionalModules?.length > 0) score += 10;
  maxScore += 30;

  // 第三阶段评分
  if (phase3.dataRequirements?.dataEntities?.length > 0) score += 10;
  if (phase3.interfaceRequirements?.externalInterfaces?.length > 0) score += 10;
  maxScore += 20;

  // 第四阶段评分
  if (phase4.businessRules?.length > 0) score += 10;
  if (Object.keys(phase4.nonFunctionalRequirements || {}).length > 0) score += 5;
  maxScore += 15;

  const percentage = Math.round((score / maxScore) * 100);
  
  if (percentage >= 80) return 'excellent';
  if (percentage >= 60) return 'good';
  if (percentage >= 40) return 'fair';
  return 'poor';
}

// 保留原有的简单分析函数作为后备
async function analyzeRequirementDocWithAI(client, documentText, sections) {
  // 如果文档足够大，使用深度分析
  if (documentText.length > 500) {
    console.log('[需求文档分析] 文档内容充足，启用多阶段深度分析');
    return await deepAnalyzeRequirementDocWithAI(client, documentText, sections);
  }
  
  // 否则使用简化版分析
  console.log('[需求文档分析] 文档较短，使用简化分析');
  const prompt = `你是一名资深需求分析专家。请深度分析以下需求文档，提取结构化信息。

## 文档内容：
${documentText.slice(0, 15000)}

## 已识别的章节结构：
${sections.slice(0, 30).map(s => `${'  '.repeat(s.level - 1)}${s.number} ${s.title}`).join('\n')}

## 请提取以下信息并以JSON格式返回：

{
  "projectName": "项目名称",
  "projectDescription": "项目简述（100字以内）",
  "systemScope": "系统范围描述",
  "userRoles": ["用户角色1", "用户角色2"],
  "functionalModules": [
    {
      "name": "模块名称",
      "description": "模块描述",
      "functions": ["功能1", "功能2"]
    }
  ],
  "keyBusinessRules": ["核心业务规则1", "核心业务规则2"],
  "dataEntities": ["数据实体1", "数据实体2"],
  "integrationPoints": ["集成点1", "集成点2"],
  "nonFunctionalRequirements": {
    "performance": "性能要求",
    "security": "安全要求",
    "availability": "可用性要求"
  },
  "technicalConstraints": ["技术约束1", "技术约束2"],
  "assumptions": ["假设条件1", "假设条件2"]
}

请确保返回有效的JSON格式，不要包含其他文字说明。`;

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是专业的需求分析专家，擅长从文档中提取结构化信息。只返回JSON格式的结果。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });

    const responseText = completion.choices[0]?.message?.content || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('AI分析需求文档失败:', error.message);
    return null;
  }
}

// 上传并解析需求文档（Word格式）- 流式深度分析
app.post('/api/cosmic-to-spec/parse-requirement-doc', uploadMultiple.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传Word需求文档' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.docx' && ext !== '.doc') {
      return res.status(400).json({ error: '请上传Word文档（.docx或.doc格式）' });
    }

    console.log(`解析需求文档: ${req.file.originalname}, 大小: ${req.file.size} bytes`);

    // 检查是否请求流式响应
    const useStream = req.query.stream === 'true';

    // 深度解析文档
    const result = await parseRequirementDocument(req.file.buffer, ext);

    // 如果使用流式响应
    if (useStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // 发送基础解析结果
      res.write(`data: ${JSON.stringify({
        phase: 'parsing_complete',
        message: '📄 文档解析完成',
        progress: 10,
        basicResult: {
          filename: req.file.originalname,
          fileSize: req.file.size,
          sectionCount: result.sectionCount,
          functionalRequirementsCount: result.functionalRequirements?.length || 0
        }
      })}\n\n`);

      // 如果有API密钥，进行AI深度分析
      const client = getOpenAIClient();
      if (client && result.fullText.length > 100) {
        console.log('开始AI多阶段深度分析需求文档...');
        
        const progressCallback = (phaseId, message) => {
          const progressMap = {
            'phase1': 20,
            'phase2': 40,
            'phase3': 60,
            'phase4': 80,
            'phase5': 95
          };
          res.write(`data: ${JSON.stringify({
            phase: phaseId,
            message: message,
            progress: progressMap[phaseId] || 50
          })}\n\n`);
        };

        const aiAnalysis = await deepAnalyzeRequirementDocWithAI(client, result.fullText, result.sections, progressCallback);
        
        // 发送完成消息
        res.write(`data: ${JSON.stringify({
          phase: 'analysis_complete',
          message: '✅ 需求文档深度分析完成',
          progress: 100,
          result: {
            success: true,
            filename: req.file.originalname,
            fileSize: req.file.size,
            documentType: 'requirement',
            ...result,
            aiAnalysis
          }
        })}\n\n`);
      } else {
        // 无API密钥，直接返回基础结果
        res.write(`data: ${JSON.stringify({
          phase: 'analysis_complete',
          message: '⚠️ 未配置API密钥，跳过AI分析',
          progress: 100,
          result: {
            success: true,
            filename: req.file.originalname,
            fileSize: req.file.size,
            documentType: 'requirement',
            ...result,
            aiAnalysis: null
          }
        })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // 非流式响应（保持向后兼容）
    let aiAnalysis = null;
    const client = getOpenAIClient();
    if (client && result.fullText.length > 100) {
      console.log('开始AI深度分析需求文档...');
      aiAnalysis = await analyzeRequirementDocWithAI(client, result.fullText, result.sections);
      if (aiAnalysis) {
        console.log('AI分析完成:', aiAnalysis.projectName || '未识别项目名');
      }
    }

    res.json({
      success: true,
      filename: req.file.originalname,
      fileSize: req.file.size,
      documentType: 'requirement',
      ...result,
      aiAnalysis
    });
  } catch (error) {
    console.error('解析需求文档失败:', error);
    res.status(500).json({ error: '解析需求文档失败: ' + error.message });
  }
});

/**
 * 【新增】针对Word文档的功能需求深度思考函数
 * 为每个功能需求进行多维度深度分析，生成更丰富的内容提示
 */
async function deepThinkForFunctionFromDoc(client, functionInfo, context) {
  const { name, content, businessRules, acceptanceCriteria } = functionInfo;
  const { projectInfo, templateAnalysis, allFunctions } = context;

  const prompt = `你是一位资深业务分析师和需求工程师，请对以下功能需求进行**深度多维度分析**，为后续生成高质量需求规格说明书提供参考。

## 【功能名称】
${name}

## 【原始需求内容】
${content?.slice(0, 2000) || '无详细描述'}

## 【已有业务规则】
${businessRules ? JSON.stringify(businessRules) : '无'}

## 【已有验收标准】
${acceptanceCriteria ? JSON.stringify(acceptanceCriteria) : '无'}

## 【项目背景】
- 项目名称：${projectInfo?.projectName || '未知'}
- 用户角色：${(projectInfo?.userRoles || []).join('、') || '未知'}
- 相关功能：${allFunctions?.slice(0, 10).join('、') || '无'}

## 【深度分析任务】
请从以下维度进行深入分析：

1. **业务价值分析**：这个功能解决什么业务问题？带来什么价值？
2. **核心使用场景**：列出3-5个典型使用场景（场景名称+简要描述）
3. **关键业务规则**：推导出5-8条关键业务规则（规则名称+描述）
4. **关键数据字段**：识别8-12个关键数据字段（字段名+类型+说明）
5. **验收要点**：推导5-8个关键验收标准（场景+预期结果）
6. **异常场景**：识别3-5个可能的异常场景（异常名称+处理方式）
7. **用户角色**：识别涉及的用户角色
8. **权限要点**：识别关键权限控制点

## 【输出格式】JSON
\`\`\`json
{
  "businessValue": "业务价值描述",
  "coreScenarios": [
    {"name": "场景名称", "description": "场景描述"}
  ],
  "keyRules": [
    {"name": "规则名称", "description": "规则描述"}
  ],
  "keyDataFields": [
    {"name": "字段名", "type": "数据类型", "description": "说明"}
  ],
  "acceptanceCriteria": [
    {"scenario": "测试场景", "expected": "预期结果"}
  ],
  "exceptionScenarios": [
    {"name": "异常名称", "handling": "处理方式"}
  ],
  "userRoles": ["角色1", "角色2"],
  "permissionPoints": ["权限点1", "权限点2"]
}
\`\`\``;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是资深业务分析师，擅长深度分析功能需求并提取关键信息。请输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 3000
    });

    const responseContent = response.choices[0].message.content.trim();
    const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)```/) || responseContent.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      console.log(`✅ 【Word模式】深度思考完成: ${name}`);
      return result;
    }
    return null;
  } catch (error) {
    console.error(`❌ 【Word模式】深度思考失败: ${name}`, error.message);
    return null;
  }
}

// 根据需求文档和模板生成需求规格说明书 - 增强版：与Excel模式一致的模板驱动
app.post('/api/cosmic-to-spec/generate-from-doc', async (req, res) => {
  try {
    const { requirementDoc, templateId } = req.body;

    if (!requirementDoc || !requirementDoc.fullText) {
      return res.status(400).json({ error: '请先上传需求文档' });
    }

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 获取模板信息和深度分析结果
    let templateText = '';
    let templateAnalysis = null;
    let savedAnalysis = null;
    let fullProcessExample = '';

    if (templateId) {
      // 首先检查是否有已保存的深度分析结果
      const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_analysis.json`);
      if (fs.existsSync(analysisPath)) {
        try {
          savedAnalysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
          templateText = savedAnalysis.originalTemplateText || '';
          fullProcessExample = savedAnalysis.fullProcessExample || '';
          
          // 【修复】清理已保存分析结果中的页码数字
          const cleanPageNumber = (str) => str ? str.replace(/\s+\d{1,4}\s*$/, '').trim() : str;
          if (savedAnalysis.allChapters) {
            savedAnalysis.allChapters.forEach(c => { if (c.title) c.title = cleanPageNumber(c.title); });
          }
          if (savedAnalysis.sections) {
            savedAnalysis.sections.forEach(c => { if (c.title) c.title = cleanPageNumber(c.title); });
          }
          if (savedAnalysis.processContentTemplate?.sections) {
            savedAnalysis.processContentTemplate.sections = savedAnalysis.processContentTemplate.sections.map(s => 
              typeof s === 'string' ? cleanPageNumber(s) : s
            );
          }
          if (savedAnalysis.functionalChapter?.processContentTemplate?.sections) {
            savedAnalysis.functionalChapter.processContentTemplate.sections = 
              savedAnalysis.functionalChapter.processContentTemplate.sections.map(s => 
                typeof s === 'string' ? cleanPageNumber(s) : s
              );
          }
          if (savedAnalysis.functionalChapter?.processContentTemplate?.sectionsDetailed) {
            savedAnalysis.functionalChapter.processContentTemplate.sectionsDetailed.forEach(s => {
              if (s.name) s.name = cleanPageNumber(s.name);
            });
          }
          
          console.log('【Word模式】使用已保存的深度分析结果（已清理页码）');
        } catch (e) {
          console.log('读取分析结果失败，将重新分析');
        }
      }

      // 如果没有分析结果，从缓存或文件获取模板
      if (!templateText) {
        const templateInfo = specTemplatesCache.get(templateId);
        if (templateInfo) {
          templateText = templateInfo.fullText || '';
          fullProcessExample = templateInfo.functionalExampleContent || '';
        } else {
          let templatePath = path.join(TEMPLATES_DIR, `${templateId}.docx`);
          let ext = '.docx';
          if (!fs.existsSync(templatePath)) {
            templatePath = path.join(TEMPLATES_DIR, `${templateId}.doc`);
            ext = '.doc';
          }
          if (fs.existsSync(templatePath)) {
            const buffer = fs.readFileSync(templatePath);
            const parsed = await parseWordTemplate(buffer, ext);
            templateText = parsed.fullText;
            fullProcessExample = parsed.functionalExampleContent || '';
          }
        }
      }
    }

    // 提取功能需求列表（优先使用AI深度分析的结果）
    let functionalReqs = [];
    if (requirementDoc.aiAnalysis?.functionalRequirements?.length > 0) {
      functionalReqs = requirementDoc.aiAnalysis.functionalRequirements;
    } else if (requirementDoc.functionalRequirements?.length > 0) {
      functionalReqs = requirementDoc.functionalRequirements;
    }
    
    const totalFunctions = functionalReqs.length;
    const BATCH_SIZE = 3;
    const totalBatches = Math.ceil(totalFunctions / BATCH_SIZE);

    console.log(`【Word模式】开始生成规格书: ${totalFunctions} 个功能需求, 分 ${totalBatches + 3} 批处理`);
    console.log(`【Word模式】模板示例长度: ${fullProcessExample?.length || 0} 字符`);

    // ========== 第一阶段：分析模板 ==========
    res.write(`data: ${JSON.stringify({
      phase: 'analyzing_template',
      message: '🧠 分析模板结构...',
      currentStep: 1,
      totalSteps: totalBatches + 3
    })}\n\n`);

    if (savedAnalysis) {
      templateAnalysis = savedAnalysis;
      res.write(`data: ${JSON.stringify({
        phase: 'template_analyzed',
        message: '✅ 使用已保存的模板分析结果',
        templateAnalysis: {
          documentStyle: savedAnalysis.documentStyle,
          hierarchyStructure: savedAnalysis.hierarchyStructure
        }
      })}\n\n`);
    } else if (templateText) {
      templateAnalysis = await analyzeTemplateWithAI(client, templateText);
      if (templateAnalysis) {
        res.write(`data: ${JSON.stringify({
          phase: 'template_analyzed',
          message: `✅ 模板分析完成: ${templateAnalysis.chapters?.length || 0} 个章节`,
          templateAnalysis: templateAnalysis
        })}\n\n`);
      }
    }

    // ========== 第1.5阶段：分析模板层级结构（和Excel模式一致）==========
    // 【核心修复】获取功能需求章节编号 - 多种方式尝试
    let funcChapterNum = 
      savedAnalysis?.functionalChapterNumber || 
      templateAnalysis?.functionalChapterNumber || 
      templateAnalysis?.functionalChapter?.number;
    
    // 如果上述方式都没有获取到，从 sections 中自动检测
    const sectionsForAnalysis = savedAnalysis?.sections || templateAnalysis?.sections || templateAnalysis?.allChapters || [];
    if (!funcChapterNum) {
      const funcSection = sectionsForAnalysis.find(s => 
        s.title?.includes('功能需求') || s.title?.includes('功能要求')
      );
      if (funcSection) {
        funcChapterNum = funcSection.number.split('.')[0];
        console.log(`【Word模式】从sections中检测到功能需求章节: ${funcSection.number} ${funcSection.title}`);
      }
    }
    funcChapterNum = funcChapterNum || '5';
    console.log(`【Word模式】功能需求章节编号: ${funcChapterNum}`);

    // 【核心修复】分析模板层级深度
    let templateHierarchyLevels = analyzeTemplateHierarchyLevels(sectionsForAnalysis, funcChapterNum);
    if (templateAnalysis?.functionalChapter?.hierarchyLevels) {
      console.log(`AI分析的层级深度: ${templateAnalysis.functionalChapter.hierarchyLevels}, 代码分析的层级深度: ${templateHierarchyLevels}`);
    }
    const useSimpleStructure = templateHierarchyLevels <= 2;
    console.log(`【Word模式】模板层级深度: ${templateHierarchyLevels}, 使用简单结构: ${useSimpleStructure}`);

    // 【核心修复】从模板中提取功能过程子节结构
    const extractedProcessTemplate = extractFunctionalProcessSectionsFromTemplate(sectionsForAnalysis, funcChapterNum);
    if (extractedProcessTemplate) {
      console.log(`【Word模式】从模板中提取到功能过程子节: ${extractedProcessTemplate.sections.join('、')}`);
    }

    // ========== 第二阶段：分析需求文档 ==========
    res.write(`data: ${JSON.stringify({
      phase: 'analyzing_document',
      message: '📄 深度分析需求文档...',
      currentStep: 2,
      totalSteps: totalBatches + 4
    })}\n\n`);

    // 构建功能模块概览（用于生成前置章节）
    let functionalOverview = '';
    if (requirementDoc.aiAnalysis && requirementDoc.aiAnalysis.functionalModules) {
      const modules = requirementDoc.aiAnalysis.functionalModules;
      functionalOverview = modules.map((m, idx) => {
        const funcs = m.functions ? m.functions.map((f, i) => `  ${idx + 1}.${i + 1}. ${f}`).join('\n') : '';
        return `${idx + 1}. ${m.name}\n${m.description || ''}\n${funcs}`;
      }).join('\n\n');
    } else {
      functionalOverview = functionalReqs.map((f, idx) => `${idx + 1}. ${f.title || f.name}`).join('\n');
    }

    res.write(`data: ${JSON.stringify({
      phase: 'document_analyzed',
      message: `✅ 识别到 ${totalFunctions} 个功能需求`,
      documentInfo: {
        projectName: requirementDoc.aiAnalysis?.projectName || '未命名项目',
        functionalCount: totalFunctions,
        sectionCount: requirementDoc.sectionCount
      }
    })}\n\n`);

    // ========== 第三阶段：生成前置章节 ==========
    res.write(`data: ${JSON.stringify({
      phase: 'generating_header',
      message: '📝 生成文档前置章节...',
      currentStep: 3,
      totalSteps: totalBatches + 4
    })}\n\n`);

    const allChapters = templateAnalysis?.allChapters || [];
    const funcChapterIndex = allChapters.findIndex(c =>
      c.title?.includes('功能') || c.number === funcChapterNum
    );
    const headerChapters = funcChapterIndex > 0 ? allChapters.slice(0, funcChapterIndex) : [];
    
    // 获取功能需求章节的标题
    const funcChapterTitle = allChapters.find(c => 
      c.number === funcChapterNum || c.number?.startsWith(funcChapterNum + '.')
    )?.title || '功能需求';

    let headerChaptersList = '';
    if (headerChapters.length > 0) {
      headerChaptersList = headerChapters.map(c => {
        const prefix = c.level === 1 ? '#' : c.level === 2 ? '##' : '###';
        return `${prefix} ${c.number} ${c.title}`;
      }).join('\n');
    }

    const projectInfo = requirementDoc.aiAnalysis || {};
    let fullContent = '';

    // ========== 【核心改进】按章节逐个生成前置内容，确保格式一致 ==========
    const level1HeaderChapters = headerChapters.filter(c => c.level === 1);
    console.log(`[Word模式前置章节] 一级章节数量: ${level1HeaderChapters.length}`);

    for (const chapter of level1HeaderChapters) {
      // 获取该一级章节下的所有子章节
      const chapterPrefix = chapter.number + '.';
      const subChapters = headerChapters.filter(c => 
        c.number?.startsWith(chapterPrefix) && c.level > chapter.level
      );
      
      // 【代码显式输出章节标题】确保格式完全一致
      const chapterTitle = `\n## ${chapter.number} ${chapter.title}\n\n`;
      fullContent += chapterTitle;
      res.write(`data: ${JSON.stringify({ content: chapterTitle })}\n\n`);

      // 构建该章节的子节列表
      let subChaptersList = '';
      if (subChapters.length > 0) {
        subChaptersList = subChapters.map(s => `- ${s.number} ${s.title}`).join('\n');
      }

      // 为每个一级章节单独生成内容
      const chapterPrompt = `你是专业的需求规格说明书撰写专家。请为以下章节生成内容。

## 当前章节
- 编号: ${chapter.number}
- 标题: ${chapter.title}

${subChapters.length > 0 ? `## 该章节包含的子节（必须全部输出）：
${subChaptersList}

请严格按照上述子节结构输出，每个子节标题格式为：### 编号 标题` : ''}

## 项目信息
- 项目名称：${projectInfo.projectName || '待定'}
- 项目描述：${projectInfo.projectDescription || ''}
- 用户角色：${(projectInfo.userRoles || []).join('、')}

## 功能模块概览
${functionalOverview.slice(0, 2000)}

## 【重要规则】
1. 不要输出当前章节的标题（已由系统输出）
2. ${subChapters.length > 0 ? '必须按照子节列表逐个输出，子节标题格式：### 编号 标题' : '直接输出该章节的内容'}
3. 内容要专业、具体、充实
4. 基于需求文档的实际内容填写

请直接开始输出内容：`;

      const chapterStream = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'glm-4-flash',
        messages: [
          { role: 'system', content: '你是专业的需求规格说明书撰写专家。直接输出内容，不要输出章节主标题。' },
          { role: 'user', content: chapterPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        stream: true
      });

      // 【修复】先收集完整内容，再进行编号修正后输出
      let chapterContent = '';
      for await (const chunk of chapterStream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          chapterContent += content;
        }
      }
      
      // 【核心修复】修正AI输出中的错误子节编号
      if (subChapters.length > 0) {
        chapterContent = fixHeaderChapterNumbers(chapterContent, chapter.number, subChapters);
      }
      
      // 输出修正后的内容
      if (chapterContent.trim()) {
        fullContent += chapterContent;
        res.write(`data: ${JSON.stringify({ content: chapterContent })}\n\n`);
      }
    }

    // 输出功能需求章节标题
    const funcChapterHeader = `\n## ${funcChapterNum} ${funcChapterTitle}\n\n`;
    fullContent += funcChapterHeader;
    res.write(`data: ${JSON.stringify({ content: funcChapterHeader })}\n\n`);

    // ========== 第四阶段：分批生成功能需求（与Excel模式一致的模板驱动） ==========
    
    // 【核心修复】获取功能过程子节结构 - 与Excel模式完全一致
    let finalSectionsForGenerate = [];
    
    // 优先级1: 从提取的模板结构中获取
    if (extractedProcessTemplate && extractedProcessTemplate.sections.length > 0) {
      finalSectionsForGenerate = extractedProcessTemplate.sections;
    }
    // 优先级2: 从 savedAnalysis 的 processContentTemplate 获取
    else if (savedAnalysis?.processContentTemplate?.sections) {
      finalSectionsForGenerate = savedAnalysis.processContentTemplate.sections.map(s => s.name || s);
    }
    // 优先级3: 从 templateAnalysis 的 processContentTemplate 获取
    else if (templateAnalysis?.processContentTemplate?.sections) {
      finalSectionsForGenerate = templateAnalysis.processContentTemplate.sections.map(s => s.name || s);
    }
    // 优先级4: 从 functionalChapter.processContentTemplate 获取
    else if (templateAnalysis?.functionalChapter?.processContentTemplate?.sections) {
      finalSectionsForGenerate = templateAnalysis.functionalChapter.processContentTemplate.sections.map(s => s.name || s);
    }
    // 最终默认值
    if (finalSectionsForGenerate.length === 0) {
      finalSectionsForGenerate = ['功能说明', '业务规则、模型和算法', '处理数据', '接口', '界面', '验收标准'];
    }
    
    // 【修复】清理子节名称末尾的页码数字
    finalSectionsForGenerate = finalSectionsForGenerate.map(s => 
      typeof s === 'string' ? s.replace(/\s+\d{1,4}\s*$/, '').trim() : s
    );
    
    console.log(`【Word模式】最终使用的功能过程子节: ${finalSectionsForGenerate.join('、')}`);

    // 构建模板示例内容（与Excel模式一致）
    let templateExampleContent = '';
    if (fullProcessExample) {
      templateExampleContent = `

## 【模板格式示例 - 必须严格参照】
以下是模板中功能需求的示例格式，你生成的每个功能都必须**完全按照**这个格式和结构：
\`\`\`
${fullProcessExample.slice(0, 6000)}
\`\`\`
`;
    }

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalFunctions);
      const batchReqs = functionalReqs.slice(batchStart, batchEnd);

      // ========== 【新增】深度思考阶段：为每个功能进行深度分析 ==========
      res.write(`data: ${JSON.stringify({
        phase: 'deep_thinking',
        message: `🧠 深度思考分析功能需求 (${batchStart + 1}-${batchEnd}/${totalFunctions})...`,
        currentStep: batchIdx + 4,
        totalSteps: totalBatches + 5
      })}\n\n`);

      // 为当前批次的每个功能执行深度思考
      const deepThinkingResults = [];
      for (const req of batchReqs) {
        try {
          const functionName = req.title || req.name;
          console.log(`🧠 【Word模式】深度思考: ${functionName}`);
          
          const thinkResult = await deepThinkForFunctionFromDoc(client, {
            name: functionName,
            content: req.content || req.description || '',
            businessRules: req.businessRules,
            acceptanceCriteria: req.acceptanceCriteria
          }, {
            projectInfo,
            templateAnalysis,
            allFunctions: functionalReqs.map(f => f.title || f.name)
          });
          
          deepThinkingResults.push({
            functionName,
            thinkResult
          });
        } catch (thinkError) {
          console.log(`⚠️ 深度思考跳过: ${thinkError.message}`);
          deepThinkingResults.push({
            functionName: req.title || req.name,
            thinkResult: null
          });
        }
      }

      res.write(`data: ${JSON.stringify({
        phase: 'generating_functions',
        message: `🔄 生成功能需求 (${batchStart + 1}-${batchEnd}/${totalFunctions})...`,
        currentStep: batchIdx + 4,
        totalSteps: totalBatches + 5,
        batchInfo: {
          start: batchStart + 1,
          end: batchEnd,
          total: totalFunctions
        }
      })}\n\n`);

      // 构建当前批次的详细信息（包含深度思考结果）
      const batchDetails = batchReqs.map((req, idx) => {
        const globalIdx = batchStart + idx + 1;
        const reqContent = req.content || req.description || '';
        const businessRules = req.businessRules ? `\n业务规则: ${JSON.stringify(req.businessRules)}` : '';
        const acceptanceCriteria = req.acceptanceCriteria ? `\n验收标准: ${JSON.stringify(req.acceptanceCriteria)}` : '';
        
        // 获取深度思考结果（仅作为生成参考，不直接输出到文档）
        const thinkResult = deepThinkingResults[idx]?.thinkResult;
        let deepThinkingInsight = '';
        if (thinkResult) {
          deepThinkingInsight = `
【深度分析参考 - 仅供AI生成参考，不要直接输出以下内容】
业务价值：${thinkResult.businessValue || '提升业务效率'}
核心场景：${(thinkResult.coreScenarios || []).slice(0, 3).map(s => s.name || s).join('、') || '请推断'}
关键规则：${(thinkResult.keyRules || []).slice(0, 5).map(r => r.name || r.ruleName || r).join('、') || '请提取'}
关键字段：${(thinkResult.keyDataFields || []).slice(0, 8).map(f => f.name || f).join('、') || '请分析'}
验收要点：${(thinkResult.acceptanceCriteria || []).slice(0, 5).map(c => c.scenario || c).join('、') || '请推断'}
异常场景：${(thinkResult.exceptionScenarios || []).slice(0, 3).map(e => e.name || e).join('、') || '请考虑'}
用户角色：${(thinkResult.userRoles || []).join('、') || '系统用户'}`;
        }
        
        return `【功能 ${funcChapterNum}.${globalIdx}】${req.title || req.name}
原始需求内容：
${reqContent.slice(0, 3000)}${businessRules}${acceptanceCriteria}${deepThinkingInsight}`;
      }).join('\n\n---\n\n');

      // 构建子节结构说明（使用正确的编号格式）
      const sectionsDescription = finalSectionsForGenerate.map((s, i) => `### ${funcChapterNum}.X.${i + 1} ${s}`).join('\n');

      const functionPrompt = `你是资深需求规格说明书撰写专家。请根据原始需求内容和深度思考分析结果，为以下功能生成**完整、详细、专业、高质量**的需求规格说明。
${templateExampleContent}

## 【待生成的功能需求】
${batchDetails}

## 【每个功能必须包含的子节结构】（严格按此顺序和格式）
功能标题格式：## ${funcChapterNum}.N 功能名称（N为功能序号1、2、3...）
子节标题格式：### ${funcChapterNum}.N.M 子节名称（M为子节序号1、2、3...）

${sectionsDescription}

## 【内容质量要求 - 深度思考增强】
1. **功能说明**（至少400字）：
   - 功能背景和业务价值（参考深度思考的业务价值分析）
   - 至少3个典型使用场景（参考深度思考的核心场景）
   - 详细操作流程（步骤1、2、3...，至少5个步骤）
   - 前置条件、后置条件
   - 涉及的用户角色及权限

2. **业务规则**（至少8条规则，使用表格格式）：
   - 参考深度思考的关键业务规则
   - 包含数据校验规则、权限控制规则、状态转换规则、异常处理规则
   | 规则编号 | 规则名称 | 规则描述 | 触发条件 | 执行动作 |
   |---------|---------|---------|---------|---------|

3. **处理数据**（至少10个字段，使用表格格式）：
   - 参考深度思考的关键数据字段
   | 字段名 | 数据类型 | 长度 | 是否必填 | 校验规则 | 说明 |
   |-------|---------|------|---------|---------|------|

4. **接口**：
   - 请求参数表（至少5个参数）
   - 响应参数表（至少5个参数）
   - 错误码表（至少3个错误码）

5. **界面**：
   - 页面整体布局描述
   - 主要界面元素列表（至少5个）
   - 交互流程说明

6. **验收标准**（至少8条用例）：
   - 参考深度思考的验收要点和异常场景
   - 覆盖正常流程、异常流程、边界条件
   | 用例编号 | 测试场景 | 前置条件 | 操作步骤 | 预期结果 |
   |---------|---------|---------|---------|---------|

## 【格式要求】
1. 每个功能使用二级标题: ## ${funcChapterNum}.X ${useSimpleStructure ? '功能名称' : '功能名称（功能编号）'}
2. 每个子节使用三级标题: ### ${funcChapterNum}.X.Y 子节名称

## 【严格禁止】
- ❌ 不要使用"XXX"、"待定"、"..."、"略"等占位符
- ❌ 不要输出空白内容或只有标题
- ❌ 不要使用"请参考"、"详见"、"同上"等推诿表述
- ❌ 表格数据不能少于指定的最小行数
- ❌ 内容不能过于简单或泛泛而谈

## 【严格警告 - 必须遵守】
1. **禁止重复**：每个子节只输出一次，绝对禁止重复输出同一个子节！
2. **编号严格**：子节编号必须使用 ${funcChapterNum}.X.Y 格式，不要使用其他编号！
3. **禁止错误标题**：不要输出任何与当前功能无关的标题！
4. **内容归位**："使用场景"和"操作流程"必须写在"功能说明"子节内，除非有单独的子节标题！
5. **不要输出目录**：直接输出详细内容，不要输出目录列表！

请直接开始输出，不要有任何解释或说明：`;

      const functionStream = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'glm-4-flash',
        messages: [
          { role: 'system', content: REQUIREMENT_SPEC_SYSTEM_PROMPT },
          { role: 'user', content: functionPrompt }
        ],
        temperature: 0.7,
        max_tokens: 16000,
        stream: true
      });

      // 【修复】先收集完整内容，再进行子节编号修正后输出
      let batchContent = '';
      for await (const chunk of functionStream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          batchContent += content;
        }
      }
      
      // 【核心修复1】移除AI输出中的重复子节
      // 对批次中的每个功能进行去重
      if (finalSectionsForGenerate.length > 0) {
        for (let idx = 0; idx < batchReqs.length; idx++) {
          const globalIdx = batchStart + idx + 1;
          const correctPrefix = `${funcChapterNum}.${globalIdx}`;
          batchContent = removeDuplicateSections(batchContent, correctPrefix, finalSectionsForGenerate);
        }
      }
      
      // 【核心修复1.5】移除子节标题下方的重复文本标题
      // 对批次中的每个功能进行文本标题去重
      if (finalSectionsForGenerate.length > 0) {
        for (let idx = 0; idx < batchReqs.length; idx++) {
          const globalIdx = batchStart + idx + 1;
          const correctPrefix = `${funcChapterNum}.${globalIdx}`;
          batchContent = removeTextDuplicateTitles(batchContent, correctPrefix, finalSectionsForGenerate);
        }
      }
      
      // 【核心修复1.6】移除子节内容中出现的错位子节标题
      // 对批次中的每个功能进行错位标题移除
      if (finalSectionsForGenerate.length > 0) {
        for (let idx = 0; idx < batchReqs.length; idx++) {
          const globalIdx = batchStart + idx + 1;
          const correctPrefix = `${funcChapterNum}.${globalIdx}`;
          batchContent = removeMisplacedSectionTitles(batchContent, correctPrefix, finalSectionsForGenerate);
        }
      }
      
      // 【核心修复2】修正AI输出中的错误子节编号
      // 对批次中的每个功能进行编号修正
      if (finalSectionsForGenerate.length > 0) {
        for (let idx = 0; idx < batchReqs.length; idx++) {
          const globalIdx = batchStart + idx + 1;
          const correctPrefix = `${funcChapterNum}.${globalIdx}`;
          batchContent = fixSubSectionNumbers(batchContent, correctPrefix, '.', finalSectionsForGenerate);
        }
      }
      
      // 输出修正后的内容
      if (batchContent.trim()) {
        fullContent += batchContent;
        res.write(`data: ${JSON.stringify({ content: batchContent })}\n\n`);
      }
    }

    // ========== 第五阶段：生成后置章节 ==========
    res.write(`data: ${JSON.stringify({
      phase: 'generating_footer',
      message: '📝 生成文档后置章节...',
      currentStep: totalBatches + 4,
      totalSteps: totalBatches + 4
    })}\n\n`);

    const footerChapters = funcChapterIndex >= 0 ? allChapters.slice(funcChapterIndex + 1) : [];
    let footerChaptersList = '';
    if (footerChapters.length > 0) {
      footerChaptersList = footerChapters.map(c => `${c.number} ${c.title}`).join('\n');
    }

    // 从需求文档的深度分析中获取非功能需求信息
    const nonFuncReqs = requirementDoc.aiAnalysis?.nonFunctionalRequirements || {};
    const dataEntities = requirementDoc.aiAnalysis?.dataEntities || [];
    const integrationPoints = requirementDoc.aiAnalysis?.integrationPoints || [];

    const footerPrompt = `请生成需求规格说明书的后置章节。

## 【项目信息】
- 项目名称：${projectInfo.projectName || '待定'}
- 非功能需求：${JSON.stringify(nonFuncReqs)}
- 数据实体：${dataEntities.map(e => e.name || e).join('、') || '无'}
- 外部集成：${integrationPoints.map(i => i.name || i.systemName || i).join('、') || '无'}
- 技术约束：${(projectInfo.technicalConstraints || []).join('、') || '无'}

## 【后置章节结构】（严格按照模板章节生成）
${footerChaptersList || '6. 系统需求\n7. 附录'}

## 【生成要求】
1. 严格按照上面的后置章节结构生成，每个章节都要有实际内容
2. 性能需求：具体的响应时间、并发用户数、数据量等指标
3. 安全需求：身份认证、权限控制、数据加密等
4. 可用性需求：系统可用性指标、故障恢复时间等
5. 附录：术语表、参考文献、修订记录等
6. 所有内容必须具体，禁止使用占位符

请开始生成：`;

    const footerStream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是专业的需求规格说明书撰写专家。' },
        { role: 'user', content: footerPrompt }
      ],
      temperature: 0.7,
      max_tokens: 6000,
      stream: true
    });

    for await (const chunk of footerStream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // 完成
    res.write(`data: ${JSON.stringify({ phase: 'complete', message: '✅ 生成完成' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('从需求文档生成规格书失败:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// ==================== 深度理解系统 API 端点 ====================

/**
 * API: 深度分析模板
 * POST /api/deep-analyze-template
 * 对模板进行六维度深度分析
 */
app.post('/api/deep-analyze-template', async (req, res) => {
  try {
    const { templateId } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 检查模板是否存在
    const templateJsonPath = path.join(TEMPLATES_DIR, `${templateId}.json`);
    if (!fs.existsSync(templateJsonPath)) {
      return res.status(404).json({ error: '模板不存在' });
    }

    // 设置SSE响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`data: ${JSON.stringify({
      phase: 'start',
      message: '🧠 开始深度分析模板...'
    })}\n\n`);

    // 读取模板元数据
    const templateMeta = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'));

    // 读取模板文档内容
    let templateDocPath = path.join(TEMPLATES_DIR, `${templateId}.docx`);
    let ext = '.docx';
    if (!fs.existsSync(templateDocPath)) {
      templateDocPath = path.join(TEMPLATES_DIR, `${templateId}.doc`);
      ext = '.doc';
    }

    if (!fs.existsSync(templateDocPath)) {
      res.write(`data: ${JSON.stringify({
        phase: 'error',
        message: '模板文档文件不存在'
      })}\n\n`);
      res.end();
      return;
    }

    // 解析模板文档
    res.write(`data: ${JSON.stringify({
      phase: 'parsing',
      message: '📄 解析模板文档...'
    })}\n\n`);

    const buffer = fs.readFileSync(templateDocPath);
    let templateText = '';
    let templateSections = [];

    if (ext === '.doc') {
      const extracted = await wordExtractor.extract(buffer);
      templateText = extracted.getBody() || '';
    } else {
      const result = await mammoth.extractRawText({ buffer });
      templateText = result.value;
    }

    // 提取章节结构（从已有的metadata或重新解析）
    if (templateMeta.sections && templateMeta.sections.length > 0) {
      templateSections = templateMeta.sections;
    } else {
      // 简单的章节提取
      const lines = templateText.split('\n');
      const sectionPattern = /^(\d{1,2}(?:\.\d{1,3})*)\s*[、.．\s]\s*([^\d\t][^\t]*?)$/;
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        const match = trimmed.match(sectionPattern);
        if (match) {
          const number = match[1];
          const title = match[2].trim();
          const level = number.split('.').length;
          templateSections.push({ number, title, level, lineIndex: idx });
        }
      });
    }

    res.write(`data: ${JSON.stringify({
      phase: 'parsed',
      message: `✅ 已解析模板，识别到 ${templateSections.length} 个章节`
    })}\n\n`);

    // 执行深度分析
    const progressCallback = (phase, message) => {
      res.write(`data: ${JSON.stringify({ phase, message })}\n\n`);
    };

    const deepAnalysis = await deepAnalyzeTemplate(
      client,
      templateText,
      templateSections,
      progressCallback
    );

    if (deepAnalysis) {
      // 保存深度分析结果
      const deepAnalysisPath = path.join(TEMPLATES_DIR, `${templateId}_deep_analysis.json`);
      fs.writeFileSync(deepAnalysisPath, JSON.stringify(deepAnalysis, null, 2));

      res.write(`data: ${JSON.stringify({
        phase: 'complete',
        message: '✅ 深度分析完成！',
        analysis: {
          structuralAnalysis: deepAnalysis.structuralAnalysis,
          semanticAnalysis: deepAnalysis.semanticAnalysis ? {
            chapterCount: deepAnalysis.semanticAnalysis.chapterSemantics?.length || 0
          } : null,
          styleAnalysis: deepAnalysis.styleAnalysis,
          examplesCount: {
            functionalProcesses: deepAnalysis.examplesExtraction?.functionalProcesses?.length || 0,
            tables: deepAnalysis.examplesExtraction?.tables?.length || 0
          }
        }
      })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({
        phase: 'error',
        message: '❌ 深度分析失败'
      })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('深度分析模板失败:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({
        phase: 'error',
        error: error.message
      })}\n\n`);
      res.end();
    }
  }
});

/**
 * API: 增强版COSMIC转需求规格书生成
 * POST /api/enhanced-cosmic-to-spec
 * 使用深度理解和智能推理生成高质量需求文档
 */
app.post('/api/enhanced-cosmic-to-spec', async (req, res) => {
  try {
    const { cosmicData, templateId, requirementDoc } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    if (!cosmicData || Object.keys(cosmicData).length === 0) {
      return res.status(400).json({ error: '请提供COSMIC数据' });
    }

    // 设置SSE响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`data: ${JSON.stringify({
      phase: 'start',
      message: '🚀 启动增强版生成流程...',
      progress: 0
    })}\n\n`);

    // 加载模板分析（优先使用深度分析结果）
    let templateAnalysis = null;
    if (templateId) {
      const deepAnalysisPath = path.join(TEMPLATES_DIR, `${templateId}_deep_analysis.json`);
      if (fs.existsSync(deepAnalysisPath)) {
        templateAnalysis = JSON.parse(fs.readFileSync(deepAnalysisPath, 'utf-8'));
        res.write(`data: ${JSON.stringify({
          phase: 'template_loaded',
          message: '✅ 已加载模板深度分析结果',
          progress: 5
        })}\n\n`);
      } else {
        // 尝试加载普通分析
        const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_analysis.json`);
        if (fs.existsSync(analysisPath)) {
          templateAnalysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
          res.write(`data: ${JSON.stringify({
            phase: 'template_loaded',
            message: '⚠️ 使用普通模板分析（建议先进行深度分析）',
            progress: 5
          })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({
            phase: 'warning',
            message: '⚠️ 未找到模板分析，将使用默认结构',
            progress: 5
          })}\n\n`);
        }
      }
    }

    // 执行增强生成
    const result = await enhancedGenerateRequirementSpec(
      client,
      cosmicData,
      templateAnalysis,
      requirementDoc,
      (progress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      }
    );

    // 发送生成结果
    res.write(`data: ${JSON.stringify({
      phase: 'result',
      message: '✅ 生成完成',
      qualityScore: result.qualityReport.overallScore,
      contentLength: result.content.length,
      metadata: result.metadata
    })}\n\n`);

    // 分块发送内容
    const chunkSize = 5000;
    for (let i = 0; i < result.content.length; i += chunkSize) {
      const chunk = result.content.slice(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({
        phase: 'content_chunk',
        chunk: chunk,
        chunkIndex: Math.floor(i / chunkSize),
        totalChunks: Math.ceil(result.content.length / chunkSize)
      })}\n\n`);
    }

    // 发送质量报告
    res.write(`data: ${JSON.stringify({
      phase: 'quality_report',
      qualityReport: result.qualityReport
    })}\n\n`);

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('增强生成失败:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    res.write(`data: ${JSON.stringify({
      phase: 'error',
      error: error.message,
      stack: error.stack
    })}\n\n`);
    res.end();
  }
});

/**
 * API: 独立质量检查
 * POST /api/quality-check
 * 对已生成的文档进行质量检查
 */
app.post('/api/quality-check', async (req, res) => {
  try {
    const { content, templateId, cosmicData } = req.body;

    if (!content) {
      return res.status(400).json({ error: '请提供要检查的文档内容' });
    }

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥（质量检查需要AI辅助）' });
    }

    // 加载模板分析
    let templateAnalysis = null;
    if (templateId) {
      const deepAnalysisPath = path.join(TEMPLATES_DIR, `${templateId}_deep_analysis.json`);
      if (fs.existsSync(deepAnalysisPath)) {
        templateAnalysis = JSON.parse(fs.readFileSync(deepAnalysisPath, 'utf-8'));
      }
    }

    // 执行质量检查
    console.log('开始质量检查...');
    const qualityReport = await comprehensiveQualityCheck(
      client,
      content,
      templateAnalysis,
      cosmicData
    );

    res.json({
      success: true,
      qualityReport,
      message: `质量检查完成，总分: ${qualityReport.overallScore}/100`
    });

  } catch (error) {
    console.error('质量检查失败:', error);
    res.status(500).json({
      error: '质量检查失败: ' + error.message,
      stack: error.stack
    });
  }
});

// ==================== 深度理解系统 API 端点结束 ====================


// ==================== 需求评审智能体 API 端点 ====================

/**
 * API: 完整需求评审
 * POST /api/review/full
 * 对需求文档进行多维度完整评审
 */
app.post('/api/review/full', upload.single('file'), handleMulterError, async (req, res) => {
  try {
    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    let requirementDoc = '';

    // 支持文件上传或直接传入文本
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        requirementDoc = result.value;
      } else if (ext === '.doc') {
        const extracted = await wordExtractor.extract(req.file.buffer);
        requirementDoc = extracted.getBody();
      } else if (ext === '.txt' || ext === '.md') {
        requirementDoc = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.content) {
      requirementDoc = req.body.content;
    }

    if (!requirementDoc || requirementDoc.trim().length < 100) {
      return res.status(400).json({ error: '请提供有效的需求文档（至少100字符）' });
    }

    // 设置SSE响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`data: ${JSON.stringify({
      phase: 'start',
      message: '🔍 启动需求评审智能体...',
      progress: 0
    })}\n\n`);

    // 执行完整评审
    const report = await reviewRequirementDocument(
      client,
      requirementDoc,
      {},
      (progress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      }
    );

    // 发送评审结果
    res.write(`data: ${JSON.stringify({
      phase: 'result',
      report: report
    })}\n\n`);

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('需求评审失败:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    res.write(`data: ${JSON.stringify({
      phase: 'error',
      error: error.message
    })}\n\n`);
    res.end();
  }
});

/**
 * API: 快速评审
 * POST /api/review/quick
 * 轻量级快速评审，识别关键问题
 */
app.post('/api/review/quick', upload.single('file'), handleMulterError, async (req, res) => {
  try {
    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    let requirementDoc = '';

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        requirementDoc = result.value;
      } else if (ext === '.doc') {
        const extracted = await wordExtractor.extract(req.file.buffer);
        requirementDoc = extracted.getBody();
      } else if (ext === '.txt' || ext === '.md') {
        requirementDoc = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.content) {
      requirementDoc = req.body.content;
    }

    if (!requirementDoc || requirementDoc.trim().length < 50) {
      return res.status(400).json({ error: '请提供有效的需求文档' });
    }

    const result = await quickReview(client, requirementDoc);
    res.json({ success: true, result });

  } catch (error) {
    console.error('快速评审失败:', error);
    res.status(500).json({ error: '快速评审失败: ' + error.message });
  }
});

/**
 * API: 对比评审
 * POST /api/review/compare
 * 对比两个版本的需求文档
 */
app.post('/api/review/compare', upload.fields([
  { name: 'oldFile', maxCount: 1 },
  { name: 'newFile', maxCount: 1 }
]), handleMulterError, async (req, res) => {
  try {
    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    let oldDoc = '';
    let newDoc = '';

    // 解析旧版本文档
    if (req.files?.oldFile?.[0]) {
      const file = req.files.oldFile[0];
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        oldDoc = result.value;
      } else if (ext === '.doc') {
        const extracted = await wordExtractor.extract(file.buffer);
        oldDoc = extracted.getBody();
      } else {
        oldDoc = file.buffer.toString('utf-8');
      }
    } else if (req.body.oldContent) {
      oldDoc = req.body.oldContent;
    }

    // 解析新版本文档
    if (req.files?.newFile?.[0]) {
      const file = req.files.newFile[0];
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        newDoc = result.value;
      } else if (ext === '.doc') {
        const extracted = await wordExtractor.extract(file.buffer);
        newDoc = extracted.getBody();
      } else {
        newDoc = file.buffer.toString('utf-8');
      }
    } else if (req.body.newContent) {
      newDoc = req.body.newContent;
    }

    if (!oldDoc || !newDoc) {
      return res.status(400).json({ error: '请提供两个版本的需求文档' });
    }

    const result = await compareReview(client, oldDoc, newDoc);
    res.json({ success: true, result });

  } catch (error) {
    console.error('对比评审失败:', error);
    res.status(500).json({ error: '对比评审失败: ' + error.message });
  }
});

/**
 * API: 获取评审维度信息
 * GET /api/review/dimensions
 */
app.get('/api/review/dimensions', (req, res) => {
  res.json({
    dimensions: REVIEW_DIMENSIONS,
    severityLevels: SEVERITY_LEVELS
  });
});

// ==================== 需求评审智能体 API 端点结束 ====================


// ==================== 智器云自研AI智能体 API ====================

/**
 * API: 自研AI对话（完全自主实现，不依赖外部API）
 * POST /api/chat/stream
 */
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: '请提供消息内容' });
    }

    // 设置SSE响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 使用自研AI处理对话
    const result = await selfAI.chat(sessionId || 'default', message);

    // 模拟流式输出（逐字输出）
    const response = result.response;
    const chunkSize = 5; // 每次输出5个字符
    
    for (let i = 0; i < response.length; i += chunkSize) {
      const chunk = response.slice(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`);
      
      // 小延迟模拟打字效果
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    res.write(`data: ${JSON.stringify({ type: 'done', intent: result.intent, confidence: result.confidence })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('自研AI对话失败:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }
});

/**
 * API: 自研AI同步对话
 * POST /api/chat/sync
 */
app.post('/api/chat/sync', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: '请提供消息内容' });
    }

    const result = await selfAI.chat(sessionId || 'default', message);
    res.json({ 
      success: result.success, 
      response: result.response,
      intent: result.intent,
      confidence: result.confidence,
      entities: result.entities,
      suggestions: result.suggestions,
      processingTime: result.processingTime
    });

  } catch (error) {
    console.error('自研AI对话失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: 获取角色列表（自研AI使用统一角色）
 * GET /api/chat/roles
 */
app.get('/api/chat/roles', (req, res) => {
  const roles = [
    {
      key: 'default',
      name: '智器云助手',
      icon: '🤖',
      description: '自研AI助手，完全自主实现'
    }
  ];
  res.json({ roles });
});

/**
 * API: 清空会话历史
 * POST /api/chat/clear
 */
app.post('/api/chat/clear', (req, res) => {
  const { sessionId } = req.body;
  selfAI.clearSession(sessionId || 'default');
  res.json({ success: true, message: '会话已清空' });
});

/**
 * API: 获取会话历史
 * GET /api/chat/history/:sessionId
 */
app.get('/api/chat/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const history = selfAI.getHistory(sessionId);
  res.json({ messages: history });
});

/**
 * API: 获取自研AI信息
 * GET /api/chat/info
 */
app.get('/api/chat/info', (req, res) => {
  res.json({
    name: '智器云自研AI助手',
    version: '1.0.0',
    description: '完全自主实现的AI对话系统，不依赖任何外部大模型API',
    features: [
      'NLU引擎 - 意图识别、实体提取、情感分析',
      '对话管理 - 多轮对话、上下文记忆、状态机',
      '知识库 - 编程知识、技术框架、通用知识',
      'NLG引擎 - 模板生成、动态回复',
      '技能系统 - 计算器、代码生成、日期时间'
    ],
    knowledgeCategories: selfAI.kb.getCategories()
  });
});

// ==================== 智器云自研AI智能体 API 结束 ====================


// ==================== 编程智能体 API ====================

/**
 * API: 生成代码（增强版：支持纯HTML和React）
 * POST /api/code-generator/generate
 * 根据项目类型选择不同的生成策略
 */
app.post('/api/code-generator/generate', async (req, res) => {
  try {
    const { requirement, documentContent, projectType, uiFramework, includeBackend, chatHistory } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    console.log('\n🚀 ========== 代码生成请求 ==========');
    console.log(`📋 项目类型: ${projectType}`);
    console.log(`🎨 UI框架: ${uiFramework}`);
    console.log(`📝 需求: ${(requirement || '').slice(0, 100)}...`);
    console.log(`📄 文档长度: ${(documentContent || '').length} 字符`);

    // 分析需求，用于日志
    const analysis = analyzeRequirementForData(requirement, documentContent);
    console.log(`📊 识别实体: ${analysis.entities.map(e => e.name).join(', ') || '通用数据'}`);
    console.log(`🔧 识别功能: ${analysis.features.join(', ') || '基础CRUD'}`);

    let codeBlocks;

    // 根据项目类型选择生成策略
    if (projectType === 'html') {
      // 纯HTML生成 - 单文件，包含CSS和JS
      console.log('🌐 使用纯HTML生成模式');
      
      res.write(`data: ${JSON.stringify({ 
        phase: 'start', 
        progress: 5, 
        message: '🌐 启动纯HTML页面生成...'
      })}\n\n`);

      // 获取上传的HTML模板（如果有）
      const uploadedHtml = req.body.uploadedHtml || '';
      if (uploadedHtml) {
        console.log('📄 检测到上传的HTML模板，将作为参考');
      }

      codeBlocks = await streamHtmlGenerate(
        client,
        requirement,
        documentContent,
        { projectType, uiFramework, includeBackend, uploadedHtml },
        res
      );

    } else {
      // React/Vue 多轮迭代生成
      console.log(`⚛️ 使用${projectType === 'react' ? 'React' : 'Vue'}多轮迭代模式`);
      console.log(`🔄 迭代轮数: ${GENERATION_CONFIG.maxRounds}`);

      res.write(`data: ${JSON.stringify({ 
        phase: 'start', 
        progress: 5, 
        message: '🚀 启动多轮迭代生成...',
        totalRounds: GENERATION_CONFIG.maxRounds
      })}\n\n`);

      codeBlocks = await streamMultiRoundGenerate(
        client,
        requirement,
        documentContent,
        { projectType, uiFramework, includeBackend },
        res
      );
    }

    // 发送最终代码
    const finalCode = codeBlocks.html || codeBlocks.react || codeBlocks.fullCode || '';
    const finalLineCount = finalCode.split('\n').length;
    
    res.write(`data: ${JSON.stringify({ 
      complete: true, 
      finalCode: codeBlocks,
      phase: 'complete',
      progress: 100,
      lineCount: finalLineCount,
      message: `✅ 生成完成！共 ${finalLineCount} 行代码`
    })}\n\n`);

    console.log(`✅ 代码生成完成，最终代码行数: ${finalLineCount}`);
    res.end();

  } catch (error) {
    console.error('❌ 代码生成错误:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

/**
 * API: 修改代码
 * POST /api/code-generator/modify
 * 根据修改需求调整现有代码
 */
app.post('/api/code-generator/modify', async (req, res) => {
  try {
    const { modification, currentCode, projectType, uiFramework, chatHistory } = req.body;

    const client = getOpenAIClient();
    if (!client) {
      return res.status(400).json({ error: '请先配置API密钥' });
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    console.log('\n🔧 ========== 代码修改请求 ==========');
    console.log(`📝 修改需求: ${modification.slice(0, 100)}...`);

    // 构建修改提示词
    const { prompt, systemPrompt } = await modifyCode(
      client, modification, currentCode,
      { projectType, uiFramework },
      chatHistory
    );

    // 调用AI修改代码
    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 16000,
      stream: true
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // 解析修改后的代码
    const codeBlocks = parseCodeBlocks(fullResponse);
    
    if (!codeBlocks.react && !codeBlocks.html) {
      codeBlocks.react = fullResponse;
      codeBlocks.fullCode = buildFullReactCode({ react: fullResponse, css: currentCode.css || '' });
    }

    res.write(`data: ${JSON.stringify({ 
      complete: true, 
      finalCode: codeBlocks 
    })}\n\n`);

    console.log('✅ 代码修改完成');
    res.end();

  } catch (error) {
    console.error('❌ 代码修改错误:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// ==================== 编程智能体 API 结束 ====================


app.listen(PORT, () => {
  console.log(`🚀 智能体服务器运行在 http://localhost:${PORT}`);
  console.log(`📋 API密钥状态: ${process.env.OPENAI_API_KEY ? '已配置' : '未配置'}`);
  console.log(`📦 可用功能模块:`);
  console.log(`   - Cosmic拆分: 软件功能规模度量`);
  console.log(`   - 需求规格书生成: 需求文档智能分析`);
  console.log(`   - 架构图生成: AI分析 + Kroki渲染`);
  console.log(`   - COSMIC转需求规格书: Excel/Word数据 + 模板生成`);
  console.log(`   🆕 深度理解系统: 多维度模板分析 + 智能推理 + 质量检查`);
  console.log(`      · /api/deep-analyze-template - 六维度深度分析模板`);
  console.log(`      · /api/enhanced-cosmic-to-spec - 增强版COSMIC转需求文档`);
  console.log(`      · /api/quality-check - 文档质量检查`);
  console.log(`   🔍 需求评审智能体: 多维度需求文档评审`);
  console.log(`      · /api/review/full - 完整需求评审`);
  console.log(`      · /api/review/quick - 快速评审`);
  console.log(`      · /api/review/compare - 版本对比评审`);
  console.log(`      · /api/review/dimensions - 获取评审维度`);
  console.log(`   🤖 智器云自研AI智能体: 完全自主实现，不依赖外部API`);
  console.log(`      · /api/chat/stream - 流式对话`);
  console.log(`      · /api/chat/sync - 同步对话`);
  console.log(`      · /api/chat/info - 获取AI信息`);
  console.log(`      · 核心模块: NLU引擎、对话管理、知识库、NLG引擎、技能系统`);
  console.log(`   💻 编程智能体: 根据需求生成前端代码，支持实时预览`);
  console.log(`      · /api/code-generator/generate - 生成代码`);
  console.log(`      · /api/code-generator/modify - 修改代码`);
  console.log(`      · 支持: React/Vue/HTML + Tailwind/Antd/Material UI`);
  if (fs.existsSync(CLIENT_DIST_PATH)) {
    console.log('🖥️  静态前端: 已启用 client/dist 产物');
  }
});
