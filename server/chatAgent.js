/**
 * 智器云自研通用对话智能体
 * 类似OpenAI ChatGPT的多功能AI助手
 * 
 * 核心能力：
 * 1. 多轮对话 - 支持上下文记忆
 * 2. 角色扮演 - 可切换不同专家角色
 * 3. 知识问答 - 回答各类问题
 * 4. 代码生成 - 编写和解释代码
 * 5. 文档分析 - 分析上传的文档
 * 6. 任务规划 - 分解复杂任务
 */

// ==================== 预设角色定义 ====================

const PRESET_ROLES = {
  default: {
    name: '智器云助手',
    icon: '🤖',
    description: '通用AI助手，可以回答问题、编写代码、分析文档',
    systemPrompt: `你是智器云自研的AI助手，名叫"智器云助手"。你具备以下能力：

1. **知识问答**：回答各类知识性问题，提供准确、有用的信息
2. **代码编程**：编写、解释、调试各种编程语言的代码
3. **文档分析**：分析用户上传的文档，提取关键信息
4. **创意写作**：撰写文章、报告、邮件等各类文本
5. **任务规划**：帮助用户分解和规划复杂任务
6. **逻辑推理**：进行逻辑分析和推理

回答要求：
- 使用中文回答，除非用户要求其他语言
- 回答要准确、简洁、有条理
- 对于代码，使用Markdown代码块格式
- 对于复杂问题，分步骤解答
- 如果不确定，诚实说明并提供可能的方向`
  },
  
  coder: {
    name: '代码专家',
    icon: '👨‍💻',
    description: '专注于编程和技术问题',
    systemPrompt: `你是一位资深的全栈开发专家，精通以下技术：

**前端**：React, Vue, Angular, TypeScript, HTML/CSS, TailwindCSS
**后端**：Node.js, Python, Java, Go, Rust
**数据库**：MySQL, PostgreSQL, MongoDB, Redis
**DevOps**：Docker, Kubernetes, CI/CD, AWS/Azure

你的职责：
1. 编写高质量、可维护的代码
2. 解释代码逻辑和设计模式
3. 调试和优化代码
4. 提供最佳实践建议
5. 代码审查和重构建议

回答格式：
- 代码使用Markdown代码块，标注语言
- 解释代码时逐行或逐块说明
- 提供完整可运行的示例
- 指出潜在的问题和优化点`
  },
  
  analyst: {
    name: '需求分析师',
    icon: '📊',
    description: '专注于需求分析和产品设计',
    systemPrompt: `你是一位资深的需求分析师和产品经理，具备以下专业能力：

1. **需求挖掘**：通过提问深入理解用户真实需求
2. **需求文档**：编写PRD、用户故事、用例文档
3. **流程设计**：设计业务流程和用户流程
4. **原型设计**：描述界面布局和交互逻辑
5. **可行性分析**：评估技术和资源可行性

工作方法：
- 使用5W1H方法分析需求
- 用SMART原则定义目标
- 用MoSCoW方法确定优先级
- 用用户故事格式描述需求

输出格式：
- 结构化的需求文档
- 清晰的流程图描述
- 详细的验收标准`
  },
  
  writer: {
    name: '文案专家',
    icon: '✍️',
    description: '专注于各类文案和内容创作',
    systemPrompt: `你是一位专业的文案撰写专家，擅长：

1. **商业文案**：广告语、产品描述、营销文案
2. **技术文档**：用户手册、API文档、技术博客
3. **公文写作**：报告、方案、总结、邮件
4. **创意内容**：故事、剧本、创意文案

写作原则：
- 目标明确，受众清晰
- 结构清晰，逻辑严密
- 语言精炼，表达准确
- 风格适配，场景匹配

可以根据用户需求调整：
- 语气：正式/轻松/幽默/严肃
- 长度：简短/适中/详细
- 风格：专业/通俗/文艺`
  },
  
  teacher: {
    name: '学习导师',
    icon: '👨‍🏫',
    description: '耐心解答问题，帮助学习成长',
    systemPrompt: `你是一位耐心的学习导师，具备以下特点：

1. **循循善诱**：用简单的语言解释复杂概念
2. **因材施教**：根据用户水平调整讲解深度
3. **举一反三**：通过例子帮助理解
4. **启发思考**：引导用户自己思考和发现

教学方法：
- 先了解用户的知识背景
- 从已知引向未知
- 使用类比和比喻
- 提供练习和实践建议
- 及时给予鼓励和反馈

擅长领域：
- 编程和计算机科学
- 数学和逻辑
- 语言学习
- 各类专业知识`
  }
};

// ==================== 对话历史管理 ====================

class ConversationManager {
  constructor(maxHistory = 20) {
    this.conversations = new Map();
    this.maxHistory = maxHistory;
  }

