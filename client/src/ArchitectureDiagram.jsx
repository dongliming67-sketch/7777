import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import html2canvas from 'html2canvas';
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
  Check
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
    <div className="bg-white rounded-xl shadow-lg p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">架构图生成</h3>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">深度思考版</span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={generateDiagram}
          disabled={isThinking || isGenerating || !documentContent}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            <button
              onClick={toggleEditMode}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                isEditMode 
                  ? 'bg-orange-500 text-white hover:bg-orange-600' 
                  : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
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
                  编辑架构图
                </>
              )}
            </button>

            <button
              onClick={generateDiagram}
              disabled={isThinking || isGenerating}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              重新生成
            </button>
            
            <button
              onClick={downloadImage}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              下载PNG
            </button>
          </>
        )}
      </div>

      {/* 进度指示器 */}
      {(isThinking || isGenerating) && (
        <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${currentPhase === 'thinking' ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}>
                1
              </div>
              <span className={`text-sm ${currentPhase === 'thinking' ? 'text-blue-600 font-medium' : 'text-green-600'}`}>
                深度思考
              </span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 rounded">
              <div className={`h-full rounded transition-all duration-500 ${currentPhase === 'thinking' ? 'w-1/2 bg-blue-400' : 'w-full bg-green-400'}`}></div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${currentPhase === 'generating' ? 'bg-purple-500 text-white animate-pulse' : currentPhase === 'done' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                2
              </div>
              <span className={`text-sm ${currentPhase === 'generating' ? 'text-purple-600 font-medium' : currentPhase === 'done' ? 'text-green-600' : 'text-gray-400'}`}>
                生成架构图
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            {currentPhase === 'thinking' && '🧠 正在深入分析文档内容，识别系统功能模块和架构层级...'}
            {currentPhase === 'generating' && '🎨 基于分析结果，正在生成专业架构图...'}
          </p>
        </div>
      )}

      {/* 深度思考结果展示 */}
      {thinkingContent && (
        <div className="mb-4 border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <span className="text-lg">🧠</span>
              AI深度思考过程
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">
                {thinkingContent.length} 字
              </span>
            </span>
            {showThinking ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {showThinking && (
            <div className="p-4 bg-white max-h-[400px] overflow-auto">
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {thinkingContent}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* 编辑模式提示 */}
      {isEditMode && architectureData && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center gap-2 text-orange-700 text-sm">
            <Edit3 className="w-4 h-4" />
            <span className="font-medium">编辑模式已开启</span>
            <span className="text-orange-600">- 点击任意文字可编辑，使用按钮添加/删除元素</span>
          </div>
        </div>
      )}

      {/* 架构图预览 */}
      {architectureData && (
        <div className={`border rounded-lg p-3 bg-gray-50 mb-4 overflow-auto ${isEditMode ? 'ring-2 ring-orange-300' : ''}`}>
          <div 
            ref={diagramRef}
            className="bg-white p-6 min-w-[950px]"
            style={{ fontFamily: 'Microsoft YaHei, SimHei, sans-serif' }}
          >
            {/* 系统标题 */}
            <div className="text-center mb-5 pb-3 border-b-2 border-gray-300 relative">
              {editingItem?.type === 'systemName' ? (
                <div className="flex justify-center">
                  <EditableText
                    value={editingItem.value}
                    onSave={(text) => saveEditing(text)}
                    onCancel={cancelEditing}
                    className="text-xl font-bold"
                  />
                </div>
              ) : (
                <h2 
                  className={`text-xl font-bold text-gray-800 tracking-wide ${isEditMode ? 'cursor-pointer hover:bg-blue-50 hover:text-blue-600 px-2 py-1 rounded transition-colors' : ''}`}
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
                  <div key={layerIdx}>
                    <div className="flex border border-gray-300 relative" style={{ borderTopWidth: layerIdx === 0 ? 1 : 0 }}>
                      {/* 编辑模式：层级操作按钮 */}
                      {isEditMode && (
                        <div className="absolute -left-8 top-1/2 -translate-y-1/2 flex flex-col gap-1">
                          <button
                            onClick={() => deleteLayer(layerIdx)}
                            className="p-1 bg-red-500 text-white rounded hover:bg-red-600 opacity-70 hover:opacity-100"
                            title="删除层级"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {/* 左侧层级标签 */}
                      <div 
                        className={`w-20 flex-shrink-0 flex items-center justify-center font-bold text-white text-sm relative ${isEditMode ? 'cursor-pointer' : ''}`}
                        style={{ 
                          backgroundColor: colors.label,
                          minHeight: '80px',
                          borderRight: `2px solid ${colors.border}`
                        }}
                        onClick={() => startEditing('layerName', layerIdx)}
                      >
                        {editingItem?.type === 'layerName' && editingItem.layerIdx === layerIdx ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-white p-1">
                            <EditableText
                              value={editingItem.value}
                              onSave={(text) => saveEditing(text)}
                              onCancel={cancelEditing}
                              className="text-xs w-16"
                            />
                          </div>
                        ) : (
                          <span 
                            style={{ writingMode: 'vertical-rl', letterSpacing: '0.15em' }}
                            className={isEditMode ? 'hover:opacity-70' : ''}
                          >
                            {layer.name}
                          </span>
                        )}
                      </div>

                      {/* 右侧内容区 - 分组平铺 */}
                      <div 
                        className="flex-1 flex"
                        style={{ backgroundColor: colors.bg }}
                      >
                        {layer.groups?.map((group, groupIdx) => (
                          <div 
                            key={groupIdx}
                            className="flex-1 border-r border-gray-200 last:border-r-0 relative"
                            style={{ minWidth: `${100 / groupCount}%` }}
                          >
                            {/* 分组标题 */}
                            <div 
                              className={`px-3 py-2 text-center font-semibold text-sm border-b relative ${isEditMode ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                              style={{ 
                                backgroundColor: 'rgba(255,255,255,0.7)',
                                borderColor: colors.border,
                                color: '#333'
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
                                <div className="flex items-center justify-center gap-1">
                                  <span 
                                    onClick={() => startEditing('groupName', layerIdx, groupIdx)}
                                    className={isEditMode ? 'hover:text-blue-600' : ''}
                                  >
                                    {group.name}
                                  </span>
                                  {isEditMode && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); deleteGroup(layerIdx, groupIdx); }}
                                      className="p-0.5 bg-red-400 text-white rounded hover:bg-red-500 ml-1"
                                      title="删除分组"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            {/* 模块列表 - 自适应填充 */}
                            <div className="p-2">
                              <div className="flex flex-wrap gap-1.5">
                                {group.modules?.map((module, modIdx) => {
                                  const moduleName = typeof module === 'string' ? module : module.name;
                                  const isEditing = editingItem?.type === 'module' && 
                                    editingItem.layerIdx === layerIdx && 
                                    editingItem.groupIdx === groupIdx && 
                                    editingItem.moduleIdx === modIdx;
                                  
                                  return (
                                    <div
                                      key={modIdx}
                                      className={`flex-1 min-w-[80px] px-2 py-1.5 text-center text-xs border bg-white relative group ${isEditMode ? 'cursor-pointer hover:bg-blue-50 hover:border-blue-400' : ''}`}
                                      style={{
                                        borderColor: isEditing ? '#3B82F6' : colors.border,
                                        color: '#333'
                                      }}
                                    >
                                      {isEditing ? (
                                        <EditableText
                                          value={editingItem.value}
                                          onSave={(text) => saveEditing(text)}
                                          onCancel={cancelEditing}
                                          className="text-xs"
                                        />
                                      ) : (
                                        <>
                                          <span 
                                            onClick={() => startEditing('module', layerIdx, groupIdx, modIdx)}
                                            className="block"
                                          >
                                            {moduleName}
                                          </span>
                                          {isEditMode && (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); deleteModule(layerIdx, groupIdx, modIdx); }}
                                              className="absolute -top-1 -right-1 p-0.5 bg-red-400 text-white rounded-full hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                              title="删除模块"
                                            >
                                              <X className="w-2 h-2" />
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
                                    className="flex-1 min-w-[80px] px-2 py-1.5 text-center text-xs border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                  >
                                    <Plus className="w-3 h-3 inline" /> 添加模块
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
                            className="w-24 flex items-center justify-center border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                          >
                            <div className="text-center">
                              <Plus className="w-4 h-4 mx-auto" />
                              <span className="text-xs">添加分组</span>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* 层级间连接线 */}
                    {layerIdx < architectureData.layers.length - 1 && (
                      <div className="flex justify-center">
                        <div className="w-0 h-3 border-l-2 border-dashed border-gray-400"></div>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* 添加层级按钮 */}
              {isEditMode && (
                <button
                  onClick={addLayer}
                  className="w-full mt-2 py-3 border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  添加新层级
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI分析结果 */}
      {architectureData && (
        <div className="border rounded-lg">
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <FileText className="w-4 h-4" />
              查看分析数据 (JSON)
            </span>
            {showAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {showAnalysis && (
            <div className="p-4 bg-gray-900 rounded-b-lg">
              <pre className="text-sm text-green-400 overflow-auto max-h-[300px]">
                {JSON.stringify(architectureData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 使用说明 */}
      {!architectureData && !isGenerating && (
        <div className="text-center py-8 text-gray-500">
          <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">上传需求文档后，点击"生成架构图"按钮</p>
          <p className="text-xs mt-1">AI将分析文档内容，生成专业的分层架构图</p>
        </div>
      )}
    </div>
  );
}

export default ArchitectureDiagram;
