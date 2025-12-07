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

module.exports = {
  generateDiagramWithKroki,
  encodeDiagram,
  extractMermaidCode,
  generateDefaultArchitectureMermaid,
  generatePlantUMLArchitecture,
  generateHTMLSequenceDiagram,
  generateHTMLFlowchart,
  ARCHITECTURE_DIAGRAM_PROMPT,
  COMPONENT_ARCHITECTURE_PROMPT,
  KROKI_BASE_URL
};
