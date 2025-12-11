/**
 * 编程智能体 - 代码生成服务
 * 根据需求描述或文档内容，智能生成前端代码
 * 
 * 核心策略：大纲驱动 + 10步分模块生成 + 智能整合
 * 支持：HTML模板上传、参考代码读取
 */

// ==================== 配置 ====================
const GENERATION_CONFIG = {
  // 大纲驱动的分步生成配置
  enableOutlineDriven: true,
  totalSteps: 10,
  minCodeLength: 2000, // 最小代码行数
  targetCodeLength: 3000, // 目标代码行数
  
  // 10步分模块生成策略（每步单独调用AI）
  generationSteps: [
    { id: 'outline', name: '生成代码大纲', target: 'outline', lines: 0 },
    { id: 'css_variables', name: 'CSS变量和主题', target: 'css', lines: 80 },
    { id: 'css_layout', name: 'CSS布局系统', target: 'css', lines: 120 },
    { id: 'css_components', name: 'CSS组件样式', target: 'css', lines: 200 },
    { id: 'html_structure', name: 'HTML页面结构', target: 'html', lines: 300 },
    { id: 'js_data', name: 'JS数据层', target: 'js', lines: 200 },
    { id: 'js_render', name: 'JS渲染函数', target: 'js', lines: 250 },
    { id: 'js_crud', name: 'JS增删改查', target: 'js', lines: 300 },
    { id: 'js_advanced', name: 'JS高级功能', target: 'js', lines: 250 },
    { id: 'integrate', name: '整合与优化', target: 'full', lines: 0 }
  ],
  
  // 各模块目标行数
  targetLines: {
    css: 400,      // CSS总计400行
    html: 300,     // HTML总计300行  
    js: 1000,      // JavaScript总计1000行
    total: 2500    // 总计2500行
  },
  
  // API配置
  api: {
    maxTokens: 16000,
    temperature: 0.7
  }
};

// ==================== 需求分析函数 ====================

/**
 * 分析需求文档，提取关键信息用于生成真实数据
 */
function analyzeRequirementForData(requirement, documentContent) {
  const analysis = {
    projectName: '',
    projectType: '',
    entities: [],       // 数据实体
    fields: [],         // 字段列表
    sampleData: [],     // 示例数据
    features: [],       // 功能特性
    businessRules: []   // 业务规则
  };

  const text = (requirement + ' ' + (documentContent || '')).toLowerCase();

  // 识别项目类型
  if (text.includes('用户') || text.includes('会员') || text.includes('员工')) {
    analysis.entities.push({ name: '用户', fields: ['姓名', '邮箱', '电话', '角色', '状态', '注册时间'] });
  }
  if (text.includes('商品') || text.includes('产品') || text.includes('货物')) {
    analysis.entities.push({ name: '商品', fields: ['名称', '价格', '库存', '分类', '状态', '创建时间'] });
  }
  if (text.includes('订单') || text.includes('交易') || text.includes('购买')) {
    analysis.entities.push({ name: '订单', fields: ['订单号', '客户', '金额', '状态', '下单时间', '备注'] });
  }
  if (text.includes('文章') || text.includes('新闻') || text.includes('内容')) {
    analysis.entities.push({ name: '文章', fields: ['标题', '作者', '分类', '状态', '发布时间', '阅读量'] });
  }
  if (text.includes('设备') || text.includes('资产') || text.includes('硬件')) {
    analysis.entities.push({ name: '设备', fields: ['名称', '型号', '位置', '状态', '购入时间', '负责人'] });
  }
  if (text.includes('任务') || text.includes('工单') || text.includes('待办')) {
    analysis.entities.push({ name: '任务', fields: ['标题', '负责人', '优先级', '状态', '截止时间', '进度'] });
  }

  // 如果没有识别到实体，使用通用实体
  if (analysis.entities.length === 0) {
    analysis.entities.push({ name: '数据', fields: ['名称', '描述', '类型', '状态', '创建时间', '操作人'] });
  }

  // 识别功能特性
  if (text.includes('搜索') || text.includes('查询')) analysis.features.push('搜索');
  if (text.includes('筛选') || text.includes('过滤')) analysis.features.push('筛选');
  if (text.includes('添加') || text.includes('新增') || text.includes('创建')) analysis.features.push('添加');
  if (text.includes('编辑') || text.includes('修改')) analysis.features.push('编辑');
  if (text.includes('删除') || text.includes('移除')) analysis.features.push('删除');
  if (text.includes('导出') || text.includes('下载')) analysis.features.push('导出');
  if (text.includes('统计') || text.includes('报表') || text.includes('图表')) analysis.features.push('统计');
  if (text.includes('分页')) analysis.features.push('分页');

  return analysis;
}

/**
 * 根据分析结果生成示例数据
 */
function generateSampleDataFromAnalysis(analysis) {
  const entity = analysis.entities[0] || { name: '数据', fields: ['名称', '描述', '状态'] };
  const sampleData = [];
  
  // 生成15条示例数据
  const names = ['张三', '李四', '王五', '赵六', '孙七', '周八', '吴九', '郑十', '陈一', '林二', '黄三', '刘四', '杨五', '马六', '朱七'];
  const statuses = ['活跃', '正常', '待处理', '已完成', '进行中'];
  const roles = ['管理员', '普通用户', '编辑', 'VIP用户', '访客'];
  
  for (let i = 0; i < 15; i++) {
    sampleData.push({
      id: i + 1,
      name: names[i],
      field1: `数据${i + 1}`,
      field2: roles[i % 5],
      status: statuses[i % 5],
      createTime: `2024-0${(i % 9) + 1}-${String(i + 10).padStart(2, '0')}`
    });
  }
  
  return { entity, sampleData };
}

// ==================== 系统提示词 ====================

const CODE_GENERATOR_SYSTEM_PROMPT = `你是一位资深的全栈开发工程师和前端架构师。你的任务是根据用户的需求描述，生成高质量、可运行的前端代码。

## 你的能力
1. 精通 React、Vue、原生 HTML/CSS/JavaScript
2. 熟练使用 Tailwind CSS、Ant Design、Material UI、Bootstrap 等 UI 框架
3. 擅长设计现代化、美观、响应式的用户界面
4. 能够编写清晰、可维护、符合最佳实践的代码
5. 理解业务需求，能够将需求转化为具体的功能实现

## 代码要求
1. **完整性**：生成的代码必须完整、可直接运行，不能有省略或注释占位
2. **美观性**：界面设计要现代、美观、专业，使用合适的颜色、间距、动画
3. **响应式**：支持不同屏幕尺寸的适配
4. **交互性**：包含合理的交互效果、加载状态、错误处理
5. **代码质量**：代码结构清晰、命名规范、有适当的注释

## 输出格式
你需要输出完整的代码，使用以下格式包裹：

\`\`\`html
<!-- HTML代码 -->
\`\`\`

\`\`\`css
/* CSS代码 */
\`\`\`

\`\`\`javascript
// JavaScript代码
\`\`\`

\`\`\`jsx
// React组件代码
\`\`\`

## 重要提醒
- 代码量要充足，功能要完整
- 不要使用占位符或省略号
- 确保所有功能都有实际实现
- 添加适当的模拟数据以展示效果`;

// ==================== 代码生成函数 ====================

/**
 * 生成代码的主函数
 */
async function generateCode(client, requirement, documentContent, options, chatHistory) {
  const { projectType, uiFramework, includeBackend } = options;
  
  console.log('\n🚀 ========== 代码生成开始 ==========');
  console.log(`📋 项目类型: ${projectType}`);
  console.log(`🎨 UI框架: ${uiFramework}`);
  console.log(`📝 需求长度: ${requirement?.length || 0} 字符`);
  console.log(`📄 文档长度: ${documentContent?.length || 0} 字符`);

  // 构建增强提示词
  const enhancedPrompt = buildEnhancedPrompt(requirement, documentContent, options, chatHistory);
  
  return {
    prompt: enhancedPrompt,
    systemPrompt: CODE_GENERATOR_SYSTEM_PROMPT
  };
}

/**
 * 构建增强提示词
 */
function buildEnhancedPrompt(requirement, documentContent, options, chatHistory) {
  const { projectType, uiFramework, includeBackend } = options;

  let prompt = `## 用户需求\n${requirement || '根据文档内容生成相应的前端界面'}\n\n`;

  // 添加文档内容
  if (documentContent) {
    prompt += `## 需求文档内容\n${documentContent.slice(0, 8000)}\n\n`;
  }

  // 项目配置
  prompt += `## 项目配置
- **项目类型**: ${projectType === 'react' ? 'React (函数组件 + Hooks)' : projectType === 'vue' ? 'Vue 3 (组合式API)' : '原生 HTML/CSS/JavaScript'}
- **UI框架**: ${getUIFrameworkDescription(uiFramework)}
- **是否包含后端**: ${includeBackend ? '是，需要生成模拟API和数据处理逻辑' : '否，仅前端'}

`;

  // 根据项目类型添加特定要求
  if (projectType === 'react') {
    prompt += `## React 代码要求
1. 使用函数组件和 React Hooks (useState, useEffect, useCallback等)
2. 组件结构清晰，逻辑分离
3. 状态管理合理，必要时使用 useReducer 或 Context
4. 使用 ${uiFramework === 'tailwind' ? 'Tailwind CSS' : uiFramework === 'antd' ? 'Ant Design' : 'Material UI'} 进行样式设计
5. 添加必要的类型注释
6. 包含加载状态、错误处理、空状态等边界情况

## 输出要求
请生成一个完整的 React 组件，代码量要充足（至少300行），功能要完整。

示例结构：
\`\`\`jsx
import React, { useState, useEffect, useCallback } from 'react';

function App() {
  // 状态定义
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 数据获取
  useEffect(() => {
    // 模拟数据加载
  }, []);
  
  // 事件处理函数
  const handleAction = useCallback(() => {
    // 处理逻辑
  }, []);
  
  // 渲染
  return (
    <div className="...">
      {/* 完整的界面结构 */}
    </div>
  );
}

export default App;
\`\`\`

`;
  } else if (projectType === 'vue') {
    prompt += `## Vue 代码要求
1. 使用 Vue 3 组合式 API (setup, ref, reactive, computed等)
2. 组件结构清晰
3. 使用 ${uiFramework} 进行样式设计
4. 包含完整的逻辑实现

`;
  } else {
    prompt += `## HTML/CSS/JavaScript 代码要求
1. 使用现代 ES6+ 语法
2. CSS 使用 Flexbox 或 Grid 布局
3. 适当使用 CSS 动画和过渡效果
4. JavaScript 代码结构清晰，使用模块化思维
5. 生成一个完整的 HTML 文件，包含内联 CSS 和 JavaScript

`;
  }

  // 添加通用的UI设计要求
  prompt += `## UI 设计要求
1. **配色方案**: 使用现代、专业的配色，主色调可以是蓝色/紫色/绿色系
2. **布局**: 
   - 使用清晰的页面结构（头部导航、侧边栏、主内容区、底部等）
   - 合理的间距和留白
   - 响应式设计，适配不同屏幕
3. **组件**: 
   - 现代化的卡片设计
   - 漂亮的按钮和表单元素
   - 合适的图标（可使用 Lucide React 或 Font Awesome）
4. **交互**:
   - 悬停效果
   - 点击反馈
   - 加载动画
   - 过渡效果
5. **细节**:
   - 圆角（rounded-lg, rounded-xl）
   - 阴影（shadow-md, shadow-lg）
   - 渐变背景
   - 微妙的边框

## 模拟数据要求
- 提供足够的模拟数据以展示界面效果
- 数据要符合实际业务场景
- 至少包含 5-10 条数据记录

## 最终要求
生成的代码必须：
1. 完整可运行，不能有任何省略
2. 代码量充足，至少 300-500 行
3. 功能完整，所有按钮和交互都有实际实现
4. 界面美观，符合现代设计标准
5. 包含详细注释说明

请开始生成代码：`;

  return prompt;
}

