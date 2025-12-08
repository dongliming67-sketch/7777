import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  const latestContentRef = useRef(''); // 保存最新生成的内容

  // 加载模板列表
  useEffect(() => {
    loadTemplates();
  }, []);

  // 自动滚动
  useEffect(() => {
    contentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamingContent, generatedContent]);

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
        await loadTemplates();
        setSelectedTemplateId(res.data.template.id);
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
                // 根据批次计算进度
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
                latestContentRef.current = fullContent; // 同步更新ref
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

  // 导出Word
  const exportWord = async () => {
    // 使用ref中保存的最新内容，确保导出的是当前显示的内容
    const contentToExport = latestContentRef.current || streamingContent || generatedContent;
    
    console.log('=== 导出Word ===');
    console.log('latestContentRef长度:', latestContentRef.current?.length);
    console.log('streamingContent长度:', streamingContent?.length);
    console.log('generatedContent长度:', generatedContent?.length);
    console.log('最终导出内容长度:', contentToExport?.length);
    console.log('内容前200字符:', contentToExport?.substring(0, 200));
    
    if (!contentToExport) {
      setErrorMessage('没有可导出的内容');
      return;
    }
    
    try {
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
    <div className="space-y-6">
      {/* 顶部标题栏 */}
      <div className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
              COSMIC 转需求规格说明书
            </h1>
            <p className="text-emerald-100 mt-2 text-sm">
              基于COSMIC方法的软件功能规模度量数据，智能生成标准化需求规格说明书
            </p>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-emerald-200">支持格式</p>
              <p className="text-sm font-medium">.xlsx / .xls / .docx / .doc</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* 左侧：数据上传和配置 */}
        <div className="xl:col-span-2 space-y-5">
          {/* 数据源类型切换 - 更醒目的设计 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileType className="w-4 h-4 text-gray-500" />
                选择数据源
              </h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSourceType('cosmic')}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-xl font-medium transition-all border-2 ${
                    sourceType === 'cosmic'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-gray-50 border-transparent text-gray-600 hover:bg-gray-100 hover:border-gray-200'
                  }`}
                >
                  {sourceType === 'cosmic' && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    </div>
                  )}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    sourceType === 'cosmic' ? 'bg-emerald-100' : 'bg-gray-200'
                  }`}>
                    <FileSpreadsheet className={`w-6 h-6 ${sourceType === 'cosmic' ? 'text-emerald-600' : 'text-gray-500'}`} />
                  </div>
                  <span className="text-sm">COSMIC Excel</span>
                  <span className="text-xs text-gray-400">已有度量数据</span>
                </button>
                <button
                  onClick={() => setSourceType('word')}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-xl font-medium transition-all border-2 ${
                    sourceType === 'word'
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-gray-50 border-transparent text-gray-600 hover:bg-gray-100 hover:border-gray-200'
                  }`}
                >
                  {sourceType === 'word' && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="w-4 h-4 text-blue-500" />
                    </div>
                  )}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    sourceType === 'word' ? 'bg-blue-100' : 'bg-gray-200'
                  }`}>
                    <FileText className={`w-6 h-6 ${sourceType === 'word' ? 'text-blue-600' : 'text-gray-500'}`} />
                  </div>
                  <span className="text-sm">Word文档</span>
                  <span className="text-xs text-gray-400">需求文档分析</span>
                </button>
              </div>
            </div>
          </div>

          {/* COSMIC Excel上传 - 仅在cosmic模式显示 */}
          {sourceType === 'cosmic' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-emerald-50 px-5 py-3 border-b border-emerald-100">
                <h2 className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  上传COSMIC度量数据
                </h2>
              </div>
              <div className="p-5">
                <div
                  onClick={() => excelInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, 'excel')}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/30'
                  }`}
                >
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => handleExcelUpload(e.target.files?.[0])}
                    className="hidden"
                  />
                  <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-7 h-7 text-emerald-600" />
                  </div>
                  <p className="text-gray-700 font-medium">点击或拖拽上传文件</p>
                  <p className="text-sm text-gray-400 mt-1">支持 .xlsx / .xls 格式</p>
                </div>
            
                {/* 已上传的Excel */}
                {cosmicData && (
                  <div className="mt-5 p-4 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{cosmicFilename}</p>
                        <p className="text-xs text-gray-500">
                          {cosmicData.rowCount} 条记录 · {cosmicData.functionalProcesses?.length || 0} 个功能过程
                        </p>
                      </div>
                      <button
                        onClick={() => setShowDataPreview(true)}
                        className="p-2 hover:bg-emerald-100 rounded-lg transition-colors"
                        title="预览数据"
                      >
                        <Eye className="w-4 h-4 text-emerald-600" />
                      </button>
                      <button
                        onClick={() => {
                          setCosmicData(null);
                          setCosmicFilename('');
                        }}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                        title="清除"
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                    
                    {/* 功能过程列表 */}
                    {cosmicData.functionalProcesses && cosmicData.functionalProcesses.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-emerald-100">
                        <p className="text-xs text-gray-500 mb-2 font-medium">识别到的功能过程：</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cosmicData.functionalProcesses.slice(0, 6).map((fp, idx) => (
                            <span key={idx} className="text-xs px-2.5 py-1 bg-white text-emerald-700 rounded-lg border border-emerald-200">
                              {fp}
                            </span>
                          ))}
                          {cosmicData.functionalProcesses.length > 6 && (
                            <span className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg">
                              +{cosmicData.functionalProcesses.length - 6} 更多
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* 列映射按钮 */}
                    <button
                      onClick={() => setShowColumnMapping(true)}
                      className="mt-4 w-full text-xs px-3 py-2.5 bg-white border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      配置列映射
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Word需求文档上传 - 仅在word模式显示 */}
          {sourceType === 'word' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-blue-50 px-5 py-3 border-b border-blue-100">
                <h2 className="text-sm font-semibold text-blue-700 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  上传Word需求文档
                </h2>
              </div>
              <div className="p-5">
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
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/30'
                  }`}
                >
                  <input
                    ref={wordInputRef}
                    type="file"
                    accept=".docx,.doc"
                    onChange={(e) => handleWordUpload(e.target.files?.[0])}
                    className="hidden"
                  />
                  <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-7 h-7 text-blue-600" />
                  </div>
                  <p className="text-gray-700 font-medium">点击或拖拽上传文件</p>
                  <p className="text-sm text-gray-400 mt-1">支持 .docx / .doc 格式</p>
                </div>
                
                {/* 深度分析进度展示 */}
                {isAnalyzingDoc && (
                  <div className="mt-5 p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border border-blue-200">
                    <div className="flex items-center gap-3 mb-3">
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                      <span className="text-sm font-semibold text-blue-700">{docAnalysisMessage || '正在分析...'}</span>
                    </div>
                    
                    {/* 进度条 */}
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${docAnalysisProgress}%` }}
                      />
                    </div>
                    
                    {/* 阶段指示器 */}
                    <div className="flex flex-wrap gap-2">
                      <div className={`text-xs px-2.5 py-1 rounded-lg ${
                        docAnalysisPhase === 'parsing' || docAnalysisPhase === 'parsing_complete' 
                          ? 'bg-blue-500 text-white' 
                          : docAnalysisProgress > 10 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        📄 解析文档
                      </div>
                      <div className={`text-xs px-2.5 py-1 rounded-lg ${
                        docAnalysisPhase === 'phase1' 
                          ? 'bg-blue-500 text-white' 
                          : docAnalysisProgress > 20 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        🔍 结构分析
                      </div>
                      <div className={`text-xs px-2.5 py-1 rounded-lg ${
                        docAnalysisPhase === 'phase2' 
                          ? 'bg-blue-500 text-white' 
                          : docAnalysisProgress > 40 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        📋 功能分析
                      </div>
                      <div className={`text-xs px-2.5 py-1 rounded-lg ${
                        docAnalysisPhase === 'phase3' 
                          ? 'bg-blue-500 text-white' 
                          : docAnalysisProgress > 60 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        💾 数据分析
                      </div>
                      <div className={`text-xs px-2.5 py-1 rounded-lg ${
                        docAnalysisPhase === 'phase4' 
                          ? 'bg-blue-500 text-white' 
                          : docAnalysisProgress > 80 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        📏 规则分析
                      </div>
                      <div className={`text-xs px-2.5 py-1 rounded-lg ${
                        docAnalysisPhase === 'phase5' || docAnalysisPhase === 'analysis_complete'
                          ? 'bg-blue-500 text-white' 
                          : docAnalysisProgress > 95 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        📊 生成报告
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-500 mt-3">
                      🧠 正在进行5阶段多维度深度分析，确保准确理解文档内容...
                    </p>
                  </div>
                )}
            
                {/* 已上传的Word文档 */}
                {!isAnalyzingDoc && requirementDoc && (
                  <div className="mt-5 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{requirementFilename}</p>
                        <p className="text-xs text-gray-500">
                          {requirementDoc.sectionCount} 个章节 · {requirementDoc.functionalRequirements?.length || 0} 个功能需求
                        </p>
                      </div>
                      <button
                        onClick={() => setShowDocPreview(true)}
                        className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                        title="预览文档"
                      >
                        <Eye className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => {
                          setRequirementDoc(null);
                          setRequirementFilename('');
                        }}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                        title="清除"
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                    
                    {/* AI深度分析结果 */}
                    {requirementDoc.aiAnalysis && (
                      <div className="mt-4 pt-4 border-t border-blue-100">
                        {/* 分析版本标识 */}
                        {requirementDoc.aiAnalysis.analysisVersion && (
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              requirementDoc.aiAnalysis.analysisVersion.includes('deep') 
                                ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                                : 'bg-gray-200 text-gray-600'
                            }`}>
                              {requirementDoc.aiAnalysis.analysisVersion.includes('deep') ? '🧠 5阶段深度分析' : '基础分析'}
                            </span>
                            {requirementDoc.aiAnalysis.summary?.analysisQuality && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                requirementDoc.aiAnalysis.summary.analysisQuality === 'excellent' ? 'bg-green-100 text-green-700' :
                                requirementDoc.aiAnalysis.summary.analysisQuality === 'good' ? 'bg-blue-100 text-blue-700' :
                                requirementDoc.aiAnalysis.summary.analysisQuality === 'fair' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                质量: {
                                  requirementDoc.aiAnalysis.summary.analysisQuality === 'excellent' ? '优秀' :
                                  requirementDoc.aiAnalysis.summary.analysisQuality === 'good' ? '良好' :
                                  requirementDoc.aiAnalysis.summary.analysisQuality === 'fair' ? '一般' : '较弱'
                                }
                              </span>
                            )}
                          </div>
                        )}
                        
                        <p className="text-xs text-gray-500 mb-2 font-medium">📊 AI深度分析结果：</p>
                        
                        {/* 项目概览 */}
                        <div className="space-y-1.5 mb-3">
                          <p className="text-xs text-blue-700">
                            <span className="font-medium">📌 项目：</span> {requirementDoc.aiAnalysis.projectName || '未识别'}
                          </p>
                          {requirementDoc.aiAnalysis.projectDescription && (
                            <p className="text-xs text-gray-600 pl-4">
                              {requirementDoc.aiAnalysis.projectDescription.slice(0, 100)}
                              {requirementDoc.aiAnalysis.projectDescription.length > 100 ? '...' : ''}
                            </p>
                          )}
                        </div>
                        
                        {/* 统计摘要 */}
                        {requirementDoc.aiAnalysis.summary && (
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className="bg-blue-50 rounded-lg p-2 text-center">
                              <p className="text-lg font-bold text-blue-600">
                                {requirementDoc.aiAnalysis.summary.totalFunctionalRequirements || 0}
                              </p>
                              <p className="text-xs text-blue-500">功能需求</p>
                            </div>
                            <div className="bg-purple-50 rounded-lg p-2 text-center">
                              <p className="text-lg font-bold text-purple-600">
                                {requirementDoc.aiAnalysis.summary.totalModules || 0}
                              </p>
                              <p className="text-xs text-purple-500">功能模块</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-2 text-center">
                              <p className="text-lg font-bold text-green-600">
                                {requirementDoc.aiAnalysis.summary.totalBusinessRules || 0}
                              </p>
                              <p className="text-xs text-green-500">业务规则</p>
                            </div>
                          </div>
                        )}
                        
                        {/* 详细信息 */}
                        <div className="space-y-1.5">
                          {requirementDoc.aiAnalysis.userRoles && requirementDoc.aiAnalysis.userRoles.length > 0 && (
                            <p className="text-xs text-blue-600">
                              <span className="font-medium">👥 用户角色：</span> {requirementDoc.aiAnalysis.userRoles.slice(0, 4).join('、')}
                              {requirementDoc.aiAnalysis.userRoles.length > 4 ? ` 等${requirementDoc.aiAnalysis.userRoles.length}个` : ''}
                            </p>
                          )}
                          {requirementDoc.aiAnalysis.functionalModules && requirementDoc.aiAnalysis.functionalModules.length > 0 && (
                            <p className="text-xs text-purple-600">
                              <span className="font-medium">📦 功能模块：</span> {requirementDoc.aiAnalysis.functionalModules.slice(0, 3).map(m => m.name || m).join('、')}
                              {requirementDoc.aiAnalysis.functionalModules.length > 3 ? ` 等${requirementDoc.aiAnalysis.functionalModules.length}个` : ''}
                            </p>
                          )}
                          {requirementDoc.aiAnalysis.dataEntities && requirementDoc.aiAnalysis.dataEntities.length > 0 && (
                            <p className="text-xs text-green-600">
                              <span className="font-medium">💾 数据实体：</span> {requirementDoc.aiAnalysis.dataEntities.slice(0, 3).map(e => e.name || e).join('、')}
                              {requirementDoc.aiAnalysis.dataEntities.length > 3 ? ` 等${requirementDoc.aiAnalysis.dataEntities.length}个` : ''}
                            </p>
                          )}
                          {requirementDoc.aiAnalysis.integrationPoints && requirementDoc.aiAnalysis.integrationPoints.length > 0 && (
                            <p className="text-xs text-orange-600">
                              <span className="font-medium">🔗 集成点：</span> {requirementDoc.aiAnalysis.integrationPoints.length}个外部系统集成
                            </p>
                          )}
                        </div>
                        
                        {/* 分析耗时 */}
                        {requirementDoc.aiAnalysis.analysisDuration && (
                          <p className="text-xs text-gray-400 mt-2">
                            ⏱️ 分析耗时: {(requirementDoc.aiAnalysis.analysisDuration / 1000).toFixed(1)}秒
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* 功能需求列表 */}
                    {requirementDoc.functionalRequirements && requirementDoc.functionalRequirements.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-blue-100">
                        <p className="text-xs text-gray-500 mb-2 font-medium">识别到的功能需求：</p>
                        <div className="flex flex-wrap gap-1.5">
                          {requirementDoc.functionalRequirements.slice(0, 5).map((req, idx) => (
                            <span key={idx} className="text-xs px-2.5 py-1 bg-white text-blue-700 rounded-lg border border-blue-200">
                              {req.title}
                            </span>
                          ))}
                          {requirementDoc.functionalRequirements.length > 5 && (
                            <span className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg">
                              +{requirementDoc.functionalRequirements.length - 5} 更多
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        
          {/* 模板管理 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-purple-50 px-5 py-3 border-b border-purple-100">
              <h2 className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                规格书模板（可选）
              </h2>
            </div>
            <div className="p-5">
              {/* 上传新模板 */}
              <div
                onClick={() => templateInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'template')}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  uploadingTemplate ? 'opacity-50 cursor-wait' : ''
                } ${
                  isDragging
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50/30'
                }`}
              >
                <input
                  ref={templateInputRef}
                  type="file"
                  accept=".docx,.doc"
                  onChange={(e) => handleTemplateUpload(e.target.files?.[0])}
                  className="hidden"
                />
                {uploadingTemplate ? (
                  <Loader2 className="w-8 h-8 text-purple-500 mx-auto mb-2 animate-spin" />
                ) : (
                  <Plus className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                )}
                <p className="text-sm text-gray-600">上传自定义模板</p>
                <p className="text-xs text-gray-400 mt-1">.docx / .doc 格式</p>
              </div>
              
              {/* 模板列表 */}
              <div className="mt-4 space-y-2">
                {/* 默认模板选项 */}
                <label
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2 ${
                    !selectedTemplateId
                      ? 'bg-purple-50 border-purple-400'
                      : 'bg-gray-50 border-transparent hover:border-purple-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    checked={!selectedTemplateId}
                    onChange={() => setSelectedTemplateId('')}
                    className="w-4 h-4 text-purple-600 sr-only"
                  />
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    !selectedTemplateId ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                  }`}>
                    {!selectedTemplateId && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">默认模板</p>
                    <p className="text-xs text-gray-500">7章节标准结构</p>
                  </div>
                </label>
                
                {/* 已上传的模板 */}
                {templates.map((template) => (
                  <label
                    key={template.id}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2 ${
                      selectedTemplateId === template.id
                        ? 'bg-purple-50 border-purple-400'
                        : 'bg-gray-50 border-transparent hover:border-purple-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      checked={selectedTemplateId === template.id}
                      onChange={() => setSelectedTemplateId(template.id)}
                      className="w-4 h-4 text-purple-600 sr-only"
                    />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedTemplateId === template.id ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                    }`}>
                      {selectedTemplateId === template.id && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{template.filename}</p>
                      <p className="text-xs text-gray-500">
                        {template.sectionCount} 章节 · {(template.fileSize / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteTemplate(template.id);
                      }}
                      className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                      title="删除模板"
                    >
                      <Trash2 className="w-4 h-4 text-red-400 hover:text-red-500" />
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
            className={`w-full py-4 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 shadow-lg ${
              sourceType === 'cosmic'
                ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-emerald-200'
                : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-blue-200'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                正在生成中...
              </>
            ) : (
              <>
                <ArrowRight className="w-5 h-5" />
                {sourceType === 'cosmic' ? '生成需求规格说明书' : '生成需求规格说明书'}
              </>
            )}
          </button>
        
          {/* 错误提示 */}
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700">{errorMessage}</p>
                <button
                  onClick={() => setErrorMessage('')}
                  className="text-xs text-red-500 hover:text-red-700 mt-1 underline"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        
          {/* 生成状态 - 简化版 */}
          {(isGenerating || generatedContent) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  生成状态
                </h2>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {isGenerating ? (
                    <>
                      <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">{generationPhase}</p>
                        {totalSteps > 0 && (
                          <p className="text-xs text-gray-500">
                            步骤 {currentStep}/{totalSteps}
                            {batchInfo && ` · 功能 ${batchInfo.end}/${batchInfo.total}`}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">生成完成</p>
                        <p className="text-xs text-gray-500">
                          {generatedContent.length} 字符 · 约 {Math.ceil(generatedContent.length / 1500)} 页
                        </p>
                      </div>
                    </>
                  )}
                </div>
                
                {/* 进度条 */}
                {isGenerating && (
                  <div className="pt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span>生成进度</span>
                      <span className="font-medium">{Math.round(generationProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-green-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              
              {/* 模板分析结果 - 简洁版 */}
              {templateAnalysis && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1.5">模板分析</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                      {templateAnalysis.allChapters?.length || templateAnalysis.chapters?.length || 0} 章节
                    </span>
                    {templateAnalysis.functionalChapter?.hierarchyLevels && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {templateAnalysis.functionalChapter.hierarchyLevels} 级结构
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              {/* 功能过程分类结果 - 简洁版 */}
              {processClassification && processClassification.classification && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1.5">功能分类</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(processClassification.classification).slice(0, 3).map(([subsystem, modules], idx) => (
                      <span key={idx} className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                        {subsystem} ({Object.values(modules).flat().length})
                      </span>
                    ))}
                    {Object.keys(processClassification.classification).length > 3 && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        +{Object.keys(processClassification.classification).length - 3}
                      </span>
                    )}
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
        </div>
        
        {/* 右侧：生成结果 */}
        <div className="xl:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 h-[calc(100vh-220px)] flex flex-col overflow-hidden">
            {/* 标题栏 */}
            <div className="bg-gray-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-500" />
                生成结果预览
              </h3>
              {(generatedContent || streamingContent) && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyContent}
                    className="text-sm px-3 py-2 bg-white text-gray-600 rounded-lg hover:bg-gray-100 flex items-center gap-1.5 border border-gray-200 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                  <button
                    onClick={exportWord}
                    className="text-sm px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    导出Word
                  </button>
                </div>
              )}
            </div>
            
            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto p-6">
              {!generatedContent && !streamingContent && !isGenerating && (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <FileText className="w-10 h-10 text-gray-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">等待生成</h3>
                  <p className="text-gray-400 text-sm max-w-sm mx-auto">
                    请在左侧上传数据文件并选择模板，然后点击"生成需求规格说明书"按钮
                  </p>
                </div>
              )}
              
              {/* 流式输出或最终内容 */}
              {(streamingContent || generatedContent) && (
                <div className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-600 prose-table:border-collapse">
                  <style>{`
                    .prose table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.875rem; }
                    .prose th, .prose td { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; }
                    .prose th { background-color: #f9fafb; font-weight: 600; color: #374151; }
                    .prose tr:nth-child(even) { background-color: #fafafa; }
                    .prose h1 { font-size: 1.5rem; border-bottom: 2px solid #10b981; padding-bottom: 0.5em; margin-top: 1.5em; color: #111827; }
                    .prose h2 { font-size: 1.25rem; border-bottom: 1px solid #d1d5db; padding-bottom: 0.4em; margin-top: 1.5em; color: #1f2937; }
                    .prose h3 { font-size: 1.1rem; color: #059669; margin-top: 1.2em; }
                    .prose h4 { font-size: 1rem; color: #374151; margin-top: 1em; }
                    .prose h5 { font-size: 0.95rem; color: #4b5563; margin-top: 0.8em; }
                    .prose ul, .prose ol { margin: 0.5em 0; padding-left: 1.5em; }
                    .prose li { margin: 0.25em 0; }
                    .prose p { margin: 0.5em 0; line-height: 1.7; }
                  `}</style>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingContent || generatedContent}
                  </ReactMarkdown>
                </div>
              )}
              
              {/* 加载指示器 */}
              {isGenerating && !streamingContent && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                  </div>
                  <p className="text-gray-600 font-medium">AI正在生成需求规格说明书...</p>
                  <p className="text-gray-400 text-sm mt-1">请稍候，这可能需要几分钟时间</p>
                </div>
              )}
              
              <div ref={contentEndRef} />
            </div>
          </div>
        </div>
      </div>
      
      {/* 数据预览弹窗 */}
      {showDataPreview && cosmicData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl m-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Table className="w-5 h-5 text-green-500" />
                COSMIC数据预览 ({cosmicData.rowCount} 条记录)
              </h2>
              <button
                onClick={() => setShowDataPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-green-500 text-white">
                    <th className="border border-green-600 px-3 py-2 text-left">功能用户</th>
                    <th className="border border-green-600 px-3 py-2 text-left">触发事件</th>
                    <th className="border border-green-600 px-3 py-2 text-left">功能过程</th>
                    <th className="border border-green-600 px-3 py-2 text-left">子过程描述</th>
                    <th className="border border-green-600 px-3 py-2 text-center w-20">类型</th>
                    <th className="border border-green-600 px-3 py-2 text-left">数据组</th>
                    <th className="border border-green-600 px-3 py-2 text-left">数据属性</th>
                  </tr>
                </thead>
                <tbody>
                  {cosmicData.data.slice(0, 100).map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-200 px-3 py-2">{row.functionalUser}</td>
                      <td className="border border-gray-200 px-3 py-2">{row.triggerEvent}</td>
                      <td className="border border-gray-200 px-3 py-2">{row.functionalProcess}</td>
                      <td className="border border-gray-200 px-3 py-2">{row.subProcessDesc}</td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          row.dataMovementType === 'E' ? 'bg-green-100 text-green-700' :
                          row.dataMovementType === 'R' ? 'bg-blue-100 text-blue-700' :
                          row.dataMovementType === 'W' ? 'bg-orange-100 text-orange-700' :
                          row.dataMovementType === 'X' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {row.dataMovementType}
                        </span>
                      </td>
                      <td className="border border-gray-200 px-3 py-2">{row.dataGroup}</td>
                      <td className="border border-gray-200 px-3 py-2">{row.dataAttributes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cosmicData.data.length > 100 && (
                <p className="text-center text-gray-500 mt-4">
                  仅显示前100条，共 {cosmicData.data.length} 条记录
                </p>
              )}
            </div>
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={() => setShowDataPreview(false)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 列映射弹窗 */}
      {showColumnMapping && cosmicData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl m-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-green-500" />
                配置列映射
              </h2>
              <button
                onClick={() => setShowColumnMapping(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-sm text-gray-600 mb-4">
                将Excel中的列映射到标准COSMIC字段。如果Excel列名与标准字段不匹配，请手动选择对应关系。
              </p>
              <div className="space-y-4">
                {standardFields.map((field) => (
                  <div key={field.key} className="flex items-center gap-4">
                    <div className="w-1/3">
                      <p className="text-sm font-medium text-gray-800">{field.label}</p>
                      <p className="text-xs text-gray-500">{field.description}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <select
                      value={columnMapping[field.key] || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        [field.key]: e.target.value
                      })}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">-- 选择Excel列 --</option>
                      {cosmicData.headers.map((header, idx) => (
                        <option key={idx} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowColumnMapping(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={() => setShowColumnMapping(false)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Word需求文档预览弹窗 */}
      {showDocPreview && requirementDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl m-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-blue-500" />
                需求文档深度分析结果
              </h2>
              <button
                onClick={() => setShowDocPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左侧：文档结构 */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <List className="w-4 h-4" />
                    文档章节结构 ({requirementDoc.sectionCount} 个章节)
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4 max-h-80 overflow-y-auto">
                    {requirementDoc.sections?.slice(0, 30).map((section, idx) => (
                      <div 
                        key={idx} 
                        className="text-sm py-1"
                        style={{ paddingLeft: `${(section.level - 1) * 16}px` }}
                      >
                        <span className="text-blue-600 font-medium">{section.number}</span>
                        <span className="text-gray-700 ml-2">{section.title}</span>
                        {section.contentLength > 0 && (
                          <span className="text-gray-400 text-xs ml-2">({section.contentLength}字)</span>
                        )}
                      </div>
                    ))}
                    {requirementDoc.sections?.length > 30 && (
                      <p className="text-xs text-gray-400 mt-2">
                        ... 还有 {requirementDoc.sections.length - 30} 个章节
                      </p>
                    )}
                  </div>
                </div>

                {/* 右侧：AI分析结果 */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    AI深度分析结果
                  </h3>
                  {requirementDoc.aiAnalysis ? (
                    <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                      <div>
                        <p className="text-xs text-gray-500">项目名称</p>
                        <p className="text-sm font-medium text-gray-800">{requirementDoc.aiAnalysis.projectName || '未识别'}</p>
                      </div>
                      {requirementDoc.aiAnalysis.projectDescription && (
                        <div>
                          <p className="text-xs text-gray-500">项目描述</p>
                          <p className="text-sm text-gray-700">{requirementDoc.aiAnalysis.projectDescription}</p>
                        </div>
                      )}
                      {requirementDoc.aiAnalysis.userRoles && requirementDoc.aiAnalysis.userRoles.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500">用户角色</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {requirementDoc.aiAnalysis.userRoles.map((role, idx) => (
                              <span key={idx} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                {role}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {requirementDoc.aiAnalysis.functionalModules && (
                        <div>
                          <p className="text-xs text-gray-500">功能模块</p>
                          <div className="mt-1 space-y-1">
                            {requirementDoc.aiAnalysis.functionalModules.slice(0, 5).map((mod, idx) => (
                              <div key={idx} className="text-sm">
                                <span className="font-medium text-gray-800">{mod.name}</span>
                                {mod.description && (
                                  <span className="text-gray-500 ml-2 text-xs">{mod.description}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {requirementDoc.aiAnalysis.dataEntities && requirementDoc.aiAnalysis.dataEntities.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500">数据实体</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {requirementDoc.aiAnalysis.dataEntities.slice(0, 8).map((entity, idx) => (
                              <span key={idx} className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                                {entity}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                      <p className="text-sm">未进行AI分析</p>
                      <p className="text-xs mt-1">请确保已配置API密钥</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 功能需求列表 */}
              {requirementDoc.functionalRequirements && requirementDoc.functionalRequirements.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    识别到的功能需求 ({requirementDoc.functionalRequirements.length} 个)
                  </h3>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-blue-500 text-white">
                          <th className="px-4 py-2 text-left w-24">编号</th>
                          <th className="px-4 py-2 text-left">功能名称</th>
                          <th className="px-4 py-2 text-right w-24">内容长度</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requirementDoc.functionalRequirements.slice(0, 20).map((req, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-2 text-blue-600 font-medium">{req.number}</td>
                            <td className="px-4 py-2 text-gray-800">{req.title}</td>
                            <td className="px-4 py-2 text-right text-gray-500">{req.content?.length || 0} 字</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {requirementDoc.functionalRequirements.length > 20 && (
                      <p className="text-center text-gray-500 py-2 text-xs">
                        仅显示前20个，共 {requirementDoc.functionalRequirements.length} 个功能需求
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 文档概要 */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{requirementDoc.sectionCount}</p>
                  <p className="text-xs text-gray-500">章节数</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{requirementDoc.functionalRequirements?.length || 0}</p>
                  <p className="text-xs text-gray-500">功能需求</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-purple-600">{requirementDoc.businessRules?.length || 0}</p>
                  <p className="text-xs text-gray-500">业务规则</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{requirementDoc.imageCount || 0}</p>
                  <p className="text-xs text-gray-500">图片数量</p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={() => setShowDocPreview(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
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
