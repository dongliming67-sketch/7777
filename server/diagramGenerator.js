/**
 * 架构图生成模块
 * 支持生成类似企业级分层架构图，可导出为PNG/SVG用于Word文档
 * 使用 Kroki.io 免费API 渲染 Mermaid/PlantUML 代码
 */

const axios = require('axios');
const zlib = require('zlib');

// Kroki API 配置
const KROKI_BASE_URL = 'https://kroki.io';

/**
 * 将图表代码编码为Kroki URL格式
 * @param {string} diagramSource - 图表源代码
 * @returns {string} - Base64编码后的字符串
 */
function encodeDiagram(diagramSource) {
  const compressed = zlib.deflateSync(Buffer.from(diagramSource, 'utf-8'));
  return compressed.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * 通过Kroki API生成图表
 * @param {string} diagramType - 图表类型: mermaid, plantuml, graphviz, d2
 * @param {string} diagramSource - 图表源代码
 * @param {string} outputFormat - 输出格式: svg, png, pdf
 * @returns {Promise<Buffer>} - 图片Buffer
 */
async function generateDiagramWithKroki(diagramType, diagramSource, outputFormat = 'svg') {
  try {
    // 方式1: POST请求（推荐，不需要编码）
    const response = await axios.post(
      `${KROKI_BASE_URL}/${diagramType}/${outputFormat}`,
      diagramSource,
      {
        headers: {
          'Content-Type': 'text/plain'
        },
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );
    return response.data;
  } catch (error) {
    console.error('Kroki API调用失败:', error.message);
    
    // 方式2: GET请求（备用）
    try {
      const encoded = encodeDiagram(diagramSource);
      const url = `${KROKI_BASE_URL}/${diagramType}/${outputFormat}/${encoded}`;
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      return response.data;
    } catch (fallbackError) {
      throw new Error(`图表生成失败: ${fallbackError.message}`);
    }
  }
}

/**
 * 架构图AI提示词 - 用于让AI生成Mermaid代码
 */
const ARCHITECTURE_DIAGRAM_PROMPT = `你是一个专业的软件架构师，擅长绘制清晰、专业的系统架构图。

## 任务
根据用户提供的需求文档，生成一个分层架构图的Mermaid代码。

## 架构图风格要求（参考企业级架构图）
1. **分层结构**：使用subgraph表示不同层级（如：应用层、服务层、数据层）
2. **模块分组**：同一层内的相关模块用subgraph分组
3. **清晰命名**：节点名称使用中文，简洁明了
4. **数据流向**：用箭头表示层级间的数据流向

## Mermaid代码规范
\`\`\`mermaid
graph TB
    subgraph 应用层
        subgraph 决策指挥
            A1[综合态势]
            A2[资产态势]
            A3[风险态势]
        end
        subgraph 监测分析
            B1[资产管理]
            B2[安全分析]
        end
    end
    
    subgraph 服务层
        subgraph 业务支撑
            C1[设备管控]
            C2[告警通报]
        end
        subgraph 基础服务
            D1[权限服务]
            D2[日志服务]
        end
    end
    
    subgraph 数据层
        E1[(原始日志)]
        E2[(规则库)]
        E3[(资产库)]
    end
    
    应用层 --> 服务层
    服务层 --> 数据层
\`\`\`

## 输出要求
1. 只输出Mermaid代码，不要其他解释
2. 代码必须以 \`\`\`mermaid 开头，以 \`\`\` 结尾
3. 节点ID使用英文字母+数字（如A1, B2）
4. 节点显示名称使用中文
5. 根据文档内容合理划分3-5个层级
6. 每个层级包含2-6个模块
7. 使用subgraph嵌套表示模块分组`;

/**
 * 组件库架构图提示词（类似图片1的风格）
 */
const COMPONENT_ARCHITECTURE_PROMPT = `你是一个前端架构师，擅长绘制组件库/微前端架构图。

## 任务
根据用户提供的需求文档，生成一个组件库/模块化架构图的Mermaid代码。

## 架构图风格要求
1. **横向分层**：顶部是子系统/应用，中间是组件库，底部是配置/工具
2. **模块嵌套**：packages内部按业务域分组（如：运输、操作、车队）
3. **独立模块**：UI组件库、工具库等独立展示

## Mermaid代码示例
\`\`\`mermaid
graph TB
    subgraph 子系统层
        direction LR
        S1[调度工作台]
        S2[运输中心]
        S3[路由基础]
    end
    
    subgraph 组件库
        subgraph packages
            subgraph 运输模块
                P1[线路搜索]
                P2[中心选择]
            end
            subgraph 操作模块
                P3[人员搜索]
                P4[岗位搜索]
            end
            subgraph 车队模块
                P5[车队选择]
                P6[车牌搜索]
            end
        end
        
        subgraph 配置公共方法
            C1[utils]
            C2[env]
            C3[api]
        end
        
        subgraph 文档
            D1[examples]
            D2[docs]
        end
    end
    
    subgraph UI组件
        U1[ZUI组件库]
    end
    
    子系统层 --> 组件库
    组件库 --> UI组件
\`\`\`

## 输出要求
1. 只输出Mermaid代码
2. 根据文档识别出的功能模块进行分组
3. 使用direction LR让同层模块横向排列
4. 节点名称简洁，使用中文`;

/**
 * 从AI响应中提取Mermaid代码
 * @param {string} aiResponse - AI的响应文本
 * @returns {string|null} - 提取的Mermaid代码
 */
function extractMermaidCode(aiResponse) {
  // 匹配 ```mermaid ... ``` 代码块
  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/i;
  const match = aiResponse.match(mermaidRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // 如果没有代码块标记，尝试直接匹配graph开头的内容
  const graphRegex = /(graph\s+(?:TB|TD|BT|RL|LR)[\s\S]*)/i;
  const graphMatch = aiResponse.match(graphRegex);
  
  if (graphMatch && graphMatch[1]) {
    return graphMatch[1].trim();
  }
  
  return null;
}

/**
 * 生成默认的分层架构图Mermaid代码
 * @param {string} systemName - 系统名称
 * @param {Array} modules - 模块列表
 * @returns {string} - Mermaid代码
 */
function generateDefaultArchitectureMermaid(systemName = '系统', modules = []) {
  const defaultModules = modules.length > 0 ? modules : [
    { layer: '应用层', items: ['用户界面', '业务展示', '数据可视化'] },
    { layer: '服务层', items: ['业务逻辑', '数据处理', '接口服务'] },
    { layer: '数据层', items: ['数据存储', '缓存服务', '日志服务'] }
  ];
  
  let mermaidCode = `graph TB\n`;
  mermaidCode += `    title[${systemName}架构图]\n`;
  mermaidCode += `    style title fill:#fff,stroke:none\n\n`;
  
  defaultModules.forEach((layer, layerIndex) => {
    const layerId = `L${layerIndex + 1}`;
    mermaidCode += `    subgraph ${layerId}[${layer.layer}]\n`;
    mermaidCode += `        direction LR\n`;
    
    layer.items.forEach((item, itemIndex) => {
      const nodeId = `${layerId}_${itemIndex + 1}`;
      mermaidCode += `        ${nodeId}[${item}]\n`;
    });
    
    mermaidCode += `    end\n\n`;
  });
  
  // 添加层级间连接
  for (let i = 0; i < defaultModules.length - 1; i++) {
    mermaidCode += `    L${i + 1} --> L${i + 2}\n`;
  }
  
  return mermaidCode;
}

/**
 * PlantUML架构图模板（备用方案，样式更丰富）
 */
function generatePlantUMLArchitecture(systemName, layers) {
  let code = `@startuml
!define RECTANGLE class
skinparam backgroundColor #FEFEFE
skinparam handwritten false

skinparam rectangle {
    BackgroundColor<<应用层>> #E3F2FD
    BackgroundColor<<服务层>> #FFF3E0
    BackgroundColor<<数据层>> #E8F5E9
    BorderColor #666666
    FontSize 14
}

title ${systemName}架构图

`;

  layers.forEach(layer => {
    code += `rectangle "${layer.name}" <<${layer.type}>> {\n`;
    layer.modules.forEach(mod => {
      code += `    rectangle "${mod}"\n`;
    });
    code += `}\n\n`;
  });

  code += `@enduml`;
  return code;
}

/**
 * 根据COSMIC数据生成HTML+CSS时序图
 * @param {Array} dataMovements - COSMIC数据移动序列
 * @param {string} processName - 功能过程名称
 * @returns {string} - HTML+CSS代码
 */
function generateHTMLSequenceDiagram(dataMovements, processName) {
  if (!dataMovements || dataMovements.length === 0) {
    return '';
  }
  
  // 生成唯一ID避免冲突
  const diagramId = `seq_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  let stepsHtml = '';
  let stepNum = 1;
  
  dataMovements.forEach(m => {
    const type = (m.dataMovementType || '').toUpperCase().trim();
    const desc = m.subProcessDesc || '操作';
    
    let arrow = '';
    let from = '';
    let to = '';
    let color = '';
    
    if (type === 'E') {
      from = '用户';
      to = '系统';
      arrow = '→';
      color = '#4CAF50';
    } else if (type === 'R') {
      from = '系统';
      to = '数据库';
      arrow = '→';
      color = '#2196F3';
    } else if (type === 'W') {
      from = '系统';
      to = '数据库';
      arrow = '→';
      color = '#FF9800';
    } else if (type === 'X') {
      from = '系统';
      to = '用户';
      arrow = '←';
      color = '#9C27B0';
    }
    
    if (from && to) {
      stepsHtml += `
        <div class="seq-step">
          <div class="step-num" style="background:${color}">${stepNum}</div>
          <div class="step-content">
            <span class="step-from">${from}</span>
            <span class="step-arrow" style="color:${color}">${arrow}</span>
            <span class="step-to">${to}</span>
            <span class="step-type" style="background:${color}">${type}</span>
          </div>
          <div class="step-desc">${desc}</div>
        </div>`;
      stepNum++;
    }
  });
  
  return `
<div id="${diagramId}" class="sequence-diagram">
  <style>
    #${diagramId} {
      font-family: 'Microsoft YaHei', Arial, sans-serif;
      background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
      border-radius: 12px;
      padding: 20px;
      margin: 16px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    #${diagramId} .seq-title {
      text-align: center;
      font-size: 16px;
      font-weight: bold;
      color: #333;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #ddd;
    }
    #${diagramId} .seq-participants {
      display: flex;
      justify-content: space-around;
      margin-bottom: 20px;
    }
    #${diagramId} .participant {
      background: #fff;
      border: 2px solid #667eea;
      border-radius: 8px;
      padding: 10px 24px;
      font-weight: bold;
      color: #333;
      box-shadow: 0 2px 8px rgba(102,126,234,0.2);
    }
    #${diagramId} .seq-step {
      display: flex;
      align-items: center;
      margin: 12px 0;
      padding: 12px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    }
    #${diagramId} .step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      margin-right: 16px;
    }
    #${diagramId} .step-content {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 200px;
    }
    #${diagramId} .step-from, #${diagramId} .step-to {
      font-weight: 500;
      color: #555;
    }
    #${diagramId} .step-arrow {
      font-size: 20px;
      font-weight: bold;
    }
    #${diagramId} .step-type {
      color: #fff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
    }
    #${diagramId} .step-desc {
      flex: 1;
      color: #666;
      font-size: 14px;
      margin-left: 16px;
    }
  </style>
  <div class="seq-title">📊 ${processName} - 操作时序图</div>
  <div class="seq-participants">
    <div class="participant">👤 用户</div>
    <div class="participant">🖥️ 系统</div>
    <div class="participant">🗄️ 数据库</div>
  </div>
  ${stepsHtml}