/**
 * 获取UI框架描述
 */
function getUIFrameworkDescription(framework) {
  const descriptions = {
    tailwind: 'Tailwind CSS - 使用 utility-first 的类名进行样式设计',
    antd: 'Ant Design - 使用 antd 组件库',
    material: 'Material UI - 使用 @mui/material 组件库',
    bootstrap: 'Bootstrap 5 - 使用 Bootstrap 类名和组件'
  };
  return descriptions[framework] || framework;
}

/**
 * 解析AI响应中的代码块
 */
function parseCodeBlocks(responseText) {
  const codeBlocks = {
    html: '',
    css: '',
    javascript: '',
    react: '',
    vue: '',
    fullCode: ''
  };

  // 提取 React/JSX 代码
  const jsxMatch = responseText.match(/```(?:jsx|react|javascript)\n([\s\S]*?)```/g);
  if (jsxMatch) {
    const allJsx = jsxMatch.map(m => m.replace(/```(?:jsx|react|javascript)\n/, '').replace(/```$/, '')).join('\n\n');
    codeBlocks.react = allJsx;
    codeBlocks.javascript = allJsx;
  }

  // 提取 HTML 代码
  const htmlMatch = responseText.match(/```html\n([\s\S]*?)```/);
  if (htmlMatch) {
    codeBlocks.html = htmlMatch[1];
  }

  // 提取 CSS 代码
  const cssMatch = responseText.match(/```css\n([\s\S]*?)```/);
  if (cssMatch) {
    codeBlocks.css = cssMatch[1];
  }

  // 提取 Vue 代码
  const vueMatch = responseText.match(/```vue\n([\s\S]*?)```/);
  if (vueMatch) {
    codeBlocks.vue = vueMatch[1];
  }

  // 构建完整代码
  if (codeBlocks.html) {
    codeBlocks.fullCode = codeBlocks.html;
  } else if (codeBlocks.react) {
    codeBlocks.fullCode = buildFullReactCode(codeBlocks);
  }

  return codeBlocks;
}

/**
 * 构建完整的React代码（包含HTML包装）
 */
function buildFullReactCode(codeBlocks) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React App</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    ${codeBlocks.css || ''}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${codeBlocks.react}
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
  </script>
</body>
</html>`;
}

/**
 * 修改代码的函数
 */
async function modifyCode(client, modification, currentCode, options, chatHistory) {
  const { projectType, uiFramework } = options;
  
  console.log('\n🔧 ========== 代码修改开始 ==========');
  console.log(`📝 修改需求: ${modification.slice(0, 100)}...`);

  const prompt = `## 当前代码
\`\`\`${projectType === 'react' ? 'jsx' : projectType === 'vue' ? 'vue' : 'html'}
${currentCode.react || currentCode.fullCode || currentCode.html}
\`\`\`

## 修改需求
${modification}

## 要求
1. 保持原有代码的整体结构和风格
2. 只修改需要改动的部分
3. 确保修改后的代码完整可运行
4. 如果需要添加新功能，要与现有代码无缝集成
5. 输出完整的修改后代码，不要使用省略号

请输出修改后的完整代码：`;

  return {
    prompt,
    systemPrompt: `你是一位专业的前端开发工程师。你的任务是根据用户的修改需求，对现有代码进行调整。
    
要求：
1. 理解用户的修改意图
2. 精确修改相关代码
3. 保持代码的整体结构和风格
4. 确保修改后的代码完整可运行
5. 输出完整代码，不要省略任何部分`
  };
}

// ==================== 快速模板生成 ====================

/**
 * 根据需求类型生成快速模板
 */
function getQuickTemplate(requirement, projectType, uiFramework) {
  const keywords = requirement.toLowerCase();
  
  // 登录页面
  if (keywords.includes('登录') || keywords.includes('login')) {
    return generateLoginTemplate(projectType, uiFramework);
  }
  
  // 注册页面
  if (keywords.includes('注册') || keywords.includes('register') || keywords.includes('signup')) {
    return generateRegisterTemplate(projectType, uiFramework);
  }
  
  // 列表页面
  if (keywords.includes('列表') || keywords.includes('list') || keywords.includes('表格')) {
    return generateListTemplate(projectType, uiFramework);
  }
  
  // 仪表盘
  if (keywords.includes('仪表盘') || keywords.includes('dashboard') || keywords.includes('看板')) {
    return generateDashboardTemplate(projectType, uiFramework);
  }
  
  // 表单
  if (keywords.includes('表单') || keywords.includes('form')) {
    return generateFormTemplate(projectType, uiFramework);
  }
  
  return null;
}

/**
 * 生成登录页面模板
 */
function generateLoginTemplate(projectType, uiFramework) {
  if (projectType === 'react' && uiFramework === 'tailwind') {
    return `import React, { useState, useCallback } from 'react';

function App() {
  // ==================== 状态管理 ====================
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ==================== 事件处理 ====================
  const handleInputChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setError('');
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    // 表单验证
    if (!formData.username.trim()) {
      setError('请输入用户名');
      return;
    }
    if (!formData.password) {
      setError('请输入密码');
      return;
    }
    if (formData.password.length < 6) {
      setError('密码长度至少为6位');
      return;
    }

    setIsLoading(true);
    setError('');

    // 模拟登录请求
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 模拟登录成功
      if (formData.username === 'admin' && formData.password === '123456') {
        alert('登录成功！欢迎回来，' + formData.username);
      } else {
        setError('用户名或密码错误');
      }
    } catch (err) {
      setError('登录失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  }, [formData]);

  const handleSocialLogin = useCallback((provider) => {
    alert(\`使用 \${provider} 登录\`);
  }, []);

  // ==================== 渲染 ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
      </div>

      {/* 登录卡片 */}
      <div className="relative w-full max-w-md">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 space-y-6">
          {/* Logo和标题 */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">欢迎回来</h1>
            <p className="text-gray-500 text-sm">请登录您的账户继续</p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600 text-sm animate-shake">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* 登录表单 */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 用户名输入 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">用户名</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="请输入用户名"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                />
              </div>
            </div>

            {/* 密码输入 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">密码</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="请输入密码"
                  className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* 记住我 & 忘记密码 */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">记住我</span>
              </label>
              <a href="#" className="text-sm text-blue-600 hover:text-blue-700 hover:underline">
                忘记密码？
              </a>
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  登录中...
                </span>
              ) : '登 录'}
            </button>
          </form>

          {/* 分割线 */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">或使用以下方式登录</span>
            </div>
          </div>

          {/* 社交登录 */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleSocialLogin('微信')}
              className="flex items-center justify-center py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all"
            >
              <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18z"/>
                <path d="M23.997 14.127c0-3.224-3.09-5.865-6.932-5.865-3.903 0-6.99 2.632-6.99 5.865 0 3.253 3.087 5.865 6.99 5.865.769 0 1.52-.089 2.239-.305a.69.69 0 01.566.098l1.483.862a.268.268 0 00.138.049c.128 0 .233-.108.233-.237 0-.058-.02-.114-.039-.17l-.305-1.146a.47.47 0 01.167-.524c1.447-1.07 2.45-2.67 2.45-4.492zm-9.203-.94c-.512 0-.928-.422-.928-.942 0-.52.416-.942.928-.942.51 0 .926.422.926.942 0 .52-.415.943-.926.943zm4.54 0c-.512 0-.928-.422-.928-.942 0-.52.416-.942.928-.942.51 0 .926.422.926.942 0 .52-.416.943-.926.943z"/>
              </svg>
            </button>
            <button
              onClick={() => handleSocialLogin('QQ')}
              className="flex items-center justify-center py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all"
            >
              <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.003 2c-2.265 0-6.29 1.364-6.29 7.325v1.195S3.55 14.96 3.55 17.474c0 .665.17 1.025.281 1.025.114 0 .902-.484 1.748-2.072 0 0-.18 2.197 1.904 3.967 0 0-1.77.495-1.77 1.182 0 .686 4.078.43 6.29.43 2.239 0 6.29.256 6.29-.43 0-.687-1.77-1.182-1.77-1.182 2.085-1.77 1.905-3.967 1.905-3.967.845 1.588 1.634 2.072 1.746 2.072.111 0 .283-.36.283-1.025 0-2.514-2.166-6.954-2.166-6.954V9.325C18.29 3.364 14.268 2 12.003 2z"/>
              </svg>
            </button>
            <button
              onClick={() => handleSocialLogin('GitHub')}
              className="flex items-center justify-center py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all"
            >
              <svg className="w-5 h-5 text-gray-800" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </button>
          </div>

          {/* 注册链接 */}
          <p className="text-center text-sm text-gray-600">
            还没有账户？
            <a href="#" className="text-blue-600 hover:text-blue-700 font-medium hover:underline ml-1">
              立即注册
            </a>
          </p>
        </div>

        {/* 底部提示 */}
        <p className="text-center text-white/70 text-xs mt-6">
          测试账户: admin / 123456
        </p>
      </div>

      {/* 添加动画样式 */}
      <style>{\`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      \`}</style>
    </div>
  );
}

export default App;`;
  }
  return null;
}

/**
 * 生成注册页面模板
 */
function generateRegisterTemplate(projectType, uiFramework) {
  // 返回注册页面模板代码...
  return null;
}

/**
 * 生成列表页面模板
 */
function generateListTemplate(projectType, uiFramework) {
  // 返回列表页面模板代码...
  return null;
}

