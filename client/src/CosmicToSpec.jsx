import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import html2canvas from 'html2canvas';
import {
  Upload,
  FileText,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Eye,
  Table,
  Info,
  Layers,
  FileOutput,
  BookOpen,
  ArrowRight,
  Settings,
  Plus,
  FileType,
  ToggleLeft,
  ToggleRight,
  FileSearch,
  List
} from 'lucide-react';

function CosmicToSpec({ apiStatus, setShowSettings }) {
  // 数据源类型: 'cosmic' 或 'word'
  const [sourceType, setSourceType] = useState('cosmic');
  
  // COSMIC Excel 数据
  const [cosmicData, setCosmicData] = useState(null);
  const [cosmicFilename, setCosmicFilename] = useState('');
  
  // Word需求文档数据
  const [requirementDoc, setRequirementDoc] = useState(null);
  const [requirementFilename, setRequirementFilename] = useState('');
  const [showDocPreview, setShowDocPreview] = useState(false);
  
  // 模板相关
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  
  // 列映射
  const [columnMapping, setColumnMapping] = useState({});
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  
  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [generationPhase, setGenerationPhase] = useState('');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [batchInfo, setBatchInfo] = useState(null);
  const [templateAnalysis, setTemplateAnalysis] = useState(null);
  const [processClassification, setProcessClassification] = useState(null);
  
  // UI状态
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [showDataPreview, setShowDataPreview] = useState(false);
  
  // 需求文档深度分析状态
  const [isAnalyzingDoc, setIsAnalyzingDoc] = useState(false);
  const [docAnalysisPhase, setDocAnalysisPhase] = useState('');
  const [docAnalysisProgress, setDocAnalysisProgress] = useState(0);
  const [docAnalysisMessage, setDocAnalysisMessage] = useState('');
  
  const excelInputRef = useRef(null);
  const wordInputRef = useRef(null);
  const templateInputRef = useRef(null);
  const contentEndRef = useRef(null);
  const contentContainerRef = useRef(null);
  const latestContentRef = useRef(''); // 保存最新生成的内容
  const [autoScroll, setAutoScroll] = useState(true); // 控制是否自动滚动

  // 加载模板列表
  useEffect(() => {
    loadTemplates();
  }, []);

  // 智能自动滚动：只在用户接近底部时才滚动
  useEffect(() => {
    if (!autoScroll) return;
    contentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamingContent, generatedContent, autoScroll]);

  // 监听滚动事件，判断用户是否手动滚动离开底部
  const handleContentScroll = useCallback((e) => {
    const container = e.target;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setAutoScroll(isNearBottom);
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await axios.get('/api/cosmic-to-spec/templates');
      if (res.data.success) {
        setTemplates(res.data.templates);
      }
    } catch (error) {
      console.error('加载模板列表失败:', error);
    }
  };

  // 上传COSMIC Excel
  const handleExcelUpload = async (file) => {
    if (!file) return;
    
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      setErrorMessage('请上传Excel文件（.xlsx或.xls格式）');
      return;
    }
    
    setErrorMessage('');
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await axios.post('/api/cosmic-to-spec/parse-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (res.data.success) {
        setCosmicData(res.data);
        setCosmicFilename(res.data.filename);
        
        // 初始化默认列映射
        const defaultMapping = {};
        const headers = res.data.headers || [];
        const standardFields = ['functionalUser', 'triggerEvent', 'functionalProcess', 'subProcessDesc', 'dataMovementType', 'dataGroup', 'dataAttributes'];
        const standardLabels = ['功能用户', '触发事件', '功能过程', '子过程描述', '数据移动类型', '数据组', '数据属性'];
        
        standardFields.forEach((field, idx) => {
          // 尝试匹配表头
          const matchedHeader = headers.find(h => 
            h.includes(standardLabels[idx]) || 
            h.toLowerCase().includes(field.toLowerCase())
          );
          if (matchedHeader) {
            defaultMapping[field] = matchedHeader;
          }
        });
        setColumnMapping(defaultMapping);
      }
    } catch (error) {
      setErrorMessage('解析Excel失败: ' + (error.response?.data?.error || error.message));
    }
  };

  // 上传Word需求文档 - 使用流式深度分析
  const handleWordUpload = async (file) => {
    if (!file) return;
    
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'docx' && ext !== 'doc') {
      setErrorMessage('请上传Word需求文档（.docx或.doc格式）');
      return;
    }
    
    setErrorMessage('');
    setIsAnalyzingDoc(true);
    setDocAnalysisPhase('parsing');
    setDocAnalysisProgress(5);
    setDocAnalysisMessage('📄 正在解析文档...');
    setRequirementDoc(null);
    setRequirementFilename(file.name);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // 使用流式API进行深度分析
      const response = await fetch('/api/cosmic-to-spec/parse-requirement-doc?stream=true', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('解析请求失败');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              
              // 更新进度状态
              if (parsed.phase) {
                setDocAnalysisPhase(parsed.phase);
              }
              if (parsed.progress !== undefined) {
                setDocAnalysisProgress(parsed.progress);
              }
              if (parsed.message) {
                setDocAnalysisMessage(parsed.message);
              }
              
              // 如果分析完成，设置结果
              if (parsed.phase === 'analysis_complete' && parsed.result) {
                setRequirementDoc(parsed.result);
                setRequirementFilename(parsed.result.filename);
              }
            } catch (e) {
              console.log('解析SSE数据失败:', e);
            }
          }
        }
      }
      
      setIsAnalyzingDoc(false);
      setDocAnalysisPhase('');
      setDocAnalysisProgress(0);
      setDocAnalysisMessage('');
      
    } catch (error) {
      console.error('流式解析失败，尝试普通请求:', error);
      // 降级到普通请求
      try {
        const res = await axios.post('/api/cosmic-to-spec/parse-requirement-doc', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        if (res.data.success) {
          setRequirementDoc(res.data);
          setRequirementFilename(res.data.filename);
        }
      } catch (e) {
        setErrorMessage('解析需求文档失败: ' + (e.response?.data?.error || e.message));
      }
      setIsAnalyzingDoc(false);
      setDocAnalysisPhase('');
      setDocAnalysisProgress(0);
      setDocAnalysisMessage('');
    }
  };

  // 上传模板
  const handleTemplateUpload = async (file) => {
    if (!file) return;
    
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'docx' && ext !== 'doc') {
      setErrorMessage('请上传Word模板文件（.docx或.doc格式）');
      return;
    }
    
    setUploadingTemplate(true);
    setErrorMessage('');
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await axios.post('/api/cosmic-to-spec/upload-template', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (res.data.success) {
        const templateId = res.data.template.id;
        await loadTemplates();
        setSelectedTemplateId(templateId);
        
        // 【关键修复】上传成功后自动进行深度分析
        console.log('模板上传成功，开始深度分析...');
        setGenerationPhase('📊 正在深度分析模板结构...');
        
        try {
          const analyzeResponse = await fetch('/api/cosmic-to-spec/analyze-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateId })
          });
          
          const reader = analyzeResponse.body.getReader();
          const decoder = new TextDecoder();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.phase) {
                    setGenerationPhase(parsed.message || parsed.phase);
                  }
                  if (parsed.analysis) {
                    setTemplateAnalysis(parsed.analysis);
                    console.log('模板深度分析完成:', parsed.analysis);
                  }
                  if (parsed.error) {
                    console.warn('模板分析警告:', parsed.error);
                  }
                } catch (e) {
                  // 解析失败，忽略
                }
              }
            }
          }
          
          setGenerationPhase('✅ 模板分析完成');
          setTimeout(() => setGenerationPhase(''), 2000);
        } catch (analyzeError) {
          console.warn('模板深度分析失败，将在生成时重新分析:', analyzeError);
          setGenerationPhase('');
        }
      }
    } catch (error) {
      setErrorMessage('上传模板失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploadingTemplate(false);
    }
  };

  // 删除模板
  const handleDeleteTemplate = async (templateId) => {
    if (!confirm('确定要删除这个模板吗？')) return;
    
    try {
      await axios.delete(`/api/cosmic-to-spec/templates/${templateId}`);
      await loadTemplates();
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId('');
      }
    } catch (error) {
      setErrorMessage('删除模板失败: ' + (error.response?.data?.error || error.message));
    }
  };

  // 开始生成需求规格说明书
  const startGeneration = async () => {
    // 根据数据源类型检查数据
    if (sourceType === 'cosmic') {
      if (!cosmicData || !cosmicData.data || cosmicData.data.length === 0) {
        setErrorMessage('请先上传COSMIC Excel数据');
        return;
      }
    } else {
      if (!requirementDoc || !requirementDoc.fullText) {
        setErrorMessage('请先上传Word需求文档');
        return;
      }
    }
    
    if (!apiStatus.hasApiKey) {
      setShowSettings(true);
      return;
    }
    
    setIsGenerating(true);
    setGeneratedContent('');
    setStreamingContent('');
    latestContentRef.current = ''; // 清空ref
    setGenerationPhase('开始分析...');
    setGenerationProgress(0);
    setCurrentStep(0);
    setTotalSteps(0);
    setBatchInfo(null);
    setTemplateAnalysis(null);
    setProcessClassification(null);
    setErrorMessage('');
    
    try {
      // 根据数据源类型选择不同的API
      const apiUrl = sourceType === 'cosmic' 
        ? '/api/cosmic-to-spec/generate' 
        : '/api/cosmic-to-spec/generate-from-doc';
      
      const requestBody = sourceType === 'cosmic'
        ? { cosmicData, templateId: selectedTemplateId, columnMapping }
        : { requirementDoc, templateId: selectedTemplateId };
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const eventEnd = buffer.indexOf('\n\n');
          if (eventEnd === -1) break;

          const rawEvent = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          const dataLines = rawEvent
            .split('\n')
            .filter(l => l.startsWith('data:'))
            .map(l => l.replace(/^data:\s?/, ''));

          if (dataLines.length === 0) continue;

          const data = dataLines.join('\n');
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
              
            if (parsed.phase === 'analyzing_template') {
              setGenerationPhase(parsed.message);
              setCurrentStep(parsed.currentStep || 1);
              setTotalSteps(parsed.totalSteps || 5);
              setGenerationProgress(5);
            } else if (parsed.phase === 'template_analyzed') {
              setGenerationPhase(parsed.message);
              setTemplateAnalysis(parsed.templateAnalysis);
              setGenerationProgress(8);
            } else if (parsed.phase === 'classifying_processes') {
              setGenerationPhase(parsed.message);
              setCurrentStep(parsed.currentStep || 2);
              setTotalSteps(parsed.totalSteps || 5);
              setGenerationProgress(10);
            } else if (parsed.phase === 'processes_classified') {
              setGenerationPhase(parsed.message);
              setProcessClassification(parsed.classification);
              setGenerationProgress(15);
            } else if (parsed.phase === 'generating_header') {
              setGenerationPhase(parsed.message);
              setCurrentStep(parsed.currentStep || 3);
              setTotalSteps(parsed.totalSteps || 5);
              setGenerationProgress(18);
            } else if (parsed.phase === 'generating_functions') {
              setGenerationPhase(parsed.message);
              setCurrentStep(parsed.currentStep || 3);
              setTotalSteps(parsed.totalSteps || 5);
              setBatchInfo(parsed.batchInfo);
              if (parsed.batchInfo) {
                const progress = 20 + (parsed.batchInfo.end / parsed.batchInfo.total) * 60;
                setGenerationProgress(Math.min(80, progress));
              }
            } else if (parsed.phase === 'generating_footer') {
              setGenerationPhase(parsed.message);
              setCurrentStep(parsed.currentStep);
              setTotalSteps(parsed.totalSteps);
              setGenerationProgress(85);
            } else if (parsed.phase === 'complete') {
              setGenerationPhase('✅ 生成完成');
              setGenerationProgress(100);
            } else if (parsed.content) {
              fullContent += parsed.content;
              latestContentRef.current = fullContent;
              setStreamingContent(fullContent);
            } else if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) {
              throw e;
            }
          }
        }
      }
      
      setGeneratedContent(fullContent);
      setStreamingContent('');
      setGenerationPhase('生成完成');
      setGenerationProgress(100);
      
    } catch (error) {
      setErrorMessage('生成失败: ' + error.message);
      setGenerationPhase('');
    } finally {
      setIsGenerating(false);
    }
  };

  // 导出Word - 支持将HTML图表转换为图片
  const exportWord = async () => {
    // 使用ref中保存的最新内容，确保导出的是当前显示的内容
    let contentToExport = latestContentRef.current || streamingContent || generatedContent;
    
    console.log('=== 导出Word ===');
    console.log('latestContentRef长度:', latestContentRef.current?.length);
    console.log('streamingContent长度:', streamingContent?.length);
    console.log('generatedContent长度:', generatedContent?.length);
    console.log('最终导出内容长度:', contentToExport?.length);
    
    if (!contentToExport) {
      setErrorMessage('没有可导出的内容');
      return;
    }
    
    try {
      // 检测并转换HTML图表为图片
      const diagramRegex = /<!-- DIAGRAM_START:(.+?) -->\n([\s\S]*?)\n<!-- DIAGRAM_END -->/g;
      const diagrams = [...contentToExport.matchAll(diagramRegex)];
      
      if (diagrams.length > 0) {
        console.log(`检测到 ${diagrams.length} 个HTML图表，开始转换为图片...`);
        
        for (const match of diagrams) {
          const [fullMatch, diagramTitle, htmlContent] = match;
          
          try {
            // 创建临时容器渲染HTML
            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = htmlContent;
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            tempContainer.style.top = '0';
            tempContainer.style.background = 'white';
            document.body.appendChild(tempContainer);
            
            // 使用html2canvas转换为图片
            const canvas = await html2canvas(tempContainer, {
              backgroundColor: '#ffffff',
              scale: 2,
              useCORS: true
            });
            
            // 转换为base64
            const dataUrl = canvas.toDataURL('image/png');
            
            // 替换HTML为Markdown图片语法
            contentToExport = contentToExport.replace(
              fullMatch,
              `\n\n![${diagramTitle}](${dataUrl})\n\n`
            );
            
            // 清理临时容器
            document.body.removeChild(tempContainer);
            console.log(`✅ 图表已转换: ${diagramTitle}`);
          } catch (imgError) {
            console.error(`图表转换失败: ${diagramTitle}`, imgError);
            // 转换失败时保留原始HTML（后端会处理）
          }
        }
      }
      
      const response = await axios.post('/api/cosmic-to-spec/export-word', {
        content: contentToExport,
        filename: cosmicFilename ? cosmicFilename.replace(/\.(xlsx|xls)$/i, '') + '_需求规格说明书' : '需求规格说明书',
        templateId: selectedTemplateId
      }, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${cosmicFilename ? cosmicFilename.replace(/\.(xlsx|xls)$/i, '') + '_' : ''}需求规格说明书.doc`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage('导出失败: ' + error.message);
    }
  };

  // 复制内容
  const copyContent = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 拖拽处理
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      if (type === 'excel') {
        handleExcelUpload(file);
      } else {
        handleTemplateUpload(file);
      }
    }
  };

  // 标准字段定义
  const standardFields = [
    { key: 'functionalUser', label: '功能用户', description: '执行功能的用户角色' },
    { key: 'triggerEvent', label: '触发事件', description: '触发功能的事件' },
    { key: 'functionalProcess', label: '功能过程', description: '功能过程名称' },
    { key: 'subProcessDesc', label: '子过程描述', description: '子过程的详细描述' },
    { key: 'dataMovementType', label: '数据移动类型', description: 'E/R/W/X类型' },
    { key: 'dataGroup', label: '数据组', description: '数据组名称' },
    { key: 'dataAttributes', label: '数据属性', description: '数据属性列表' }
  ];

  return (
    <div className="min-h-screen bg-claude-bg text-claude-text-primary font-sans selection:bg-claude-accent-light selection:text-claude-accent-primary">
      {/* 顶部导航栏 - Claude风格 */}
      

      {/* 主体内容区 - Claude风格布局 */}
      <main className="max-w-[1600px] w-full mx-auto px-4 md:px-6 py-8">
        {/* Hero区域 - 仅在未生成且未开始时显示 */}
        {!generatedContent && !streamingContent && !isGenerating && (
          <div className="text-center mb-12 fade-in">
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4 text-claude-text-primary tracking-tight">
              智能生成需求文档
            </h1>
            <p className="text-lg text-claude-text-secondary max-w-2xl mx-auto leading-relaxed">
              上传COSMIC度量数据或Word需求文档，AI将自动生成标准化的需求规格说明书
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* 左侧：配置与控制区 - 统一在一个大的卡片容器中或分块但视觉统一 */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* 1. 数据源选择与上传 */}
            <div className="bg-white rounded-xl shadow-claude border border-claude-border overflow-hidden transition-all duration-300 hover:shadow-claude-lg">
              <div className="px-6 py-4 border-b border-claude-border bg-claude-bg-warm">
                <h2 className="text-sm font-serif font-semibold text-claude-text-primary flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-claude-accent-primary text-white text-xs">1</span>
                  数据源与文件
                </h2>
              </div>
              
              <div className="p-6 space-y-6">
                {/* 数据源切换 */}
                <div className="grid grid-cols-2 gap-3 p-1 bg-claude-bg-cream rounded-xl border border-claude-border-warm">
                  <button
                    onClick={() => setSourceType('cosmic')}
                    className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                      sourceType === 'cosmic'
                        ? 'bg-white text-claude-accent-primary shadow-sm border border-claude-border'
                        : 'text-claude-text-secondary hover:text-claude-text-primary hover:bg-white/50'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    COSMIC Excel
                  </button>
                  <button
                    onClick={() => setSourceType('word')}
                    className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                      sourceType === 'word'
                        ? 'bg-white text-claude-accent-primary shadow-sm border border-claude-border'
                        : 'text-claude-text-secondary hover:text-claude-text-primary hover:bg-white/50'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    Word文档
                  </button>
                </div>

                {/* 上传区域 */}
                {sourceType === 'cosmic' ? (
                  <div
                    onClick={() => excelInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'excel')}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 group ${
                      isDragging
                        ? 'border-claude-accent-primary bg-claude-accent-light'
                        : 'border-claude-border-warm hover:border-claude-accent-primary hover:bg-claude-bg-warm'
                    }`}
                  >
                    <input
                      ref={excelInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => handleExcelUpload(e.target.files?.[0])}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-claude-bg-cream text-claude-text-muted group-hover:text-claude-accent-primary group-hover:scale-110 transition-all">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="font-medium text-claude-text-primary">点击或拖拽上传Excel</p>
                    <p className="text-xs text-claude-text-muted mt-1">支持 .xlsx / .xls 格式</p>
                  </div>
                ) : (
                  <div
                    onClick={() => wordInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer?.files?.[0];
                      if (file) handleWordUpload(file);
                    }}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 group ${
                      isDragging
                        ? 'border-claude-accent-primary bg-claude-accent-light'
                        : 'border-claude-border-warm hover:border-claude-accent-primary hover:bg-claude-bg-warm'
                    }`}
                  >
                    <input
                      ref={wordInputRef}
                      type="file"
                      accept=".docx,.doc"
                      onChange={(e) => handleWordUpload(e.target.files?.[0])}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-claude-bg-cream text-claude-text-muted group-hover:text-claude-accent-primary group-hover:scale-110 transition-all">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="font-medium text-claude-text-primary">点击或拖拽上传Word</p>
                    <p className="text-xs text-claude-text-muted mt-1">支持 .docx / .doc 格式</p>
                  </div>
                )}

                {/* 已上传文件展示 */}
                {(cosmicData || (requirementDoc && !isAnalyzingDoc)) && (
                  <div className="p-4 rounded-xl bg-claude-bg-cream border border-claude-border-warm flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center border border-claude-border text-claude-accent-primary shadow-sm">
                      {sourceType === 'cosmic' ? <FileSpreadsheet className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-claude-text-primary truncate">
                        {sourceType === 'cosmic' ? cosmicFilename : requirementFilename}
                      </p>
                      <p className="text-xs text-claude-text-secondary">
                        {sourceType === 'cosmic' 
                          ? `${cosmicData.rowCount} 条记录` 
                          : `${requirementDoc.sectionCount} 个章节`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => sourceType === 'cosmic' ? setShowDataPreview(true) : setShowDocPreview(true)}
                        className="p-1.5 hover:bg-white rounded-md text-claude-text-secondary hover:text-claude-text-primary transition-colors"
                        title="预览"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if(sourceType === 'cosmic') {
                            setCosmicData(null);
                            setCosmicFilename('');
                          } else {
                            setRequirementDoc(null);
                            setRequirementFilename('');
                          }
                        }}
                        className="p-1.5 hover:bg-red-50 rounded-md text-claude-text-secondary hover:text-red-500 transition-colors"
                        title="删除"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Word分析进度 */}
                {isAnalyzingDoc && (
                  <div className="p-4 rounded-xl bg-claude-bg-warm border border-claude-border-warm animate-pulse-slow">
                    <div className="flex items-center gap-3 mb-3">
                      <Loader2 className="w-4 h-4 animate-spin text-claude-accent-primary" />
                      <span className="text-sm font-medium text-claude-text-primary">{docAnalysisMessage || '正在分析...'}</span>
                    </div>
                    <div className="w-full h-1.5 bg-claude-border rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-claude-accent-primary transition-all duration-500 rounded-full"
                        style={{ width: `${docAnalysisProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. 模板选择 */}
            <div className="bg-white rounded-xl shadow-claude border border-claude-border overflow-hidden transition-all duration-300 hover:shadow-claude-lg">
              <div className="px-6 py-4 border-b border-claude-border bg-claude-bg-warm flex justify-between items-center">
                <h2 className="text-sm font-serif font-semibold text-claude-text-primary flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-claude-accent-primary text-white text-xs">2</span>
                  选择模板
                </h2>
                <button 
                  onClick={() => templateInputRef.current?.click()}
                  className="text-xs text-claude-accent-primary hover:text-claude-accent-hover font-medium flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  上传新模板
                </button>
                <input
                  ref={templateInputRef}
                  type="file"
                  accept=".docx,.doc"
                  onChange={(e) => handleTemplateUpload(e.target.files?.[0])}
                  className="hidden"
                />
              </div>
              
              <div className="p-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                <div className="space-y-2">
                  {/* 默认模板 */}
                  <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all ${
                    !selectedTemplateId
                      ? 'bg-claude-bg-warm border-claude-accent-primary shadow-sm'
                      : 'bg-white border-claude-border-warm hover:border-claude-border hover:bg-claude-bg-warm'
                  }`}>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                      !selectedTemplateId ? 'border-claude-accent-primary' : 'border-claude-text-muted'
                    }`}>
                      {!selectedTemplateId && <div className="w-2 h-2 rounded-full bg-claude-accent-primary" />}
                    </div>
                    <input
                      type="radio"
                      name="template"
                      checked={!selectedTemplateId}
                      onChange={() => setSelectedTemplateId('')}
                      className="hidden"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-claude-text-primary">默认模板</p>
                      <p className="text-xs text-claude-text-muted">标准需求规格说明书结构</p>
                    </div>
                  </label>

                  {/* 自定义模板列表 */}
                  {templates.map((template) => (
                    <label
                      key={template.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all ${
                        selectedTemplateId === template.id
                          ? 'bg-claude-bg-warm border-claude-accent-primary shadow-sm'
                          : 'bg-white border-claude-border-warm hover:border-claude-border hover:bg-claude-bg-warm'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        selectedTemplateId === template.id ? 'border-claude-accent-primary' : 'border-claude-text-muted'
                      }`}>
                        {selectedTemplateId === template.id && <div className="w-2 h-2 rounded-full bg-claude-accent-primary" />}
                      </div>
                      <input
                        type="radio"
                        name="template"
                        checked={selectedTemplateId === template.id}
                        onChange={() => setSelectedTemplateId(template.id)}
                        className="hidden"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-claude-text-primary truncate">{template.filename}</p>
                        <p className="text-xs text-claude-text-muted">
                          {template.sectionCount} 章节 · {(template.fileSize / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteTemplate(template.id);
                        }}
                        className="p-1.5 hover:bg-red-50 text-claude-text-muted hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 生成按钮 */}
            <button
              onClick={startGeneration}
              disabled={(sourceType === 'cosmic' ? !cosmicData : !requirementDoc) || isGenerating || !apiStatus.hasApiKey}
              className="w-full py-4 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0 bg-gradient-to-r from-claude-accent-primary to-claude-accent-hover"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>正在生成文档...</span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-5 h-5" />
                  <span>开始生成需求规格说明书</span>
                </>
              )}
            </button>

            {/* 错误提示 */}
            {errorMessage && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-700">{errorMessage}</p>
                  <button
                    onClick={() => setErrorMessage('')}
                    className="text-xs mt-1 text-red-500 hover:text-red-700 underline"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}

            {/* 生成状态 - 仅在生成过程中显示 */}
            {isGenerating && (
              <div className="bg-white rounded-xl shadow-claude border border-claude-border p-5 space-y-4 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-claude-text-primary">生成进度</h3>
                  <span className="text-xs font-mono text-claude-accent-primary">{Math.round(generationProgress)}%</span>
                </div>
                <div className="w-full h-2 bg-claude-bg-cream rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-claude-accent-primary transition-all duration-500 rounded-full"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <div className="flex items-center gap-3 text-sm text-claude-text-secondary bg-claude-bg-warm p-3 rounded-lg border border-claude-border-warm">
                  <Loader2 className="w-4 h-4 animate-spin text-claude-accent-primary" />
                  <p className="flex-1">{generationPhase}</p>
                </div>
                {totalSteps > 0 && (
                  <div className="flex justify-between text-xs text-claude-text-muted px-1">
                    <span>步骤 {currentStep}/{totalSteps}</span>
                    {batchInfo && <span>功能 {batchInfo.end}/{batchInfo.total}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        
          {/* 右侧：生成结果预览 - 占据更多空间，视觉重心 */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-xl shadow-claude border border-claude-border flex flex-col h-[calc(100vh-140px)] min-h-[600px] transition-all duration-300">
              {/* 预览区标题栏 */}
              <div className="px-6 py-4 border-b border-claude-border bg-claude-bg-warm rounded-t-xl flex items-center justify-between">
                <h3 className="font-serif font-semibold text-claude-text-primary flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-claude-accent-primary" />
                  生成结果预览
                </h3>
                {(generatedContent || streamingContent) && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyContent}
                      className="text-sm px-3 py-1.5 rounded-lg border border-claude-border bg-white text-claude-text-secondary hover:bg-claude-bg-cream hover:text-claude-text-primary transition-colors flex items-center gap-1.5"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      {copied ? '已复制' : '复制'}
                    </button>
                    <button
                      onClick={exportWord}
                      className="text-sm px-4 py-1.5 rounded-lg text-white bg-claude-accent-primary hover:bg-claude-accent-hover shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      导出Word
                    </button>
                  </div>
                )}
              </div>
              
              {/* 预览内容区 */}
              <div 
                ref={contentContainerRef}
                onScroll={handleContentScroll}
                className="flex-1 overflow-y-auto p-8 relative bg-white"
              >
                {!generatedContent && !streamingContent && !isGenerating ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-claude-bg-warm/30">
                    <div className="w-20 h-20 rounded-3xl bg-white border border-claude-border shadow-sm flex items-center justify-center mb-6">
                      <FileText className="w-10 h-10 text-claude-text-light" />
                    </div>
                    <h3 className="text-xl font-serif font-medium text-claude-text-primary mb-2">等待生成</h3>
                    <p className="text-claude-text-secondary max-w-md leading-relaxed">
                      请在左侧选择数据源并上传文件，然后点击“开始生成”按钮。AI将为您自动构建标准化的需求规格说明书。
                    </p>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:text-claude-text-primary prose-p:text-claude-text-secondary prose-strong:text-claude-text-primary prose-pre:bg-claude-bg-warm prose-pre:border prose-pre:border-claude-border">
                    <style>{`
                      .prose table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.875rem; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
                      .prose th, .prose td { border: 1px solid #E4E4E7; padding: 10px 14px; text-align: left; }
                      .prose th { background-color: #F3F2F0; font-weight: 600; color: #18181B; font-family: 'Tiempos', serif; }
                      .prose tr:nth-child(even) { background-color: #FAF9F6; }
                      .prose tr:hover { background-color: #F4F4F5; }
                      .prose h1 { color: #D97706; border-bottom: 2px solid #F3F2F0; padding-bottom: 0.3em; }
                      .prose h2 { color: #18181B; margin-top: 1.5em; border-bottom: 1px solid #F3F2F0; padding-bottom: 0.3em; }
                      .prose h3 { color: #B45309; margin-top: 1.3em; }
                      .prose blockquote { border-left-color: #D97706; background-color: #FFFBEB; padding: 0.5em 1em; border-radius: 4px; font-style: normal; }
                      .prose code { color: #D97706; background-color: #F3F2F0; padding: 0.2em 0.4em; border-radius: 4px; font-weight: 500; }
                      .prose pre code { color: inherit; background-color: transparent; padding: 0; }
                    `}</style>
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]} 
                      rehypePlugins={[rehypeRaw]}
                    >
                      {streamingContent || generatedContent}
                    </ReactMarkdown>
                  </div>
                )}
                
                <div ref={contentEndRef} />
              </div>
              
              {/* 回到底部按钮 */}
              {!autoScroll && (streamingContent || generatedContent) && (
                <button
                  onClick={() => {
                    setAutoScroll(true);
                    contentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="absolute bottom-6 right-6 px-4 py-2 bg-claude-accent-primary text-white text-sm rounded-full shadow-lg hover:shadow-xl hover:bg-claude-accent-hover transition-all flex items-center gap-2 z-10 animate-in fade-in slide-in-from-bottom-2"
                >
                  <ArrowRight className="w-4 h-4 rotate-90" />
                  回到底部
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
      
      {/* 数据预览弹窗 */}
      {showDataPreview && cosmicData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-300">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl m-4 max-h-[90vh] flex flex-col border border-claude-border animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-claude-border bg-claude-bg-warm rounded-t-xl">
              <h2 className="text-lg font-serif font-bold flex items-center gap-2 text-claude-text-primary">
                <Table className="w-5 h-5 text-claude-accent-primary" />
                COSMIC数据预览 <span className="text-sm font-sans font-normal text-claude-text-secondary">({cosmicData.rowCount} 条记录)</span>
              </h2>
              <button
                onClick={() => setShowDataPreview(false)}
                className="p-2 rounded-lg hover:bg-claude-bg-cream text-claude-text-muted hover:text-claude-text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-claude-bg-cream shadow-sm">
                  <tr>
                    {['功能用户', '触发事件', '功能过程', '子过程描述', '类型', '数据组', '数据属性'].map((header, idx) => (
                      <th key={idx} className={`px-4 py-3 text-left font-serif font-semibold text-claude-text-primary border-b border-claude-border-warm ${header === '类型' ? 'text-center w-24' : ''}`}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-claude-border-warm">
                  {cosmicData.data.slice(0, 100).map((row, idx) => (
                    <tr key={idx} className="hover:bg-claude-bg-light/50 transition-colors group">
                      <td className="px-4 py-3 text-claude-text-primary">{row.functionalUser}</td>
                      <td className="px-4 py-3 text-claude-text-primary">{row.triggerEvent}</td>
                      <td className="px-4 py-3 text-claude-text-primary font-medium">{row.functionalProcess}</td>
                      <td className="px-4 py-3 text-claude-text-secondary">{row.subProcessDesc}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-6 rounded-md text-xs font-bold border ${
                          row.dataMovementType === 'E' ? 'bg-green-50 text-green-700 border-green-200' :
                          row.dataMovementType === 'R' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          row.dataMovementType === 'W' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          row.dataMovementType === 'X' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                          {row.dataMovementType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-claude-text-secondary">{row.dataGroup}</td>
                      <td className="px-4 py-3 text-claude-text-secondary">{row.dataAttributes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cosmicData.data.length > 100 && (
                <div className="p-4 text-center border-t border-claude-border-warm bg-claude-bg-warm/30">
                  <p className="text-sm text-claude-text-muted">
                    仅显示前100条，共 {cosmicData.data.length} 条记录
                  </p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-claude-border bg-claude-bg-warm rounded-b-xl flex justify-end">
              <button
                onClick={() => setShowDataPreview(false)}
                className="px-6 py-2 bg-white border border-claude-border text-claude-text-primary rounded-lg hover:bg-claude-bg-cream hover:border-claude-text-muted transition-all shadow-sm font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 列映射弹窗 */}
      {showColumnMapping && cosmicData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-300">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl m-4 max-h-[90vh] flex flex-col border border-claude-border animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-claude-border bg-claude-bg-warm rounded-t-xl">
              <h2 className="text-lg font-serif font-bold flex items-center gap-2 text-claude-text-primary">
                <Settings className="w-5 h-5 text-claude-accent-primary" />
                配置列映射
              </h2>
              <button
                onClick={() => setShowColumnMapping(false)}
                className="p-2 rounded-lg hover:bg-claude-bg-cream text-claude-text-muted hover:text-claude-text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-claude-bg-warm p-4 rounded-lg border border-claude-border-warm mb-6">
                <p className="text-sm text-claude-text-secondary">
                  将Excel中的列映射到标准COSMIC字段。如果Excel列名与标准字段不匹配，请手动选择对应关系。
                </p>
              </div>
              <div className="space-y-4">
                {standardFields.map((field) => (
                  <div key={field.key} className="flex items-center gap-4 p-3 rounded-lg hover:bg-claude-bg-light transition-colors border border-transparent hover:border-claude-border-warm">
                    <div className="w-1/3">
                      <p className="text-sm font-medium text-claude-text-primary">{field.label}</p>
                      <p className="text-xs text-claude-text-muted mt-0.5">{field.description}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-claude-text-muted" />
                    <div className="flex-1 relative">
                      <select
                        value={columnMapping[field.key] || ''}
                        onChange={(e) => setColumnMapping({
                          ...columnMapping,
                          [field.key]: e.target.value
                        })}
                        className="w-full appearance-none bg-white border border-claude-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-claude-accent-primary/20 focus:border-claude-accent-primary text-claude-text-primary transition-all"
                      >
                        <option value="">-- 选择Excel列 --</option>
                        {cosmicData.headers.map((header, idx) => (
                          <option key={idx} value={header}>{header}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                        <svg className="w-4 h-4 text-claude-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-t border-claude-border bg-claude-bg-warm rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => setShowColumnMapping(false)}
                className="px-5 py-2 bg-white border border-claude-border text-claude-text-secondary rounded-lg hover:bg-claude-bg-cream hover:text-claude-text-primary transition-all shadow-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={() => setShowColumnMapping(false)}
                className="px-5 py-2 bg-claude-accent-primary text-white rounded-lg hover:bg-claude-accent-hover shadow-sm transition-all font-medium"
              >
                确认映射
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Word需求文档预览弹窗 */}
      {showDocPreview && requirementDoc && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-300">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl m-4 max-h-[90vh] flex flex-col border border-claude-border animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-claude-border bg-claude-bg-warm rounded-t-xl">
              <h2 className="text-lg font-serif font-bold flex items-center gap-2 text-claude-text-primary">
                <FileSearch className="w-5 h-5 text-claude-accent-primary" />
                需求文档深度分析结果
              </h2>
              <button
                onClick={() => setShowDocPreview(false)}
                className="p-2 rounded-lg hover:bg-claude-bg-cream text-claude-text-muted hover:text-claude-text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-claude-bg-warm/30">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左侧：文档结构 */}
                <div className="bg-white rounded-xl shadow-sm border border-claude-border p-5">
                  <h3 className="text-sm font-serif font-semibold text-claude-text-primary mb-4 flex items-center gap-2">
                    <List className="w-4 h-4 text-claude-accent-primary" />
                    文档章节结构 ({requirementDoc.sectionCount} 个章节)
                  </h3>
                  <div className="bg-claude-bg-warm rounded-lg p-4 max-h-80 overflow-y-auto custom-scrollbar border border-claude-border-warm">
                    {requirementDoc.sections?.slice(0, 30).map((section, idx) => (
                      <div 
                        key={idx} 
                        className="text-sm py-1.5 flex items-start hover:bg-claude-bg-light/50 rounded transition-colors"
                        style={{ paddingLeft: `${(section.level - 1) * 16}px` }}
                      >
                        <span className="text-claude-accent-primary font-medium mr-2 min-w-[20px]">{section.number}</span>
                        <span className="text-claude-text-primary flex-1">{section.title}</span>
                        {section.contentLength > 0 && (
                          <span className="text-claude-text-muted text-xs ml-2 whitespace-nowrap">({section.contentLength}字)</span>
                        )}
                      </div>
                    ))}
                    {requirementDoc.sections?.length > 30 && (
                      <p className="text-xs text-claude-text-muted mt-3 text-center border-t border-claude-border-warm pt-2">
                        ... 还有 {requirementDoc.sections.length - 30} 个章节
                      </p>
                    )}
                  </div>
                </div>

                {/* 右侧：AI分析结果 */}
                <div className="bg-white rounded-xl shadow-sm border border-claude-border p-5">
                  <h3 className="text-sm font-serif font-semibold text-claude-text-primary mb-4 flex items-center gap-2">
                    <Info className="w-4 h-4 text-claude-accent-primary" />
                    AI深度分析结果
                  </h3>
                  {requirementDoc.aiAnalysis ? (
                    <div className="space-y-4">
                      <div className="bg-claude-bg-cream rounded-xl p-4 border border-claude-border-warm">
                        <div className="mb-3">
                          <p className="text-xs text-claude-text-muted mb-1">项目名称</p>
                          <p className="text-sm font-medium text-claude-text-primary">{requirementDoc.aiAnalysis.projectName || '未识别'}</p>
                        </div>
                        {requirementDoc.aiAnalysis.projectDescription && (
                          <div>
                            <p className="text-xs text-claude-text-muted mb-1">项目描述</p>
                            <p className="text-sm text-claude-text-secondary leading-relaxed">{requirementDoc.aiAnalysis.projectDescription}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                          <p className="text-xs text-blue-600 mb-1">用户角色</p>
                          <div className="flex flex-wrap gap-1">
                            {requirementDoc.aiAnalysis.userRoles?.slice(0, 3).map((role, idx) => (
                              <span key={idx} className="text-xs px-2 py-0.5 bg-white text-blue-700 rounded border border-blue-200">
                                {role}
                              </span>
                            )) || <span className="text-xs text-blue-400">无</span>}
                          </div>
                        </div>
                        <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                          <p className="text-xs text-purple-600 mb-1">功能模块</p>
                          <p className="text-sm font-medium text-purple-800">
                            {requirementDoc.aiAnalysis.functionalModules?.length || 0} 个模块
                          </p>
                        </div>
                      </div>
                      
                      {requirementDoc.aiAnalysis.dataEntities && requirementDoc.aiAnalysis.dataEntities.length > 0 && (
                        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                          <p className="text-xs text-green-600 mb-2">数据实体</p>
                          <div className="flex flex-wrap gap-1.5">
                            {requirementDoc.aiAnalysis.dataEntities.slice(0, 8).map((entity, idx) => (
                              <span key={idx} className="text-xs px-2 py-0.5 bg-white text-green-700 rounded border border-green-200">
                                {entity}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-claude-bg-warm rounded-xl p-8 text-center border border-dashed border-claude-border">
                      <p className="text-sm text-claude-text-secondary">未进行AI分析</p>
                      <p className="text-xs mt-1 text-claude-text-muted">请确保已配置API密钥</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 功能需求列表 */}
              {requirementDoc.functionalRequirements && requirementDoc.functionalRequirements.length > 0 && (
                <div className="mt-6 bg-white rounded-xl shadow-sm border border-claude-border p-5">
                  <h3 className="text-sm font-serif font-semibold text-claude-text-primary mb-4">
                    识别到的功能需求 ({requirementDoc.functionalRequirements.length} 个)
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-claude-border-warm">
                    <table className="w-full text-sm">
                      <thead className="bg-claude-bg-cream">
                        <tr>
                          <th className="px-4 py-2.5 text-left w-24 text-claude-text-secondary font-medium border-b border-claude-border-warm">编号</th>
                          <th className="px-4 py-2.5 text-left text-claude-text-secondary font-medium border-b border-claude-border-warm">功能名称</th>
                          <th className="px-4 py-2.5 text-right w-24 text-claude-text-secondary font-medium border-b border-claude-border-warm">内容长度</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-claude-border-warm">
                        {requirementDoc.functionalRequirements.slice(0, 20).map((req, idx) => (
                          <tr key={idx} className="hover:bg-claude-bg-light transition-colors">
                            <td className="px-4 py-2.5 text-claude-accent-primary font-medium bg-claude-bg-warm/30">{req.number}</td>
                            <td className="px-4 py-2.5 text-claude-text-primary">{req.title}</td>
                            <td className="px-4 py-2.5 text-right text-claude-text-muted">{req.content?.length || 0} 字</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {requirementDoc.functionalRequirements.length > 20 && (
                      <div className="text-center bg-claude-bg-warm/50 py-2 border-t border-claude-border-warm">
                        <p className="text-xs text-claude-text-muted">
                          仅显示前20个，共 {requirementDoc.functionalRequirements.length} 个功能需求
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 文档概要 */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 text-center border border-claude-border shadow-sm">
                  <p className="text-2xl font-bold text-claude-accent-primary">{requirementDoc.sectionCount}</p>
                  <p className="text-xs text-claude-text-secondary mt-1">章节数</p>
                </div>
                <div className="bg-white rounded-xl p-4 text-center border border-claude-border shadow-sm">
                  <p className="text-2xl font-bold text-blue-600">{requirementDoc.functionalRequirements?.length || 0}</p>
                  <p className="text-xs text-claude-text-secondary mt-1">功能需求</p>
                </div>
                <div className="bg-white rounded-xl p-4 text-center border border-claude-border shadow-sm">
                  <p className="text-2xl font-bold text-purple-600">{requirementDoc.businessRules?.length || 0}</p>
                  <p className="text-xs text-claude-text-secondary mt-1">业务规则</p>
                </div>
                <div className="bg-white rounded-xl p-4 text-center border border-claude-border shadow-sm">
                  <p className="text-2xl font-bold text-orange-600">{requirementDoc.imageCount || 0}</p>
                  <p className="text-xs text-claude-text-secondary mt-1">图片数量</p>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-claude-border bg-claude-bg-warm rounded-b-xl flex justify-end">
              <button
                onClick={() => setShowDocPreview(false)}
                className="px-6 py-2 bg-claude-accent-primary text-white rounded-lg hover:bg-claude-accent-hover shadow-sm transition-all font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CosmicToSpec;