</div>`;
}

/**
 * 根据COSMIC数据生成HTML+CSS流程图
 * @param {Array} dataMovements - COSMIC数据移动序列
 * @param {string} processName - 功能过程名称
 * @returns {string} - HTML+CSS代码
 */
function generateHTMLFlowchart(dataMovements, processName) {
  if (!dataMovements || dataMovements.length === 0) {
    return '';
  }
  
  const diagramId = `flow_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  let nodesHtml = '';
  
  dataMovements.forEach((m, idx) => {
    const type = (m.dataMovementType || '').toUpperCase().trim();
    const desc = m.subProcessDesc || '操作';
    
    let bgColor = '#e3f2fd';
    let borderColor = '#2196F3';
    let icon = '📋';
    
    if (type === 'E') {
      bgColor = '#e8f5e9';
      borderColor = '#4CAF50';
      icon = '📥';
    } else if (type === 'R') {
      bgColor = '#e3f2fd';
      borderColor = '#2196F3';
      icon = '📖';
    } else if (type === 'W') {
      bgColor = '#fff3e0';
      borderColor = '#FF9800';
      icon = '📝';
    } else if (type === 'X') {
      bgColor = '#f3e5f5';
      borderColor = '#9C27B0';
      icon = '📤';
    }
    
    nodesHtml += `
      <div class="flow-node" style="background:${bgColor};border-color:${borderColor}">
        <div class="node-icon">${icon}</div>
        <div class="node-content">
          <div class="node-type">${type} - ${type === 'E' ? '输入' : type === 'R' ? '读取' : type === 'W' ? '写入' : '输出'}</div>
          <div class="node-desc">${desc}</div>
        </div>
      </div>
      ${idx < dataMovements.length - 1 ? '<div class="flow-arrow">↓</div>' : ''}
    `;
  });
  
  return `
<div id="${diagramId}" class="flowchart-diagram">
  <style>
    #${diagramId} {
      font-family: 'Microsoft YaHei', Arial, sans-serif;
      background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%);
      border-radius: 12px;
      padding: 24px;
      margin: 16px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    #${diagramId} .flow-title {
      text-align: center;
      font-size: 16px;
      font-weight: bold;
      color: #333;
      margin-bottom: 24px;
    }
    #${diagramId} .flow-container {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    #${diagramId} .flow-node {
      display: flex;
      align-items: center;
      padding: 16px 24px;
      border-radius: 12px;
      border: 3px solid;
      min-width: 300px;
      box-shadow: 0 3px 10px rgba(0,0,0,0.1);
    }
    #${diagramId} .node-icon {
      font-size: 28px;
      margin-right: 16px;
    }
    #${diagramId} .node-type {
      font-weight: bold;
      color: #333;
      font-size: 14px;
    }
    #${diagramId} .node-desc {
      color: #666;
      font-size: 13px;
      margin-top: 4px;
    }
    #${diagramId} .flow-arrow {
      font-size: 24px;
      color: #999;
      margin: 8px 0;
    }
  </style>
  <div class="flow-title">📊 ${processName} - 操作流程图</div>
  <div class="flow-container">
    ${nodesHtml}
  </div>
</div>`;
}