/**
 * 生成仪表盘模板
 */
function generateDashboardTemplate(projectType, uiFramework) {
  // 返回仪表盘模板代码...
  return null;
}

/**
 * 生成表单模板
 */
function generateFormTemplate(projectType, uiFramework) {
  // 返回表单模板代码...
  return null;
}

// ==================== 多轮迭代生成系统 ====================

/**
 * 多轮迭代生成代码 - 核心函数
 * 通过多轮AI调用，逐步完善代码，确保代码量充足且功能完整
 */
async function multiRoundGenerate(client, requirement, documentContent, options, sendProgress) {
  const { projectType, uiFramework, includeBackend } = options;
  
  console.log('\n🔄 ========== 多轮迭代生成开始 ==========');
  
  let currentCode = '';
  let codeBlocks = { html: '', css: '', javascript: '', react: '', fullCode: '' };
  const rounds = GENERATION_CONFIG.maxRounds;
  
  for (let round = 1; round <= rounds; round++) {
    const focus = GENERATION_CONFIG.roundFocus[round - 1];
    console.log(`\n📝 第 ${round}/${rounds} 轮: ${focus}`);
    
    sendProgress({
      phase: `round_${round}`,
      round,
      totalRounds: rounds,
      focus,
      progress: Math.round((round - 1) / rounds * 100),
      message: getRoundMessage(round, focus)
    });

    // 构建当前轮次的提示词
    const roundPrompt = buildRoundPrompt(round, focus, requirement, documentContent, currentCode, options);
    
    try {
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'glm-4-flash',
        messages: [
          { role: 'system', content: getRoundSystemPrompt(round, focus, projectType) },
          { role: 'user', content: roundPrompt }
        ],
        temperature: 0.7,
        max_tokens: 16000
      });

      const content = response.choices[0]?.message?.content || '';
      
      // 解析本轮生成的代码
      const roundCode = parseCodeBlocks(content);
      
      // 合并代码
      if (round === 1) {
        currentCode = roundCode.react || roundCode.html || content;
        codeBlocks = roundCode;
      } else {
        // 后续轮次：智能合并代码
        currentCode = mergeCode(currentCode, roundCode.react || roundCode.html || content, focus);
        codeBlocks.react = currentCode;
        codeBlocks.css = (codeBlocks.css || '') + '\n' + (roundCode.css || '');
      }

      // 检查代码行数
      const lineCount = currentCode.split('\n').length;
      console.log(`   ✓ 当前代码行数: ${lineCount}`);

      // 发送当前轮次完成进度
      sendProgress({
        phase: `round_${round}_complete`,
        round,
        totalRounds: rounds,
        progress: Math.round(round / rounds * 90),
        lineCount,
        message: `第 ${round} 轮完成，当前 ${lineCount} 行代码`
      });

      // 如果代码量已经足够，可以提前结束
      if (lineCount >= GENERATION_CONFIG.targetCodeLength && round >= 3) {
        console.log(`   ⚡ 代码量已达标 (${lineCount} 行)，提前完成`);
        break;
      }

    } catch (error) {
      console.error(`   ❌ 第 ${round} 轮生成失败:`, error.message);
      // 继续下一轮
    }
  }

  // 构建最终代码
  codeBlocks.fullCode = buildFullReactCode(codeBlocks);
  
  console.log(`\n✅ 多轮迭代完成，最终代码行数: ${currentCode.split('\n').length}`);
  
  return codeBlocks;
}

/**
 * 获取轮次消息
 */
function getRoundMessage(round, focus) {
  const messages = {
    structure: '🏗️ 构建基础结构和页面布局...',
    components: '🧩 生成UI组件和界面元素...',
    interactions: '⚡ 添加交互逻辑和事件处理...',
    data: '📊 完善数据管理和状态...',
    polish: '✨ 优化细节和用户体验...'
  };
  return messages[focus] || `第 ${round} 轮生成中...`;
}

/**
 * 获取每轮的系统提示词
 */
function getRoundSystemPrompt(round, focus, projectType) {
  const basePrompt = `你是一位资深的前端开发专家。你的任务是生成可运行的代码，不是描述或解释。

## 最重要的规则
1. 你必须输出完整的、可运行的代码
2. 不要输出任何描述性文字、解释或说明
3. 直接输出代码，代码必须包裹在 \`\`\`jsx 代码块中
4. 代码必须是真实的 React/JavaScript 代码，不是伪代码
5. 代码量要充足，至少 300 行

## 输出格式（必须严格遵守）
你的回复必须以 \`\`\`jsx 开头，以 \`\`\` 结尾，中间是完整的代码。
不要有任何其他内容，只有代码块。`;

  const focusPrompts = {
    structure: `
## 第1轮重点：基础结构
- 完整的页面布局（头部、侧边栏、主内容区、底部）
- 响应式设计框架
- 基础样式和主题色
- 导航结构
- 至少 300 行代码`,

    components: `
## 第2轮重点：UI组件
- 所有需要的UI组件（按钮、表单、卡片、表格等）
- 组件的完整样式
- 图标和视觉元素
- 加载状态和空状态
- 至少 300 行代码`,

    interactions: `
## 第3轮重点：交互功能
- 所有按钮的点击事件
- 表单提交和验证
- 弹窗和提示
- 动画和过渡效果
- 键盘快捷键
- 至少 250 行代码`,

    data: `
## 第4轮重点：数据管理
- 完整的状态管理（useState/useReducer）
- 模拟数据（至少10条记录）
- 数据过滤、搜索、排序
- 分页功能
- API模拟调用
- 至少 250 行代码`,

    polish: `
## 第5轮重点：优化完善
- 错误处理和边界情况
- 性能优化
- 无障碍支持
- 代码注释完善
- 用户体验细节
- 确保总代码量达到 800+ 行`
  };

  return basePrompt + (focusPrompts[focus] || '');
}

/**
 * 构建每轮的提示词
 */
function buildRoundPrompt(round, focus, requirement, documentContent, currentCode, options) {
  const { projectType, uiFramework } = options;

  if (round === 1) {
    // 第一轮：从需求开始 - 直接给出完整示例结构
    return `## 需求
${requirement || '创建一个现代化的管理系统界面'}

${documentContent ? `## 参考文档\n${documentContent.slice(0, 3000)}\n` : ''}

## 任务
生成一个完整的 React 组件。不要解释，直接输出代码。

## 必须包含的内容
1. 顶部导航栏（logo、菜单、用户头像）
2. 左侧边栏（可折叠、菜单列表）
3. 主内容区（统计卡片、数据表格）
4. useState 状态管理
5. Tailwind CSS 样式

## 输出格式
直接输出代码块，不要有任何解释文字：

\`\`\`jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';

// 模拟数据
const mockData = [
  { id: 1, name: '张三', email: 'zhangsan@example.com', role: '管理员', status: '活跃', createTime: '2024-01-15' },
  { id: 2, name: '李四', email: 'lisi@example.com', role: '用户', status: '活跃', createTime: '2024-01-16' },
  { id: 3, name: '王五', email: 'wangwu@example.com', role: '用户', status: '禁用', createTime: '2024-01-17' },
  { id: 4, name: '赵六', email: 'zhaoliu@example.com', role: '编辑', status: '活跃', createTime: '2024-01-18' },
  { id: 5, name: '孙七', email: 'sunqi@example.com', role: '用户', status: '活跃', createTime: '2024-01-19' },
];

// 菜单配置
const menuItems = [
  { id: 'dashboard', name: '仪表盘', icon: '📊' },
  { id: 'users', name: '用户管理', icon: '👥' },
  { id: 'orders', name: '订单管理', icon: '📦' },
  { id: 'products', name: '商品管理', icon: '🏷️' },
  { id: 'settings', name: '系统设置', icon: '⚙️' },
];

function App() {
  // ==================== 状态定义 ====================
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState(mockData);
  const [loading, setLoading] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // ==================== 统计数据 ====================
  const stats = useMemo(() => [
    { label: '总用户数', value: '12,456', change: '+12%', color: 'blue', icon: '👥' },
    { label: '活跃用户', value: '8,234', change: '+8%', color: 'green', icon: '✅' },
    { label: '今日订单', value: '456', change: '+23%', color: 'purple', icon: '📦' },
    { label: '总收入', value: '¥89,234', change: '+15%', color: 'orange', icon: '💰' },
  ], []);

  // ==================== 搜索过滤 ====================
  const filteredData = useMemo(() => {
    if (!searchText) return data;
    return data.filter(item => 
      item.name.includes(searchText) || 
      item.email.includes(searchText)
    );
  }, [data, searchText]);

  // ==================== 事件处理 ====================
  const handleSearch = useCallback((e) => {
    setSearchText(e.target.value);
    setCurrentPage(1);
  }, []);

  const handleDelete = useCallback((id) => {
    if (window.confirm('确定要删除吗？')) {
      setData(prev => prev.filter(item => item.id !== id));
    }
  }, []);

  const handleSelectAll = useCallback((e) => {
    if (e.target.checked) {
      setSelectedRows(filteredData.map(item => item.id));
    } else {
      setSelectedRows([]);
    }
  }, [filteredData]);

  const handleSelectRow = useCallback((id) => {
    setSelectedRows(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  }, []);

  // ==================== 渲染 ====================
  return (
    <div className="min-h-screen bg-gray-100">
      {/* 顶部导航栏 */}
      <header className="bg-white shadow-sm border-b border-gray-200 fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <span className="text-xl">☰</span>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">A</span>
              </div>
              <span className="font-bold text-gray-800">管理系统</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索..."
                className="w-64 px-4 py-2 bg-gray-100 border-0 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button className="p-2 hover:bg-gray-100 rounded-lg relative">
              <span className="text-xl">🔔</span>
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">管</span>
              </div>
              <span className="text-sm text-gray-700">管理员</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex pt-16">
        {/* 侧边栏 */}
        <aside className={\`\${sidebarOpen ? 'w-64' : 'w-20'} bg-white shadow-sm min-h-screen fixed left-0 top-16 transition-all duration-300 border-r border-gray-200\`}>
          <nav className="p-4">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveMenu(item.id)}
                className={\`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-all \${
                  activeMenu === item.id 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-50'
                }\`}
              >
                <span className="text-xl">{item.icon}</span>
                {sidebarOpen && <span className="font-medium">{item.name}</span>}
              </button>
            ))}
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className={\`flex-1 p-6 \${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300\`}>
          {/* 页面标题 */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-800">仪表盘</h1>
            <p className="text-gray-500 mt-1">欢迎回来，这是今日数据概览</p>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {stats.map((stat, index) => (
              <div key={index} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl">{stat.icon}</span>
                  <span className={\`text-sm px-2 py-1 rounded-full \${
                    stat.change.startsWith('+') ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }\`}>
                    {stat.change}
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-800">{stat.value}</div>
                <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* 数据表格 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">用户列表</h2>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="搜索用户..."
                  value={searchText}
                  onChange={handleSearch}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button 
                  onClick={() => setShowModal(true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  + 添加用户
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input 
                        type="checkbox" 
                        onChange={handleSelectAll}
                        checked={selectedRows.length === filteredData.length && filteredData.length > 0}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">姓名</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">邮箱</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">角色</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">状态</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">创建时间</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <input 
                          type="checkbox"
                          checked={selectedRows.includes(item.id)}
                          onChange={() => handleSelectRow(item.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-sm">{item.name[0]}</span>
                          </div>
                          <span className="font-medium text-gray-800">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.email}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded-full">
                          {item.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={\`px-2 py-1 text-xs rounded-full \${
                          item.status === '活跃' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                        }\`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.createTime}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button className="p-1 hover:bg-gray-100 rounded text-blue-500">编辑</button>
                          <button 
                            onClick={() => handleDelete(item.id)}
                            className="p-1 hover:bg-gray-100 rounded text-red-500"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                共 {filteredData.length} 条数据
              </span>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50">上一页</button>
                <button className="px-3 py-1 bg-blue-500 text-white rounded">1</button>
                <button className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50">2</button>
                <button className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50">3</button>
                <button className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50">下一页</button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* 添加用户弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">添加用户</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                <input type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                <input type="email" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option>用户</option>
                  <option>编辑</option>
                  <option>管理员</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
\`\`\`

请根据上述需求，生成类似结构但更完整的代码。`;
  }

  // 后续轮次：基于现有代码扩展
  return `## 当前代码
\`\`\`jsx
${currentCode.slice(0, 12000)}
\`\`\`

## 原始需求
${requirement || '根据文档内容生成界面'}

## 第${round}轮任务：${getFocusTaskDescription(focus)}

请基于上面的代码，${getFocusInstruction(focus)}

## 重要要求
1. 输出完整的、合并后的代码（不是代码片段）
2. 保留原有的所有功能
3. 新增的代码量至少 200 行
4. 不要使用省略号或注释占位
5. 确保代码可以直接运行

请输出完整的更新后代码：

\`\`\`jsx
`;
}

