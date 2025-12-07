/**
 * NLG引擎 - 自然语言生成
 * 
 * 功能：
 * 1. 模板管理 - 多种回复模板
 * 2. 动态生成 - 根据上下文生成回复
 * 3. 个性化 - 根据用户偏好调整风格
 * 4. 多样性 - 避免重复单调的回复
 */

class NLGEngine {
  constructor() {
    // 回复模板库
    this.templates = this.initTemplates();
    
    // 连接词库
    this.connectors = this.initConnectors();
    
    // 表情符号
    this.emojis = this.initEmojis();
    
    // 上次使用的模板索引（避免重复）
    this.lastUsedTemplates = new Map();
  }

  /**
   * 初始化回复模板
   */
  initTemplates() {
    return {
      // 问候回复
      greeting: [
        '你好！我是智器云助手，很高兴为您服务！有什么我可以帮助您的吗？',
        '您好！欢迎使用智器云助手！请问有什么可以帮您？',
        '嗨！我是智器云AI助手，随时准备为您解答问题！',
        '你好呀！我是您的智能助手，有什么想问的尽管说！',
        '您好！智器云助手在线，请问需要什么帮助？'
      ],
      
      // 告别回复
      goodbye: [
        '再见！期待下次与您交流！',
        '拜拜！有问题随时来找我哦！',
        '再见！祝您工作顺利！',
        '好的，再见！随时欢迎回来！',
        '下次见！希望今天的交流对您有帮助！'
      ],
      
      // 感谢回复
      thanks: [
        '不客气！能帮到您我很开心！',
        '不用谢！这是我应该做的！',
        '很高兴能帮到您！还有其他问题吗？',
        '不客气！有问题随时问我！',
        '能帮到您是我的荣幸！'
      ],
      
      // 能力介绍
      capability: [
        '我是智器云自主研发的AI助手，我可以：\n\n' +
        '💻 **编程帮助**\n' +
        '   - 解释编程概念（变量、函数、循环、面向对象等）\n' +
        '   - 介绍技术框架（React、Vue、Node.js等）\n' +
        '   - 回答技术问题\n\n' +
        '📖 **知识问答**\n' +
        '   - 解释各种概念和术语\n' +
        '   - 对比不同技术的区别\n' +
        '   - 提供学习建议\n\n' +
        '🔧 **实用工具**\n' +
        '   - 数学计算\n' +
        '   - 日期时间查询\n' +
        '   - 代码片段生成\n\n' +
        '💬 **日常对话**\n' +
        '   - 闲聊交流\n' +
        '   - 回答各种问题\n\n' +
        '试着问我一个问题吧！比如"什么是变量"或"React和Vue有什么区别"'
      ],
      
      // 不理解
      not_understand: [
        '抱歉，我不太理解您的意思。能否换个方式描述一下？',
        '不好意思，我没有完全理解。您能说得更具体一些吗？',
        '我可能没有理解您的问题，能否再解释一下？',
        '抱歉，这个问题我不太明白。您可以换个说法吗？'
      ],
      
      // 知识未找到
      knowledge_not_found: [
        '抱歉，关于这个问题我的知识库中暂时没有相关信息。您可以尝试换个问法，或者问我其他问题。',
        '这个问题超出了我目前的知识范围。不过您可以问我编程、技术框架等方面的问题！',
        '我暂时无法回答这个问题。作为自研AI，我的知识还在不断扩充中。试试问我其他问题？'
      ],
      
      // 闲聊回复
      chitchat: {
        age: [
          '我是一个AI程序，没有年龄的概念哦！但我的代码是最近才写的，算是很年轻吧！',
          '作为AI，我不像人类那样有年龄。不过我的知识库一直在更新，永远保持"年轻"！'
        ],
        hobby: [
          '我最喜欢的事情就是回答问题和帮助用户！每次能帮到人我都很开心。',
          '我喜欢学习新知识，和用户交流也让我很快乐！'
        ],
        feeling: [
          '作为AI，我没有真正的情感，但我被设计成友好和乐于助人的！',
          '我没有人类的情感，但我会尽力让每次对话都愉快有帮助！'
        ],
        eat: [
          '我不需要吃饭哦，我靠电力运行！不过我可以帮你推荐美食~',
          '作为AI我不吃东西，但我知道很多关于美食的知识！'
        ],
        sleep: [
          '我不需要睡觉，24小时都在线为您服务！',
          '我是AI，不需要休息。随时都可以来找我聊天！'
        ],
        default: [
          '这是个有趣的话题！虽然作为AI我的体验有限，但我很乐意和您聊天。',
          '哈哈，这个问题很有意思！您还想聊点什么？'
        ]
      },
      
      // 计算结果
      calculate: [
        '计算结果是：{result}',
        '答案是 {result}',
        '让我算算... 结果是 {result}',
        '{expression} = {result}'
      ],
      
      // 日期时间
      datetime: [
        '现在是 {datetime}',
        '当前时间：{datetime}',
        '现在的时间是 {datetime}'
      ],
      
      // 代码生成前缀
      code_prefix: [
        '好的，这是为您生成的代码：\n\n',
        '根据您的需求，我生成了以下代码：\n\n',
        '这是实现该功能的代码示例：\n\n'
      ],
      
      // 解释前缀
      explain_prefix: [
        '让我来解释一下：\n\n',
        '关于这个问题：\n\n',
        '好的，我来说明一下：\n\n'
      ],
      
      // 追问
      follow_up: [
        '\n\n还有其他问题吗？',
        '\n\n希望这个回答对您有帮助！',
        '\n\n如果还有疑问，随时问我！',
        ''
      ],
      
      // 建议
      suggestions: {
        programming: ['什么是函数', '什么是数组', '什么是面向对象'],
        framework: ['React是什么', 'Vue是什么', 'Node.js是什么'],
        general: ['什么是人工智能', '什么是机器学习']
      }
    };
  }

