/**
 * NLU引擎 - 自然语言理解
 * 
 * 功能：
 * 1. 意图识别 - 基于规则和关键词匹配
 * 2. 实体提取 - 命名实体识别
 * 3. 情感分析 - 判断用户情绪
 * 4. 句法分析 - 分析句子结构
 */

class NLUEngine {
  constructor() {
    // 意图模式库
    this.intentPatterns = this.initIntentPatterns();
    
    // 实体模式库
    this.entityPatterns = this.initEntityPatterns();
    
    // 停用词
    this.stopWords = new Set([
      '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
      '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
      '自己', '这', '那', '什么', '吗', '呢', '啊', '哦', '嗯', '请', '帮', '帮我'
    ]);

    // 同义词词典
    this.synonyms = this.initSynonyms();
  }

  /**
   * 初始化意图模式
   */
  initIntentPatterns() {
    return [
      // 问候意图
      {
        intent: 'greeting',
        patterns: [
          /^(你好|您好|hi|hello|嗨|哈喽|早上好|下午好|晚上好|早安|晚安)/i,
          /^(在吗|在不在|有人吗)/
        ],
        priority: 10
      },
      
      // 告别意图
      {
        intent: 'goodbye',
        patterns: [
          /^(再见|拜拜|bye|goodbye|回见|下次见|晚安)/i,
          /(结束|退出|关闭).*对话/
        ],
        priority: 10
      },
      
      // 感谢意图
      {
        intent: 'thanks',
        patterns: [
          /(谢谢|感谢|多谢|thanks|thank you|thx)/i,
          /辛苦了/
        ],
        priority: 10
      },
      
      // 能力询问
      {
        intent: 'ask_capability',
        patterns: [
          /(你能|你会|你可以|能不能|会不会|可不可以).*(做什么|干什么|帮.*什么)/,
          /(你|你们).*(功能|能力|本事|特长)/,
          /你是(谁|什么|干嘛的)/,
          /(介绍|说说).*(自己|你自己)/,
          /^(你能做什么|你会什么|你有什么功能)/
        ],
        priority: 9
      },
      
      // 代码相关
      {
        intent: 'code_help',
        patterns: [
          /(写|生成|创建|编写|实现).*(代码|程序|函数|方法|类|脚本)/,
          /(代码|程序|函数).*(怎么写|如何写|怎样写)/,
          /帮我.*(写|实现|编写).*(代码|程序|功能)/,
          /(javascript|python|java|c\+\+|go|rust|html|css|sql|react|vue)/i
        ],
        priority: 8
      },
      
      // 解释说明
      {
        intent: 'explain',
        patterns: [
          /(什么是|解释一下|说明一下|介绍一下|讲讲|说说)/,
          /(是什么意思|什么意思|啥意思)/,
          /(.+)(是什么|是啥)/,
          /(怎么理解|如何理解)/
        ],
        priority: 7
      },
      
      // 如何做/怎么做
      {
        intent: 'how_to',
        patterns: [
          /(怎么|如何|怎样|咋).*(做|实现|完成|处理|解决|使用|操作)/,
          /(.+)的(方法|步骤|流程|教程)/,
          /(教我|告诉我).*(怎么|如何)/
        ],
        priority: 7
      },
      
      // 比较
      {
        intent: 'compare',
        patterns: [
          /(.+)和(.+)(的区别|有什么区别|区别是什么|哪个好|哪个更好)/,
          /(.+)与(.+)(对比|比较|相比)/,
          /(比较|对比).*(.+)和(.+)/
        ],
        priority: 7
      },
      
      // 计算
      {
        intent: 'calculate',
        patterns: [
          /(\d+)\s*[\+\-\*\/\×\÷]\s*(\d+)/,
          /(计算|算一下|算算|多少)/,
          /(\d+).*(加|减|乘|除).*(\d+)/
        ],
        priority: 8
      },
      
      // 时间日期
      {
        intent: 'datetime',
        patterns: [
          /(现在|今天|明天|昨天|这周|下周|上周|这个月|下个月).*(几点|几号|星期几|日期|时间)/,
          /(几点了|什么时候|什么时间)/,
          /今天是.*(几号|星期几)/
        ],
        priority: 8
      },
      
      // 天气
      {
        intent: 'weather',
        patterns: [
          /(天气|气温|温度|下雨|下雪|晴天|阴天)/,
          /(.+)的天气/,
          /今天.*天气/
        ],
        priority: 8
      },
      
      // 翻译
      {
        intent: 'translate',
        patterns: [
          /(翻译|translate).*(成|为|到)/i,
          /(.+)(用|的)(英文|中文|日文|韩文|法文|德文)/,
          /(英文|中文|日文|韩文).*怎么说/
        ],
        priority: 8
      },
      
      // 总结
      {
        intent: 'summarize',
        patterns: [
          /(总结|概括|归纳|提炼|摘要)/,
          /帮我.*(总结|概括)/
        ],
        priority: 7
      },
      
      // 建议/推荐
      {
        intent: 'recommend',
        patterns: [
          /(推荐|建议|有什么好的|有没有好的)/,
          /给我.*(推荐|建议)/,
          /(什么|哪个|哪些).*(好|值得|推荐)/
        ],
        priority: 6
      },
      
      // 闲聊
      {
        intent: 'chitchat',
        patterns: [
          /(无聊|聊天|陪我|说话|讲个笑话|讲笑话)/,
          /(你.*几岁|你.*年龄|你.*多大)/,
          /(你.*喜欢|你.*爱好|你.*兴趣)/,
          /(你.*吃饭|你.*睡觉|你.*休息)/
        ],
        priority: 5
      },
      
      // 默认问答
      {
        intent: 'question',
        patterns: [
          /\?$/,
          /？$/,
          /^(为什么|为啥|怎么回事)/,
          /(吗|呢|吧)$/
        ],
        priority: 3
      }
    ];
  }