/**
 * 获取任务描述
 */
function getFocusTaskDescription(focus) {
  const descriptions = {
    structure: '完善页面结构',
    components: '添加UI组件',
    interactions: '实现交互功能',
    data: '完善数据管理',
    polish: '优化和完善'
  };
  return descriptions[focus] || focus;
}

/**
 * 获取具体指令
 */
function getFocusInstruction(focus) {
  const instructions = {
    structure: `扩展和完善页面结构：
- 添加更多页面区域
- 完善导航菜单
- 添加面包屑导航
- 增加页面过渡效果`,

    components: `添加以下UI组件：
- 数据统计卡片（至少4个，带图标和数值）
- 数据表格（带表头、多列数据）
- 搜索框和筛选器
- 操作按钮组
- 分页组件
- 标签和徽章
- 进度条`,

    interactions: `实现以下交互功能：
- 表格行的选中、编辑、删除
- 搜索和筛选功能
- 表单提交和验证
- 弹窗确认对话框
- Toast提示消息
- 下拉菜单
- 排序功能`,

    data: `完善数据管理：
- 添加完整的模拟数据（至少15条记录）
- 实现数据的增删改查
- 添加加载状态
- 实现数据过滤和搜索
- 添加本地存储
- 模拟API请求`,

    polish: `优化和完善：
- 添加加载动画和骨架屏
- 完善空状态显示
- 添加错误处理
- 优化动画效果
- 完善响应式适配
- 添加更多注释
- 确保所有功能完整可用`
  };
  return instructions[focus] || '继续完善代码';
}

/**
 * 智能合并代码
 */
function mergeCode(existingCode, newCode, focus) {
  // 如果新代码包含完整的组件定义，直接使用新代码
  if (newCode.includes('function App()') && newCode.includes('export default')) {
    // 提取新代码中的 App 组件
    const appMatch = newCode.match(/function App\(\)[\s\S]*?^}$/m);
    if (appMatch) {
      return newCode;
    }
  }
  
  // 如果新代码是代码片段，尝试合并
  // 这里简单处理：如果新代码更长，使用新代码
  if (newCode.length > existingCode.length * 0.8) {
    return newCode;
  }
  
  return existingCode;
}

/**
 * 流式多轮生成（用于实时反馈）
 */
async function streamMultiRoundGenerate(client, requirement, documentContent, options, res) {
  const { projectType, uiFramework, includeBackend } = options;
  
  console.log('\n🔄 ========== 流式多轮迭代生成 ==========');
  
  let currentCode = '';
  let codeBlocks = { html: '', css: '', javascript: '', react: '', fullCode: '' };
  const rounds = GENERATION_CONFIG.maxRounds;
  
  for (let round = 1; round <= rounds; round++) {
    const focus = GENERATION_CONFIG.roundFocus[round - 1];
    
    // 发送轮次开始消息
    res.write(`data: ${JSON.stringify({
      phase: 'multi_round',
      round,
      totalRounds: rounds,
      focus,
      progress: Math.round((round - 1) / rounds * 90),
      message: getRoundMessage(round, focus)
    })}\n\n`);

    // 构建当前轮次的提示词
    const roundPrompt = buildRoundPrompt(round, focus, requirement, documentContent, currentCode, options);
    
    try {
      // 流式调用
      const stream = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'glm-4-flash',
        messages: [
          { role: 'system', content: getRoundSystemPrompt(round, focus, projectType) },
          { role: 'user', content: roundPrompt }
        ],
        temperature: 0.7,
        max_tokens: 16000,
        stream: true
      });

      let roundContent = '';
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          roundContent += content;
          // 发送流式内容
          res.write(`data: ${JSON.stringify({ 
            content,
            round,
            phase: 'streaming'
          })}\n\n`);
        }
      }

      // 解析本轮代码
      const roundCode = parseCodeBlocks(roundContent);
      
      // 合并代码
      if (round === 1) {
        currentCode = roundCode.react || roundCode.html || roundContent;
        codeBlocks = roundCode;
      } else {
        currentCode = mergeCode(currentCode, roundCode.react || roundCode.html || roundContent, focus);
        codeBlocks.react = currentCode;
        codeBlocks.css = (codeBlocks.css || '') + '\n' + (roundCode.css || '');
      }

      const lineCount = currentCode.split('\n').length;
      
      // 发送轮次完成消息
      res.write(`data: ${JSON.stringify({
        phase: 'round_complete',
        round,
        totalRounds: rounds,
        lineCount,
        progress: Math.round(round / rounds * 90),
        message: `✅ 第 ${round} 轮完成 (${lineCount} 行)`
      })}\n\n`);

      // 提前结束条件
      if (lineCount >= GENERATION_CONFIG.targetCodeLength && round >= 3) {
        console.log(`   ⚡ 代码量已达标，提前完成`);
        break;
      }

    } catch (error) {
      console.error(`   ❌ 第 ${round} 轮失败:`, error.message);
      res.write(`data: ${JSON.stringify({
        phase: 'round_error',
        round,
        error: error.message
      })}\n\n`);
    }
  }

  // 构建最终代码
  codeBlocks.fullCode = buildFullReactCode(codeBlocks);
  
  return codeBlocks;
}

// ==================== 纯HTML生成专用函数 ====================

/**
 * 构建纯HTML生成的提示词 - 根据需求动态生成数据
 */
function buildHtmlPrompt(requirement, documentContent, options) {
  // 分析需求，提取数据实体
  const analysis = analyzeRequirementForData(requirement, documentContent);
  const { entity, sampleData } = generateSampleDataFromAnalysis(analysis);
  
  const featuresText = analysis.features.length > 0 
    ? `需要的功能：${analysis.features.join('、')}` 
    : '需要的功能：搜索、筛选、添加、编辑、删除、分页';

  return `## 需求描述
${requirement || '创建一个数据管理页面'}

${documentContent ? `## 需求文档内容（重要！根据这个生成真实数据）\n${documentContent.slice(0, 5000)}\n` : ''}

## 数据分析结果
- 主要数据实体：${entity.name}
- 数据字段：${entity.fields.join('、')}
- ${featuresText}

## 任务
生成一个完整的纯HTML页面（单文件，包含CSS和JavaScript）。

## 关键要求
1. **数据必须根据需求生成**：不要使用示例数据，要根据上面的需求文档生成真实、相关的数据
2. **代码量必须充足**：至少 800 行代码
3. **功能必须完整**：所有按钮都要有实际功能
4. **界面必须美观**：使用现代化设计，渐变色、阴影、圆角

## 必须包含的内容

### 1. 页面结构（约200行）
- 完整的HTML5结构
- 顶部导航栏（logo、菜单项、用户信息、通知图标）
- 左侧菜单栏（可折叠、多个菜单项、图标）
- 主内容区域
- 底部版权信息

### 2. 样式CSS（约300行）
- CSS变量定义颜色主题
- 响应式布局（媒体查询）
- 悬停效果、过渡动画
- 表格样式、卡片样式
- 按钮样式（多种状态）
- 弹窗样式
- 加载动画

### 3. 数据和表格（约150行）
- JavaScript数组存储数据（至少15条，根据需求生成真实数据）
- 数据表格渲染函数
- 表头排序功能
- 行选择功能

### 4. 交互功能JavaScript（约250行）
- 搜索过滤功能
- 添加数据弹窗
- 编辑数据功能
- 删除确认功能
- 分页功能
- 表单验证
- Toast提示

## 输出格式
直接输出完整的HTML文件，不要有任何解释：

\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理系统</title>
  <style>
    /* 在这里写完整的CSS样式 */
  </style>
</head>
<body>
  <!-- 在这里写完整的HTML结构 -->
  
  <script>
    // 在这里写完整的JavaScript代码
    // 数据要根据需求生成，不要用示例数据
  </script>
</body>
</html>
\`\`\``;
}

/**
 * 专业UI设计系统提示词 - 企业级增强版
 */
