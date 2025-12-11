import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import html2canvas from 'html2canvas';
import pptxgen from 'pptxgenjs';
import {
  Layers,
  Download,
  RefreshCw,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Edit3,
  Save,
  Plus,
  Trash2,
  X,
  Check,
  FileSpreadsheet
} from 'lucide-react';

/**
 * 专业架构图生成组件
 * 生成类似企业级分层架构图（带左侧标签、彩色背景）
 */
function ArchitectureDiagram({ documentContent, documentName }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingContent, setThinkingContent] = useState('');
  const [architectureData, setArchitectureData] = useState(null);
  const [error, setError] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [currentPhase, setCurrentPhase] = useState(''); // 当前阶段
  const [isEditMode, setIsEditMode] = useState(false); // 编辑模式
  const [editingItem, setEditingItem] = useState(null); // 当前正在编辑的项目 {type, layerIdx, groupIdx, moduleIdx, value}
  const diagramRef = useRef(null);

  // 层级颜色配置
  const layerColors = {
    '应用层': { bg: '#FFF5F5', border: '#FFCDD2', label: '#E57373' },
    '服务层': { bg: '#FFFDE7', border: '#FFF59D', label: '#FFD54F' },
    '数据层': { bg: '#F3E5F5', border: '#CE93D8', label: '#BA68C8' },
    '基础设施层': { bg: '#E3F2FD', border: '#90CAF9', label: '#64B5F6' },
    '数据源': { bg: '#ECEFF1', border: '#B0BEC5', label: '#78909C' },
    '接入层': { bg: '#E8F5E9', border: '#A5D6A7', label: '#66BB6A' },
    'default': { bg: '#F5F5F5', border: '#E0E0E0', label: '#9E9E9E' }
  };

  // 第一阶段：深度思考提示词
  const THINKING_PROMPT = `你是一位资深系统架构师。请对以下需求文档进行深度分析，为后续生成架构图做准备。

## 分析任务
请从以下几个维度深入分析文档：

### 1. 系统概述分析
- 系统的名称和定位是什么？
- 系统要解决什么核心问题？
- 目标用户群体是谁？

### 2. 功能模块识别
- 文档中提到了哪些具体的功能模块？
- 这些功能之间有什么关联关系？
- 哪些是核心功能，哪些是辅助功能？

### 3. 技术架构分析
- 系统涉及哪些技术组件？
- 数据流是如何流转的？
- 有哪些外部系统需要对接？

### 4. 层级划分建议
- 建议划分为哪几个层级？
- 每个层级应该包含哪些模块？
- 层级之间的调用关系是什么？

### 5. 关键发现
- 文档中有哪些重要的业务逻辑？
- 有哪些特殊的技术要求？
- 需要特别注意的架构设计点？

请详细输出你的分析思考过程，使用中文回答。

---
需求文档内容：
`;

  // 第二阶段：生成架构图JSON提示词
  const GENERATE_PROMPT = `你是一位资深系统架构师。基于之前的深度分析，现在请生成架构图的JSON数据。

## 之前的分析结论：
{THINKING_RESULT}

## 输出要求
请严格按照以下JSON格式输出，只输出JSON代码块，不要有其他内容：

\`\`\`json
{
  "systemName": "XXX系统技术架构图",
  "layers": [
    {
      "name": "应用层",
      "groups": [
        {
          "name": "分组名称",
          "modules": ["模块1", "模块2", "模块3", "模块4"]
        }
      ]
    }
  ]
}
\`\`\`

## 重要规则
1. **完全基于文档**：所有模块名称必须从文档中提取，禁止编造
2. **层级划分**：通常分为 应用层、服务层、数据层、基础设施层 等3-5层
3. **分组均衡**：每层2-4个分组，每个分组5-10个模块，尽量均匀分布
4. **模块简洁**：modules数组直接用字符串，不需要对象格式
5. **名称专业**：使用文档中的专业术语，保持简洁（2-6个字）
6. **覆盖全面**：提取文档中所有功能模块，不要遗漏

## 原始需求文档：
`;

  // 生成架构图（两阶段：深度思考 + 生成）
  const generateDiagram = async () => {
    if (!documentContent) {
      setError('请先上传需求文档');
      return;
    }

    setIsThinking(true);
    setIsGenerating(false);
    setError('');
    setThinkingContent('');
    setArchitectureData(null);
    setCurrentPhase('thinking');

    try {
      // ========== 第一阶段：深度思考 ==========
      const thinkingResponse = await axios.post('/api/chat', {
        messages: [
          {
            role: 'user',
            content: THINKING_PROMPT + documentContent.slice(0, 15000)
          }
        ]
      });

      if (!thinkingResponse.data.success) {
        throw new Error(thinkingResponse.data.error || '深度分析失败');
      }

      const thinkingResult = thinkingResponse.data.reply;
      setThinkingContent(thinkingResult);
      setIsThinking(false);
      
      // ========== 第二阶段：生成架构图 ==========
      setIsGenerating(true);
      setCurrentPhase('generating');
      
      const generatePrompt = GENERATE_PROMPT
        .replace('{THINKING_RESULT}', thinkingResult)
        + documentContent.slice(0, 10000);

      const generateResponse = await axios.post('/api/chat', {
        messages: [
          {
            role: 'user',
            content: generatePrompt
          }
        ]
      });

      if (!generateResponse.data.success) {
        throw new Error(generateResponse.data.error || '生成架构图失败');
      }

      const reply = generateResponse.data.reply;
      
      // 提取JSON
      const jsonMatch = reply.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          setArchitectureData(data);
          setCurrentPhase('done');
        } catch (e) {
          // 尝试直接匹配JSON对象
          const objMatch = reply.match(/\{[\s\S]*\}/);
          if (objMatch) {
            const data = JSON.parse(objMatch[0]);
            setArchitectureData(data);
            setCurrentPhase('done');
          } else {
            setError('JSON解析失败，请重试');
          }
        }
      } else {
        // 尝试直接匹配JSON对象
        const objMatch = reply.match(/\{[\s\S]*\}/);
        if (objMatch) {
          try {
            const data = JSON.parse(objMatch[0]);
            setArchitectureData(data);
            setCurrentPhase('done');
          } catch (e) {
            setError('未能提取架构数据，请重试');
          }
        } else {
          setError('未能提取架构数据，请重试');
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsThinking(false);
      setIsGenerating(false);
    }
  };

  // 下载为PNG图片
  const downloadImage = async () => {
    if (!diagramRef.current) return;

    try {
      const canvas = await html2canvas(diagramRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true
      });
      
      const link = document.createElement('a');
      link.download = `${documentName || 'architecture'}_架构图.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      setError('导出图片失败: ' + err.message);
    }
  };

  // 获取层级颜色
  const getLayerColor = (layerName) => {
    for (const key of Object.keys(layerColors)) {
      if (layerName.includes(key) || key.includes(layerName)) {
        return layerColors[key];
      }
    }
    return layerColors.default;
  };

  // 导出为PPT（可编辑）
  const downloadPPT = async () => {
    if (!architectureData) return;

    try {
      const pptx = new pptxgen();
      pptx.layout = 'LAYOUT_WIDE'; // 16:9 宽屏
      pptx.title = architectureData.systemName || '系统架构图';
      pptx.author = '架构图生成器';

      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };

      // PPT尺寸（英寸）- LAYOUT_WIDE: 13.33 x 7.5
      const slideWidth = 13.33;
      const slideHeight = 7.5;
      const margin = 0.3;
      const labelWidth = 0.8; // 左侧层级标签宽度
      const contentStartX = margin + labelWidth;
      const contentWidth = slideWidth - contentStartX - margin;

      // 标题
      slide.addText(architectureData.systemName || '系统架构图', {
        x: margin,
        y: margin,
        w: slideWidth - margin * 2,
        h: 0.5,
        fontSize: 24,
        bold: true,
        align: 'center',
        color: '333333'
      });

      // 计算每层高度
      const titleHeight = 0.7;
      const availableHeight = slideHeight - titleHeight - margin * 2;
      const layerCount = architectureData.layers?.length || 1;
      const layerGap = 0.1;
      const layerHeight = (availableHeight - layerGap * (layerCount - 1)) / layerCount;

      // 颜色映射（PPT格式，不带#）
      const pptLayerColors = {
        '应用层': { bg: 'FFF5F5', border: 'FFCDD2', label: 'E57373' },
        '服务层': { bg: 'FFFDE7', border: 'FFF59D', label: 'FFD54F' },
        '数据层': { bg: 'F3E5F5', border: 'CE93D8', label: 'BA68C8' },
        '基础设施层': { bg: 'E3F2FD', border: '90CAF9', label: '64B5F6' },
        '数据源': { bg: 'ECEFF1', border: 'B0BEC5', label: '78909C' },
        '接入层': { bg: 'E8F5E9', border: 'A5D6A7', label: '66BB6A' },
        'default': { bg: 'F5F5F5', border: 'E0E0E0', label: '9E9E9E' }
      };

      const getPptColor = (layerName) => {
        for (const key of Object.keys(pptLayerColors)) {
          if (layerName.includes(key) || key.includes(layerName)) {
            return pptLayerColors[key];
          }
        }
        return pptLayerColors.default;
      };

      // 绘制每个层级
      architectureData.layers?.forEach((layer, layerIdx) => {
        const colors = getPptColor(layer.name);
        const layerY = titleHeight + margin + layerIdx * (layerHeight + layerGap);

        // 左侧层级标签
        slide.addShape(pptx.ShapeType.rect, {
          x: margin,
          y: layerY,
          w: labelWidth,
          h: layerHeight,
          fill: { color: colors.label },
          line: { color: colors.border, width: 1 }
        });

        // 层级名称（竖排）
        slide.addText(layer.name.split('').join('\n'), {
          x: margin,
          y: layerY,
          w: labelWidth,
          h: layerHeight,
          fontSize: 11,
          bold: true,
          color: 'FFFFFF',
          align: 'center',
          valign: 'middle'
        });

        // 右侧内容区背景
        slide.addShape(pptx.ShapeType.rect, {
          x: contentStartX,
          y: layerY,
          w: contentWidth,
          h: layerHeight,
          fill: { color: colors.bg },
          line: { color: colors.border, width: 1 }
        });

        // 分组
        const groupCount = layer.groups?.length || 1;
        const groupWidth = contentWidth / groupCount;
        const groupHeaderHeight = 0.35;
        const moduleAreaHeight = layerHeight - groupHeaderHeight;

        layer.groups?.forEach((group, groupIdx) => {
          const groupX = contentStartX + groupIdx * groupWidth;

          // 分组标题背景
          slide.addShape(pptx.ShapeType.rect, {
            x: groupX,
            y: layerY,
            w: groupWidth,
            h: groupHeaderHeight,
            fill: { color: 'FFFFFF', transparency: 30 },
            line: { color: colors.border, width: 0.5 }
          });

          // 分组标题文字
          slide.addText(group.name, {
            x: groupX,
            y: layerY,
            w: groupWidth,
            h: groupHeaderHeight,
            fontSize: 10,
            bold: true,
            color: '333333',
            align: 'center',
            valign: 'middle'
          });

          // 模块
          const modules = group.modules || [];
          const modulesPerRow = Math.ceil(Math.sqrt(modules.length * 2)); // 每行模块数
          const moduleRows = Math.ceil(modules.length / modulesPerRow);
          const modulePadding = 0.05;
          const moduleWidth = (groupWidth - modulePadding * 2) / modulesPerRow - modulePadding;
          const moduleHeight = (moduleAreaHeight - modulePadding * 2) / moduleRows - modulePadding;

          modules.forEach((mod, modIdx) => {
            const moduleName = typeof mod === 'string' ? mod : mod.name;
            const row = Math.floor(modIdx / modulesPerRow);
            const col = modIdx % modulesPerRow;
            const modX = groupX + modulePadding + col * (moduleWidth + modulePadding);
            const modY = layerY + groupHeaderHeight + modulePadding + row * (moduleHeight + modulePadding);

            // 模块背景
            slide.addShape(pptx.ShapeType.rect, {
              x: modX,
              y: modY,
              w: moduleWidth,
              h: moduleHeight,
              fill: { color: 'FFFFFF' },
              line: { color: colors.border, width: 0.5 }
            });

            // 模块文字
            slide.addText(moduleName, {
              x: modX,
              y: modY,
              w: moduleWidth,
              h: moduleHeight,
              fontSize: 8,
              color: '333333',
              align: 'center',
              valign: 'middle'
            });
          });
        });
      });

      // 保存文件
      const fileName = `${documentName || 'architecture'}_架构图.pptx`;
      await pptx.writeFile({ fileName });
    } catch (err) {
      setError('导出PPT失败: ' + err.message);
    }
  };

  // ========== 编辑功能 ==========
  
  // 开始编辑某个项目
  const startEditing = (type, layerIdx, groupIdx = null, moduleIdx = null) => {
    if (!isEditMode) return;
    
    let value = '';
    if (type === 'systemName') {
      value = architectureData.systemName || '';
    } else if (type === 'layerName') {
      value = architectureData.layers[layerIdx].name || '';
    } else if (type === 'groupName') {
      value = architectureData.layers[layerIdx].groups[groupIdx].name || '';
    } else if (type === 'module') {
      const mod = architectureData.layers[layerIdx].groups[groupIdx].modules[moduleIdx];
      value = typeof mod === 'string' ? mod : mod.name;
    }
    
    setEditingItem({ type, layerIdx, groupIdx, moduleIdx, value });
  };

  // 保存编辑 - 接受直接传入的新值
  const saveEditing = (newValue) => {
    if (!editingItem) return;
    
    const newData = JSON.parse(JSON.stringify(architectureData));
    const { type, layerIdx, groupIdx, moduleIdx } = editingItem;
    const value = newValue !== undefined ? newValue : editingItem.value;
    
    if (type === 'systemName') {
      newData.systemName = value;
    } else if (type === 'layerName') {
      newData.layers[layerIdx].name = value;
    } else if (type === 'groupName') {
      newData.layers[layerIdx].groups[groupIdx].name = value;
    } else if (type === 'module') {
      newData.layers[layerIdx].groups[groupIdx].modules[moduleIdx] = value;
    }
    
    setArchitectureData(newData);
    setEditingItem(null);
  };

  // 取消编辑
  const cancelEditing = () => {
    setEditingItem(null);
  };

  // 添加层级
  const addLayer = () => {
    const newData = JSON.parse(JSON.stringify(architectureData));
    newData.layers.push({
      name: '新层级',
      groups: [{ name: '新分组', modules: ['新模块'] }]
    });
    setArchitectureData(newData);
  };

  // 删除层级
  const deleteLayer = (layerIdx) => {
    if (architectureData.layers.length <= 1) return;
    const newData = JSON.parse(JSON.stringify(architectureData));
    newData.layers.splice(layerIdx, 1);
    setArchitectureData(newData);
  };

  // 添加分组
  const addGroup = (layerIdx) => {
    const newData = JSON.parse(JSON.stringify(architectureData));
    newData.layers[layerIdx].groups.push({ name: '新分组', modules: ['新模块'] });
    setArchitectureData(newData);
  };

  // 删除分组
  const deleteGroup = (layerIdx, groupIdx) => {
    if (architectureData.layers[layerIdx].groups.length <= 1) return;
    const newData = JSON.parse(JSON.stringify(architectureData));
    newData.layers[layerIdx].groups.splice(groupIdx, 1);
    setArchitectureData(newData);
  };

  // 添加模块
  const addModule = (layerIdx, groupIdx) => {
    const newData = JSON.parse(JSON.stringify(architectureData));
    newData.layers[layerIdx].groups[groupIdx].modules.push('新模块');
    setArchitectureData(newData);
  };

  // 删除模块
  const deleteModule = (layerIdx, groupIdx, moduleIdx) => {
    if (architectureData.layers[layerIdx].groups[groupIdx].modules.length <= 1) return;
    const newData = JSON.parse(JSON.stringify(architectureData));
    newData.layers[layerIdx].groups[groupIdx].modules.splice(moduleIdx, 1);
    setArchitectureData(newData);
  };

  // 切换编辑模式
  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
    setEditingItem(null);
  };

  // 可编辑文本组件
  const EditableText = ({ value, onSave, onCancel, className = '' }) => {
    const [text, setText] = useState(value);
    const inputRef = useRef(null);

    useEffect(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, []);

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        onSave(text);
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };

    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`border border-blue-400 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-blue-300 ${className}`}
          style={{ minWidth: '60px' }}
        />
        <button
          onClick={() => onSave(text)}
          className="p-0.5 bg-green-500 text-white rounded hover:bg-green-600"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onClick={onCancel}
          className="p-0.5 bg-gray-400 text-white rounded hover:bg-gray-500"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6 transition-all duration-300">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6 border-b border-claude-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-claude-accent-primary flex items-center justify-center shadow-sm">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-serif font-bold text-claude-text-primary">架构图生成</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-claude-text-muted">基于AI的深度架构分析与可视化</span>
              <span className="text-[10px] bg-claude-bg-warm text-claude-accent-primary border border-claude-border-warm px-2 py-0.5 rounded-full font-medium">深度思考版</span>
            </div>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-3 mb-6 p-4 bg-claude-bg-warm rounded-xl border border-claude-border-warm">
        <button
          onClick={generateDiagram}
          disabled={isThinking || isGenerating || !documentContent}
          className="flex items-center gap-2 px-5 py-2.5 bg-claude-accent-primary text-white rounded-lg hover:bg-claude-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm font-medium"
        >
          {isThinking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              深度思考中...
            </>
          ) : isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              生成架构图...
            </>
          ) : (
            <>
              <Layers className="w-4 h-4" />
              生成架构图
            </>
          )}
        </button>

        {architectureData && (
          <>
            <div className="w-px h-8 bg-claude-border mx-1 self-center"></div>
            
            <button
              onClick={toggleEditMode}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all font-medium ${
                isEditMode 
                  ? 'bg-claude-text-primary text-white hover:bg-claude-text-secondary shadow-md' 
                  : 'bg-white border border-claude-border text-claude-text-secondary hover:text-claude-text-primary hover:bg-claude-bg-cream'
              }`}
            >
              {isEditMode ? (
                <>
                  <Save className="w-4 h-4" />
                  退出编辑
                </>
              ) : (
                <>
                  <Edit3 className="w-4 h-4" />
                  编辑模式
                </>
              )}
            </button>

            <button
              onClick={generateDiagram}
              disabled={isThinking || isGenerating}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-claude-border text-claude-text-secondary rounded-lg hover:bg-claude-bg-cream hover:text-claude-text-primary transition-all font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              重新生成
            </button>
            
            <div className="flex-1"></div>

            <button
              onClick={downloadImage}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-claude-border text-claude-text-secondary rounded-lg hover:bg-claude-bg-cream hover:text-claude-text-primary transition-all font-medium"
            >
              <Download className="w-4 h-4" />
              PNG
            </button>

            <button
              onClick={downloadPPT}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-claude-border text-claude-text-secondary rounded-lg hover:bg-claude-bg-cream hover:text-claude-text-primary transition-all font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" />
              PPT
            </button>
          </>
        )}
      </div>

      {/* 进度指示器 */}
      {(isThinking || isGenerating) && (
        <div className="mb-6 p-5 bg-white rounded-xl border border-claude-border shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm transition-all duration-500 ${currentPhase === 'thinking' ? 'bg-claude-accent-primary scale-110' : 'bg-green-500'}`}>
                1
              </div>
              <span className={`text-sm font-medium ${currentPhase === 'thinking' ? 'text-claude-accent-primary' : 'text-green-600'}`}>
                深度思考
              </span>
            </div>
            <div className="flex-1 h-1.5 bg-claude-bg-warm rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ease-out ${currentPhase === 'thinking' ? 'w-1/2 bg-claude-accent-primary/50' : 'w-full bg-green-500'}`}></div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm transition-all duration-500 ${currentPhase === 'generating' ? 'bg-claude-accent-primary scale-110 text-white' : currentPhase === 'done' ? 'bg-green-500 text-white' : 'bg-claude-bg-warm text-claude-text-muted border border-claude-border'}`}>
                2
              </div>
              <span className={`text-sm font-medium ${currentPhase === 'generating' ? 'text-claude-accent-primary' : currentPhase === 'done' ? 'text-green-600' : 'text-claude-text-muted'}`}>
                生成架构图
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-claude-text-secondary bg-claude-bg-warm p-3 rounded-lg border border-claude-border-warm">
            <Loader2 className="w-4 h-4 animate-spin text-claude-accent-primary" />
            <p>
              {currentPhase === 'thinking' && '🧠 正在深入分析文档内容，识别系统功能模块和架构层级...'}
              {currentPhase === 'generating' && '🎨 基于分析结果，正在生成专业架构图...'}
            </p>
          </div>
        </div>
      )}

      {/* 深度思考结果展示 */}
      {thinkingContent && (
        <div className="mb-6 border border-claude-border rounded-xl overflow-hidden shadow-sm transition-all hover:shadow-md">
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="w-full flex items-center justify-between p-4 bg-claude-bg-warm hover:bg-claude-bg-light transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-serif font-semibold text-claude-text-primary">
              <span className="text-lg">🧠</span>
              AI深度思考过程
              <span className="text-xs bg-white text-claude-text-secondary px-2 py-0.5 rounded border border-claude-border-warm font-sans font-normal ml-2">
                {thinkingContent.length} 字
              </span>
            </span>
            {showThinking ? <ChevronUp className="w-4 h-4 text-claude-text-muted" /> : <ChevronDown className="w-4 h-4 text-claude-text-muted" />}
          </button>
          
          {showThinking && (
            <div className="p-5 bg-white border-t border-claude-border max-h-[400px] overflow-auto custom-scrollbar">
              <div className="prose prose-sm max-w-none text-claude-text-secondary whitespace-pre-wrap leading-relaxed">
                {thinkingContent}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 text-red-700 border border-red-100 rounded-xl mb-6 shadow-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* 编辑模式提示 */}
      {isEditMode && architectureData && (
        <div className="mb-6 p-4 bg-claude-bg-warm border border-claude-accent-primary/30 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-claude-text-primary text-sm">
            <div className="w-8 h-8 rounded-full bg-claude-accent-primary/10 flex items-center justify-center text-claude-accent-primary">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold block text-claude-accent-primary">编辑模式已开启</span>
              <span className="text-claude-text-secondary text-xs">点击任意文字可编辑，使用按钮添加/删除元素</span>
            </div>
          </div>
        </div>
      )}

      {/* 架构图预览 */}
      {architectureData && (
        <div className={`border rounded-xl p-4 bg-claude-bg-cream mb-6 overflow-auto transition-all duration-300 ${isEditMode ? 'ring-2 ring-claude-accent-primary/50 shadow-md' : 'border-claude-border shadow-inner'}`}>
          <div 
            ref={diagramRef}
            className="bg-white p-8 min-w-[950px] rounded-lg shadow-sm"
            style={{ fontFamily: 'Microsoft YaHei, SimHei, sans-serif' }}
          >
            {/* 系统标题 */}
            <div className="text-center mb-8 pb-4 border-b-2 border-claude-border-warm relative">
              {editingItem?.type === 'systemName' ? (
                <div className="flex justify-center">
                  <EditableText
                    value={editingItem.value}
                    onSave={(text) => saveEditing(text)}
                    onCancel={cancelEditing}
                    className="text-2xl font-serif font-bold text-claude-text-primary"
                  />
                </div>
              ) : (
                <h2 
                  className={`text-2xl font-serif font-bold text-claude-text-primary tracking-wide ${isEditMode ? 'cursor-pointer hover:text-claude-accent-primary hover:bg-claude-bg-warm px-4 py-1 rounded-lg transition-all' : ''}`}
                  onClick={() => startEditing('systemName', null)}
                >
                  {architectureData.systemName || '系统架构图'}
                </h2>
              )}
            </div>

            {/* 分层架构 */}
            <div className="space-y-0">
              {architectureData.layers?.map((layer, layerIdx) => {
                const colors = getLayerColor(layer.name);
                const groupCount = layer.groups?.length || 1;
                return (
                  <div key={layerIdx} className="relative">
                    <div className="flex border border-claude-border-warm relative shadow-sm" style={{ borderTopWidth: layerIdx === 0 ? 1 : 0 }}>
                      {/* 编辑模式：层级操作按钮 */}
                      {isEditMode && (
                        <div className="absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-2">
                          <button
                            onClick={() => deleteLayer(layerIdx)}
                            className="p-2 bg-white border border-red-200 text-red-500 rounded-full hover:bg-red-50 shadow-sm transition-all"
                            title="删除层级"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* 左侧层级标签 */}
                      <div 
                        className={`w-24 flex-shrink-0 flex items-center justify-center font-bold text-claude-text-primary text-sm relative ${isEditMode ? 'cursor-pointer group' : ''}`}
                        style={{ 
                          backgroundColor: colors.bg,
                          minHeight: '100px',
                          borderRight: `3px solid ${colors.label}`
                        }}
                        onClick={() => startEditing('layerName', layerIdx)}
                      >
                        {editingItem?.type === 'layerName' && editingItem.layerIdx === layerIdx ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm p-1 z-10">
                            <EditableText
                              value={editingItem.value}
                              onSave={(text) => saveEditing(text)}
                              onCancel={cancelEditing}
                              className="text-xs w-20"
                            />
                          </div>
                        ) : (
                          <span 
                            style={{ writingMode: 'vertical-rl', letterSpacing: '0.2em' }}
                            className={`font-serif ${isEditMode ? 'group-hover:text-claude-accent-primary transition-colors' : ''}`}
                          >
                            {layer.name}
                          </span>
                        )}
                      </div>

                      {/* 右侧内容区 - 分组平铺 */}
                      <div 
                        className="flex-1 flex bg-white"
                      >
                        {layer.groups?.map((group, groupIdx) => (
                          <div 
                            key={groupIdx}
                            className="flex-1 border-r border-dashed border-claude-border-warm last:border-r-0 relative flex flex-col"
                            style={{ minWidth: `${100 / groupCount}%` }}
                          >
                            {/* 分组标题 */}
                            <div 
                              className={`px-4 py-2.5 text-center font-medium text-sm border-b border-dashed border-claude-border-warm relative ${isEditMode ? 'cursor-pointer hover:bg-claude-bg-warm transition-colors' : ''}`}
                              style={{ 
                                backgroundColor: isEditMode ? '' : `${colors.bg}40`,
                                color: '#444'
                              }}
                            >
                              {editingItem?.type === 'groupName' && editingItem.layerIdx === layerIdx && editingItem.groupIdx === groupIdx ? (
                                <EditableText
                                  value={editingItem.value}
                                  onSave={(text) => saveEditing(text)}
                                  onCancel={cancelEditing}
                                  className="text-sm"
                                />
                              ) : (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span 
                                    onClick={() => startEditing('groupName', layerIdx, groupIdx)}
                                    className={`font-semibold tracking-wide ${isEditMode ? 'hover:text-claude-accent-primary' : ''}`}
                                  >
                                    {group.name}
                                  </span>
                                  {isEditMode && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); deleteGroup(layerIdx, groupIdx); }}
                                      className="p-0.5 text-claude-text-light hover:text-red-500 rounded transition-colors"
                                      title="删除分组"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            {/* 模块列表 - 自适应填充 */}
                            <div className="p-3 flex-1 flex flex-col justify-center">
                              <div className="flex flex-wrap gap-2 justify-center content-center h-full">
                                {group.modules?.map((module, modIdx) => {
                                  const moduleName = typeof module === 'string' ? module : module.name;
                                  const isEditing = editingItem?.type === 'module' && 
                                    editingItem.layerIdx === layerIdx && 
                                    editingItem.groupIdx === groupIdx && 
                                    editingItem.moduleIdx === modIdx;
                                  
                                  return (
                                    <div
                                      key={modIdx}
                                      className={`flex-1 min-w-[100px] max-w-[180px] px-3 py-2 text-center text-xs border rounded shadow-sm relative group transition-all duration-200 ${
                                        isEditMode 
                                          ? 'cursor-pointer hover:border-claude-accent-primary hover:shadow-md bg-white' 
                                          : 'border-claude-border-warm bg-white hover:border-claude-border hover:shadow-md'
                                      }`}
                                      style={{
                                        borderColor: isEditing ? '#D97706' : undefined,
                                      }}
                                    >
                                      {isEditing ? (
                                        <EditableText
                                          value={editingItem.value}
                                          onSave={(text) => saveEditing(text)}
                                          onCancel={cancelEditing}
                                          className="text-xs w-full"
                                        />
                                      ) : (
                                        <>
                                          <span 
                                            onClick={() => startEditing('module', layerIdx, groupIdx, modIdx)}
                                            className="block truncate text-claude-text-primary"
                                            title={moduleName}
                                          >
                                            {moduleName}
                                          </span>
                                          {isEditMode && (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); deleteModule(layerIdx, groupIdx, modIdx); }}
                                              className="absolute -top-1.5 -right-1.5 p-0.5 bg-white border border-red-200 text-red-500 rounded-full hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                                              title="删除模块"
                                            >
                                              <X className="w-2.5 h-2.5" />
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                                
                                {/* 添加模块按钮 */}
                                {isEditMode && (
                                  <button
                                    onClick={() => addModule(layerIdx, groupIdx)}
                                    className="flex-1 min-w-[80px] max-w-[120px] px-2 py-1.5 text-center text-xs border border-dashed border-claude-border text-claude-text-muted hover:border-claude-accent-primary hover:text-claude-accent-primary hover:bg-claude-bg-warm rounded transition-all"
                                  >
                                    <Plus className="w-3 h-3 inline mr-1" /> 添加
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* 添加分组按钮 */}
                        {isEditMode && (
                          <button
                            onClick={() => addGroup(layerIdx)}
                            className="w-16 flex items-center justify-center border-l border-dashed border-claude-border hover:bg-claude-bg-warm text-claude-text-muted hover:text-claude-accent-primary transition-all"
                            title="添加分组"
                          >
                            <div className="text-center">
                              <Plus className="w-5 h-5 mx-auto" />
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* 层级间连接线 */}
                    {layerIdx < architectureData.layers.length - 1 && (
                      <div className="flex justify-center h-4 items-center">
                        <div className="w-0.5 h-full bg-claude-border-warm"></div>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* 添加层级按钮 */}
              {isEditMode && (
                <button
                  onClick={addLayer}
                  className="w-full mt-4 py-3 border-2 border-dashed border-claude-border text-claude-text-muted hover:border-claude-accent-primary hover:text-claude-accent-primary hover:bg-claude-bg-warm rounded-xl transition-all flex items-center justify-center gap-2 font-medium"
                >
                  <Plus className="w-5 h-5" />
                  添加新层级
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI分析结果 */}
      {architectureData && (
        <div className="border border-claude-border rounded-xl overflow-hidden bg-white shadow-sm">
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="w-full flex items-center justify-between p-4 bg-claude-bg-warm hover:bg-claude-bg-light transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-serif font-medium text-claude-text-primary">
              <FileText className="w-4 h-4 text-claude-text-secondary" />
              查看分析数据 (JSON)
            </span>
            {showAnalysis ? <ChevronUp className="w-4 h-4 text-claude-text-muted" /> : <ChevronDown className="w-4 h-4 text-claude-text-muted" />}
          </button>
          
          {showAnalysis && (
            <div className="p-0 bg-claude-dark border-t border-claude-border">
              <pre className="text-xs text-gray-300 overflow-auto max-h-[300px] p-4 font-mono leading-relaxed">
                {JSON.stringify(architectureData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 使用说明 - Claude风格 */}
      {!architectureData && !isGenerating && (
        <div className="text-center py-16 bg-claude-bg-warm rounded-xl border border-dashed border-claude-border">
          <div className="w-16 h-16 rounded-2xl bg-white border border-claude-border shadow-sm flex items-center justify-center mx-auto mb-4">
            <Layers className="w-8 h-8 text-claude-accent-primary" />
          </div>
          <h4 className="text-lg font-serif font-medium text-claude-text-primary mb-2">准备生成架构图</h4>
          <p className="text-sm text-claude-text-secondary max-w-sm mx-auto">
            上传需求文档后，点击上方的"生成架构图"按钮。AI将自动分析文档内容，识别功能模块并生成专业的分层架构图。
          </p>
        </div>
      )}
    </div>

  );
}

export default ArchitectureDiagram;
