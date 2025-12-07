/**
 * 智器云自研AI智能体 - 完全自主实现
 * 不依赖任何外部大模型API
 * 
 * 核心架构：
 * 1. NLU模块 - 自然语言理解（意图识别 + 实体提取）
 * 2. DM模块 - 对话管理（状态机 + 上下文管理）
 * 3. KB模块 - 知识库（知识图谱 + 向量检索）
 * 4. NLG模块 - 自然语言生成（模板 + 规则）
 * 5. 插件系统 - 可扩展的技能模块
 */

const NLUEngine = require('./nlu');
const DialogManager = require('./dialogManager');
const KnowledgeBase = require('./knowledgeBase');
const NLGEngine = require('./nlg');
const SkillManager = require('./skills');

class SelfAIAgent {
  constructor(config = {}) {
    this.config = {
      name: '智器云助手',
      version: '1.0.0',
      maxContextTurns: 10,
      ...config
    };

    // 初始化各模块
    this.nlu = new NLUEngine();
    this.dm = new DialogManager(this.config.maxContextTurns);
    this.kb = new KnowledgeBase();
    this.nlg = new NLGEngine();
    this.skills = new SkillManager();

    // 会话存储
    this.sessions = new Map();

    console.log(`🤖 ${this.config.name} v${this.config.version} 初始化完成`);
  }

  /**
   * 获取或创建会话
   */
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        context: this.dm.createContext(),
        history: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now()
      });
    }
    const session = this.sessions.get(sessionId);
    session.lastActiveAt = Date.now();
    return session;
  }

  /**
   * 主对话入口
   */
  async chat(sessionId, userInput) {
    const startTime = Date.now();
    const session = this.getSession(sessionId);

    try {
      // 1. 预处理用户输入
      const preprocessed = this.preprocess(userInput);

      // 2. NLU：理解用户意图
      const nluResult = this.nlu.understand(preprocessed, session.context);

      // 3. 对话管理：更新状态，决定动作
      const dmResult = this.dm.process(nluResult, session.context);

      // 4. 执行技能或查询知识库
      let actionResult;
      if (dmResult.action === 'skill') {
        actionResult = await this.skills.execute(dmResult.skill, dmResult.params, session.context);
      } else if (dmResult.action === 'knowledge') {
        actionResult = this.kb.query(dmResult.query, nluResult.entities);
      } else {
        actionResult = { type: 'direct', data: dmResult.data };
      }

      // 5. NLG：生成回复
      const response = this.nlg.generate(nluResult, dmResult, actionResult, session.context);

      // 6. 更新会话历史
      session.history.push({
        role: 'user',
        content: userInput,
        timestamp: Date.now()
      });
      session.history.push({
        role: 'assistant',
        content: response.text,
        timestamp: Date.now()
      });

      // 7. 更新上下文
      this.dm.updateContext(session.context, nluResult, response);

      // 限制历史长度
      if (session.history.length > this.config.maxContextTurns * 2) {
        session.history = session.history.slice(-this.config.maxContextTurns * 2);
      }

      return {
        success: true,
        response: response.text,
        intent: nluResult.intent,
        confidence: nluResult.confidence,
        entities: nluResult.entities,
        suggestions: response.suggestions || [],
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('对话处理错误:', error);
      return {
        success: false,
        response: '抱歉，我遇到了一些问题，请稍后再试。',
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * 预处理用户输入
   */
  preprocess(text) {
    if (!text) return '';
    
    // 去除首尾空白
    let processed = text.trim();
    
    // 统一标点符号
    processed = processed
      .replace(/[？]/g, '?')
      .replace(/[！]/g, '!')
      .replace(/[，]/g, ',')
      .replace(/[。]/g, '.')
      .replace(/[：]/g, ':')
      .replace(/[；]/g, ';');
    
    // 去除多余空格
    processed = processed.replace(/\s+/g, ' ');
    
    return processed;
  }

  /**
   * 清空会话
   */
  clearSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      session.history = [];
      session.context = this.dm.createContext();
    }
  }

  /**
   * 获取会话历史
   */
  getHistory(sessionId) {
    const session = this.getSession(sessionId);
    return session.history;
  }

  /**
   * 添加知识
   */
  addKnowledge(category, question, answer, keywords = []) {
    this.kb.add(category, question, answer, keywords);
  }

  /**
   * 注册技能
   */
  registerSkill(name, handler) {
    this.skills.register(name, handler);
  }
}

module.exports = SelfAIAgent;