const PROFESSIONAL_UI_SYSTEM_PROMPT = `你是一位顶级的企业级前端架构师，精通Ant Design、Element Plus等专业组件库设计规范。

## 核心设计理念
1. **企业级视觉规范**：参考Ant Design/Element Plus的设计语言
2. **设计Token一致性**：统一的颜色、字体、间距、圆角、阴影
3. **专业数据展示**：图表、统计卡片、进度条、状态标签
4. **完整交互反馈**：加载态、空状态、错误态、成功提示

## 代码质量标准
- 每个功能必须完整实现，绝不允许空函数或注释占位
- 代码量要求：CSS 400+行，JS 800+行，总计1500+行
- 每个函数都有详细中文注释
- 所有事件都有实际处理逻辑

## 设计规范
### 配色系统
- 主色：#1890ff（蓝）或 #722ed1（紫）
- 成功：#52c41a
- 警告：#faad14
- 错误：#ff4d4f
- 中性色：#f0f2f5, #d9d9d9, #8c8c8c, #262626

### 组件规范
- 圆角：2px(小) / 4px(中) / 8px(大)
- 阴影：0 2px 8px rgba(0,0,0,0.15)
- 间距：8px / 16px / 24px
- 字体：14px(正文) / 16px(标题) / 20px(大标题)

## 输出规则
1. 只输出代码，不要解释
2. 代码用 \`\`\`html 包裹
3. 输出完整文件，不要省略任何部分
4. 所有按钮和链接都必须有实际功能`;

/**
 * 纯HTML专用的系统提示词
 */
const HTML_SYSTEM_PROMPT = PROFESSIONAL_UI_SYSTEM_PROMPT;

/**
 * 流式生成纯HTML代码 - 大纲驱动 + 10步分模块生成
 * 
 * 核心策略：
 * 1. 先生成详细代码大纲
 * 2. 按大纲分10步独立生成各模块
 * 3. 智能整合所有模块
 * 4. 支持上传HTML模板作为参考
 */
async function streamHtmlGenerate(client, requirement, documentContent, options, res) {
  console.log('\n🌐 ========== 大纲驱动 + 10步分模块生成 ==========');
  
  // 获取上传的HTML模板（如果有）
  const uploadedHtml = options?.uploadedHtml || '';
  if (uploadedHtml) {
    console.log('📄 检测到上传的HTML模板，将作为参考');
  }
  
  // 分析需求
  const analysis = analyzeRequirementForData(requirement, documentContent);
  console.log('📊 识别到的实体:', analysis.entities.map(e => e.name).join(', '));
  console.log('🔧 识别到的功能:', analysis.features.join(', '));

  res.write(`data: ${JSON.stringify({
    phase: 'analyzing',
    progress: 2,
    message: '📋 深度分析需求...'
  })}\n\n`);

  // 存储各模块生成的代码
  const modules = {
    outline: '',      // 代码大纲
    cssVariables: '', // CSS变量
    cssLayout: '',    // CSS布局
    cssComponents: '',// CSS组件
    htmlStructure: '',// HTML结构
    jsData: '',       // JS数据层
    jsRender: '',     // JS渲染
    jsCrud: '',       // JS增删改查
    jsAdvanced: '',   // JS高级功能
    fullCode: ''      // 整合后的完整代码
  };

  // 10步生成流程
  const steps = [
    { id: 'outline', name: '📝 生成代码大纲', progress: 5 },
    { id: 'css_variables', name: '🎨 CSS变量和主题系统', progress: 15 },
    { id: 'css_layout', name: '📐 CSS布局系统', progress: 25 },
    { id: 'css_components', name: '🧩 CSS组件样式库', progress: 35 },
    { id: 'html_structure', name: '🏗️ HTML页面结构', progress: 45 },
    { id: 'js_data', name: '💾 JavaScript数据层', progress: 55 },
    { id: 'js_render', name: '🖼️ JavaScript渲染函数', progress: 65 },
    { id: 'js_crud', name: '⚡ JavaScript增删改查', progress: 75 },
    { id: 'js_advanced', name: '🚀 JavaScript高级功能', progress: 85 },
    { id: 'integrate', name: '🔧 整合与优化', progress: 95 }
  ];

  const totalSteps = steps.length;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    res.write(`data: ${JSON.stringify({
      phase: 'step_start',
      step: i + 1,
      totalSteps,
      stepId: step.id,
      progress: step.progress,
      message: `${step.name}...`
    })}\n\n`);

    console.log(`\n📝 步骤 ${i + 1}/${totalSteps}: ${step.name}`);

    try {
      // 根据步骤ID调用对应的生成函数
      const result = await generateStepContent(
        client, step.id, requirement, documentContent, 
        analysis, modules, uploadedHtml, res
      );
      
      // 存储生成结果
      switch(step.id) {
        case 'outline': modules.outline = result; break;
        case 'css_variables': modules.cssVariables = result; break;
        case 'css_layout': modules.cssLayout = result; break;
        case 'css_components': modules.cssComponents = result; break;
        case 'html_structure': modules.htmlStructure = result; break;
        case 'js_data': modules.jsData = result; break;
        case 'js_render': modules.jsRender = result; break;
        case 'js_crud': modules.jsCrud = result; break;
        case 'js_advanced': modules.jsAdvanced = result; break;
        case 'integrate': modules.fullCode = result; break;
      }

      const lineCount = result.split('\n').length;
      console.log(`   ✓ ${step.name} 完成，生成 ${lineCount} 行`);

      res.write(`data: ${JSON.stringify({
        phase: 'step_complete',
        step: i + 1,
        totalSteps,
        stepId: step.id,
        lineCount,
        progress: step.progress,
        message: `✅ ${step.name} 完成 (${lineCount} 行)`
      })}\n\n`);

    } catch (error) {
      console.error(`   ❌ ${step.name} 失败:`, error.message);
      res.write(`data: ${JSON.stringify({
        phase: 'step_error',
        step: i + 1,
        stepId: step.id,
        error: error.message
      })}\n\n`);
    }
  }

  // 如果整合失败，手动整合
  if (!modules.fullCode) {
    modules.fullCode = manualIntegrateModules(modules, analysis);
  }

  const finalLineCount = modules.fullCode.split('\n').length;
  console.log(`\n✅ 代码生成完成，最终代码行数: ${finalLineCount}`);

  return {
    html: modules.fullCode,
    css: '',
    javascript: '',
    react: '',
    fullCode: modules.fullCode,
    modules // 返回所有模块，便于调试
  };
}

/**
 * 根据步骤ID生成对应内容
 */
async function generateStepContent(client, stepId, requirement, documentContent, analysis, modules, uploadedHtml, res) {
  const entity = analysis.entities[0] || { name: '数据', fields: ['名称', '描述', '状态'] };
  const features = analysis.features.length > 0 ? analysis.features : ['搜索', '添加', '编辑', '删除', '分页', '导出'];

  // 获取步骤专属的系统提示词和用户提示词
  const { system: systemPrompt, user: userPrompt } = getStepPrompts(stepId, requirement, documentContent, analysis, modules, uploadedHtml, entity, features);

  const modelName = process.env.OPENAI_MODEL || 'deepseek-ai/DeepSeek-V3';
  console.log(`   🤖 调用模型: ${modelName}`);

  try {
    const stream = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 16000,
      stream: true
    });

    let response = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        response += content;
        res.write(`data: ${JSON.stringify({ 
          content,
          stepId,
          phase: 'streaming'
        })}\n\n`);
      }
    }

    // 提取代码
    return extractCodeFromResponse(response, stepId);
  } catch (apiError) {
    console.error(`   ❌ API调用失败 [${stepId}]:`, apiError.message);
    if (apiError.response) {
      console.error(`   📋 API响应:`, apiError.response.status, apiError.response.data);
    }
    throw new Error(`API调用失败: ${apiError.message}`);
  }
}

/**
 * 获取各步骤的提示词
 */