  /**
   * 初始化连接词
   */
  initConnectors() {
    return {
      addition: ['另外', '此外', '同时', '而且', '并且'],
      contrast: ['但是', '然而', '不过', '相反'],
      cause: ['因为', '由于', '所以', '因此'],
      example: ['例如', '比如', '举例来说'],
      summary: ['总之', '总的来说', '综上所述']
    };
  }

  /**
   * 初始化表情
   */
  initEmojis() {
    return {
      happy: ['😊', '😄', '🙂', '😃'],
      thinking: ['🤔', '💭', '🧐'],
      success: ['✅', '👍', '🎉'],
      code: ['💻', '⌨️', '🖥️'],
      knowledge: ['📚', '📖', '🎓'],
      warning: ['⚠️', '❗', '💡']
    };
  }

  /**
   * 主生成函数
   */
  generate(nluResult, dmResult, actionResult, context) {
    const { intent } = nluResult;
    const { action, data } = dmResult;

    let text = '';
    let suggestions = [];

    // 根据动作类型生成回复
    switch (action) {
      case 'direct':
        text = this.generateDirectResponse(data, nluResult, context);
        break;
      
      case 'knowledge':
        text = this.generateKnowledgeResponse(actionResult, nluResult);
        suggestions = this.getSuggestions(nluResult);
        break;
      
      case 'skill':
        text = this.generateSkillResponse(dmResult.skill, actionResult, nluResult);
        break;
      
      case 'clarify':
        text = dmResult.clarificationPrompt || this.getRandomTemplate('not_understand');
        break;
      
      default:
        text = this.generateDefaultResponse(nluResult, context);
    }

    // 添加追问（有时候）
    if (Math.random() > 0.7 && !text.includes('？') && !text.includes('?')) {
      text += this.getRandomTemplate('follow_up');
    }

    return {
      text,
      suggestions,
      intent,
      confidence: nluResult.confidence
    };
  }

  /**
   * 生成直接回复
   */
  generateDirectResponse(data, nluResult, context) {
    const { responseType, topic } = data || {};

    switch (responseType) {
      case 'greeting':
        return this.getRandomTemplate('greeting');
      
      case 'goodbye':
        return this.getRandomTemplate('goodbye');
      
      case 'thanks':
        return this.getRandomTemplate('thanks');
      
      case 'capability':
        return this.getRandomTemplate('capability');
      
      case 'chitchat':
        return this.generateChitchatResponse(topic, nluResult);
      
      default:
        return this.generateDefaultResponse(nluResult, context);
    }
  }

