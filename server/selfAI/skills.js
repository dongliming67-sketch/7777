/**
 * 技能管理器 - Skill Manager
 * 
 * 功能：
 * 1. 技能注册 - 动态注册新技能
 * 2. 技能执行 - 执行具体技能
 * 3. 内置技能 - 计算器、日期时间、代码生成等
 */

class SkillManager {
  constructor() {
    this.skills = new Map();
    
    // 注册内置技能
    this.registerBuiltinSkills();
  }

  /**
   * 注册内置技能
   */
  registerBuiltinSkills() {
    // 计算器技能
    this.register('calculator', this.calculatorSkill.bind(this));
    
    // 日期时间技能
    this.register('datetime', this.datetimeSkill.bind(this));
    
    // 代码生成技能
    this.register('code_generator', this.codeGeneratorSkill.bind(this));
    
    // 翻译技能
    this.register('translator', this.translatorSkill.bind(this));
    
    // 总结技能
    this.register('summarizer', this.summarizerSkill.bind(this));

    console.log(`🔧 技能管理器初始化完成，共 ${this.skills.size} 个技能`);
  }

  /**
   * 注册技能
   */
  register(name, handler) {
    this.skills.set(name, handler);
  }

  /**
   * 执行技能
   */
  async execute(skillName, params, context) {
    const skill = this.skills.get(skillName);
    
    if (!skill) {
      return {
        success: false,
        error: `未找到技能: ${skillName}`
      };
    }

    try {
      const result = await skill(params, context);
      return {
        success: true,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 计算器技能
   */
  calculatorSkill(params, context) {
    const { expression } = params;
    
    if (!expression) {
      return { success: false, error: '请提供计算表达式' };
    }

    try {
      // 提取数学表达式
      const mathExpr = this.extractMathExpression(expression);
      
      if (!mathExpr) {
        return { success: false, error: '无法识别数学表达式' };
      }

      // 安全计算（不使用eval）
      const result = this.safeCalculate(mathExpr);
      
      return {
        result,
        expression: mathExpr
      };
    } catch (error) {
      return { success: false, error: '计算出错: ' + error.message };
    }
  }

  /**
   * 提取数学表达式
   */
  extractMathExpression(text) {
    // 替换中文运算符
    let expr = text
      .replace(/加/g, '+')
      .replace(/减/g, '-')
      .replace(/乘/g, '*')
      .replace(/除/g, '/')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/（/g, '(')
      .replace(/）/g, ')');

    // 提取数学表达式
    const match = expr.match(/[\d\+\-\*\/\(\)\.\s]+/);
    if (match) {
      return match[0].trim();
    }
    return null;
  }

  /**
   * 安全计算（简单的表达式解析器）
   */
  safeCalculate(expr) {
    // 移除空格
    expr = expr.replace(/\s/g, '');
    
    // 验证表达式只包含允许的字符
    if (!/^[\d\+\-\*\/\(\)\.]+$/.test(expr)) {
      throw new Error('表达式包含非法字符');
    }

    // 使用Function构造器（比eval稍安全）
    // 只允许数学运算
    try {
      const result = new Function(`return ${expr}`)();
      
      if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
        throw new Error('计算结果无效');
      }
      
      // 格式化结果
      return Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
    } catch (e) {
      throw new Error('表达式格式错误');
    }
  }

  /**
   * 日期时间技能
   */
  datetimeSkill(params, context) {
    const now = new Date();
    
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekDay = weekDays[now.getDay()];
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    return {
      datetime: `${year}年${month}月${day}日 星期${weekDay} ${hours}:${minutes}:${seconds}`,
      date: `${year}年${month}月${day}日`,
      time: `${hours}:${minutes}:${seconds}`,
      weekDay: `星期${weekDay}`,
      timestamp: now.getTime()
    };
  }

  /**
   * 代码生成技能
   */
  codeGeneratorSkill(params, context) {
    const { task_description, programming_language } = params;
    const lang = programming_language || 'JavaScript';

    // 代码模板库
    const codeTemplates = {
      // 排序相关
      '排序': {
        'JavaScript': `// 数组排序示例
const numbers = [64, 34, 25, 12, 22, 11, 90];

// 升序排序
const ascending = [...numbers].sort((a, b) => a - b);
console.log('升序:', ascending);

// 降序排序
const descending = [...numbers].sort((a, b) => b - a);
console.log('降序:', descending);

// 冒泡排序实现
function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
  return arr;
}`,
        'Python': `# 数组排序示例
numbers = [64, 34, 25, 12, 22, 11, 90]

# 升序排序
ascending = sorted(numbers)
print('升序:', ascending)

# 降序排序
descending = sorted(numbers, reverse=True)
print('降序:', descending)

# 冒泡排序实现
def bubble_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr`
      },

      // Hello World
      'hello': {
        'JavaScript': `// Hello World 示例
console.log('Hello, World!');

// 带参数的问候函数
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('智器云'));`,
        'Python': `# Hello World 示例
print('Hello, World!')

# 带参数的问候函数
def greet(name):
    return f'Hello, {name}!'

print(greet('智器云'))`,
        'Java': `// Hello World 示例
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        // 带参数的问候
        System.out.println(greet("智器云"));
    }
    
    public static String greet(String name) {
        return "Hello, " + name + "!";
    }
}`
      },

      // 循环
      '循环': {
        'JavaScript': `// 循环示例

// for 循环
console.log('for 循环:');
for (let i = 1; i <= 5; i++) {
  console.log(\`第 \${i} 次循环\`);
}

// while 循环
console.log('\\nwhile 循环:');
let count = 1;
while (count <= 5) {
  console.log(\`计数: \${count}\`);
  count++;
}

// for...of 遍历数组
console.log('\\n遍历数组:');
const fruits = ['苹果', '香蕉', '橙子'];
for (const fruit of fruits) {
  console.log(fruit);
}`,
        'Python': `# 循环示例

# for 循环
print('for 循环:')
for i in range(1, 6):
    print(f'第 {i} 次循环')

# while 循环
print('\\nwhile 循环:')
count = 1
while count <= 5:
    print(f'计数: {count}')
    count += 1

# 遍历列表
print('\\n遍历列表:')
fruits = ['苹果', '香蕉', '橙子']
for fruit in fruits:
    print(fruit)`
      },

      // 函数
      '函数': {
        'JavaScript': `// 函数定义示例

// 普通函数
function add(a, b) {
  return a + b;
}

// 箭头函数
const multiply = (a, b) => a * b;

// 带默认参数的函数
function greet(name = '访客') {
  return \`你好，\${name}！\`;
}

// 异步函数
async function fetchData(url) {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error('获取数据失败:', error);
  }
}

// 使用示例
console.log(add(2, 3));        // 5
console.log(multiply(4, 5));   // 20
console.log(greet());          // 你好，访客！
console.log(greet('张三'));    // 你好，张三！`,
        'Python': `# 函数定义示例

# 普通函数
def add(a, b):
    return a + b

# 带默认参数的函数
def greet(name='访客'):
    return f'你好，{name}！'

# Lambda 函数
multiply = lambda a, b: a * b

# 异步函数
import asyncio

async def fetch_data(url):
    # 模拟异步操作
    await asyncio.sleep(1)
    return {'data': 'result'}

# 使用示例
print(add(2, 3))        # 5
print(multiply(4, 5))   # 20
print(greet())          # 你好，访客！
print(greet('张三'))    # 你好，张三！`
      },

      // 类
      '类': {
        'JavaScript': `// 类定义示例

class Person {
  constructor(name, age) {
    this.name = name;
    this.age = age;
  }

  // 实例方法
  introduce() {
    return \`我叫\${this.name}，今年\${this.age}岁。\`;
  }

  // 静态方法
  static create(name, age) {
    return new Person(name, age);
  }
}

// 继承
class Student extends Person {
  constructor(name, age, grade) {
    super(name, age);
    this.grade = grade;
  }

  introduce() {
    return \`\${super.introduce()}我是\${this.grade}年级的学生。\`;
  }
}

// 使用示例
const person = new Person('张三', 25);
console.log(person.introduce());

const student = new Student('李四', 18, '高三');
console.log(student.introduce());`,
        'Python': `# 类定义示例

class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age
    
    # 实例方法
    def introduce(self):
        return f'我叫{self.name}，今年{self.age}岁。'
    
    # 类方法
    @classmethod
    def create(cls, name, age):
        return cls(name, age)

# 继承
class Student(Person):
    def __init__(self, name, age, grade):
        super().__init__(name, age)
        self.grade = grade
    
    def introduce(self):
        return f'{super().introduce()}我是{self.grade}年级的学生。'

# 使用示例
person = Person('张三', 25)
print(person.introduce())

student = Student('李四', 18, '高三')
print(student.introduce())`
      },

      // API请求
      'api': {
        'JavaScript': `// API 请求示例

// 使用 fetch
async function fetchAPI(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('请求失败:', error);
    throw error;
  }
}

// POST 请求
async function postData(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return response.json();
}

// 使用示例
// fetchAPI('https://api.example.com/data')
//   .then(data => console.log(data));`,
        'Python': `# API 请求示例
import requests

# GET 请求
def fetch_api(url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f'请求失败: {e}')
        raise

# POST 请求
def post_data(url, data):
    response = requests.post(url, json=data)
    return response.json()

# 使用示例
# data = fetch_api('https://api.example.com/data')
# print(data)`
      }
    };

    // 查找匹配的模板
    let code = null;
    const taskLower = task_description?.toLowerCase() || '';

    for (const [keyword, templates] of Object.entries(codeTemplates)) {
      if (taskLower.includes(keyword.toLowerCase())) {
        code = templates[lang] || templates['JavaScript'];
        break;
      }
    }

    // 如果没找到匹配的模板，返回通用示例
    if (!code) {
      code = `// ${lang} 代码示例
// 根据您的需求: ${task_description}

// 这是一个基础模板，请根据具体需求修改
function main() {
  console.log('Hello from 智器云助手!');
  // TODO: 在这里实现您的功能
}

main();`;
    }

    return {
      code: '```' + lang.toLowerCase() + '\n' + code + '\n```',
      language: lang
    };
  }

  /**
   * 翻译技能（简单的词典翻译）
   */
  translatorSkill(params, context) {
    const { source_text, target_language } = params;
    
    // 简单的翻译词典
    const dictionary = {
      '你好': { '英文': 'Hello', '日文': 'こんにちは' },
      '谢谢': { '英文': 'Thank you', '日文': 'ありがとう' },
      '再见': { '英文': 'Goodbye', '日文': 'さようなら' },
      '早上好': { '英文': 'Good morning', '日文': 'おはようございます' },
      '晚上好': { '英文': 'Good evening', '日文': 'こんばんは' },
      '对不起': { '英文': 'Sorry', '日文': 'すみません' },
      '是': { '英文': 'Yes', '日文': 'はい' },
      '不是': { '英文': 'No', '日文': 'いいえ' }
    };

    const translation = dictionary[source_text]?.[target_language || '英文'];
    
    if (translation) {
      return { translation };
    }

    return {
      translation: `抱歉，我目前的词典中没有"${source_text}"的${target_language || '英文'}翻译。作为自研AI，我的翻译能力还在扩充中。`
    };
  }

  /**
   * 总结技能
   */
  summarizerSkill(params, context) {
    const { text } = params;
    
    if (!text || text.length < 50) {
      return {
        result: '文本太短，无需总结。'
      };
    }

    // 简单的提取式总结：取前几句
    const sentences = text.split(/[。！？.!?]+/).filter(s => s.trim().length > 0);
    const summary = sentences.slice(0, 3).join('。') + '。';

    return {
      result: `**摘要**：\n${summary}\n\n（原文共${text.length}字，提取了前${Math.min(3, sentences.length)}句作为摘要）`
    };
  }
}

module.exports = SkillManager;
