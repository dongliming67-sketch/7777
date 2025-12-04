const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
require('dotenv').config();

// 存储提取的图片（内存缓存）
const extractedImagesCache = new Map();

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

// 需求规格书生成系统提示词 - 优化版
const REQUIREMENT_SPEC_SYSTEM_PROMPT = `# 角色定位
你是一名资深软件需求分析专家，专注于生成高质量、结构清晰、内容充实的软件需求规格说明书。

# 核心输出原则

## 1. 结构规范
- 严格按照章节编号顺序输出（1→2→3→4→5→6→7）
- 每个章节必须有明确的标题层级（#、##、###）
- 章节之间保持逻辑连贯性

## 2. 内容充实度要求（必须严格遵守）
| 内容类型 | 最低要求 | 必含元素 |
|----------|----------|----------|
| 功能说明 | 300字以上 | 业务背景、使用场景、操作流程、核心价值、异常处理 |
| 业务规则 | 5条以上 | 规则编号、规则名称、触发条件、处理逻辑、异常处理 |
| 处理数据 | 8行以上 | 字段名、类型、长度、必填、校验规则、说明 |
| 接口设计 | 完整结构 | 接口编号、请求方式、URL、请求参数表(5行+)、响应参数表(5行+)、错误码表 |
| 界面设计 | 详细描述 | 页面布局(顶部/侧边/主体/底部)、组件列表、交互流程、状态说明 |
| 验收标准 | 5条以上 | 编号、测试场景、前置条件、操作步骤、预期结果 |

## 3. 表格规范
- 所有表格必须使用标准Markdown格式：|列1|列2|列3|
- 表头与数据行之间必须有分隔行：|---|---|---|
- 每个表格至少5行有效数据
- **禁止使用占位符**：不允许出现"XXX"、"待定"、"..."、"略"等

## 4. Mermaid图表规范
- 使用正确的Mermaid语法，确保可直接渲染
- 节点名称必须来自实际业务对象，禁止使用"示例"、"Example"、"Placeholder"
- 图表类型选择：
  - 流程图：flowchart TD
  - 架构图：graph TB + subgraph
  - 用例图：graph LR + 圆形节点((角色))
  - ER图：erDiagram（实体名必须用英文，如User、Order）
  - 时序图：sequenceDiagram

## 5. 标注规则
- **[知识库补全]**：AI基于行业最佳实践补充的内容
- **[待业务确认]**：需要业务方确认的内容
- **[假设数据]**：假设性数据，需根据实际调整

## 6. 严格禁止
- ❌ 输出空白章节或只有标题没有内容的章节
- ❌ 使用"请参考"、"详见"、"同上"等推诿性表述
- ❌ 在正文中出现"深度完善"、"扩展内容"、"完善要求"等元描述
- ❌ 重复输出相同内容
- ❌ 使用不完整的表格（缺少列或行）
- ❌ 功能说明少于100字
- ❌ 表格数据少于3行

## 7. 质量自检
生成内容前，确保：
✓ 每个功能模块都有完整的6个小节（功能说明、业务规则、处理数据、接口、界面、验收标准）
✓ 所有表格数据具体、真实、可执行
✓ 接口设计包含完整的请求/响应参数
✓ 业务规则可验证、可测试
✓ 验收标准覆盖正常和异常场景
✓ 内容专业、正式，像真正的需求规格说明书`;

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
          convertImage: mammoth.images.imgElement(function(image) {
            return image.read("base64").then(function(imageBuffer) {
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
      return res.status(400).json({ 
        error: '不支持旧版.doc格式，请将文件另存为.docx格式后重新上传' 
      });
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
const CHAPTER_SEQUENCE = [
  { key: 'chapter1_overview', name: '第1章 概述', chapterNum: 1 },
  { key: 'chapter2_business', name: '第2章 业务需求', chapterNum: 2 },
  { key: 'chapter3_user', name: '第3章 用户需求', chapterNum: 3 },
  { key: 'chapter4_architecture', name: '第4章 产品功能架构', chapterNum: 4 },
  { key: 'chapter5_functions', name: '第5章 功能需求', chapterNum: 5 },
  { key: 'chapter6_system', name: '第6章 系统需求', chapterNum: 6 },
  { key: 'chapter7_appendix', name: '第7章 附录', chapterNum: 7 }
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
// skipEnhance: true 表示该章节不需要完善阶段，一次生成即可
const TEMPLATE2_CHAPTER_SEQUENCE = [
  { key: 't2_chapter1_overview', name: '第1章 系统概述', chapterNum: 1, skipEnhance: true },
  { key: 't2_chapter2_analysis', name: '第2章 需求分析', chapterNum: 2, skipEnhance: true },
  { key: 't2_chapter3_functions', name: '第3章 功能说明', chapterNum: 3, skipEnhance: false },
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

// ==================== 按章节单独生成需求规格书（两阶段：生成+完善） ====================
// 【核心思路】每个章节调用两次AI：第一次生成基础内容，第二次深度完善，共14次调用

app.post('/api/requirement-spec/enhance', async (req, res) => {
  try {
    const { 
      documentContent, 
      previousContent, 
      images = [], 
      round = 1,
      totalRounds = 14,  // 改为14轮：7章节 × 2次（生成+完善）
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
    // round 1-2: 第1章（生成+完善）, round 3-4: 第2章（生成+完善）...
    const chapterIndex = Math.floor((round - 1) / 2);
    const isEnhancePhase = (round % 2 === 0); // 偶数轮是完善阶段
    const chapterConfig = CHAPTER_SEQUENCE[Math.min(chapterIndex, CHAPTER_SEQUENCE.length - 1)];

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
          ? uiImages.map((img, i) => `[插入图片: img_${analyzedImages.indexOf(img) + 1}]\n*图5-${i+1}: ${img.suggestedTitle || '界面原型'}*`).join('\n\n')
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
    const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`;

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

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 智能体服务器运行在 http://localhost:${PORT}`);
  console.log(`📋 API密钥状态: ${process.env.OPENAI_API_KEY ? '已配置' : '未配置'}`);
  console.log(`📦 可用功能模块:`);
  console.log(`   - Cosmic拆分: 软件功能规模度量`);
  console.log(`   - 需求规格书生成: 需求文档智能分析`);
  console.log(`   - 架构图生成: AI分析 + Kroki渲染`);
  if (fs.existsSync(CLIENT_DIST_PATH)) {
    console.log('🖥️  静态前端: 已启用 client/dist 产物');
  }
});