/**
 * 生成HTML+CSS格式的用例图
 * @param {Array} actors - 用户角色列表 [{name: '管理员', description: '系统管理员'}]
 * @param {Array} useCases - 用例列表 [{name: '用户登录', actor: '管理员', description: '...'}]
 * @param {string} systemName - 系统名称
 * @returns {string} - HTML+CSS代码
 */
function generateHTMLUseCaseDiagram(actors, useCases, systemName = '系统') {
  const diagramId = `usecase_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  // 按角色分组用例
  const actorUseCases = {};
  actors.forEach(actor => {
    actorUseCases[actor.name] = useCases.filter(uc => 
      uc.actor === actor.name || uc.actors?.includes(actor.name)
    );
  });
  
  // 生成角色HTML
  let actorsHtml = '';
  actors.forEach((actor, idx) => {
    const colors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140'];
    const color = colors[idx % colors.length];
    actorsHtml += `
      <div class="actor" style="--actor-color: ${color}">
        <div class="actor-icon">👤</div>
        <div class="actor-name">${actor.name}</div>
      </div>`;
  });
  
  // 生成用例HTML
  let useCasesHtml = '';
  useCases.forEach((uc, idx) => {
    useCasesHtml += `
      <div class="usecase" data-actor="${uc.actor || ''}">
        <div class="usecase-ellipse">
          <span class="usecase-name">${uc.name}</span>
        </div>
      </div>`;
  });
  
  // 生成连接线（通过CSS实现）
  let connectionsHtml = '';
  
  return `
<div id="${diagramId}" class="usecase-diagram">
  <style>
    #${diagramId} {
      font-family: 'Microsoft YaHei', Arial, sans-serif;
      background: linear-gradient(135deg, #f8f9fc 0%, #e8ecf3 100%);
      border-radius: 16px;
      padding: 32px;
      margin: 20px 0;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
      min-height: 400px;
    }
    #${diagramId} .diagram-title {
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      color: #1a1a2e;
      margin-bottom: 8px;
    }
    #${diagramId} .diagram-subtitle {
      text-align: center;
      font-size: 14px;
      color: #666;
      margin-bottom: 32px;
    }
    #${diagramId} .diagram-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 40px;
    }
    #${diagramId} .actors-section {
      display: flex;
      flex-direction: column;
      gap: 24px;
      min-width: 120px;
    }
    #${diagramId} .actor {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(102,126,234,0.15);
      border: 2px solid var(--actor-color);
      transition: transform 0.2s;
    }
    #${diagramId} .actor:hover {
      transform: translateY(-4px);
    }
    #${diagramId} .actor-icon {
      font-size: 48px;
      margin-bottom: 8px;
    }
    #${diagramId} .actor-name {
      font-weight: 600;
      color: #333;
      font-size: 14px;
    }
    #${diagramId} .system-boundary {
      flex: 1;
      background: white;
      border: 3px solid #667eea;
      border-radius: 20px;
      padding: 24px;
      position: relative;
    }
    #${diagramId} .system-label {
      position: absolute;
      top: -14px;
      left: 24px;
      background: #667eea;
      color: white;
      padding: 4px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
    }
    #${diagramId} .usecases-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 20px;
      margin-top: 16px;
    }
    #${diagramId} .usecase {
      display: flex;
      justify-content: center;
    }
    #${diagramId} .usecase-ellipse {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50px;
      padding: 16px 28px;
      min-width: 140px;
      text-align: center;
      box-shadow: 0 4px 16px rgba(102,126,234,0.3);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #${diagramId} .usecase-ellipse:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 24px rgba(102,126,234,0.4);
    }
    #${diagramId} .usecase-name {
      color: white;
      font-weight: 500;
      font-size: 13px;
      line-height: 1.4;
    }
    #${diagramId} .legend {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      justify-content: center;
      gap: 32px;
      font-size: 12px;
      color: #666;
    }
    #${diagramId} .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #${diagramId} .legend-actor {
      width: 24px;
      height: 24px;
      background: #f0f0f0;
      border: 2px solid #667eea;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }
    #${diagramId} .legend-usecase {
      width: 60px;
      height: 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
    }
  </style>
  
  <div class="diagram-title">📊 ${systemName} - 用例图</div>
  <div class="diagram-subtitle">Use Case Diagram</div>
  
  <div class="diagram-container">
    <div class="actors-section">
      ${actorsHtml}
    </div>
    
    <div class="system-boundary">
      <div class="system-label">🖥️ ${systemName}</div>
      <div class="usecases-grid">
        ${useCasesHtml}
      </div>
    </div>
  </div>
  
  <div class="legend">
    <div class="legend-item">
      <div class="legend-actor">👤</div>
      <span>参与者 (Actor)</span>
    </div>
    <div class="legend-item">
      <div class="legend-usecase"></div>
      <span>用例 (Use Case)</span>
    </div>
  </div>