function getStepPrompts(stepId, requirement, documentContent, analysis, modules, uploadedHtml, entity, features) {
  const baseSystemPrompt = `你是一位顶级企业级前端架构师。只输出代码，不要任何解释。`;
  
  const prompts = {
    // 步骤1：生成代码大纲
    outline: {
      system: `${baseSystemPrompt}
你的任务是生成一份详细的代码大纲，用于指导后续的分模块生成。`,
      user: `## 需求
${requirement || '创建数据管理系统'}

${documentContent ? `## 需求文档\n${documentContent.slice(0, 3000)}\n` : ''}
${uploadedHtml ? `## 参考HTML模板\n\`\`\`html\n${uploadedHtml.slice(0, 2000)}\n\`\`\`\n` : ''}

## 数据分析
- 主要实体：${entity.name}
- 字段：${entity.fields.join('、')}
- 功能：${features.join('、')}

## 任务：生成详细代码大纲

请输出一份详细的代码大纲，包括：

### 1. CSS部分大纲
- CSS变量（主题色、间距、圆角、阴影等）
- 布局系统（侧边栏、顶栏、内容区）
- 组件样式（按钮、卡片、表格、表单、弹窗、Toast、分页等）

### 2. HTML部分大纲
- 页面结构（导航、侧边栏、主内容区）
- 统计卡片区
- 工具栏
- 数据表格
- 弹窗结构
- 分页组件

### 3. JavaScript部分大纲
- 数据层（数据数组、状态变量）
- 渲染函数（表格渲染、卡片渲染、分页渲染）
- CRUD函数（增删改查、表单验证）
- 高级功能（搜索、筛选、排序、导出、批量操作、快捷键）

### 4. 交互流程
- 用户操作流程
- 数据流向

请用结构化的格式输出大纲：`
    },

    // 步骤2：CSS变量和主题
    css_variables: {
      system: `${baseSystemPrompt}
你的任务是生成CSS变量和主题系统。输出纯CSS代码，用 \`\`\`css 包裹。`,
      user: `## 大纲参考
${modules.outline.slice(0, 2000)}

## 任务：生成CSS变量和主题系统（80+行）

生成完整的CSS变量系统，包括：

1. **主题色变量**（15+个）
   - 主色及其变体（hover、active、light、dark）
   - 成功/警告/错误/信息色
   
2. **中性色变量**（10+个）
   - 标题色、正文色、次要文字色、禁用色
   - 边框色、分割线色、背景色

3. **间距变量**（8+个）
   - xs/sm/md/lg/xl/xxl

4. **圆角变量**（4+个）
5. **阴影变量**（4+个）
6. **字体变量**（6+个）
7. **布局变量**（侧边栏宽度、顶栏高度等）
8. **过渡动画变量**

输出CSS代码（80+行）：

\`\`\`css
:root {`
    },

    // 步骤3：CSS布局
    css_layout: {
      system: `${baseSystemPrompt}
你的任务是生成CSS布局系统。输出纯CSS代码，用 \`\`\`css 包裹。`,
      user: `## 已有CSS变量
\`\`\`css
${modules.cssVariables}
\`\`\`

## 任务：生成CSS布局系统（120+行）

生成完整的布局CSS，包括：

1. **全局重置和基础样式**（15行）
2. **Flex/Grid工具类**（20行）
3. **主布局容器**（侧边栏+主内容区）（30行）
4. **顶部导航栏**（25行）
5. **侧边栏**（可折叠、菜单项）（30行）
6. **内容区域**（面包屑、标题、内容）（20行）
7. **响应式布局**（3个断点）（20行）

输出CSS代码（120+行）：

\`\`\`css
/* ========== 全局重置 ========== */`
    },

    // 步骤4：CSS组件
    css_components: {
      system: `${baseSystemPrompt}
你的任务是生成CSS组件样式库。输出纯CSS代码，用 \`\`\`css 包裹。`,
      user: `## 任务：生成CSS组件样式库（200+行）

生成完整的组件CSS，包括：

1. **按钮组件**（主要、次要、危险、禁用、大小变体）（40行）
2. **卡片组件**（统计卡片、普通卡片、悬停效果）（25行）
3. **表格组件**（表头、行、悬停、斑马纹、选中态）（35行）
4. **表单组件**（输入框、下拉框、复选框、标签）（35行）
5. **弹窗组件**（遮罩、弹窗体、动画）（30行）
6. **Toast组件**（成功、警告、错误、动画）（20行）
7. **分页组件**（页码、按钮、输入框）（20行）
8. **标签组件**（多种颜色状态标签）（15行）
9. **加载和空状态**（骨架屏、空状态图）（20行）
10. **动画关键帧**（fadeIn、slideIn、scaleIn等）（20行）

输出CSS代码（200+行）：

\`\`\`css
/* ========== 按钮组件 ========== */`
    },

    // 步骤5：HTML结构
    html_structure: {
      system: `${baseSystemPrompt}
你的任务是生成HTML页面结构。输出纯HTML代码（body内部），用 \`\`\`html 包裹。`,
      user: `## 大纲参考
${modules.outline.slice(0, 1500)}

## 数据实体：${entity.name}
## 字段：${entity.fields.join('、')}

## 任务：生成HTML页面结构（300+行）

生成完整的HTML结构，包括：

1. **顶部导航栏**（30行）
   - Logo区域
   - 搜索框
   - 消息图标（带红点）
   - 用户头像和下拉菜单

2. **左侧边栏**（50行）
   - 折叠按钮
   - 菜单分组（至少2组，每组3-4项）
   - 菜单项带图标

3. **主内容区**（150行）
   - 面包屑导航
   - 页面标题和描述
   - 统计卡片区（4个卡片）
   - 工具栏（搜索、筛选下拉、按钮组）
   - 数据表格（表头、空的tbody用于渲染）
   - 分页区域

4. **弹窗结构**（50行）
   - 添加/编辑弹窗（完整表单）
   - 查看详情弹窗
   - 删除确认弹窗
   
5. **Toast容器**（10行）
6. **加载遮罩**（10行）

输出HTML代码（300+行，只是body内部的内容）：

\`\`\`html
<!-- ========== 顶部导航栏 ========== -->`
    },

    // 步骤6：JS数据层
    js_data: {
      system: `${baseSystemPrompt}
你的任务是生成JavaScript数据层代码。输出纯JS代码，用 \`\`\`javascript 包裹。`,
      user: `## 数据实体：${entity.name}
## 字段：${entity.fields.join('、')}

## 任务：生成JavaScript数据层（200+行）

生成完整的数据层代码，包括：

1. **数据数组**（60行）
   - 生成25条真实的${entity.name}数据
   - 每条数据包含：id, ${entity.fields.slice(0, 5).join(', ')}, status, createdAt
   - 数据要真实、多样

2. **状态变量**（20行）
   - currentPage, pageSize, totalPages
   - searchKeyword, filterStatus
   - selectedIds, editingId
   - sortField, sortOrder

3. **统计计算函数**（30行）
   - getStatistics() - 返回总数、活跃数、本月新增、待处理数

4. **数据过滤函数**（40行）
   - filterData() - 根据搜索词和筛选条件过滤
   - sortData() - 排序
   - paginateData() - 分页

5. **数据操作函数**（50行）
   - addItem(item)
   - updateItem(id, data)
   - deleteItem(id)
   - deleteMultiple(ids)
   - generateId()

输出JavaScript代码（200+行）：

\`\`\`javascript
// ========== 数据层 ==========

// 原始数据
let ${entity.name.toLowerCase()}Data = [`
    },

    // 步骤7：JS渲染函数
    js_render: {
      system: `${baseSystemPrompt}
你的任务是生成JavaScript渲染函数。输出纯JS代码，用 \`\`\`javascript 包裹。`,
      user: `## 数据实体：${entity.name}
## 字段：${entity.fields.join('、')}

## 任务：生成JavaScript渲染函数（250+行）

生成完整的渲染函数，包括：

1. **DOM元素获取**（30行）
   - 获取所有需要操作的DOM元素

2. **统计卡片渲染**（30行）
   - renderStatistics() - 更新4个统计卡片的数值

3. **表格渲染**（80行）
   - renderTable() - 渲染表格内容
   - renderTableRow(item, index) - 渲染单行
   - getStatusBadge(status) - 返回状态标签HTML

4. **分页渲染**（50行）
   - renderPagination() - 渲染分页组件
   - 显示页码、上一页、下一页、跳转

5. **空状态渲染**（20行）
   - renderEmptyState() - 无数据时显示

6. **加载状态**（20行）
   - showLoading() / hideLoading()
   - showTableSkeleton()

7. **刷新函数**（20行）
   - refreshAll() - 刷新统计、表格、分页

输出JavaScript代码（250+行）：

\`\`\`javascript
// ========== 渲染函数 ==========

// DOM元素`
    },

    // 步骤8：JS增删改查
    js_crud: {
      system: `${baseSystemPrompt}
你的任务是生成JavaScript增删改查功能。输出纯JS代码，用 \`\`\`javascript 包裹。`,
      user: `## 数据实体：${entity.name}
## 字段：${entity.fields.join('、')}

## 任务：生成JavaScript增删改查功能（300+行）

生成完整的CRUD功能，包括：

1. **弹窗控制**（40行）
   - openModal(type, data) - 打开弹窗
   - closeModal() - 关闭弹窗
   - 弹窗动画

2. **表单处理**（50行）
   - fillForm(data) - 填充表单数据
   - getFormData() - 获取表单数据
   - resetForm() - 重置表单
   - validateForm() - 表单验证

3. **添加功能**（30行）
   - handleAdd() - 打开添加弹窗
   - submitAdd() - 提交添加

4. **编辑功能**（30行）
   - handleEdit(id) - 打开编辑弹窗
   - submitEdit() - 提交编辑

5. **删除功能**（40行）
   - handleDelete(id) - 单个删除确认
   - handleBatchDelete() - 批量删除
   - confirmDelete() - 确认删除

6. **查看详情**（30行）
   - handleView(id) - 查看详情弹窗
   - renderDetail(data) - 渲染详情

7. **搜索筛选**（40行）
   - handleSearch() - 搜索处理
   - handleFilter() - 筛选处理
   - clearFilters() - 清除筛选

8. **分页控制**（40行）
   - goToPage(page) - 跳转页面
   - changePageSize(size) - 改变每页条数
   - prevPage() / nextPage()

输出JavaScript代码（300+行）：

\`\`\`javascript
// ========== 增删改查功能 ==========

// 弹窗控制`
    },

    // 步骤9：JS高级功能
    js_advanced: {
      system: `${baseSystemPrompt}
你的任务是生成JavaScript高级功能。输出纯JS代码，用 \`\`\`javascript 包裹。`,
      user: `## 任务：生成JavaScript高级功能（250+行）

生成完整的高级功能，包括：

1. **Toast通知系统**（40行）
   - showToast(message, type) - 显示提示
   - hideToast() - 隐藏提示
   - 支持success/warning/error类型
   - 自动消失（3秒）

2. **表格选择**（40行）
   - toggleSelectAll() - 全选/取消全选
   - toggleSelectRow(id) - 选择单行
   - updateSelectAllState() - 更新全选状态
   - getSelectedIds() - 获取选中ID

3. **排序功能**（30行）
   - handleSort(field) - 点击表头排序
   - 升序/降序切换
   - 更新排序图标

4. **导出功能**（40行）
   - exportToCSV() - 导出CSV
   - exportToExcel() - 导出Excel（可选）
   - downloadFile(content, filename)

5. **键盘快捷键**（30行）
   - Ctrl+N 新增
   - Delete 删除选中
   - Ctrl+F 聚焦搜索
   - Escape 关闭弹窗

6. **侧边栏折叠**（20行）
   - toggleSidebar()
   - 保存折叠状态到localStorage

7. **事件绑定初始化**（50行）
   - initEventListeners() - 绑定所有事件
   - 表格行事件委托
   - 按钮点击事件

输出JavaScript代码（250+行）：

\`\`\`javascript
// ========== 高级功能 ==========

// Toast通知系统`
    },

    // 步骤10：整合
    integrate: {
      system: `${baseSystemPrompt}
你的任务是将所有模块整合成一个完整的HTML文件。输出完整的HTML文件，用 \`\`\`html 包裹。`,
      user: `## 任务：整合所有模块

请将以下模块整合成一个完整的HTML文件：

### CSS变量
\`\`\`css
${modules.cssVariables}
\`\`\`

### CSS布局
\`\`\`css
${modules.cssLayout}
\`\`\`

### CSS组件
\`\`\`css
${modules.cssComponents}
\`\`\`

### HTML结构
\`\`\`html
${modules.htmlStructure}
\`\`\`

### JS数据层
\`\`\`javascript
${modules.jsData}
\`\`\`

### JS渲染函数
\`\`\`javascript
${modules.jsRender}
\`\`\`

### JS增删改查
\`\`\`javascript
${modules.jsCrud}
\`\`\`

### JS高级功能
\`\`\`javascript
${modules.jsAdvanced}
\`\`\`

## 整合要求
1. 生成完整的HTML文件（<!DOCTYPE html>开头）
2. CSS放在<style>标签中
3. HTML放在<body>标签中
4. JavaScript放在<script>标签中，在body末尾
5. 添加DOMContentLoaded事件初始化
6. 确保代码可以直接运行
7. 添加必要的注释

输出完整的HTML文件：

\`\`\`html
<!DOCTYPE html>`
    }
  };

  return prompts[stepId] || { system: baseSystemPrompt, user: '继续...' };
}

/**
 * 从响应中提取代码
 */
