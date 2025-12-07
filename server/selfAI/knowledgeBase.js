/**
 * 知识库 - Knowledge Base
 * 
 * 功能：
 * 1. 知识存储 - 结构化知识管理
 * 2. 知识检索 - 基于关键词和语义的检索
 * 3. 知识推理 - 简单的规则推理
 * 4. 动态学习 - 支持添加新知识
 */

class KnowledgeBase {
  constructor() {
    // 知识存储
    this.knowledge = new Map();
    
    // 关键词索引
    this.keywordIndex = new Map();
    
    // 初始化内置知识
    this.initBuiltinKnowledge();
  }

  /**
   * 初始化内置知识
   */
  initBuiltinKnowledge() {
    // ===== 编程知识 =====
    this.add('programming', '什么是变量', 
      '变量是程序中用于存储数据的容器。它有一个名称（标识符）和一个值。在不同的编程语言中，变量的声明方式不同：\n\n' +
      '- **JavaScript**: `let name = "张三"; const age = 25;`\n' +
      '- **Python**: `name = "张三"; age = 25`\n' +
      '- **Java**: `String name = "张三"; int age = 25;`\n\n' +
      '变量可以被读取和修改（除非是常量）。',
      ['变量', '存储', '数据', '声明']
    );

    this.add('programming', '什么是函数',
      '函数是一段可重复使用的代码块，用于执行特定任务。函数可以接收输入（参数）并返回输出（返回值）。\n\n' +
      '**函数的优点**：\n' +
      '1. 代码复用 - 避免重复编写相同代码\n' +
      '2. 模块化 - 将复杂问题分解为小问题\n' +
      '3. 可维护性 - 修改一处即可影响所有调用\n\n' +
      '**示例**：\n```javascript\nfunction greet(name) {\n  return `你好，${name}！`;\n}\nconsole.log(greet("张三")); // 输出：你好，张三！\n```',
      ['函数', '方法', '代码块', '复用']
    );

    this.add('programming', '什么是数组',
      '数组是一种数据结构，用于存储多个相同类型的元素。数组中的元素通过索引（下标）访问，索引通常从0开始。\n\n' +
      '**常见操作**：\n' +
      '- 访问元素：`arr[0]`\n' +
      '- 添加元素：`arr.push(item)`\n' +
      '- 删除元素：`arr.pop()`\n' +
      '- 遍历：`for...of` 或 `forEach`\n\n' +
      '**示例**：\n```javascript\nconst fruits = ["苹果", "香蕉", "橙子"];\nconsole.log(fruits[0]); // 苹果\nfruits.push("葡萄");\nconsole.log(fruits.length); // 4\n```',
      ['数组', '列表', '集合', '索引']
    );

    this.add('programming', '什么是循环',
      '循环是一种控制结构，用于重复执行一段代码，直到满足特定条件。\n\n' +
      '**常见循环类型**：\n' +
      '1. **for循环** - 已知循环次数时使用\n' +
      '2. **while循环** - 条件为真时持续执行\n' +
      '3. **do-while循环** - 至少执行一次\n' +
      '4. **for...of** - 遍历可迭代对象\n\n' +
      '**示例**：\n```javascript\n// for循环\nfor (let i = 0; i < 5; i++) {\n  console.log(i);\n}\n\n// while循环\nlet count = 0;\nwhile (count < 5) {\n  console.log(count);\n  count++;\n}\n```',
      ['循环', 'for', 'while', '遍历', '迭代']
    );

    this.add('programming', '什么是面向对象',
      '面向对象编程（OOP）是一种编程范式，将数据和操作数据的方法组织成"对象"。\n\n' +
      '**四大特性**：\n' +
      '1. **封装** - 将数据和方法包装在类中，隐藏内部实现\n' +
      '2. **继承** - 子类继承父类的属性和方法\n' +
      '3. **多态** - 同一方法在不同对象中有不同实现\n' +
      '4. **抽象** - 提取共同特征，忽略细节\n\n' +
      '**示例**：\n```javascript\nclass Animal {\n  constructor(name) {\n    this.name = name;\n  }\n  speak() {\n    console.log(`${this.name}发出声音`);\n  }\n}\n\nclass Dog extends Animal {\n  speak() {\n    console.log(`${this.name}汪汪叫`);\n  }\n}\n```',
      ['面向对象', 'OOP', '类', '对象', '封装', '继承', '多态']
    );

    this.add('programming', '什么是API',
      'API（Application Programming Interface，应用程序编程接口）是软件系统之间进行交互的接口。\n\n' +
      '**类型**：\n' +
      '1. **Web API** - 通过HTTP协议访问的接口（REST、GraphQL）\n' +
      '2. **库/框架API** - 编程语言或框架提供的接口\n' +
      '3. **操作系统API** - 系统级别的接口\n\n' +
      '**REST API示例**：\n' +
      '- GET /users - 获取用户列表\n' +
      '- POST /users - 创建新用户\n' +
      '- PUT /users/1 - 更新用户1\n' +
      '- DELETE /users/1 - 删除用户1',
      ['API', '接口', 'REST', 'HTTP', 'Web']
    );

    // ===== 技术框架知识 =====
    this.add('framework', 'React是什么',
      'React是由Facebook开发的JavaScript库，用于构建用户界面。\n\n' +
      '**核心特点**：\n' +
      '1. **组件化** - UI拆分为独立可复用的组件\n' +
      '2. **虚拟DOM** - 高效的DOM更新机制\n' +
      '3. **单向数据流** - 数据从父组件流向子组件\n' +
      '4. **JSX语法** - 在JavaScript中编写类HTML代码\n\n' +
      '**示例**：\n```jsx\nfunction Welcome({ name }) {\n  return <h1>你好，{name}！</h1>;\n}\n```',
      ['React', '前端', '组件', 'JavaScript', 'UI']
    );

    this.add('framework', 'Vue是什么',
      'Vue.js是一个渐进式JavaScript框架，用于构建用户界面。\n\n' +
      '**核心特点**：\n' +
      '1. **响应式数据绑定** - 数据变化自动更新视图\n' +
      '2. **组件系统** - 可复用的UI组件\n' +
      '3. **指令系统** - v-if、v-for、v-model等\n' +
      '4. **渐进式** - 可以逐步采用\n\n' +
      '**示例**：\n```vue\n<template>\n  <h1>{{ message }}</h1>\n</template>\n<script>\nexport default {\n  data() {\n    return { message: "你好，Vue！" };\n  }\n};\n</script>\n```',
      ['Vue', '前端', '响应式', 'JavaScript', 'MVVM']
    );

    this.add('framework', 'Node.js是什么',
      'Node.js是一个基于Chrome V8引擎的JavaScript运行时环境，让JavaScript可以在服务器端运行。\n\n' +
      '**核心特点**：\n' +
      '1. **事件驱动** - 基于事件循环的非阻塞I/O\n' +
      '2. **单线程** - 主线程单线程，通过异步处理并发\n' +
      '3. **NPM生态** - 丰富的包管理系统\n' +
      '4. **跨平台** - 支持Windows、Linux、macOS\n\n' +
      '**适用场景**：\n' +
      '- Web服务器\n' +
      '- API服务\n' +
      '- 实时应用（聊天、游戏）\n' +
      '- 命令行工具',
      ['Node.js', '后端', '服务器', 'JavaScript', 'NPM']
    );

    // ===== 通用知识 =====
    this.add('general', '什么是人工智能',
      '人工智能（AI）是计算机科学的一个分支，致力于创建能够模拟人类智能的系统。\n\n' +
      '**主要领域**：\n' +
      '1. **机器学习** - 从数据中学习模式\n' +
      '2. **深度学习** - 使用神经网络的机器学习\n' +
      '3. **自然语言处理** - 理解和生成人类语言\n' +
      '4. **计算机视觉** - 理解图像和视频\n' +
      '5. **机器人学** - 智能机器人系统\n\n' +
      '**应用场景**：语音助手、推荐系统、自动驾驶、医疗诊断等。',
      ['人工智能', 'AI', '机器学习', '深度学习', 'NLP']
    );

    this.add('general', '什么是机器学习',
      '机器学习是人工智能的一个子领域，让计算机能够从数据中自动学习和改进，而无需明确编程。\n\n' +
      '**三种主要类型**：\n' +
      '1. **监督学习** - 从标注数据中学习（分类、回归）\n' +
      '2. **无监督学习** - 从未标注数据中发现模式（聚类）\n' +
      '3. **强化学习** - 通过与环境交互学习（游戏AI）\n\n' +
      '**常用算法**：线性回归、决策树、随机森林、神经网络、SVM等。',
      ['机器学习', 'ML', '监督学习', '无监督学习', '算法']
    );

    // ===== 关于智器云助手 =====
    this.add('about', '你是谁',
      '我是**智器云助手**，一个完全自主研发的AI对话系统。\n\n' +
      '**我的特点**：\n' +
      '- 🧠 自主NLU引擎 - 理解您的意图和需求\n' +
      '- 📚 内置知识库 - 涵盖编程、技术、通用知识\n' +
      '- 🔧 技能系统 - 计算、代码生成、翻译等\n' +
      '- 💬 多轮对话 - 记住上下文，连贯交流\n\n' +
      '我不依赖外部大模型API，所有智能都来自自主实现的算法！',
      ['你是谁', '介绍', '智器云', '助手']
    );

    this.add('about', '你能做什么',
      '我可以帮您完成以下任务：\n\n' +
      '**💻 编程帮助**\n' +
      '- 解释编程概念（变量、函数、循环等）\n' +
      '- 生成代码片段\n' +
      '- 解答技术问题\n\n' +
      '**📖 知识问答**\n' +
      '- 解释技术术语\n' +
      '- 介绍框架和工具\n' +
      '- 回答通用问题\n\n' +
      '**🔧 实用工具**\n' +
      '- 数学计算\n' +
      '- 日期时间查询\n' +
      '- 简单翻译\n\n' +
      '**💬 日常对话**\n' +
      '- 闲聊交流\n' +
      '- 回答各种问题\n\n' +
      '试着问我一个问题吧！',
      ['功能', '能力', '做什么', '帮助']
    );

    // ===== 比较类知识 =====
    this.add('comparison', 'React和Vue的区别',
      '**React vs Vue 对比**：\n\n' +
      '| 特性 | React | Vue |\n' +
      '|------|-------|-----|\n' +
      '| 开发者 | Facebook | 尤雨溪 |\n' +
      '| 类型 | 库 | 框架 |\n' +
      '| 语法 | JSX | 模板/JSX |\n' +
      '| 数据流 | 单向 | 双向绑定 |\n' +
      '| 学习曲线 | 较陡 | 较平缓 |\n' +
      '| 生态系统 | 丰富 | 完整 |\n' +
      '| 适用场景 | 大型应用 | 中小型应用 |\n\n' +
      '**选择建议**：\n' +
      '- 团队熟悉JavaScript → React\n' +
      '- 快速上手、渐进式 → Vue\n' +
      '- 大型企业应用 → React\n' +
      '- 中小型项目 → Vue',
      ['React', 'Vue', '区别', '对比', '比较']
    );

    this.add('comparison', 'let和const的区别',
      '**let vs const vs var 对比**：\n\n' +
      '| 特性 | var | let | const |\n' +
      '|------|-----|-----|-------|\n' +
      '| 作用域 | 函数作用域 | 块作用域 | 块作用域 |\n' +
      '| 重复声明 | 允许 | 不允许 | 不允许 |\n' +
      '| 重新赋值 | 允许 | 允许 | 不允许 |\n' +
      '| 变量提升 | 是 | 否 | 否 |\n\n' +
      '**使用建议**：\n' +
      '- 默认使用 `const`\n' +
      '- 需要重新赋值时使用 `let`\n' +
      '- 避免使用 `var`',
      ['let', 'const', 'var', '区别', '变量']
    );

    console.log(`📚 知识库初始化完成，共 ${this.knowledge.size} 条知识`);
  }