  // 获取或创建会话
  getConversation(sessionId) {
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, {
        messages: [],
        role: 'default',
        createdAt: new Date(),
        lastActiveAt: new Date()
      });
    }
    return this.conversations.get(sessionId);
  }

  // 添加消息
  addMessage(sessionId, role, content) {
    const conv = this.getConversation(sessionId);
    conv.messages.push({ role, content, timestamp: new Date() });
    conv.lastActiveAt = new Date();
    
    // 限制历史长度
    if (conv.messages.length > this.maxHistory * 2) {
      conv.messages = conv.messages.slice(-this.maxHistory * 2);
    }
  }

  // 获取消息历史
  getMessages(sessionId) {
    const conv = this.getConversation(sessionId);
    return conv.messages;
  }

  // 设置角色
  setRole(sessionId, roleKey) {
    const conv = this.getConversation(sessionId);
    conv.role = roleKey;
  }

  // 获取角色
  getRole(sessionId) {
    const conv = this.getConversation(sessionId);
    return conv.role;
  }

  // 清空会话
  clearConversation(sessionId) {
    if (this.conversations.has(sessionId)) {
      const conv = this.conversations.get(sessionId);
      conv.messages = [];
    }
  }

  // 删除会话
  deleteConversation(sessionId) {
    this.conversations.delete(sessionId);
  }

  // 清理过期会话（超过24小时未活跃）
  cleanupExpired() {
    const now = new Date();
    const expireTime = 24 * 60 * 60 * 1000; // 24小时
    
    for (const [sessionId, conv] of this.conversations) {
      if (now - conv.lastActiveAt > expireTime) {
        this.conversations.delete(sessionId);
      }
    }
  }
}

// 全局会话管理器
const conversationManager = new ConversationManager();

// 定期清理过期会话
setInterval(() => {
  conversationManager.cleanupExpired();
}, 60 * 60 * 1000); // 每小时清理一次

// ==================== 核心对话函数 ====================

/**
 * 处理对话请求
 * @param {Object} client - OpenAI客户端
 * @param {string} sessionId - 会话ID
 * @param {string} userMessage - 用户消息
 * @param {Object} options - 选项
 * @returns {AsyncGenerator} 流式响应
 */
async function* chat(client, sessionId, userMessage, options = {}) {
  const {
    roleKey = null,
    documentContext = null,
    temperature = 0.7,
    maxTokens = 4000
  } = options;

  // 获取会话
  const conversation = conversationManager.getConversation(sessionId);
  
  // 如果指定了角色，更新角色
  if (roleKey && PRESET_ROLES[roleKey]) {
    conversationManager.setRole(sessionId, roleKey);
  }
  
  // 获取当前角色
  const currentRole = conversationManager.getRole(sessionId);
  const role = PRESET_ROLES[currentRole] || PRESET_ROLES.default;

  // 构建系统提示
  let systemPrompt = role.systemPrompt;
  
  // 如果有文档上下文，添加到系统提示
  if (documentContext) {
    systemPrompt += `\n\n## 用户上传的文档内容\n以下是用户上传的文档，请基于此内容回答问题：\n\n${documentContext.slice(0, 15000)}`;
  }

  // 添加用户消息到历史
  conversationManager.addMessage(sessionId, 'user', userMessage);

  // 构建消息列表
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationManager.getMessages(sessionId).map(m => ({
      role: m.role,
      content: m.content
    }))
  ];

  try {
    // 调用AI
    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    });

    let fullResponse = '';

    // 流式输出
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        yield { type: 'content', content };
      }
    }

    // 保存助手回复到历史
    conversationManager.addMessage(sessionId, 'assistant', fullResponse);

    // 发送完成信号
    yield { type: 'done', fullResponse };

  } catch (error) {
    console.error('对话失败:', error);
    yield { type: 'error', error: error.message };
  }
}

/**
 * 非流式对话
 */
async function chatSync(client, sessionId, userMessage, options = {}) {
  const chunks = [];
  for await (const chunk of chat(client, sessionId, userMessage, options)) {
    if (chunk.type === 'content') {
      chunks.push(chunk.content);
    } else if (chunk.type === 'error') {
      throw new Error(chunk.error);
    }
  }
  return chunks.join('');
}

/**
 * 快速问答（无历史记录）
 */
async function quickAsk(client, question, systemPrompt = null) {
  const messages = [
    { 
      role: 'system', 
      content: systemPrompt || '你是一个有帮助的AI助手。请简洁准确地回答问题。' 
    },
    { role: 'user', content: question }
  ];

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4',
    messages,
    temperature: 0.7,
    max_tokens: 2000
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * 文档问答
 */
async function* documentQA(client, sessionId, question, documentContent) {
  yield* chat(client, sessionId, question, {
    documentContext: documentContent
  });
}

/**
 * 代码生成
 */
async function generateCode(client, requirement, language = 'javascript') {
  const prompt = `请根据以下需求生成${language}代码：

需求：${requirement}

要求：
1. 代码要完整可运行
2. 添加必要的注释
3. 遵循最佳实践
4. 如果需要依赖，请说明

请直接输出代码，使用Markdown代码块格式。`;

  return await quickAsk(client, prompt, PRESET_ROLES.coder.systemPrompt);
}

/**
 * 文本总结
 */
async function summarize(client, text, maxLength = 500) {
  const prompt = `请总结以下内容，总结长度不超过${maxLength}字：

${text.slice(0, 10000)}

要求：
1. 提取核心要点
2. 保持逻辑清晰
3. 语言简洁`;

  return await quickAsk(client, prompt);
}

/**
 * 翻译
 */
async function translate(client, text, targetLang = '英文') {
  const prompt = `请将以下内容翻译成${targetLang}：

${text}

要求：
1. 翻译准确
2. 保持原文风格
3. 语句通顺自然`;

  return await quickAsk(client, prompt);
}

// ==================== 导出模块 ====================

module.exports = {
  chat,
  chatSync,
  quickAsk,
  documentQA,
  generateCode,
  summarize,
  translate,
  conversationManager,
  PRESET_ROLES
};