</div>`;
}

/**
 * ========== 深度分析提示词 ==========
 */

/**
 * 用例图深度分析提示词（第一阶段：思考分析）
 */
const USE_CASE_THINKING_PROMPT = `你是资深的需求分析师和UML建模专家。请对以下功能需求进行深度分析，为生成用例图做准备。

## 分析任务
请从以下维度深入分析：

### 1. 系统边界分析
- 系统的核心职责是什么？
- 系统与外部的交互边界在哪里？
- 哪些功能属于系统内部，哪些涉及外部交互？

### 2. 参与者识别
- 有哪些不同类型的用户会使用这个系统？
- 每类用户的职责和权限有什么区别？
- 是否有外部系统作为参与者？
- 参与者之间是否存在泛化关系（如：VIP用户继承普通用户）？

### 3. 用例提取
- 每个功能对应什么用例？
- 用例之间是否存在包含关系（include）？
- 用例之间是否存在扩展关系（extend）？
- 哪些是主要用例，哪些是次要用例？

### 4. 关联关系分析
- 每个用例由哪个参与者触发？
- 一个用例是否可以被多个参与者使用？
- 用例的执行顺序和依赖关系是什么？

### 5. 分组建议
- 用例可以按什么维度分组（如：用户管理、业务处理、系统配置）？
- 每个分组包含哪些用例？

请详细输出你的分析思考过程。`;

/**
 * 用例图生成提示词（第二阶段：生成JSON）
 */
const USE_CASE_DIAGRAM_PROMPT = `你是专业的需求分析师。基于之前的深度分析，现在请生成用例图的JSON数据。

## 之前的分析结论：
{THINKING_RESULT}

## 输出格式（必须是JSON）
\`\`\`json
{
  "systemName": "系统名称",
  "actors": [
    {"name": "管理员", "description": "系统管理人员", "type": "primary"},
    {"name": "普通用户", "description": "系统使用者", "type": "primary"},
    {"name": "外部系统", "description": "对接的第三方系统", "type": "external"}
  ],
  "useCases": [
    {"name": "用户登录", "actor": "普通用户", "description": "用户通过账号密码登录系统", "group": "用户管理"},
    {"name": "权限配置", "actor": "管理员", "description": "配置用户角色和权限", "group": "系统配置"}
  ],
  "groups": ["用户管理", "业务处理", "系统配置"]
}
\`\`\`

## 重要规则
1. actors数组必须包含所有识别出的参与者，type为primary（主要）或external（外部）
2. useCases数组必须覆盖所有功能，每个用例必须指定group分组
3. groups数组列出所有用例分组
4. 用例名称简洁（2-8个字），但要准确反映功能
5. 确保每个用例都关联到正确的参与者

请只输出JSON，不要其他解释。`;

/**
 * 优先级象限图深度分析提示词
 */
const QUADRANT_THINKING_PROMPT = `你是资深的产品经理和需求分析专家。请对以下功能需求进行深度分析，为生成优先级象限图做准备。

## 分析任务
请从以下维度深入分析每个功能：

### 1. 业务价值评估
- 该功能对核心业务流程的重要性如何？
- 该功能对用户体验的影响程度？
- 该功能是否是差异化竞争优势？
- 该功能的商业价值（收入、成本节约）？

### 2. 紧急程度评估
- 该功能是否有明确的上线时间要求？
- 该功能是否阻塞其他功能的开发？
- 该功能是否涉及合规或法规要求？
- 用户对该功能的期望程度？

### 3. 实现复杂度
- 该功能的技术实现难度？
- 该功能需要的开发资源？
- 该功能是否依赖外部系统？

### 4. 象限分类建议
请将每个功能分配到以下四个象限之一：
- Q1（紧急且重要）：必须立即处理的核心功能
- Q2（重要不紧急）：需要规划的战略功能
- Q3（紧急不重要）：可以委托或简化的功能
- Q4（不紧急不重要）：可以延后或删除的功能

请详细输出你的分析思考过程，并给出每个功能的象限分类建议。`;

/**
 * 优先级象限图生成提示词
 */
const QUADRANT_DIAGRAM_PROMPT = `你是专业的产品经理。基于之前的深度分析，现在请生成优先级象限图的JSON数据。

## 之前的分析结论：
{THINKING_RESULT}

## 输出格式（必须是JSON）
\`\`\`json
{
  "title": "需求优先级象限图",
  "quadrants": {
    "Q1": {
      "name": "紧急且重要",
      "color": "#c62828",
      "items": [
        {"name": "用户登录", "reason": "核心入口功能"},
        {"name": "权限控制", "reason": "安全基础"}
      ]
    },
    "Q2": {
      "name": "重要不紧急",
      "color": "#ef6c00",
      "items": [
        {"name": "数据分析", "reason": "提升决策效率"}
      ]
    },
    "Q3": {
      "name": "紧急不重要",
      "color": "#1565c0",
      "items": [
        {"name": "通知提醒", "reason": "用户期望高但非核心"}
      ]
    },
    "Q4": {
      "name": "不紧急不重要",
      "color": "#2e7d32",
      "items": [
        {"name": "主题切换", "reason": "锦上添花功能"}
      ]
    }
  }
}
\`\`\`

## 重要规则
1. 每个象限至少包含1个功能，分布要合理
2. 每个功能必须有reason说明分类理由
3. 确保所有功能都被分配到某个象限
4. Q1通常占20-30%，Q2占30-40%，Q3占15-25%，Q4占10-20%

请只输出JSON，不要其他解释。`;

/**
 * 功能架构图深度分析提示词
 */