  /**
   * 添加知识
   */
  add(category, question, answer, keywords = []) {
    const id = `${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const entry = {
      id,
      category,
      question,
      answer,
      keywords: [...keywords, ...this.extractKeywords(question)],
      createdAt: Date.now()
    };

    this.knowledge.set(id, entry);

    // 建立关键词索引
    for (const keyword of entry.keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      if (!this.keywordIndex.has(normalizedKeyword)) {
        this.keywordIndex.set(normalizedKeyword, new Set());
      }
      this.keywordIndex.get(normalizedKeyword).add(id);
    }

    return id;
  }

  /**
   * 查询知识
   */
  query(queryText, entities = {}) {
    const results = [];
    const queryKeywords = this.extractKeywords(queryText.toLowerCase());

    // 1. 基于关键词匹配
    const candidateIds = new Set();
    for (const keyword of queryKeywords) {
      const ids = this.keywordIndex.get(keyword);
      if (ids) {
        for (const id of ids) {
          candidateIds.add(id);
        }
      }
    }

    // 2. 计算相关度得分
    for (const id of candidateIds) {
      const entry = this.knowledge.get(id);
      if (!entry) continue;

      const score = this.calculateRelevance(queryText, queryKeywords, entry);
      if (score > 0.1) {
        results.push({ ...entry, score });
      }
    }

    // 3. 如果关键词匹配不到，尝试模糊匹配
    if (results.length === 0) {
      for (const [id, entry] of this.knowledge) {
        const score = this.fuzzyMatch(queryText, entry);
        if (score > 0.2) {
          results.push({ ...entry, score });
        }
      }
    }

    // 4. 按得分排序
    results.sort((a, b) => b.score - a.score);

    // 5. 返回最佳结果
    if (results.length > 0) {
      return {
        found: true,
        answer: results[0].answer,
        confidence: results[0].score,
        category: results[0].category,
        relatedQuestions: results.slice(1, 4).map(r => r.question)
      };
    }

    return {
      found: false,
      answer: null,
      confidence: 0
    };
  }

  /**
   * 计算相关度
   */
  calculateRelevance(queryText, queryKeywords, entry) {
    let score = 0;

    // 关键词匹配得分
    const entryKeywords = new Set(entry.keywords.map(k => k.toLowerCase()));
    let matchCount = 0;
    for (const keyword of queryKeywords) {
      if (entryKeywords.has(keyword)) {
        matchCount++;
      }
    }
    score += (matchCount / Math.max(queryKeywords.length, 1)) * 0.5;

    // 问题相似度
    const questionSimilarity = this.stringSimilarity(queryText.toLowerCase(), entry.question.toLowerCase());
    score += questionSimilarity * 0.5;

    return Math.min(score, 1);
  }

  /**
   * 模糊匹配
   */
  fuzzyMatch(queryText, entry) {
    const query = queryText.toLowerCase();
    const question = entry.question.toLowerCase();
    const answer = entry.answer.toLowerCase();

    // 检查查询是否包含在问题或答案中
    if (question.includes(query) || query.includes(question)) {
      return 0.6;
    }

    // 检查关键词
    for (const keyword of entry.keywords) {
      if (query.includes(keyword.toLowerCase())) {
        return 0.4;
      }
    }

    return this.stringSimilarity(query, question) * 0.3;
  }

  /**
   * 字符串相似度（简化的编辑距离）
   */
  stringSimilarity(s1, s2) {
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // 使用Jaccard相似度
    const set1 = new Set(s1.split(''));
    const set2 = new Set(s2.split(''));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * 提取关键词
   */
  extractKeywords(text) {
    const stopWords = new Set(['的', '是', '在', '了', '和', '与', '或', '什么', '怎么', '如何', '为什么', '吗', '呢']);
    const words = text.split(/[\s,，.。!！?？;；:：、]+/);
    return words.filter(w => w.length > 1 && !stopWords.has(w));
  }

  /**
   * 获取所有分类
   */
  getCategories() {
    const categories = new Set();
    for (const entry of this.knowledge.values()) {
      categories.add(entry.category);
    }
    return Array.from(categories);
  }

  /**
   * 获取分类下的知识
   */
  getByCategory(category) {
    const results = [];
    for (const entry of this.knowledge.values()) {
      if (entry.category === category) {
        results.push(entry);
      }
    }
    return results;
  }
}

module.exports = KnowledgeBase;
