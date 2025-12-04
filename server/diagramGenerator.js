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

module.exports = {
  generateDiagramWithKroki,
  encodeDiagram,
  extractMermaidCode,
  generateDefaultArchitectureMermaid,
  generatePlantUMLArchitecture,
  ARCHITECTURE_DIAGRAM_PROMPT,
  COMPONENT_ARCHITECTURE_PROMPT,
  KROKI_BASE_URL
};