const ARCHITECTURE_THINKING_PROMPT = `你是资深的系统架构师。请对以下功能需求进行深度分析，为生成功能架构图做准备。

## 分析任务
请从以下维度深入分析：

### 1. 功能模块识别
- 系统包含哪些主要功能模块？
- 每个模块的核心职责是什么？
- 模块之间的依赖关系如何？

### 2. 层级划分
- 功能可以划分为哪几个层级？
- 每个层级的职责边界是什么？
- 层级之间的调用关系如何？

### 3. 模块分组
- 功能可以按什么维度分组（如：业务域、用户类型、技术特性）？
- 每个分组包含哪些具体功能？
- 分组之间是否有交互？

### 4. 技术组件
- 系统需要哪些基础技术组件（数据库、缓存、消息队列等）？
- 这些组件如何支撑上层业务功能？

### 5. 架构建议
- 推荐采用什么架构风格（分层、微服务、事件驱动等）？
- 关键的架构决策点是什么？

请详细输出你的分析思考过程。`;

/**
 * 功能架构图生成提示词
 */
const ARCHITECTURE_DIAGRAM_PROMPT_V2 = `你是专业的系统架构师。基于之前的深度分析，现在请生成功能架构图的JSON数据。

## 之前的分析结论：
{THINKING_RESULT}

## 输出格式（必须是JSON）
\`\`\`json
{
  "systemName": "XXX系统功能架构图",
  "layers": [
    {
      "name": "应用层",
      "description": "面向用户的应用功能",
      "groups": [
        {
          "name": "用户中心",
          "modules": ["用户注册", "用户登录", "个人信息", "密码管理"]
        },
        {
          "name": "业务管理",
          "modules": ["订单管理", "商品管理", "库存管理", "价格管理"]
        }
      ]
    },
    {
      "name": "服务层",
      "description": "核心业务服务",
      "groups": [
        {
          "name": "基础服务",
          "modules": ["认证服务", "授权服务", "日志服务", "通知服务"]
        }
      ]
    },
    {
      "name": "数据层",
      "description": "数据存储和访问",
      "groups": [
        {
          "name": "数据存储",
          "modules": ["业务数据库", "缓存服务", "文件存储", "搜索引擎"]
        }
      ]
    }
  ]
}
\`\`\`

## 重要规则
1. layers数组按从上到下的层级顺序排列
2. 每个layer包含多个groups，每个group包含多个modules
3. modules必须来自实际的功能需求，不要编造
4. 每层2-4个分组，每个分组3-8个模块
5. 模块名称简洁（2-6个字）

请只输出JSON，不要其他解释。`;

/**
 * 从AI响应中提取用例图JSON
 */
function extractUseCaseJSON(aiResponse) {
  try {
    // 尝试匹配JSON代码块
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)```/i);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1].trim());
    }
    
    // 尝试直接解析
    const directMatch = aiResponse.match(/\{[\s\S]*"actors"[\s\S]*"useCases"[\s\S]*\}/);
    if (directMatch) {
      return JSON.parse(directMatch[0]);
    }
    
    return null;
  } catch (e) {
    console.error('解析用例图JSON失败:', e.message);
    return null;
  }
}

/**
 * 生成HTML+CSS格式的数据流图
 */
function generateHTMLDataFlowDiagram(entities, flows, systemName = '系统') {
  const diagramId = `dfd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  let entitiesHtml = entities.map((e, idx) => `
    <div class="entity" style="--entity-hue: ${(idx * 60) % 360}">
      <div class="entity-icon">${e.type === 'external' ? '👥' : e.type === 'store' ? '🗄️' : '⚙️'}</div>
      <div class="entity-name">${e.name}</div>
    </div>
  `).join('');
  
  let flowsHtml = flows.map(f => `
    <div class="flow-item">
      <span class="flow-from">${f.from}</span>
      <span class="flow-arrow">→</span>
      <span class="flow-data">${f.data}</span>
      <span class="flow-arrow">→</span>
      <span class="flow-to">${f.to}</span>
    </div>
  `).join('');
  
  return `
<div id="${diagramId}" class="dfd-diagram">
  <style>
    #${diagramId} {
      font-family: 'Microsoft YaHei', Arial, sans-serif;
      background: linear-gradient(135deg, #fff5f5 0%, #fef2f2 100%);
      border-radius: 16px;
      padding: 32px;
      margin: 20px 0;
      box-shadow: 0 8px 32px rgba(0,0,0,0.08);
    }
    #${diagramId} .dfd-title {
      text-align: center;
      font-size: 18px;
      font-weight: bold;
      color: #333;
      margin-bottom: 24px;
    }
    #${diagramId} .entities-row {
      display: flex;
      justify-content: space-around;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 24px;
    }
    #${diagramId} .entity {
      background: white;
      border: 2px solid hsl(var(--entity-hue), 70%, 60%);
      border-radius: 12px;
      padding: 16px 24px;
      text-align: center;
      box-shadow: 0 4px 12px hsla(var(--entity-hue), 70%, 60%, 0.2);
    }
    #${diagramId} .entity-icon { font-size: 32px; margin-bottom: 8px; }
    #${diagramId} .entity-name { font-weight: 600; color: #333; }
    #${diagramId} .flows-section {
      background: white;
      border-radius: 12px;
      padding: 20px;
    }
    #${diagramId} .flow-item {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 12px;
      border-bottom: 1px solid #f0f0f0;
    }
    #${diagramId} .flow-from, #${diagramId} .flow-to {
      background: #e3f2fd;
      padding: 4px 12px;
      border-radius: 6px;
      font-weight: 500;
    }
    #${diagramId} .flow-data {
      background: #fff3e0;
      padding: 4px 12px;
      border-radius: 6px;
      color: #e65100;
    }
    #${diagramId} .flow-arrow { color: #999; font-size: 18px; }
  </style>
  <div class="dfd-title">📊 ${systemName} - 数据流图</div>
  <div class="entities-row">${entitiesHtml}</div>
  <div class="flows-section">${flowsHtml}</div>
</div>`;
}

/**
 * 使用Puppeteer将HTML转换为图片
 * 注意：需要安装 puppeteer: npm install puppeteer
 * @param {string} htmlContent - HTML内容
 * @param {Object} options - 选项 {width, height, type}
 * @returns {Promise<Buffer>} - 图片Buffer
 */