  /**
   * 初始化实体模式
   */
  initEntityPatterns() {
    return {
      // 编程语言
      programming_language: {
        patterns: [
          /\b(javascript|js|typescript|ts|python|java|c\+\+|cpp|c#|csharp|go|golang|rust|ruby|php|swift|kotlin|scala|r|matlab|sql|html|css|shell|bash)\b/gi
        ],
        normalize: (match) => {
          const map = {
            'js': 'JavaScript',
            'javascript': 'JavaScript',
            'ts': 'TypeScript',
            'typescript': 'TypeScript',
            'python': 'Python',
            'java': 'Java',
            'c++': 'C++',
            'cpp': 'C++',
            'c#': 'C#',
            'csharp': 'C#',
            'go': 'Go',
            'golang': 'Go',
            'rust': 'Rust',
            'ruby': 'Ruby',
            'php': 'PHP',
            'swift': 'Swift',
            'kotlin': 'Kotlin',
            'sql': 'SQL',
            'html': 'HTML',
            'css': 'CSS'
          };
          return map[match.toLowerCase()] || match;
        }
      },
      
      // 数字
      number: {
        patterns: [
          /\b\d+(\.\d+)?\b/g
        ],
        normalize: (match) => parseFloat(match)
      },
      
      // 日期
      date: {
        patterns: [
          /\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}[日号]?/g,
          /(今天|明天|昨天|后天|前天|大后天|大前天)/g,
          /(这周|下周|上周|本周)(一|二|三|四|五|六|日|天)?/g
        ],
        normalize: (match) => match
      },
      
      // 时间
      time: {
        patterns: [
          /\d{1,2}[点时:：]\d{0,2}[分]?/g,
          /(早上|上午|中午|下午|晚上|凌晨)/g
        ],
        normalize: (match) => match
      },
      
      // 城市
      city: {
        patterns: [
          /(北京|上海|广州|深圳|杭州|南京|成都|武汉|西安|重庆|天津|苏州|郑州|长沙|青岛|大连|宁波|厦门|福州|济南|合肥|昆明|贵阳|南宁|海口|拉萨|乌鲁木齐|呼和浩特|银川|西宁|兰州|太原|石家庄|沈阳|长春|哈尔滨)/g
        ],
        normalize: (match) => match
      },
      
      // 技术框架
      framework: {
        patterns: [
          /\b(react|vue|angular|svelte|nextjs|nuxt|express|koa|fastify|django|flask|spring|springboot|laravel|rails|gin|echo|fiber)\b/gi
        ],
        normalize: (match) => {
          const map = {
            'react': 'React',
            'vue': 'Vue',
            'angular': 'Angular',
            'svelte': 'Svelte',
            'nextjs': 'Next.js',
            'nuxt': 'Nuxt',
            'express': 'Express',
            'koa': 'Koa',
            'django': 'Django',
            'flask': 'Flask',
            'spring': 'Spring',
            'springboot': 'Spring Boot',
            'laravel': 'Laravel',
            'rails': 'Rails',
            'gin': 'Gin',
            'echo': 'Echo'
          };
          return map[match.toLowerCase()] || match;
        }
      }
    };
  }

  /**
   * 初始化同义词
   */
  initSynonyms() {
    return {
      '写': ['编写', '创建', '生成', '实现', '开发'],
      '代码': ['程序', '脚本', '代码片段'],
      '解释': ['说明', '介绍', '讲解', '阐述'],
      '帮助': ['帮忙', '协助', '支持'],
      '问题': ['疑问', '困惑', '难题'],
      '方法': ['方式', '途径', '办法', '手段'],
      '好': ['棒', '优秀', '不错', '厉害', '牛']
    };
  }

  /**
   * 主理解函数
   */
  understand(text, context = {}) {
    const result = {
      originalText: text,
      processedText: text,
      intent: 'unknown',
      confidence: 0,
      entities: {},
      sentiment: 'neutral',
      keywords: [],
      isQuestion: false
    };

    if (!text || text.trim().length === 0) {
      return result;
    }

    // 1. 分词和关键词提取
    result.keywords = this.extractKeywords(text);

    // 2. 意图识别
    const intentResult = this.recognizeIntent(text, context);
    result.intent = intentResult.intent;
    result.confidence = intentResult.confidence;

    // 3. 实体提取
    result.entities = this.extractEntities(text);

    // 4. 情感分析
    result.sentiment = this.analyzeSentiment(text);

    // 5. 是否是问句
    result.isQuestion = this.isQuestion(text);

    return result;
  }