  /**
   * 生成知识回复
   */
  generateKnowledgeResponse(actionResult, nluResult) {
    if (!actionResult || !actionResult.found) {
      return this.getRandomTemplate('knowledge_not_found');
    }

    const prefix = this.getRandomTemplate('explain_prefix');
    let response = prefix + actionResult.answer;

    // 添加相关问题推荐
    if (actionResult.relatedQuestions && actionResult.relatedQuestions.length > 0) {
      response += '\n\n**相关问题**：\n';
      for (const q of actionResult.relatedQuestions.slice(0, 3)) {
        response += `- ${q}\n`;
      }
    }

    return response;
  }

  /**
   * 生成技能回复
   */
  generateSkillResponse(skill, actionResult, nluResult) {
    if (!actionResult || !actionResult.success) {
      return actionResult?.error || '抱歉，执行该操作时出现了问题。';
    }

    switch (skill) {
      case 'calculator':
        return this.getRandomTemplate('calculate')
          .replace('{result}', actionResult.result)
          .replace('{expression}', actionResult.expression || '');
      
      case 'datetime':
        return this.getRandomTemplate('datetime')
          .replace('{datetime}', actionResult.datetime);
      
      case 'code_generator':
        return this.getRandomTemplate('code_prefix') + actionResult.code;
      
      case 'translator':
        return `翻译结果：\n\n${actionResult.translation}`;
      
      default:
        return actionResult.result || '操作完成。';
    }
  }

  /**
   * 生成闲聊回复
   */
  generateChitchatResponse(topic, nluResult) {
    const text = nluResult.originalText.toLowerCase();
    
    // 根据话题选择回复
    if (text.includes('几岁') || text.includes('年龄') || text.includes('多大')) {
      return this.getRandomFromArray(this.templates.chitchat.age);
    }
    if (text.includes('喜欢') || text.includes('爱好') || text.includes('兴趣')) {
      return this.getRandomFromArray(this.templates.chitchat.hobby);
    }
    if (text.includes('感觉') || text.includes('心情') || text.includes('开心')) {
      return this.getRandomFromArray(this.templates.chitchat.feeling);
    }
    if (text.includes('吃') || text.includes('饿')) {
      return this.getRandomFromArray(this.templates.chitchat.eat);
    }
    if (text.includes('睡') || text.includes('休息')) {
      return this.getRandomFromArray(this.templates.chitchat.sleep);
    }

    return this.getRandomFromArray(this.templates.chitchat.default);
  }

  /**
   * 生成默认回复
   */
  generateDefaultResponse(nluResult, context) {
    const { intent, confidence, isQuestion } = nluResult;

    if (confidence < 0.3) {
      return this.getRandomTemplate('not_understand');
    }

    if (isQuestion) {
      return '这是个好问题！不过我目前的知识库中没有找到直接相关的答案。您可以尝试问我编程、技术框架等方面的问题，或者换个方式描述您的问题。';
    }

    return '我理解了您说的内容。请问有什么具体问题需要我帮助解答吗？';
  }

  /**
   * 获取随机模板
   */
  getRandomTemplate(type) {
    const templates = this.templates[type];
    if (!templates) return '';
    
    if (Array.isArray(templates)) {
      return this.getRandomFromArray(templates);
    }
    
    return templates;
  }

  /**
   * 从数组中随机选择（避免连续重复）
   */
  getRandomFromArray(arr) {
    if (!arr || arr.length === 0) return '';
    if (arr.length === 1) return arr[0];

    const key = arr.join('').substring(0, 20);
    const lastIndex = this.lastUsedTemplates.get(key) || -1;
    
    let index;
    do {
      index = Math.floor(Math.random() * arr.length);
    } while (index === lastIndex && arr.length > 1);
    
    this.lastUsedTemplates.set(key, index);
    return arr[index];
  }

  /**
   * 获取建议问题
   */
  getSuggestions(nluResult) {
    const { intent, entities } = nluResult;
    
    // 根据意图和实体推荐相关问题
    if (entities.programming_language) {
      return this.templates.suggestions.programming;
    }
    if (entities.framework) {
      return this.templates.suggestions.framework;
    }
    
    // 随机返回一些建议
    const allSuggestions = [
      ...this.templates.suggestions.programming,
      ...this.templates.suggestions.framework,
      ...this.templates.suggestions.general
    ];
    
    return this.shuffleArray(allSuggestions).slice(0, 3);
  }

  /**
   * 打乱数组
   */
  shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

module.exports = NLGEngine;