async function htmlToImage(htmlContent, options = {}) {
  const { width = 800, height = 600, type = 'png' } = options;
  
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    console.warn('Puppeteer未安装，无法生成图片。请运行: npm install puppeteer');
    return null;
  }
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    
    // 设置完整的HTML页面
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 20px; background: white; }
        </style>
      </head>
      <body>${htmlContent}</body>
      </html>
    `;
    
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    
    // 获取内容实际尺寸
    const bodyHandle = await page.$('body > div');
    const boundingBox = bodyHandle ? await bodyHandle.boundingBox() : null;
    
    let screenshotOptions = { type, encoding: 'binary' };
    
    if (boundingBox) {
      screenshotOptions.clip = {
        x: boundingBox.x,
        y: boundingBox.y,
        width: Math.ceil(boundingBox.width) + 40,
        height: Math.ceil(boundingBox.height) + 40
      };
    } else {
      screenshotOptions.fullPage = true;
    }
    
    const imageBuffer = await page.screenshot(screenshotOptions);
    return imageBuffer;
    
  } catch (error) {
    console.error('HTML转图片失败:', error.message);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 将图片Buffer转换为Base64 Data URL
 */
function bufferToDataUrl(buffer, mimeType = 'image/png') {
  if (!buffer) return null;
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * 从AI响应中提取通用JSON
 */
function extractDiagramJSON(aiResponse) {
  try {
    // 尝试匹配JSON代码块
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)```/i);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1].trim());
    }
    
    // 尝试直接解析JSON对象
    const directMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (directMatch) {
      return JSON.parse(directMatch[0]);
    }
    
    return null;
  } catch (e) {
    console.error('解析图表JSON失败:', e.message);
    return null;
  }
}

/**
 * 基于AI分析结果生成用例图 HTML（增强版）
 * @param {Object} analysisResult - AI分析返回的JSON
 * @param {string} systemName - 系统名称
 * @returns {string} HTML字符串
 */
function generateUseCaseDiagramFromAnalysis(analysisResult, systemName = '系统') {
  const diagramId = `usecase_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  const actors = analysisResult?.actors || [];
  const useCases = analysisResult?.useCases || [];
  const groups = analysisResult?.groups || [];
  const title = analysisResult?.systemName || systemName;
  
  // 按分组组织用例
  const groupedUseCases = {};
  groups.forEach(g => { groupedUseCases[g] = []; });
  useCases.forEach(uc => {
    const group = uc.group || '其他';
    if (!groupedUseCases[group]) groupedUseCases[group] = [];
    groupedUseCases[group].push(uc);
  });
  
  // 生成参与者HTML
  const actorsHtml = actors.map((actor, idx) => `
    <div style="display: flex; flex-direction: column; align-items: center; margin: 10px 15px;">
      <div style="font-size: 40px;">${actor.type === 'external' ? '🖥️' : '👤'}</div>
      <div style="font-weight: bold; margin-top: 5px; font-size: 13px;">${actor.name}</div>
      <div style="font-size: 11px; color: #666; max-width: 80px; text-align: center;">${actor.description || ''}</div>
    </div>
  `).join('');
  
  // 生成分组用例HTML
  const groupsHtml = Object.entries(groupedUseCases).map(([groupName, cases]) => {
    if (cases.length === 0) return '';
    const casesHtml = cases.map(uc => `
      <div style="background: #e3f2fd; border: 2px solid #1976d2; border-radius: 20px; padding: 8px 16px; margin: 5px; font-size: 12px; display: inline-block;">
        ${uc.name}
        <span style="font-size: 10px; color: #666; display: block;">${uc.actor || ''}</span>
      </div>
    `).join('');
    return `
      <div style="margin-bottom: 15px;">
        <div style="font-weight: bold; color: #1565c0; margin-bottom: 8px; font-size: 13px; border-bottom: 1px solid #90caf9; padding-bottom: 4px;">📁 ${groupName}</div>
        <div style="display: flex; flex-wrap: wrap;">${casesHtml}</div>
      </div>
    `;
  }).join('');
  
  return `
<div id="${diagramId}" style="font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 25px; background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%); border-radius: 12px; margin: 20px 0;">
  <div style="text-align: center; margin-bottom: 20px;">
    <h3 style="margin: 0; color: #1976d2; font-size: 18px;">📊 ${title} - 用例图</h3>
    <p style="margin: 5px 0 0; color: #666; font-size: 12px;">Use Case Diagram</p>
  </div>
  
  <div style="display: flex; gap: 20px; align-items: flex-start;">
    <!-- 参与者区域 -->
    <div style="background: #fff; border-radius: 8px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); min-width: 120px;">
      <div style="font-weight: bold; color: #333; margin-bottom: 10px; text-align: center; font-size: 13px;">参与者</div>
      ${actorsHtml}
    </div>
    
    <!-- 系统边界 -->
    <div style="flex: 1; background: #fff; border: 3px solid #1976d2; border-radius: 12px; padding: 20px; position: relative;">
      <div style="position: absolute; top: -12px; left: 20px; background: #1976d2; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px;">🖥️ ${title}</div>
      ${groupsHtml}
    </div>
  </div>
  
  <!-- 图例 -->
  <div style="display: flex; justify-content: center; gap: 30px; margin-top: 20px; font-size: 11px; color: #666;">
    <div style="display: flex; align-items: center; gap: 5px;">
      <span style="font-size: 16px;">👤</span> 主要参与者
    </div>
    <div style="display: flex; align-items: center; gap: 5px;">
      <span style="font-size: 16px;">🖥️</span> 外部系统
    </div>
    <div style="display: flex; align-items: center; gap: 5px;">
      <div style="background: #e3f2fd; border: 2px solid #1976d2; border-radius: 12px; padding: 2px 8px; font-size: 10px;">用例</div>
    </div>
  </div>
</div>`;
}

/**
 * 基于AI分析结果生成优先级象限图 HTML（增强版）
 * @param {Object} analysisResult - AI分析返回的JSON
 * @returns {string} HTML字符串
 */
function generateQuadrantDiagramFromAnalysis(analysisResult) {
  const diagramId = `quadrant_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  const title = analysisResult?.title || '需求优先级象限图';
  const quadrants = analysisResult?.quadrants || {};
  
  const q1 = quadrants.Q1?.items || [];
  const q2 = quadrants.Q2?.items || [];
  const q3 = quadrants.Q3?.items || [];
  const q4 = quadrants.Q4?.items || [];
  
  const renderItems = (items, maxShow = 8) => {
    const shown = items.slice(0, maxShow);
    const remaining = items.length - maxShow;
    return shown.map(item => `
      <div style="margin: 4px 0; padding: 4px 8px; background: rgba(255,255,255,0.7); border-radius: 4px; font-size: 12px;">
        <strong>${item.name}</strong>
        ${item.reason ? `<span style="color: #666; font-size: 10px; display: block;">${item.reason}</span>` : ''}
      </div>
    `).join('') + (remaining > 0 ? `<div style="color: #666; font-size: 11px; margin-top: 5px;">...还有${remaining}项</div>` : '');
  };
  
  return `
<div id="${diagramId}" style="font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 25px; background: white; border-radius: 12px; margin: 20px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
  <div style="text-align: center; margin-bottom: 20px;">
    <h3 style="margin: 0; color: #333; font-size: 18px;">📊 ${title}</h3>
    <p style="margin: 5px 0 0; color: #666; font-size: 12px;">Priority Quadrant Diagram</p>
  </div>
  
  <!-- 坐标轴标签 -->
  <div style="display: flex; justify-content: center; margin-bottom: 10px;">
    <span style="font-weight: bold; color: #333;">← 紧急程度 →</span>
  </div>
  
  <div style="display: flex; align-items: center;">
    <!-- 左侧标签 -->
    <div style="writing-mode: vertical-rl; text-orientation: mixed; font-weight: bold; color: #333; margin-right: 10px;">
      ↑ 重要程度 ↓
    </div>
    
    <!-- 象限网格 -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 3px; flex: 1; border: 2px solid #333; border-radius: 8px; overflow: hidden;">
      <!-- Q1: 紧急且重要 -->
      <div style="background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); padding: 15px; min-height: 180px;">
        <div style="font-weight: bold; color: #c62828; margin-bottom: 10px; font-size: 14px;">🔴 紧急且重要 (${q1.length})</div>
        ${renderItems(q1)}
      </div>
      
      <!-- Q2: 重要不紧急 -->
      <div style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); padding: 15px; min-height: 180px;">
        <div style="font-weight: bold; color: #ef6c00; margin-bottom: 10px; font-size: 14px;">🟠 重要不紧急 (${q2.length})</div>
        ${renderItems(q2)}
      </div>
      
      <!-- Q3: 紧急不重要 -->
      <div style="background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); padding: 15px; min-height: 180px;">
        <div style="font-weight: bold; color: #1565c0; margin-bottom: 10px; font-size: 14px;">🔵 紧急不重要 (${q3.length})</div>
        ${renderItems(q3)}
      </div>
      
      <!-- Q4: 不紧急不重要 -->
      <div style="background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 15px; min-height: 180px;">
        <div style="font-weight: bold; color: #2e7d32; margin-bottom: 10px; font-size: 14px;">🟢 不紧急不重要 (${q4.length})</div>
        ${renderItems(q4)}
      </div>
    </div>
  </div>
  
  <!-- 统计信息 -->
  <div style="display: flex; justify-content: center; gap: 20px; margin-top: 15px; font-size: 12px; color: #666;">
    <span>共 ${q1.length + q2.length + q3.length + q4.length} 项需求</span>
    <span>|</span>
    <span>Q1: ${q1.length} | Q2: ${q2.length} | Q3: ${q3.length} | Q4: ${q4.length}</span>
  </div>
</div>`;
}