function extractCodeFromResponse(response, stepId) {
  // 根据步骤类型选择提取模式
  const patterns = {
    outline: /```(?:markdown|text|outline)?\n?([\s\S]*?)```/,
    css_variables: /```css\n?([\s\S]*?)```/,
    css_layout: /```css\n?([\s\S]*?)```/,
    css_components: /```css\n?([\s\S]*?)```/,
    html_structure: /```html\n?([\s\S]*?)```/,
    js_data: /```javascript\n?([\s\S]*?)```/,
    js_render: /```javascript\n?([\s\S]*?)```/,
    js_crud: /```javascript\n?([\s\S]*?)```/,
    js_advanced: /```javascript\n?([\s\S]*?)```/,
    integrate: /```html\n?([\s\S]*?)```/
  };

  const pattern = patterns[stepId];
  if (pattern) {
    const match = response.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // 如果匹配失败，尝试通用匹配
  const genericMatch = response.match(/```\w*\n?([\s\S]*?)```/);
  if (genericMatch && genericMatch[1]) {
    return genericMatch[1].trim();
  }

  // 对于outline，直接返回文本
  if (stepId === 'outline') {
    return response.trim();
  }

  return response.trim();
}

/**
 * 手动整合所有模块（备用方案）
 */
function manualIntegrateModules(modules, analysis) {
  const entity = analysis.entities[0] || { name: '数据', fields: ['名称', '描述', '状态'] };
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${entity.name}管理系统</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📊</text></svg>">
  <style>
    /* ========== CSS变量和主题 ========== */
${modules.cssVariables}

    /* ========== CSS布局系统 ========== */
${modules.cssLayout}

    /* ========== CSS组件样式 ========== */
${modules.cssComponents}
  </style>
</head>
<body>
${modules.htmlStructure}

  <script>
    // ========== 数据层 ==========
${modules.jsData}

    // ========== 渲染函数 ==========
${modules.jsRender}

    // ========== 增删改查 ==========
${modules.jsCrud}

    // ========== 高级功能 ==========
${modules.jsAdvanced}

    // ========== 初始化 ==========
    document.addEventListener('DOMContentLoaded', function() {
      console.log('${entity.name}管理系统初始化...');
      if (typeof initEventListeners === 'function') initEventListeners();
      if (typeof refreshAll === 'function') refreshAll();
      console.log('初始化完成');
    });
  </script>
</body>
</html>`;
}

/**
 * 解析上传的HTML文件
 */
function parseUploadedHtml(htmlContent) {
  const result = {
    hasLayout: false,
    hasTable: false,
    hasModal: false,
    cssVariables: '',
    structure: '',
    scripts: ''
  };

  // 检测布局
  result.hasLayout = /<aside|class=".*sidebar.*"|class=".*side-menu.*"/i.test(htmlContent);
  result.hasTable = /<table/i.test(htmlContent);
  result.hasModal = /<div.*class=".*modal.*"/i.test(htmlContent);

  // 提取CSS变量
  const cssMatch = htmlContent.match(/:root\s*{([^}]+)}/);
  if (cssMatch) {
    result.cssVariables = cssMatch[1];
  }

  // 提取body内容
  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    result.structure = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '').trim();
  }

  // 提取scripts
  const scriptMatches = htmlContent.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  if (scriptMatches) {
    result.scripts = scriptMatches.map(s => s.replace(/<\/?script[^>]*>/gi, '')).join('\n');
  }

  return result;
}

/**
 * 提取HTML代码 - 增强版
 */
function extractHtmlCode(response) {
  // 尝试多种匹配方式
  const patterns = [
    /```html\n([\s\S]*?)```/,
    /```HTML\n([\s\S]*?)```/,
    /```\n(<!DOCTYPE[\s\S]*?<\/html>)\n```/i,
  ];
  
  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // 直接查找DOCTYPE
  if (response.includes('<!DOCTYPE html>') || response.includes('<!doctype html>')) {
    const start = response.toLowerCase().indexOf('<!doctype html>');
    const end = response.toLowerCase().lastIndexOf('</html>');
    if (end > start) {
      return response.slice(start, end + 7).trim();
    }
  }
  
  return null;
}

/**
 * 验证HTML结构完整性
 */
function validateHtmlStructure(code) {
  if (!code) return false;
  
  const hasDoctype = /<!DOCTYPE html>/i.test(code);
  const hasHtmlOpen = /<html/i.test(code);
  const hasHtmlClose = /<\/html>/i.test(code);
  const hasHead = /<head[\s\S]*?<\/head>/i.test(code);
  const hasBody = /<body[\s\S]*?<\/body>/i.test(code);
  const hasStyle = /<style[\s\S]*?<\/style>/i.test(code);
  const hasScript = /<script[\s\S]*?<\/script>/i.test(code);
  
  return hasDoctype && hasHtmlOpen && hasHtmlClose && hasHead && hasBody && hasStyle && hasScript;
}

/**
 * 增强最终代码
 */
function enhanceFinalCode(code, analysis) {
  // 确保有完整的meta标签
  if (!code.includes('viewport')) {
    code = code.replace('<head>', '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  }
  
  // 确保有favicon
  if (!code.includes('favicon')) {
    code = code.replace('</head>', '  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📊</text></svg>">\n</head>');
  }
  
  return code;
}

/**
 * 获取专业阶段的系统提示词
 */
function getProfessionalSystemPrompt(phaseNum, phase, analysis) {
  const entity = analysis.entities[0] || { name: '数据', fields: ['名称', '描述', '状态'] };
  
  const basePrompt = `你是一位顶级的企业级前端架构师，精通Ant Design、Element Plus等专业组件库设计规范。

## 核心原则
1. **只输出代码**：不要任何解释或描述
2. **代码量充足**：目标 ${phase.minLines}+ 行
3. **完整实现**：每个函数都有完整逻辑，禁止空函数
4. **专业设计**：企业级UI，参考Ant Design风格

## 设计Token
- 主色：#1890ff
- 成功：#52c41a
- 警告：#faad14  
- 错误：#ff4d4f
- 圆角：4px / 8px
- 阴影：0 2px 8px rgba(0,0,0,0.15)
- 间距：8px / 16px / 24px

## 输出格式
代码包裹在 \`\`\`html 中，输出完整HTML文件`;

  const phasePrompts = {
    1: `${basePrompt}

## 第1阶段重点：专业CSS设计系统 + 页面骨架
- 完整的CSS变量系统（50+个变量）
- 专业的布局系统（侧边栏+顶栏+内容区）
- 丰富的组件样式（按钮、卡片、表格、表单、弹窗、Toast）
- 动画库（淡入、滑动、缩放、旋转）
- 响应式断点（1200px, 992px, 768px）`,

    2: `${basePrompt}

## 第2阶段重点：数据展示
- 数据数组（20+条真实${entity.name}数据）
- 专业数据表格（排序、筛选、选择）
- 4个统计卡片（带图标、趋势）
- 简单图表（进度条、环形图）
- 状态标签（多种颜色）`,

    3: `${basePrompt}

## 第3阶段重点：完整交互功能
- 搜索功能（实时过滤、高亮匹配）
- CRUD弹窗（添加、编辑、查看、删除确认）
- 表单验证（非空、格式、长度）
- 分页组件（页码、跳转、每页条数）
- Toast通知系统
- 加载状态`,

    4: `${basePrompt}

## 第4阶段重点：高级功能
- 数据导出（CSV格式）
- 批量操作（全选、批量删除）
- 键盘快捷键（Ctrl+N新增、Delete删除、Ctrl+F搜索）
- 右键菜单
- 数据刷新
- 列显示/隐藏切换`,

    5: `${basePrompt}

## 第5阶段重点：UI打磨
- 丰富的动画效果
- 骨架屏加载
- 空状态设计
- 响应式完善
- 暗色主题切换
- 微交互（悬停、点击反馈）`,

    6: `${basePrompt}

## 第6阶段重点：代码校验与修复
- 检查所有函数是否有实际实现
- 检查所有按钮是否绑定事件
- 检查HTML结构完整性
- 检查CSS样式完整性
- 修复任何遗漏的功能
- 确保代码可直接运行`
  };

  return phasePrompts[phaseNum] || basePrompt;
}

/**
 * 构建专业阶段的提示词
 */
function buildProfessionalPhasePrompt(phaseNum, phase, requirement, documentContent, currentCode, analysis) {
  const entity = analysis.entities[0] || { name: '数据', fields: ['名称', '描述', '状态'] };
  const features = analysis.features.length > 0 ? analysis.features : ['搜索', '添加', '编辑', '删除', '分页', '导出'];

  // 第一阶段：从零开始构建
  if (phaseNum === 1) {
    return `## 项目需求
${requirement || '创建一个专业的数据管理系统'}

${documentContent ? `## 需求文档（重要！根据这个生成真实数据）\n${documentContent.slice(0, 5000)}\n` : ''}

## 数据分析
- 主要实体：${entity.name}
- 数据字段：${entity.fields.join('、')}
- 功能需求：${features.join('、')}

## 第1阶段任务：构建专业CSS设计系统和页面骨架

生成一个完整的HTML文件，包含：

### 1. CSS设计系统（300+行）
\`\`\`
:root {
  /* 主题色 */
  --primary-color: #1890ff;
  --primary-hover: #40a9ff;
  --primary-active: #096dd9;
  
  /* 功能色 */
  --success-color: #52c41a;
  --warning-color: #faad14;
  --error-color: #ff4d4f;
  --info-color: #1890ff;
  
  /* 中性色 */
  --heading-color: rgba(0, 0, 0, 0.85);
  --text-color: rgba(0, 0, 0, 0.65);
  --text-secondary: rgba(0, 0, 0, 0.45);
  --disabled-color: rgba(0, 0, 0, 0.25);
  --border-color: #d9d9d9;
  --divider-color: #f0f0f0;
  --background-color: #f5f5f5;
  --component-background: #ffffff;
  
  /* 阴影 */
  --shadow-1: 0 2px 8px rgba(0, 0, 0, 0.15);
  --shadow-2: 0 4px 12px rgba(0, 0, 0, 0.15);
  
  /* 圆角 */
  --border-radius-sm: 2px;
  --border-radius-base: 4px;
  --border-radius-lg: 8px;
  
  /* 间距 */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* 字体 */
  --font-size-sm: 12px;
  --font-size-base: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  --font-size-xxl: 24px;
  
  /* 布局 */
  --sidebar-width: 240px;
  --sidebar-collapsed-width: 64px;
  --header-height: 64px;
}
\`\`\`

### 2. 页面布局结构（100+行HTML）
- 顶部导航栏：Logo、菜单、搜索框、消息图标、用户头像下拉
- 左侧边栏：可折叠、多级菜单、图标
- 面包屑导航
- 页面标题区
- 统计卡片区（4个占位）
- 工具栏（搜索框、筛选、按钮组）
- 数据表格区
- 分页区
- 底部版权

### 3. 组件样式
- 按钮组件（主要、次要、危险、禁用态）
- 卡片组件
- 表格组件
- 表单组件
- 弹窗组件
- Toast组件

### 4. 动画效果
- 淡入淡出
- 滑动
- 缩放

直接输出完整代码：`;
  }

  // 后续阶段：基于现有代码扩展
  const phaseTasks = {
    2: `## 第2阶段任务：数据展示层

在现有代码基础上，添加：

### 1. 数据数组（20+条真实数据）
根据需求生成真实的${entity.name}数据，字段包括：${entity.fields.join('、')}
每条数据要有唯一ID、创建时间、状态等

### 2. 统计卡片（4个）
- 总${entity.name}数
- 本月新增
- 活跃数量
- 待处理数
每个卡片要有：图标、数值、趋势（↑↓）、对比

### 3. 数据表格
- 表头：复选框、序号、${entity.fields.slice(0, 5).join('、')}、状态、操作
- 表格行渲染函数
- 状态标签（不同颜色）
- 操作按钮（查看、编辑、删除）

### 4. 表格功能
- 行选择（单选、多选）
- 行悬停效果
- 斑马纹

确保所有函数都有完整实现！`,

    3: `## 第3阶段任务：完整交互功能

在现有代码基础上，添加：

### 1. 搜索功能
- 实时搜索过滤
- 搜索结果高亮
- 空结果提示

### 2. 添加${entity.name}弹窗
- 完整的表单（${entity.fields.slice(0, 5).join('、')}）
- 表单验证（必填、格式）
- 提交处理
- 关闭/取消

### 3. 编辑${entity.name}弹窗
- 数据回显
- 修改保存
- 验证逻辑

### 4. 查看详情弹窗
- 详细信息展示
- 只读模式

### 5. 删除确认
- 确认弹窗
- 删除逻辑

### 6. 分页功能
- 页码显示
- 上一页/下一页
- 跳转指定页
- 每页条数选择

### 7. Toast通知
- 成功/警告/错误类型
- 自动消失
- 可手动关闭

所有函数必须完整实现！`,

    4: `## 第4阶段任务：高级功能

在现有代码基础上，添加：

### 1. 数据导出
- 导出为CSV
- 下载功能

### 2. 批量操作
- 全选/取消全选
- 批量删除
- 批量状态修改

### 3. 键盘快捷键
- Ctrl+N：新增
- Delete：删除选中
- Ctrl+F：聚焦搜索框
- Escape：关闭弹窗

### 4. 表格增强
- 列排序（点击表头）
- 列宽调整
- 列显示/隐藏切换

### 5. 数据刷新
- 刷新按钮
- 加载状态

### 6. 筛选增强
- 状态筛选
- 日期范围筛选
- 筛选标签显示`,

    5: `## 第5阶段任务：UI打磨

在现有代码基础上，添加：

### 1. 加载状态
- 表格骨架屏
- 按钮加载状态
- 全局加载遮罩

### 2. 空状态
- 无数据时的空状态图
- 搜索无结果

### 3. 动画增强
- 弹窗动画（淡入+缩放）
- 列表项动画（依次出现）
- 按钮点击波纹效果
- Toast滑入

### 4. 响应式
- 移动端侧边栏隐藏
- 表格横向滚动
- 卡片自适应

### 5. 暗色主题（可选）
- 主题切换按钮
- 暗色配色

### 6. 微交互
- 悬停状态优化
- 聚焦状态
- 选中状态`,

    6: `## 第6阶段任务：代码校验与修复

检查并修复以下问题：

### 1. 功能完整性检查
- 所有按钮是否绑定了事件
- 所有函数是否有实际实现（禁止空函数）
- 弹窗的打开/关闭是否正常
- 表单提交是否有处理

### 2. 代码质量检查
- 是否有语法错误
- 是否有未定义的变量
- 事件监听是否正确

### 3. UI完整性检查
- 所有样式是否完整
- 响应式是否生效
- 动画是否流畅

### 4. 数据检查
- 数据数组是否完整（20+条）
- CRUD操作是否正确更新数据

如果发现任何问题，请修复并输出完整的修复后代码。
如果代码已经完善，直接输出当前代码。`
  };

  const task = phaseTasks[phaseNum] || '继续完善代码';

  return `## 当前代码（保留所有现有功能）
\`\`\`html
${currentCode.slice(0, 20000)}
\`\`\`

## 原始需求
${requirement || '创建数据管理系统'}

${task}

## 关键要求
1. **输出完整HTML文件**（不是代码片段）
2. **保留现有所有功能和样式**
3. **新增内容与现有代码合并**
4. **目标代码量：${phase.minLines}+ 行**
5. **所有函数必须有实际实现**
6. **不要省略任何代码**

请输出完整的更新后代码：

\`\`\`html
`;
}

/**
 * 获取HTML轮次的系统提示词（兼容旧版）
 */
function getHtmlRoundSystemPrompt(roundNum, round) {
  return `你是一位资深的前端开发专家。你的任务是生成高质量的纯HTML页面代码。

## 最重要的规则
1. 只输出代码，不要有任何解释或描述
2. 代码必须包裹在 \`\`\`html 代码块中
3. 输出完整的HTML文件，包含所有CSS和JavaScript
4. 代码量必须充足，当前轮次目标至少 ${round.minLines} 行
5. 所有功能都必须有实际实现，不能是空函数

## 第 ${roundNum} 轮重点：${round.desc}

## 代码质量要求
- HTML5语义化标签
- CSS使用变量、渐变、阴影、动画
- JavaScript使用ES6+语法
- 详细的中文注释
- 现代化UI设计`;
}

/**
 * 构建HTML轮次的提示词
 */
function buildHtmlRoundPrompt(roundNum, round, requirement, documentContent, currentCode, analysis) {
  const entity = analysis.entities[0] || { name: '数据', fields: ['名称', '描述', '状态'] };
  const features = analysis.features.length > 0 ? analysis.features : ['搜索', '添加', '编辑', '删除', '分页'];

  if (roundNum === 1) {
    // 第一轮：生成基础结构
    return `## 需求
${requirement || '创建一个数据管理系统'}

${documentContent ? `## 需求文档（重要！根据这个生成真实数据）\n${documentContent.slice(0, 4000)}\n` : ''}

## 数据分析
- 主要实体：${entity.name}
- 字段：${entity.fields.join('、')}
- 功能：${features.join('、')}

## 第1轮任务：生成完整的HTML基础结构

请生成一个完整的HTML文件，必须包含：

### HTML结构（约100行）
- DOCTYPE和完整的head
- 顶部导航栏（logo、菜单、搜索框、用户头像、通知图标）
- 左侧菜单栏（5个以上菜单项，带图标，可折叠）
- 主内容区（面包屑、标题、统计卡片区、表格区）
- 底部版权

### CSS样式（约200行）
- CSS变量定义主题色
- 布局样式（flex、grid）
- 导航栏样式
- 侧边栏样式
- 卡片样式
- 表格样式
- 按钮样式（多种颜色和状态）
- 响应式媒体查询
- 悬停效果和过渡动画

### JavaScript（约50行）
- 侧边栏折叠功能
- 菜单切换功能
- 基础事件绑定

直接输出代码：

\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${entity.name}管理系统</title>
  <style>
    /* CSS变量 */
    :root {
      --primary-color: #3b82f6;
      --primary-dark: #2563eb;
      /* 更多变量... */
    }
    /* 完整的CSS样式... */
  </style>
</head>
<body>
  <!-- 完整的HTML结构... -->
  <script>
    // JavaScript代码...
  </script>
</body>
</html>
\`\`\``;
  }

  // 后续轮次：基于现有代码扩展
  const roundTasks = {
    2: `## 第2轮任务：添加数据和表格功能

在现有代码基础上，添加：

### 数据部分
- JavaScript数组存储数据（至少15条，根据需求生成真实的${entity.name}数据）
- 数据字段：${entity.fields.join('、')}
- 每条数据要有真实、合理的值

### 表格功能
- 表格渲染函数
- 表头（复选框、序号、${entity.fields.slice(0, 5).join('、')}、操作）
- 表格行渲染
- 行选择功能
- 操作按钮（查看、编辑、删除）

### 统计卡片
- 4个统计卡片（总数、活跃数、今日新增、待处理）
- 卡片样式和图标`,

    3: `## 第3轮任务：添加交互功能

在现有代码基础上，添加：

### 搜索和筛选
- 搜索框实时过滤
- 状态筛选下拉框
- 日期范围筛选

### 弹窗功能
- 添加数据弹窗（表单、验证、提交）
- 编辑数据弹窗
- 删除确认弹窗
- 查看详情弹窗

### 分页功能
- 分页组件
- 页码切换
- 每页条数选择

### Toast提示
- 成功/错误/警告提示
- 自动消失`,

    4: `## 第4轮任务：优化和完善

在现有代码基础上，添加：

### 加载状态
- 表格加载骨架屏
- 按钮加载状态
- 全局加载遮罩

### 空状态
- 无数据时的空状态显示
- 搜索无结果提示

### 动画效果
- 弹窗动画
- 列表项动画
- 按钮点击效果

### 响应式优化
- 移动端适配
- 侧边栏响应式

### 代码注释
- 为所有函数添加详细注释
- 关键逻辑说明`
  };

  return `## 当前代码
\`\`\`html
${currentCode.slice(0, 15000)}
\`\`\`

## 原始需求
${requirement || '创建数据管理系统'}

${roundTasks[roundNum] || '继续完善代码'}

## 重要要求
1. 输出完整的HTML文件（不是代码片段）
2. 保留原有的所有功能和样式
3. 新增内容要与现有代码合并
4. 目标代码量：${round.minLines}+ 行
5. 不要省略任何代码

请输出完整的更新后代码：

\`\`\`html
`;
}

// ==================== 导出模块 ====================

module.exports = {
  // 核心生成函数
  generateCode,
  modifyCode,
  streamHtmlGenerate,
  multiRoundGenerate,
  streamMultiRoundGenerate,
  
  // 10步分模块生成相关
  generateStepContent,
  getStepPrompts,
  extractCodeFromResponse,
  manualIntegrateModules,
  
  // HTML上传解析
  parseUploadedHtml,
  
  // 代码处理
  parseCodeBlocks,
  buildFullReactCode,
  extractHtmlCode,
  validateHtmlStructure,
  enhanceFinalCode,
  
  // 需求分析
  analyzeRequirementForData,
  
  // 提示词相关
  buildHtmlPrompt,
  getProfessionalSystemPrompt,
  buildProfessionalPhasePrompt,
  
  // 模板
  getQuickTemplate,
  
  // 配置和常量
  GENERATION_CONFIG,
  HTML_SYSTEM_PROMPT,
  PROFESSIONAL_UI_SYSTEM_PROMPT,
  CODE_GENERATOR_SYSTEM_PROMPT
};