  /**
   * 意图识别
   */
  recognizeIntent(text, context = {}) {
    let bestMatch = { intent: 'unknown', confidence: 0, pattern: null };

    for (const intentDef of this.intentPatterns) {
      for (const pattern of intentDef.patterns) {
        const match = text.match(pattern);
        if (match) {
          // 计算置信度：基于匹配长度和优先级
          const matchRatio = match[0].length / text.length;
          const confidence = Math.min(0.95, matchRatio * 0.5 + intentDef.priority * 0.05);

          if (confidence > bestMatch.confidence) {
            bestMatch = {
              intent: intentDef.intent,
              confidence,
              pattern: pattern.toString(),
              match: match[0]
            };
          }
        }
      }
    }

    // 如果没有匹配到，尝试基于关键词的模糊匹配
    if (bestMatch.confidence < 0.3) {
      const keywordIntent = this.matchByKeywords(text);
      if (keywordIntent.confidence > bestMatch.confidence) {
        bestMatch = keywordIntent;
      }
    }

    return bestMatch;
  }

  /**
   * 基于关键词的意图匹配
   */
  matchByKeywords(text) {
    const keywordIntentMap = {
      'greeting': ['你好', '您好', '嗨', '早上好', '下午好', '晚上好'],
      'code_help': ['代码', '程序', '函数', '编程', '开发', '实现'],
      'explain': ['什么是', '解释', '说明', '介绍', '讲讲'],
      'how_to': ['怎么', '如何', '怎样', '方法', '步骤'],
      'ask_capability': ['你能', '你会', '功能', '能力']
    };

    let bestMatch = { intent: 'unknown', confidence: 0 };

    for (const [intent, keywords] of Object.entries(keywordIntentMap)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          const confidence = 0.4 + (keyword.length / text.length) * 0.3;
          if (confidence > bestMatch.confidence) {
            bestMatch = { intent, confidence };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * 实体提取
   */
  extractEntities(text) {
    const entities = {};

    for (const [entityType, config] of Object.entries(this.entityPatterns)) {
      const found = [];
      
      for (const pattern of config.patterns) {
        const matches = text.match(pattern);
        if (matches) {
          for (const match of matches) {
            const normalized = config.normalize ? config.normalize(match) : match;
            if (!found.includes(normalized)) {
              found.push(normalized);
            }
          }
        }
      }

      if (found.length > 0) {
        entities[entityType] = found.length === 1 ? found[0] : found;
      }
    }

    return entities;
  }

  /**
   * 关键词提取
   */
  extractKeywords(text) {
    // 简单的基于词频的关键词提取
    const words = this.tokenize(text);
    const filtered = words.filter(w => !this.stopWords.has(w) && w.length > 1);
    
    // 统计词频
    const freq = {};
    for (const word of filtered) {
      freq[word] = (freq[word] || 0) + 1;
    }

    // 按词频排序
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * 简单分词
   */
  tokenize(text) {
    // 中文按字符分割，英文按空格分割
    const tokens = [];
    let current = '';
    let isEnglish = false;

    for (const char of text) {
      const isEng = /[a-zA-Z0-9]/.test(char);
      
      if (isEng !== isEnglish && current) {
        if (!isEnglish) {
          // 中文逐字添加
          tokens.push(...current.split(''));
        } else {
          tokens.push(current);
        }
        current = '';
      }
      
      isEnglish = isEng;
      
      if (/[\s\.,!?;:，。！？；：]/.test(char)) {
        if (current) {
          if (!isEnglish) {
            tokens.push(...current.split(''));
          } else {
            tokens.push(current);
          }
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      if (!isEnglish) {
        tokens.push(...current.split(''));
      } else {
        tokens.push(current);
      }
    }

    return tokens;
  }

  /**
   * 情感分析
   */
  analyzeSentiment(text) {
    const positiveWords = ['好', '棒', '优秀', '喜欢', '感谢', '谢谢', '开心', '高兴', '满意', '不错', '厉害', '牛', '赞'];
    const negativeWords = ['差', '烂', '糟糕', '讨厌', '生气', '愤怒', '失望', '不满', '垃圾', '坑', '难用'];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      if (text.includes(word)) positiveCount++;
    }
    for (const word of negativeWords) {
      if (text.includes(word)) negativeCount++;
    }

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * 判断是否是问句
   */
  isQuestion(text) {
    const questionPatterns = [
      /[?？]$/,
      /^(什么|怎么|如何|为什么|哪|谁|几|多少)/,
      /(吗|呢|吧|啊)$/
    ];

    return questionPatterns.some(p => p.test(text));
  }
}

module.exports = NLUEngine;