/**
 * 基于AI分析结果生成功能架构图 HTML（增强版）
 * @param {Object} analysisResult - AI分析返回的JSON
 * @returns {string} HTML字符串
 */
function generateArchitectureDiagramFromAnalysis(analysisResult) {
  const diagramId = `arch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  const systemName = analysisResult?.systemName || '系统功能架构图';
  const layers = analysisResult?.layers || [];
  
  const layerColors = [
    { bg: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)', border: '#1976d2', label: '#1565c0' },
    { bg: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)', border: '#f57c00', label: '#ef6c00' },
    { bg: 'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)', border: '#7b1fa2', label: '#6a1b9a' },
    { bg: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)', border: '#388e3c', label: '#2e7d32' },
    { bg: 'linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%)', border: '#c2185b', label: '#ad1457' }
  ];
  
  const layersHtml = layers.map((layer, layerIdx) => {
    const color = layerColors[layerIdx % layerColors.length];
    
    const groupsHtml = (layer.groups || []).map(group => {
      const modulesHtml = (group.modules || []).map(mod => `
        <div style="background: white; border: 1px solid ${color.border}; border-radius: 6px; padding: 6px 10px; margin: 3px; font-size: 11px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          ${mod}
        </div>
      `).join('');
      
      return `
        <div style="background: rgba(255,255,255,0.5); border-radius: 8px; padding: 12px; margin: 5px; min-width: 150px;">
          <div style="font-weight: bold; color: ${color.label}; margin-bottom: 8px; font-size: 13px; text-align: center;">${group.name}</div>
          <div style="display: flex; flex-wrap: wrap; justify-content: center;">
            ${modulesHtml}
          </div>
        </div>
      `;
    }).join('');
    
    return `
      <div style="background: ${color.bg}; border: 2px solid ${color.border}; border-radius: 10px; padding: 15px; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
          <div style="background: ${color.border}; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 14px;">
            ${layer.name}
          </div>
          ${layer.description ? `<span style="margin-left: 10px; color: #666; font-size: 12px;">${layer.description}</span>` : ''}
        </div>
        <div style="display: flex; flex-wrap: wrap; justify-content: center;">
          ${groupsHtml}
        </div>
      </div>
    `;
  }).join('');
  
  return `
<div id="${diagramId}" style="font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 25px; background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%); border-radius: 12px; margin: 20px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
  <div style="text-align: center; margin-bottom: 20px;">
    <h3 style="margin: 0; color: #333; font-size: 18px;">🏗️ ${systemName}</h3>
    <p style="margin: 5px 0 0; color: #666; font-size: 12px;">Function Architecture Diagram</p>
  </div>
  
  ${layersHtml}
  
  <!-- 基础设施层 -->
  <div style="background: linear-gradient(135deg, #37474f 0%, #263238 100%); color: white; text-align: center; padding: 12px; border-radius: 8px; font-size: 12px; margin-top: 10px;">
    <span style="margin: 0 15px;">💾 数据库</span>
    <span style="margin: 0 15px;">⚡ 缓存</span>
    <span style="margin: 0 15px;">📨 消息队列</span>
    <span style="margin: 0 15px;">📝 日志服务</span>
    <span style="margin: 0 15px;">🔒 安全组件</span>
  </div>
</div>`;
}

/**
 * 生成优先级象限图 HTML（简单版，兼容旧代码）
 * @param {Array} functions - 功能列表
 * @returns {string} HTML字符串
 */
function generatePriorityQuadrantDiagram(functions = []) {
  // 将功能分配到四个象限
  const total = functions.length;
  const q1 = functions.slice(0, Math.ceil(total * 0.3)); // 高优先级-高紧急
  const q2 = functions.slice(Math.ceil(total * 0.3), Math.ceil(total * 0.5)); // 高优先级-低紧急
  const q3 = functions.slice(Math.ceil(total * 0.5), Math.ceil(total * 0.8)); // 低优先级-高紧急
  const q4 = functions.slice(Math.ceil(total * 0.8)); // 低优先级-低紧急
  
  return `
<div style="font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 20px; background: white;">
  <div style="text-align: center; margin-bottom: 20px;">
    <h3 style="margin: 0; color: #333;">需求优先级象限图</h3>
  </div>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; width: 600px; height: 400px; margin: 0 auto; border: 2px solid #333;">
    <!-- 第一象限：高优先级-高紧急 -->
    <div style="background: #ffebee; padding: 15px; border-right: 1px solid #333; border-bottom: 1px solid #333;">
      <div style="font-weight: bold; color: #c62828; margin-bottom: 10px;">🔴 紧急且重要</div>
      <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #333;">
        ${q1.slice(0, 5).map(f => `<li>${f.name}</li>`).join('')}
        ${q1.length > 5 ? `<li style="color: #666;">...等${q1.length}项</li>` : ''}
      </ul>
    </div>
    <!-- 第二象限：高优先级-低紧急 -->
    <div style="background: #fff3e0; padding: 15px; border-bottom: 1px solid #333;">
      <div style="font-weight: bold; color: #ef6c00; margin-bottom: 10px;">🟠 重要不紧急</div>
      <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #333;">
        ${q2.slice(0, 5).map(f => `<li>${f.name}</li>`).join('')}
        ${q2.length > 5 ? `<li style="color: #666;">...等${q2.length}项</li>` : ''}
      </ul>
    </div>
    <!-- 第三象限：低优先级-高紧急 -->
    <div style="background: #e3f2fd; padding: 15px; border-right: 1px solid #333;">
      <div style="font-weight: bold; color: #1565c0; margin-bottom: 10px;">🔵 紧急不重要</div>
      <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #333;">
        ${q3.slice(0, 5).map(f => `<li>${f.name}</li>`).join('')}
        ${q3.length > 5 ? `<li style="color: #666;">...等${q3.length}项</li>` : ''}
      </ul>
    </div>
    <!-- 第四象限：低优先级-低紧急 -->
    <div style="background: #e8f5e9; padding: 15px;">
      <div style="font-weight: bold; color: #2e7d32; margin-bottom: 10px;">🟢 不紧急不重要</div>
      <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #333;">
        ${q4.slice(0, 5).map(f => `<li>${f.name}</li>`).join('')}
        ${q4.length > 5 ? `<li style="color: #666;">...等${q4.length}项</li>` : ''}
      </ul>
    </div>
  </div>
  <div style="display: flex; justify-content: center; margin-top: 15px; font-size: 12px; color: #666;">
    <span style="margin-right: 20px;">← 紧急程度 →</span>
    <span>↑ 重要程度 ↓</span>
  </div>
</div>`;
}

/**
 * 生成功能架构图 HTML
 * @param {Array} functions - 功能列表
 * @param {string} systemName - 系统名称
 * @returns {string} HTML字符串
 */
function generateFunctionArchitectureDiagram(functions = [], systemName = '系统') {
  // 将功能按模块分组（简单按数量分）
  const moduleSize = Math.ceil(functions.length / 4);
  const modules = [];
  for (let i = 0; i < functions.length; i += moduleSize) {
    modules.push(functions.slice(i, i + moduleSize));
  }
  
  const moduleNames = ['核心业务模块', '数据管理模块', '系统配置模块', '辅助功能模块'];
  const moduleColors = ['#e3f2fd', '#fff3e0', '#e8f5e9', '#fce4ec'];
  
  return `
<div style="font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 20px; background: white;">
  <div style="text-align: center; margin-bottom: 20px;">
    <h3 style="margin: 0; color: #333;">${systemName} 功能架构图</h3>
  </div>
  
  <!-- 系统层 -->
  <div style="background: #1976d2; color: white; text-align: center; padding: 15px; border-radius: 8px 8px 0 0; font-weight: bold; font-size: 16px;">
    ${systemName}
  </div>
  
  <!-- 模块层 -->
  <div style="display: grid; grid-template-columns: repeat(${Math.min(modules.length, 4)}, 1fr); gap: 10px; padding: 15px; background: #f5f5f5; border: 1px solid #ddd;">
    ${modules.map((mod, idx) => `
      <div style="background: ${moduleColors[idx % 4]}; border-radius: 6px; padding: 12px; border: 1px solid #ddd;">
        <div style="font-weight: bold; color: #333; margin-bottom: 8px; text-align: center; font-size: 13px;">
          ${moduleNames[idx % 4]}
        </div>
        <ul style="margin: 0; padding-left: 15px; font-size: 11px; color: #555;">
          ${mod.slice(0, 4).map(f => `<li style="margin: 3px 0;">${f.name}</li>`).join('')}
          ${mod.length > 4 ? `<li style="color: #999;">...等${mod.length}项</li>` : ''}
        </ul>
      </div>
    `).join('')}
  </div>
  
  <!-- 基础层 -->
  <div style="background: #424242; color: white; text-align: center; padding: 10px; border-radius: 0 0 8px 8px; font-size: 12px;">
    数据库 | 缓存 | 消息队列 | 日志服务
  </div>
</div>`;
}

module.exports = {
  generateDiagramWithKroki,
  encodeDiagram,
  extractMermaidCode,
  generateDefaultArchitectureMermaid,
  generatePlantUMLArchitecture,
  generateHTMLSequenceDiagram,
  generateHTMLFlowchart,
  generateHTMLUseCaseDiagram,
  generateHTMLDataFlowDiagram,
  generatePriorityQuadrantDiagram,
  generateFunctionArchitectureDiagram,
  // 基于AI分析的增强版图表生成
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
  ARCHITECTURE_DIAGRAM_PROMPT_V2,
  // 旧版提示词（兼容）
  ARCHITECTURE_DIAGRAM_PROMPT,
  COMPONENT_ARCHITECTURE_PROMPT,
  KROKI_BASE_URL
};
