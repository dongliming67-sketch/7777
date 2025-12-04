import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import ArchitectureDiagram from './ArchitectureDiagram';
import {
  Upload,
  FileText,
  Send,
  Download,
  Settings,
  Bot,
  User,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  FileSpreadsheet,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Eye,
  Table,
  Info,
  Zap,
  FileOutput,
  BookOpen,
  Layers,
  ArrowRight,
  GitBranch
} from 'lucide-react';

function App() {
  // 状态管理
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [documentContent, setDocumentContent] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://open.bigmodel.cn/api/paas/v4');
  const [modelName, setModelName] = useState('glm-4-flash');
  const [apiStatus, setApiStatus] = useState({ hasApiKey: false });
  const [tableData, setTableData] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showTableView, setShowTableView] = useState(false);
  const [minFunctionCount, setMinFunctionCount] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('minFunctionCount');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }
    return 30;
  });

  // 功能模块切换: 'cosmic' | 'requirement'
  const [activeModule, setActiveModule] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('activeModule') || 'requirement';
    }
    return 'requirement';
  });
  
  // 需求规格书相关状态
  const [specContent, setSpecContent] = useState('');
  const [specStreamingContent, setSpecStreamingContent] = useState('');
  const [specAnalysisJson, setSpecAnalysisJson] = useState('');
  const [specPhase, setSpecPhase] = useState('idle');
  const [specMessages, setSpecMessages] = useState([]);
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  
  // 图片相关状态
  const [extractedImages, setExtractedImages] = useState([]);
  const [showImagePreview, setShowImagePreview] = useState(false);
  
  // 架构图模块独立状态
  const [diagramDocContent, setDiagramDocContent] = useState('');
  const [diagramDocName, setDiagramDocName] = useState('');
  
  // 多轮完善相关状态
  const [enhanceRound, setEnhanceRound] = useState(0);
  const [totalEnhanceRounds, setTotalEnhanceRounds] = useState(14); // 7章节 × 2次（生成+完善）= 14轮
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enableMultiRoundEnhance, setEnableMultiRoundEnhance] = useState(true);
  
  // 模板选择状态
  const [selectedTemplate, setSelectedTemplate] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseInt(window.localStorage.getItem('selectedTemplate') || '1', 10);
    }
    return 1;
  });

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // 初始化Mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'Microsoft YaHei, sans-serif'
    });
  }, []);

  // 检查API状态
  useEffect(() => {
    checkApiStatus();
  }, []);

  // 持久化最小功能过程数量
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('minFunctionCount', String(minFunctionCount));
    }
  }, [minFunctionCount]);

  // 记住上次选择的模块
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('activeModule', activeModule);
    }
  }, [activeModule]);

  // 记住上次选择的模板
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('selectedTemplate', String(selectedTemplate));
      // 根据模板调整总轮次
      setTotalEnhanceRounds(selectedTemplate === 1 ? 14 : 10);
    }
  }, [selectedTemplate]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const checkApiStatus = async () => {
    try {
      const res = await axios.get('/api/health');
      setApiStatus(res.data);
      if (res.data.baseUrl) {
        setBaseUrl(res.data.baseUrl);
      }
    } catch (error) {
      console.error('检查API状态失败:', error);
    }
  };

  // 保存API配置
  const saveApiConfig = async () => {
    try {
      await axios.post('/api/config', { apiKey, baseUrl });
      setShowSettings(false);
      checkApiStatus();
      alert('API配置已保存');
    } catch (error) {
      alert('保存配置失败: ' + error.message);
    }
  };

  // 拖拽上传处理
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开拖拽区域时才取消状态
    if (e.currentTarget === dropZoneRef.current && !e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, []);

  // 文件选择处理
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // 重置input以便可以重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 处理文件上传
  const processFile = async (file) => {
    // 清除之前的错误
    setErrorMessage('');

    // 检查文件类型
    const allowedExtensions = ['.docx', '.txt', '.md'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      setErrorMessage(`不支持的文件格式: ${ext}。请上传 .docx, .txt 或 .md 文件`);
      return;
    }

    // 检查文件大小
    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage('文件大小超过限制（最大50MB）');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsLoading(true);
      setUploadProgress(0);

      const res = await axios.post('/api/parse-word', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      if (res.data.success) {
        setDocumentContent(res.data.text);
        setDocumentName(res.data.filename);
        setUploadProgress(100);

        // 添加系统消息
        const wordCount = res.data.wordCount || res.data.text.length;
        setMessages(prev => [...prev, {
          role: 'system',
          content: `📄 已成功导入文档: ${res.data.filename}\n📊 文档大小: ${(res.data.fileSize / 1024).toFixed(2)} KB | 字符数: ${wordCount}\n\n文档内容预览:\n${res.data.text.substring(0, 800)}${res.data.text.length > 800 ? '\n\n... (点击"预览文档"查看完整内容)' : ''}`
        }]);

        // 自动开始分析 - 先检查最新的API状态
        const statusRes = await axios.get('/api/health');
        if (statusRes.data.hasApiKey) {
          setApiStatus(statusRes.data);
          await startAnalysis(res.data.text);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: '⚠️ 请先配置API密钥才能使用AI分析功能。点击右上角的设置按钮进行配置。\n\n推荐使用免费的智谱GLM-4-Flash API：\n1. 访问 https://bigmodel.cn 注册账号\n2. 在控制台获取API Key\n3. 在设置中填入API Key'
          }]);
        }
      }
    } catch (error) {
      console.error('文档解析失败:', error);
      const errorMsg = error.response?.data?.error || error.message;
      setErrorMessage(`文档解析失败: ${errorMsg}`);
      setMessages(prev => [...prev, {
        role: 'system',
        content: `❌ 文档解析失败: ${errorMsg}`
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  // 开始AI分析 - 循环调用直到完成
  const startAnalysis = async (content) => {
    if (!apiStatus.hasApiKey) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ 请先配置API密钥才能使用AI分析功能。点击右上角的设置按钮进行配置。'
      }]);
      return;
    }

    setIsLoading(true);
    setStreamingContent('');
    setTableData([]); // 清空之前的表格数据

    let allTableData = [];
    let round = 1;
    const maxRounds = 12; // 最多循环12次，防止无限循环
    let uniqueFunctions = [];
    const globalRowSet = new Set(); // 仅用于整行去重

    try {
      while (round <= maxRounds) {
        if (uniqueFunctions.length >= minFunctionCount) {
          break;
        }

        // 更新进度提示
        setMessages(prev => {
          const filtered = prev.filter(m => !m.content.startsWith('🔄'));
          return [...filtered, {
            role: 'system',
            content: `🔄 第 ${round} 轮分析中... 已识别 ${allTableData.length} 个子过程 / 目标 ${minFunctionCount * 4} 数据移动`
          }];
        });

        const response = await axios.post('/api/continue-analyze', {
          documentContent: content,
          previousResults: allTableData,
          round: round,
          targetFunctions: minFunctionCount
        });

        if (response.data.success) {
          const replyContent = response.data.reply;

          // 解析表格数据 - 直接使用后端已处理好的数据，不再前端二次处理
          try {
            const tableRes = await axios.post('/api/parse-table', { markdown: replyContent });
            console.log(`第 ${round} 轮解析结果:`, tableRes.data);
            if (tableRes.data.success && tableRes.data.tableData.length > 0) {
              // 直接使用后端返回的数据，不做额外过滤
              const newData = tableRes.data.tableData;
              console.log(`第 ${round} 轮获取 ${newData.length} 条数据`);

              // 统计数据移动类型分布
              const typeCount = { E: 0, R: 0, W: 0, X: 0 };
              newData.forEach(row => {
                const t = (row.dataMovementType || '').toUpperCase();
                if (typeCount[t] !== undefined) typeCount[t]++;
              });
              console.log(`数据移动类型分布:`, typeCount);

              if (newData.length > 0) {
                allTableData = [...allTableData, ...newData];
                setTableData(allTableData);
                console.log(`第 ${round} 轮新增 ${newData.length} 条，总计 ${allTableData.length} 条`);
              }
            }
          } catch (e) {
            console.log(`第 ${round} 轮表格解析失败`);
          }

          // 显示本轮结果
          setMessages(prev => {
            const filtered = prev.filter(m => !m.content.startsWith('🔄'));
            return [...filtered, {
              role: 'assistant',
              content: `**第 ${round} 轮完成** (已识别 ${allTableData.length} 个子过程)\n\n${replyContent}`
            }];
          });

          uniqueFunctions = [...new Set(allTableData.map(r => r.functionalProcess).filter(Boolean))];
          const reachedTarget = uniqueFunctions.length >= minFunctionCount;

          if (reachedTarget) {
            console.log(`达到用户设定的最少功能过程数量: ${minFunctionCount}`);
            break;
          }

          // 检查是否完成
          if (response.data.isDone && !reachedTarget) {
            setMessages(prev => [...prev, {
              role: 'system',
              content: '⚠️ AI表示已拆分完成，但尚未达到目标数量，继续尝试扩展覆盖...'
            }]);
          } else if (response.data.isDone && reachedTarget) {
            console.log('AI表示已完成所有功能过程');
            break;
          }

          // 如果这轮没有新增数据，可能已经完成
          const tableRes = await axios.post('/api/parse-table', { markdown: replyContent }).catch(() => null);
          if (!tableRes?.data?.tableData?.length && round > 1) {
            console.log('本轮无新增数据，结束循环');
            break;
          }
        }

        round++;

        // 轮次间延迟
        if (round <= maxRounds) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // 统计功能过程数量
      uniqueFunctions = [...new Set(allTableData.map(r => r.functionalProcess).filter(Boolean))];
      const reachedTarget = uniqueFunctions.length >= minFunctionCount;

      // 最终汇总
      setMessages(prev => {
        const filtered = prev.filter(m => !m.content.startsWith('🔄'));
        return [...filtered, {
          role: 'assistant',
          content: `🎉 **分析完成！**\n\n经过 **${round}** 轮分析，共识别：\n- **${uniqueFunctions.length}** 个功能过程（目标 ${minFunctionCount} 个${reachedTarget ? ' ✅' : ' ⚠️ 未达标'}）\n- **${allTableData.length}** 个子过程（CFP点数）\n\n数据移动类型分布：\n- 输入(E): ${allTableData.filter(r => r.dataMovementType === 'E').length}\n- 读取(R): ${allTableData.filter(r => r.dataMovementType === 'R').length}\n- 写入(W): ${allTableData.filter(r => r.dataMovementType === 'W').length}\n- 输出(X): ${allTableData.filter(r => r.dataMovementType === 'X').length}\n\n点击"查看表格"或"导出Excel"查看完整结果。`
        }];
      });

      if (!reachedTarget) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ 未达到用户设定的最少功能过程数量（${minFunctionCount} 个）。建议：\n- 检查原始文档是否有更多可拆分的功能描述\n- 提高最大轮数或降低目标数量\n- 重新上传更详细的需求文档`
        }]);
      }

    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 分析失败: ${error.response?.data?.error || error.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 发送消息
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = { role: 'user', content: inputText };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    setStreamingContent('');

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentContent: documentContent,
          messages: [...messages.filter(m => m.role !== 'system'), userMessage]
        })
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
              if (parsed.content) {
                fullContent += parsed.content;
                setStreamingContent(fullContent);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: fullContent
      }]);
      setStreamingContent('');

      // 尝试解析表格数据
      parseTableFromMarkdown(fullContent);

    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 发送失败: ${error.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 从Markdown解析表格
  const parseTableFromMarkdown = async (markdown) => {
    try {
      const res = await axios.post('/api/parse-table', { markdown });
      if (res.data.success && res.data.tableData.length > 0) {
        setTableData(res.data.tableData);
      }
    } catch (error) {
      console.log('表格解析失败，可能没有有效表格');
    }
  };

  // 导出Excel
  const exportExcel = async () => {
    if (tableData.length === 0) {
      alert('没有可导出的数据，请先进行Cosmic拆分分析');
      return;
    }

    try {
      const response = await axios.post('/api/export-excel', {
        tableData,
        filename: documentName ? documentName.replace('.docx', '') + '_cosmic拆分结果' : 'cosmic拆分结果'
      }, {
        responseType: 'blob'
      });

      // 下载文件
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${documentName ? documentName.replace('.docx', '') + '_' : ''}cosmic拆分结果.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('导出失败: ' + error.message);
    }
  };

  // ==================== 需求规格书生成功能 ====================
  
  // 开始生成需求规格书（支持多轮完善）
  const startRequirementSpecGeneration = async (content, images = []) => {
    if (!apiStatus.hasApiKey) {
      setSpecMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ 请先配置API密钥才能使用AI分析功能。点击右上角的设置按钮进行配置。'
      }]);
      return;
    }

    setIsGeneratingSpec(true);
    setSpecStreamingContent('');
    setSpecContent('');
    setSpecAnalysisJson('');
    setSpecPhase('analysis');
    setEnhanceRound(0);

    const templateName = selectedTemplate === 1 ? '完整型需求规格说明书' : '江苏移动项目需求文档';
    const chapterCount = selectedTemplate === 1 ? 7 : 5;
    const rounds = selectedTemplate === 1 ? 14 : 10;

    try {
      // 模板2：直接进入章节生成流程，不需要先调用generate接口
      if (selectedTemplate === 2) {
        setSpecMessages(prev => [...prev, {
          role: 'system',
          content: `🔄 正在生成【${templateName}】...\n📝 共${chapterCount}个章节，每章节生成+完善，共${rounds}轮`
        }]);
        
        // 直接调用章节生成
        await enhanceSpecContent(content, '', images);
        return;
      }

      // 模板1：保持原有流程
      setSpecMessages(prev => [...prev, {
        role: 'system',
        content: '🔄 阶段1：正在进行结构化需求分析...'
      }]);

      const response = await fetch('/api/requirement-spec/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentContent: content,
          section: 'all',
          images: images
        })
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
              
              if (parsed.phase === 'analysis') {
                setSpecAnalysisJson(parsed.content);
                setSpecPhase('generation');
                setSpecMessages(prev => {
                  const filtered = prev.filter(m => !m.content.startsWith('🔄'));
                  return [...filtered, {
                    role: 'system',
                    content: '✅ 阶段1完成：结构化分析已完成\n🔄 阶段2：正在生成完整需求规格书...'
                  }];
                });
                continue;
              }
              
              if (parsed.content) {
                fullContent += parsed.content;
                setSpecStreamingContent(fullContent);
              }
              if (parsed.error) {
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

      setSpecContent(fullContent);
      setSpecStreamingContent('');
      setSpecPhase('done');
      
      if (!fullContent.includes('# 6.') && !fullContent.includes('## 6.')) {
        const extendedContent = await continueSpecGeneration(content, fullContent);
        fullContent = extendedContent || fullContent;
      }
      
      if (enableMultiRoundEnhance && fullContent.length > 0) {
        setSpecMessages(prev => {
          const filtered = prev.filter(m => !m.content.startsWith('🔄') && !m.content.startsWith('✅'));
          return [...filtered, {
            role: 'system',
            content: `✅ 基础需求规格书生成完成！\n🔄 开始按章节生成完整文档（共${chapterCount}章节，每章节生成+完善两轮，共${rounds}轮）...`
          }];
        });
        
        await enhanceSpecContent(content, fullContent, images);
      } else {
        setSpecMessages(prev => {
          const filtered = prev.filter(m => !m.content.startsWith('🔄'));
          return [...filtered, {
            role: 'system',
            content: '✅ 需求规格书生成完成！可点击"导出Word"下载文档。'
          }];
        });
      }

    } catch (error) {
      setSpecMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 生成失败: ${error.message}`
      }]);
    } finally {
      setIsGeneratingSpec(false);
    }
  };
  
  // 判断是否为完整的需求规格书文档（包含多个主要章节）
  const isFullDocumentContent = (text = '') => {
    const content = text.trim();
    // 检查是否包含多个主要章节标题（至少2个不同的一级或二级标题）
    const majorSections = [
      /^#\s*1[\.\s]/m,      // 1. 概述
      /^#\s*2[\.\s]/m,      // 2. 业务需求
      /^#\s*3[\.\s]/m,      // 3. 用户需求
      /^#\s*4[\.\s]/m,      // 4. 产品功能架构
      /^#\s*5[\.\s]/m,      // 5. 功能需求
      /^#\s*6[\.\s]/m,      // 6. 系统需求
      /^#\s*7[\.\s]/m,      // 7. 附录
      /^##?\s*概述/m,
      /^##?\s*业务需求/m,
      /^##?\s*用户需求/m,
      /^##?\s*功能需求/m,
      /^##?\s*系统需求/m,
    ];
    const matchCount = majorSections.filter(pattern => pattern.test(content)).length;
    // 只要包含至少2个主要章节就认为是完整文档
    return matchCount >= 2;
  };

  // 智能合并：【重要】现在每轮都输出完整文档，优先使用最新的完整版本
  const mergeEnhancementContent = (existing = '', addition = '', round = 1, roundTitle = '') => {
    const trimmedAddition = addition.trim();
    if (!trimmedAddition) return existing;

    // 【核心逻辑】现在每轮AI都会输出完整的需求规格说明书
    // 如果新内容包含章节结构（# 1. 或 # 2. 等），说明是完整文档，直接使用
    if (isFullDocumentContent(trimmedAddition)) {
      console.log(`第${round}轮：AI输出完整文档，直接使用最新版本（长度: ${trimmedAddition.length}）`);
      return trimmedAddition;
    }

    // 如果新内容长度超过现有内容的70%，也认为是完整版本
    if (trimmedAddition.length > existing.length * 0.7) {
      console.log(`第${round}轮：新内容较长(${trimmedAddition.length}>${existing.length * 0.7})，使用新版本`);
      return trimmedAddition;
    }

    // 检查新内容是否包含关键章节标记
    const hasKeyChapters = /^#\s*(1|2|3|4|5|6|7)[\.\s]/m.test(trimmedAddition);
    if (hasKeyChapters) {
      console.log(`第${round}轮：新内容包含章节标记，使用新版本`);
      return trimmedAddition;
    }

    // 只有在新内容明显是片段时才追加（这种情况现在应该很少发生）
    console.log(`第${round}轮：新内容为片段(${trimmedAddition.length}字符)，追加到现有文档`);
    return `${existing.trim()}\n\n${trimmedAddition}`.trim();
  };

  // 【重构】按章节单独生成需求规格书（优化：单次生成）
  // 模板1章节配置（完整型需求规格说明书）- 7次AI调用（优化后）
  // skipEnhance: true 表示该章节不需要完善阶段，一次生成即可
  const TEMPLATE1_CHAPTER_CONFIG = [
    { key: 'chapter1_overview', name: '第1章 概述', chapterNum: 1, skipEnhance: true },
    { key: 'chapter2_business', name: '第2章 业务需求', chapterNum: 2, skipEnhance: true },
    { key: 'chapter3_user', name: '第3章 用户需求', chapterNum: 3, skipEnhance: true },
    { key: 'chapter4_architecture', name: '第4章 产品功能架构', chapterNum: 4, skipEnhance: true },
    { key: 'chapter5_functions', name: '第5章 功能需求', chapterNum: 5, skipEnhance: true },
    { key: 'chapter6_system', name: '第6章 系统需求', chapterNum: 6, skipEnhance: true },
    { key: 'chapter7_appendix', name: '第7章 附录', chapterNum: 7, skipEnhance: true }
  ];

  // 模板2章节配置（江苏移动项目需求文档格式）- 5次AI调用（优化后）
  // skipEnhance: true 表示该章节不需要完善阶段
  const TEMPLATE2_CHAPTER_CONFIG = [
    { key: 't2_chapter1_overview', name: '1 系统概述', chapterNum: 1, skipEnhance: true },
    { key: 't2_chapter2_analysis', name: '2 需求分析', chapterNum: 2, skipEnhance: true },
    { key: 't2_chapter3_functions', name: '3 功能说明', chapterNum: 3, skipEnhance: true },
    { key: 't2_chapter4_deploy', name: '4 部署说明', chapterNum: 4, skipEnhance: true },
    { key: 't2_chapter5_supplement', name: '5 其他补充说明', chapterNum: 5, skipEnhance: true }
  ];

  // 根据选择的模板获取章节配置
  const CHAPTER_CONFIG = selectedTemplate === 1 ? TEMPLATE1_CHAPTER_CONFIG : TEMPLATE2_CHAPTER_CONFIG;

  // 整合所有章节内容为完整文档
  const integrateChapters = (chapters) => {
    // 按章节号排序
    const sortedChapters = Object.entries(chapters)
      .sort(([a], [b]) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.match(/\d+/)?.[0] || 0);
        return numA - numB;
      })
      .map(([, content]) => content.trim())
      .filter(content => content.length > 0);
    
    return sortedChapters.join('\n\n');
  };

  const enhanceSpecContent = async (docContent, baseContent, images = []) => {
    setIsEnhancing(true);
    
    // 保存各章节内容
    const chapterContents = {};
    let analyzedImagesRef = images; // 保存分析后的图片信息
    
    // 根据模板选择API端点和总轮次
    const apiEndpoint = selectedTemplate === 1 
      ? '/api/requirement-spec/enhance' 
      : '/api/requirement-spec/template2/enhance';
    
    // 计算总轮次：根据skipEnhance字段计算（优化后都是单次生成）
    const calculateTotalRounds = () => {
      const config = selectedTemplate === 1 ? TEMPLATE1_CHAPTER_CONFIG : TEMPLATE2_CHAPTER_CONFIG;
      return config.reduce((sum, ch) => sum + (ch.skipEnhance ? 1 : 2), 0);
    };
    const currentTotalRounds = calculateTotalRounds(); // 模板1: 7轮, 模板2: 5轮
    const templateName = selectedTemplate === 1 ? '完整型需求规格说明书' : '简洁型功能需求文档';
    
    // 根据轮次计算当前章节和阶段（支持skipEnhance）
    const getChapterAndPhase = (round) => {
      const config = selectedTemplate === 1 ? TEMPLATE1_CHAPTER_CONFIG : TEMPLATE2_CHAPTER_CONFIG;
      let currentRound = 0;
      for (let i = 0; i < config.length; i++) {
        const chapter = config[i];
        const roundsForChapter = chapter.skipEnhance ? 1 : 2;
        if (currentRound + roundsForChapter >= round) {
          const isEnhancePhase = !chapter.skipEnhance && (round - currentRound === 2);
          return { chapterIndex: i, isEnhancePhase, chapterInfo: chapter };
        }
        currentRound += roundsForChapter;
      }
      return { chapterIndex: 0, isEnhancePhase: false, chapterInfo: config[0] };
    };
    
    try {
      for (let round = 1; round <= currentTotalRounds; round++) {
        setEnhanceRound(round);
        
        // 计算当前章节索引和阶段
        const { chapterIndex, isEnhancePhase, chapterInfo } = getChapterAndPhase(round);
        const phaseLabel = isEnhancePhase ? '完善' : '生成';
        
        setSpecMessages(prev => {
          const filtered = prev.filter(m => !m.content.includes('正在') && !m.content.includes('轮完善'));
          return [...filtered, {
            role: 'system',
            content: `📝 [${templateName}] 正在${phaseLabel} ${chapterInfo.name}... (${round}/${currentTotalRounds})`
          }];
        });
        
        // 构建previousContent
        // - 生成阶段：传递已生成的所有章节内容
        // - 完善阶段：传递当前章节的初稿内容
        let previousContent;
        if (isEnhancePhase) {
          // 完善阶段：传递当前章节的初稿
          previousContent = chapterContents[chapterInfo.key] || '';
        } else {
          // 生成阶段：传递已完成的章节内容
          previousContent = integrateChapters(chapterContents) || baseContent;
        }
        
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentContent: docContent,
            previousContent: previousContent,
            images: analyzedImagesRef,
            round: round,
            totalRounds: currentTotalRounds
          })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let chapterContent = '';

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
                
                // 处理深度思考阶段的消息
                if (parsed.phase === 'thinking' || parsed.phase === 'thinking_complete') {
                  setSpecMessages(prev => {
                    const filtered = prev.filter(m => !m.content.includes('深度思考') && !m.content.includes('图片分析'));
                    return [...filtered, {
                      role: 'system',
                      content: parsed.message
                    }];
                  });
                  if (parsed.analyzedImages) {
                    analyzedImagesRef = parsed.analyzedImages;
                  }
                  continue;
                }
                
                // 处理章节生成/完善阶段的消息
                if (parsed.phase === 'generating_chapter' || parsed.phase === 'enhancing_chapter') {
                  const label = parsed.isEnhancePhase ? '🔧 完善' : '📝 生成';
                  setSpecMessages(prev => {
                    const filtered = prev.filter(m => !m.content.includes('正在'));
                    return [...filtered, {
                      role: 'system',
                      content: `${label} ${parsed.chapterName}... (${parsed.round}/${parsed.totalRounds})`
                    }];
                  });
                  continue;
                }
                
                if (parsed.content) {
                  chapterContent += parsed.content;
                  // 实时预览
                  const previewContent = integrateChapters({
                    ...chapterContents,
                    [chapterInfo.key]: chapterContent
                  });
                  setSpecStreamingContent(previewContent);
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }

        // 保存本轮内容
        if (chapterContent.length > 0) {
          chapterContents[chapterInfo.key] = chapterContent;
          const actionLabel = isEnhancePhase ? '完善' : '生成';
          console.log(`✅ ${chapterInfo.name} ${actionLabel}完成，长度: ${chapterContent.length}`);
          
          // 整合所有已生成的章节
          const integratedContent = integrateChapters(chapterContents);
          setSpecContent(integratedContent);
          setSpecStreamingContent('');
        }
        
        // 轮次间延迟
        if (round < currentTotalRounds) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // 最终整合所有章节
      const finalContent = integrateChapters(chapterContents);
      setSpecContent(finalContent);
      
      setSpecMessages(prev => {
        const filtered = prev.filter(m => !m.content.includes('正在') && !m.content.includes('轮完善'));
        return [...filtered, {
          role: 'system',
          content: `✅ ${templateName}生成完成！\n📚 共生成 ${Object.keys(chapterContents).length} 个章节（每章节经过生成+完善两轮优化）\n📄 文档总长度: ${finalContent.length} 字符\n💾 可点击"导出Word"下载完整文档。`
        }];
      });
      
    } catch (error) {
      console.error('章节生成失败:', error);
      const partialContent = integrateChapters(chapterContents);
      if (partialContent.length > 0) {
        setSpecContent(partialContent);
      }
      setSpecMessages(prev => [...prev, {
        role: 'system',
        content: `⚠️ 生成过程中出错: ${error.message}\n已保留已生成的 ${Object.keys(chapterContents).length} 个章节内容。`
      }]);
    } finally {
      setIsEnhancing(false);
      setEnhanceRound(0);
    }
  };

  // 继续生成需求规格书
  const continueSpecGeneration = async (docContent, previousContent) => {
    try {
      setSpecMessages(prev => [...prev, {
        role: 'system',
        content: '🔄 阶段2：继续扩展剩余章节...'
      }]);

      const response = await fetch('/api/requirement-spec/continue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentContent: docContent,
          previousContent: previousContent,
          targetSection: '系统需求'
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let additionalContent = '';

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
              if (parsed.content) {
                additionalContent += parsed.content;
                setSpecStreamingContent(previousContent + '\n\n' + additionalContent);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      const finalContent = previousContent + '\n\n' + additionalContent;
      setSpecContent(finalContent);
      setSpecStreamingContent('');
      setSpecMessages(prev => {
        const filtered = prev.filter(m => !m.content.startsWith('🔄'));
        // 更新最后一条assistant消息
        const lastAssistantIdx = filtered.findLastIndex(m => m.role === 'assistant');
        if (lastAssistantIdx >= 0) {
          filtered[lastAssistantIdx].content = finalContent;
        }
        return filtered;
      });

    } catch (error) {
      console.error('继续生成失败:', error);
    }
  };

  // 导出Word文档（包含图片）
  const exportWord = async () => {
    if (!specContent) {
      alert('没有可导出的内容，请先生成需求规格书');
      return;
    }

    try {
      const response = await axios.post('/api/export-word', {
        content: specContent,
        filename: documentName ? documentName.replace('.docx', '') + '_需求规格说明书' : '需求规格说明书',
        images: extractedImages // 传递提取的图片
      }, {
        responseType: 'blob'
      });

      // 下载文件
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${documentName ? documentName.replace('.docx', '') + '_' : ''}需求规格说明书.doc`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('导出失败: ' + error.message);
    }
  };

  // 处理需求规格书模块的文件上传
  const processFileForSpec = async (file) => {
    setErrorMessage('');
    setExtractedImages([]); // 清空之前的图片

    const allowedExtensions = ['.docx', '.txt', '.md'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      setErrorMessage(`不支持的文件格式: ${ext}。请上传 .docx, .txt 或 .md 文件`);
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage('文件大小超过限制（最大50MB）');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsLoading(true);
      setUploadProgress(0);

      const res = await axios.post('/api/parse-word', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      if (res.data.success) {
        setDocumentContent(res.data.text);
        setDocumentName(res.data.filename);
        setUploadProgress(100);
        
        // 保存提取的图片
        if (res.data.images && res.data.images.length > 0) {
          setExtractedImages(res.data.images);
          console.log(`提取了 ${res.data.images.length} 张图片`);
        }

        const wordCount = res.data.wordCount || res.data.text.length;
        const imageInfo = res.data.imageCount > 0 
          ? `\n🖼️ 提取图片: ${res.data.imageCount} 张（点击"查看图片"预览）` 
          : '';
        
        setSpecMessages(prev => [...prev, {
          role: 'system',
          content: `📄 已成功导入文档: ${res.data.filename}\n📊 文档大小: ${(res.data.fileSize / 1024).toFixed(2)} KB | 字符数: ${wordCount}${imageInfo}\n\n文档内容预览:\n${res.data.text.substring(0, 500)}${res.data.text.length > 500 ? '\n\n... (点击"预览文档"查看完整内容)' : ''}`
        }]);

        // 自动开始生成需求规格书
        const statusRes = await axios.get('/api/health');
        if (statusRes.data.hasApiKey) {
          setApiStatus(statusRes.data);
          await startRequirementSpecGeneration(res.data.text, res.data.images || []);
        } else {
          setSpecMessages(prev => [...prev, {
            role: 'assistant',
            content: '⚠️ 请先配置API密钥才能使用AI分析功能。点击右上角的设置按钮进行配置。'
          }]);
        }
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      setErrorMessage(`文档解析失败: ${errorMsg}`);
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  // 复制内容
  const copyContent = (content) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 将中文转换为拼音首字母（简化版，用于erDiagram实体名）
  const chineseToPinyin = (str) => {
    // 简单的中文到英文映射，用于常见的数据库实体名
    const commonMappings = {
      '用户': 'User', '用户信息': 'UserInfo', '用户表': 'UserTable',
      '设备': 'Device', '设备信息': 'DeviceInfo', '设备表': 'DeviceTable',
      '孪生': 'Twin', '数字孪生': 'DigitalTwin', '孪生体': 'TwinEntity',
      '模型': 'Model', '模型信息': 'ModelInfo', '模型数据': 'ModelData',
      '告警': 'Alarm', '告警信息': 'AlarmInfo', '告警记录': 'AlarmRecord',
      '日志': 'Log', '操作日志': 'OperationLog', '系统日志': 'SystemLog',
      '权限': 'Permission', '角色': 'Role', '菜单': 'Menu',
      '订单': 'Order', '订单信息': 'OrderInfo', '订单详情': 'OrderDetail',
      '产品': 'Product', '商品': 'Goods', '分类': 'Category',
      '文件': 'File', '附件': 'Attachment', '图片': 'Image',
      '配置': 'Config', '参数': 'Parameter', '设置': 'Setting',
      '任务': 'Task', '作业': 'Job', '调度': 'Schedule',
      '消息': 'Message', '通知': 'Notification', '公告': 'Notice',
      '评论': 'Comment', '反馈': 'Feedback', '评价': 'Review',
      '地址': 'Address', '区域': 'Region', '位置': 'Location',
      '存储设备模型数据': 'DeviceModelData', '存储设备': 'StorageDevice',
    };
    
    // 先检查完整匹配
    if (commonMappings[str]) return commonMappings[str];
    
    // 检查部分匹配
    for (const [cn, en] of Object.entries(commonMappings)) {
      if (str.includes(cn)) {
        return en + str.replace(cn, '').replace(/[\u4e00-\u9fa5]/g, '');
      }
    }
    
    // 如果没有匹配，生成一个基于哈希的英文名
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return 'Entity' + Math.abs(hash % 10000);
  };

  // 清洗Mermaid代码，修复常见语法问题
  const cleanMermaidCode = (code) => {
    let cleaned = code.trim();
    
    // 移除可能的markdown标记残留
    cleaned = cleaned.replace(/^```mermaid\s*/i, '').replace(/```\s*$/, '');
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/```\s*$/, '');
    
    // 移除开头的空行
    cleaned = cleaned.replace(/^\s*\n+/, '');
    
    // 检测是否有有效的图表类型声明
    const validDiagramTypes = [
      'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 
      'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie',
      'gitGraph', 'mindmap', 'timeline', 'quadrantChart', 'sankey',
      'xychart', 'block', 'packet', 'architecture'
    ];
    
    const firstLine = cleaned.split('\n')[0].trim().toLowerCase();
    const hasValidType = validDiagramTypes.some(type => 
      firstLine.startsWith(type.toLowerCase()) || 
      firstLine.startsWith(type.toLowerCase() + '-')
    );
    
    // 如果没有有效的图表类型，尝试推断或添加默认类型
    if (!hasValidType) {
      // 检查是否像是流程图（有箭头）
      if (cleaned.includes('-->') || cleaned.includes('==>') || cleaned.includes('->')) {
        cleaned = 'flowchart TD\n' + cleaned;
      }
      // 检查是否像是ER图（有关系符号）
      else if (cleaned.includes('||--') || cleaned.includes('}o--') || cleaned.includes('|o--')) {
        cleaned = 'erDiagram\n' + cleaned;
      }
      // 检查是否像是序列图
      else if (cleaned.includes('->>') || cleaned.includes('-->>')) {
        cleaned = 'sequenceDiagram\n' + cleaned;
      }
      // 默认使用flowchart
      else if (cleaned.length > 0) {
        cleaned = 'flowchart TD\n' + cleaned;
      }
    }
    
    // 修复常见的中文标点问题
    cleaned = cleaned.replace(/：/g, ':').replace(/；/g, ';').replace(/，/g, ',');
    
    // 修复节点ID中的特殊字符（Mermaid不支持某些字符）
    // 将中文括号替换为英文括号
    cleaned = cleaned.replace(/（/g, '(').replace(/）/g, ')');
    cleaned = cleaned.replace(/【/g, '[').replace(/】/g, ']');
    
    // 检测是否是flowchart/graph类型
    const isFlowchart = /^(flowchart|graph)\s/im.test(cleaned);
    
    if (isFlowchart) {
      // 为flowchart中的中文节点ID生成英文别名
      const lines = cleaned.split('\n');
      const nodeMap = new Map();
      let nodeCounter = 0;
      
      // 第一遍：收集所有中文节点ID
      for (const line of lines) {
        // 匹配节点定义: 中文ID[文本] 或 中文ID(文本) 或 中文ID{文本}
        const nodeDefPattern = /([\u4e00-\u9fa5]+)\s*[\[\(\{]/g;
        let match;
        while ((match = nodeDefPattern.exec(line)) !== null) {
          const chineseId = match[1];
          if (!nodeMap.has(chineseId)) {
            nodeMap.set(chineseId, `N${nodeCounter++}`);
          }
        }
        
        // 匹配箭头两侧的中文节点
        const arrowPattern = /([\u4e00-\u9fa5]+)\s*(?:-->|==>|->|--)/g;
        while ((match = arrowPattern.exec(line)) !== null) {
          const chineseId = match[1];
          if (!nodeMap.has(chineseId)) {
            nodeMap.set(chineseId, `N${nodeCounter++}`);
          }
        }
        
        // 匹配箭头右侧的中文节点
        const rightArrowPattern = /(?:-->|==>|->|--)\s*([\u4e00-\u9fa5]+)/g;
        while ((match = rightArrowPattern.exec(line)) !== null) {
          const chineseId = match[1];
          if (!nodeMap.has(chineseId)) {
            nodeMap.set(chineseId, `N${nodeCounter++}`);
          }
        }
      }
      
      // 第二遍：替换中文节点ID为英文，但保留中文作为显示文本
      if (nodeMap.size > 0) {
        for (const [cn, en] of nodeMap) {
          // 替换节点定义: 中文ID[文本] -> 英文ID[文本]
          cleaned = cleaned.replace(
            new RegExp(`(^|\\s|;)(${cn})\\s*\\[`, 'gm'),
            `$1${en}[`
          );
          cleaned = cleaned.replace(
            new RegExp(`(^|\\s|;)(${cn})\\s*\\(`, 'gm'),
            `$1${en}(`
          );
          cleaned = cleaned.replace(
            new RegExp(`(^|\\s|;)(${cn})\\s*\\{`, 'gm'),
            `$1${en}{`
          );
          
          // 替换箭头连接中的纯中文节点（没有括号的）
          // 左侧: 中文 --> 变成 英文["中文"] -->
          cleaned = cleaned.replace(
            new RegExp(`(^|\\s|;)(${cn})\\s*(-->|==>|->|--)`, 'gm'),
            `$1${en}["${cn}"] $3`
          );
          
          // 右侧: --> 中文 变成 --> 英文["中文"]
          cleaned = cleaned.replace(
            new RegExp(`(-->|==>|->|--)\\s*(${cn})(\\s|$|;)`, 'gm'),
            `$1 ${en}["${cn}"]$3`
          );
        }
      }
      
      // 修复箭头格式
      cleaned = cleaned.replace(/\s*-+>\s*/g, ' --> ');
      cleaned = cleaned.replace(/\s*=+>\s*/g, ' ==> ');
      
      // 修复subgraph语法问题
      cleaned = cleaned.replace(/subgraph\s+([^\n\[\"]+)\s*\n/g, (match, name) => {
        const cleanName = name.trim();
        // 如果名称包含中文或特殊字符，用引号包裹
        if (/[\u4e00-\u9fa5]/.test(cleanName) || cleanName.includes(' ') || /[^\w]/.test(cleanName)) {
          return `subgraph "${cleanName}"\n`;
        }
        return match;
      });
    }
    
    // 修复节点定义中的问题
    // 处理节点文本中的特殊字符
    cleaned = cleaned.replace(/\[([^\]]+)\]/g, (match, text) => {
      // 转义可能导致问题的字符
      const escaped = text.replace(/"/g, "'").replace(/\|/g, '/');
      return `[${escaped}]`;
    });
    
    // 修复erDiagram中的中文实体名问题（关键修复！）
    if (cleaned.includes('erDiagram')) {
      // 确保关系符号格式正确
      cleaned = cleaned.replace(/\s*\|\|--o\{\s*/g, ' ||--o{ ');
      cleaned = cleaned.replace(/\s*\}o--\|\|\s*/g, ' }o--|| ');
      cleaned = cleaned.replace(/\s*\|\|--\|\|\s*/g, ' ||--|| ');
      cleaned = cleaned.replace(/\s*\|o--o\|\s*/g, ' |o--o| ');
      cleaned = cleaned.replace(/\s*\}o--o\{\s*/g, ' }o--o{ ');
      cleaned = cleaned.replace(/\s*\|o--\|\|\s*/g, ' |o--|| ');
      cleaned = cleaned.replace(/\s*\|\|--o\|\s*/g, ' ||--o| ');
      
      // 收集所有中文实体名并创建映射
      const chineseEntityPattern = /([\u4e00-\u9fa5]+)\s*(\|\|--o\{|\}o--\|\||\|\|--\|\||\|o--o\||\}o--o\{|\|o--\|\||\|\|--o\||:)/g;
      const entityMap = new Map();
      let match;
      while ((match = chineseEntityPattern.exec(cleaned)) !== null) {
        const chineseName = match[1];
        if (!entityMap.has(chineseName)) {
          entityMap.set(chineseName, chineseToPinyin(chineseName));
        }
      }
      
      // 也检查关系右侧的实体名
      const rightEntityPattern = /(\|\|--o\{|\}o--\|\||\|\|--\|\||\|o--o\||\}o--o\{|\|o--\|\||\|\|--o\|)\s*([\u4e00-\u9fa5]+)/g;
      while ((match = rightEntityPattern.exec(cleaned)) !== null) {
        const chineseName = match[2];
        if (!entityMap.has(chineseName)) {
          entityMap.set(chineseName, chineseToPinyin(chineseName));
        }
      }
      
      // 替换所有中文实体名为英文
      for (const [cn, en] of entityMap) {
        // 使用正则确保只替换实体名位置的中文
        const regex = new RegExp(`(^|\\s|\\{|\\|)(${cn})(\\s|\\||:)`, 'gm');
        cleaned = cleaned.replace(regex, `$1${en}$3`);
      }
      
      // 添加注释说明原始中文名
      if (entityMap.size > 0) {
        const legend = Array.from(entityMap).map(([cn, en]) => `%% ${en} = ${cn}`).join('\n');
        cleaned = cleaned.replace('erDiagram', `erDiagram\n${legend}`);
      }
    }
    
    // 移除空行过多的情况
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // 最终验证：确保第一行是有效的图表类型
    const finalFirstLine = cleaned.split('\n')[0].trim().toLowerCase();
    const finalHasValidType = validDiagramTypes.some(type => 
      finalFirstLine.startsWith(type.toLowerCase())
    );
    
    if (!finalHasValidType && cleaned.length > 0) {
      // 如果还是没有有效类型，强制添加flowchart
      cleaned = 'flowchart TD\n' + cleaned;
    }
    
    return cleaned;
  };

  // Mermaid图表渲染组件 - 增强版
  const MermaidChart = ({ code }) => {
    const containerRef = useRef(null);
    const [svg, setSvg] = useState('');
    const [error, setError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      const renderChart = async () => {
        if (!code || !containerRef.current) return;
        
        // 清洗代码
        let cleanedCode = cleanMermaidCode(code);
        
        console.log('清洗后的Mermaid代码:', cleanedCode);
        
        // 多次尝试渲染，每次简化代码
        const maxRetries = 4;
        let lastError = null;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
            const { svg: renderedSvg } = await mermaid.render(id, cleanedCode);
            setSvg(renderedSvg);
            setError(null);
            return; // 成功渲染，退出
          } catch (err) {
            lastError = err;
            console.warn(`Mermaid渲染尝试 ${attempt + 1}/${maxRetries + 1} 失败:`, err.message);
            
            // 尝试进一步简化代码
            if (attempt < maxRetries) {
              if (attempt === 0) {
                // 第一次重试：移除样式定义
                cleanedCode = cleanedCode.replace(/style\s+\w+\s+[^\n]+/g, '');
                cleanedCode = cleanedCode.replace(/classDef\s+[^\n]+/g, '');
                cleanedCode = cleanedCode.replace(/class\s+\w+\s+\w+/g, '');
              } else if (attempt === 1) {
                // 第二次重试：简化长文本
                cleanedCode = cleanedCode.replace(/\[([^\]]{30,})\]/g, (m, text) => `[${text.slice(0, 25)}...]`);
                cleanedCode = cleanedCode.replace(/\(([^\)]{30,})\)/g, (m, text) => `(${text.slice(0, 25)}...)`);
              } else if (attempt === 2) {
                // 第三次重试：移除所有中文，只保留基本结构
                const lines = cleanedCode.split('\n');
                const firstLine = lines[0];
                // 保留图表类型声明
                if (/^(flowchart|graph|erDiagram|sequenceDiagram)/i.test(firstLine)) {
                  // 尝试创建一个简化版本
                  cleanedCode = firstLine + '\n  A[图表加载中] --> B[请查看源代码]';
                }
              } else if (attempt === 3) {
                // 第四次重试：使用最简单的占位图
                cleanedCode = 'flowchart TD\n  A[图表预览不可用] --> B[请导出Word查看]';
              }
            }
          }
        }
        
        // 所有尝试都失败了
        console.error('Mermaid渲染最终失败:', lastError);
        setError(lastError?.message || '图表语法错误');
        setRetryCount(maxRetries + 1);
      };
      
      renderChart();
    }, [code]);

    if (error) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-4">
          <div className="flex items-start gap-3">
            <div className="text-amber-500 text-xl">⚠️</div>
            <div className="flex-1">
              <p className="text-amber-700 text-sm font-medium mb-2">图表预览暂不可用</p>
              <p className="text-xs text-gray-500 mb-2">原因: {error}</p>
              <details className="text-xs">
                <summary className="cursor-pointer text-blue-600 hover:text-blue-800">查看图表代码</summary>
                <pre className="mt-2 text-gray-600 bg-gray-100 p-2 rounded overflow-x-auto whitespace-pre-wrap">{code}</pre>
              </details>
              <p className="text-xs text-gray-400 mt-2">提示: 导出Word后图表将正常显示</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div 
        ref={containerRef}
        className="my-4 p-4 bg-white border border-gray-200 rounded-lg overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  };

  // 自定义Markdown渲染器，支持Mermaid
  const MarkdownWithMermaid = ({ content }) => {
    // 提取mermaid代码块并替换为占位符
    const parts = useMemo(() => {
      const mermaidBlocks = [];
      let index = 0;
      const processedContent = content.replace(/```mermaid\n([\s\S]*?)```/g, (match, code) => {
        mermaidBlocks.push(code);
        return `%%MERMAID_PLACEHOLDER_${index++}%%`;
      });
      return { processedContent, mermaidBlocks };
    }, [content]);

    // 渲染Markdown，遇到占位符时渲染Mermaid
    const renderContent = () => {
      const segments = parts.processedContent.split(/(%%MERMAID_PLACEHOLDER_\d+%%)/);
      return segments.map((segment, idx) => {
        const match = segment.match(/%%MERMAID_PLACEHOLDER_(\d+)%%/);
        if (match) {
          const blockIndex = parseInt(match[1]);
          return <MermaidChart key={idx} code={parts.mermaidBlocks[blockIndex]} />;
        }
        return (
          <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]}>
            {segment}
          </ReactMarkdown>
        );
      });
    };

    return <div className="markdown-content">{renderContent()}</div>;
  };

  // 清空对话
  const clearChat = () => {
    setMessages([]);
    setDocumentContent('');
    setDocumentName('');
    setTableData([]);
    setStreamingContent('');
  };

  // 处理键盘事件
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* 顶部导航 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                {activeModule === 'cosmic' ? 'Cosmic拆分智能体' : 
                 activeModule === 'requirement' ? '需求规格书生成' : '架构图生成'}
              </h1>
              <p className="text-xs text-gray-500">
                {activeModule === 'cosmic' ? '基于AI的软件功能规模度量工具' : 
                 activeModule === 'requirement' ? '基于AI的需求文档智能分析工具' :
                 '基于AI的系统架构图生成工具'}
              </p>
            </div>
          </div>

          {/* 功能模块切换器 */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setActiveModule('cosmic')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeModule === 'cosmic'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              Cosmic拆分
            </button>
            <button
              onClick={() => setActiveModule('requirement')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeModule === 'requirement'
                  ? 'bg-white text-purple-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              需求规格书
            </button>
            <button
              onClick={() => setActiveModule('diagram')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeModule === 'diagram'
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              架构图
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* API状态指示 */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${apiStatus.hasApiKey
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
              }`}>
              {apiStatus.hasApiKey ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>API已连接</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>未配置API</span>
                </>
              )}
            </div>

            {/* Cosmic模块的按钮 */}
            {activeModule === 'cosmic' && (
              <>
                <button
                  onClick={() => setShowTableView(true)}
                  disabled={tableData.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Table className="w-4 h-4" />
                  <span>查看表格</span>
                </button>
                <button
                  onClick={exportExcel}
                  disabled={tableData.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>导出Excel</span>
                </button>
              </>
            )}

            {/* 需求规格书模块的按钮 */}
            {activeModule === 'requirement' && (
              <button
                onClick={exportWord}
                disabled={!specContent}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FileOutput className="w-4 h-4" />
                <span>导出Word</span>
              </button>
            )}

            {/* 清空按钮 */}
            <button
              onClick={() => {
                if (activeModule === 'cosmic') {
                  clearChat();
                } else {
                  setSpecMessages([]);
                  setSpecContent('');
                  setSpecStreamingContent('');
                  setDocumentContent('');
                  setDocumentName('');
                }
              }}
              className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="清空对话"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            {/* 设置按钮 */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
              title="API设置"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Cosmic拆分模块 */}
        {activeModule === 'cosmic' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：文件上传和文档预览 */}
          <div className="lg:col-span-1 space-y-4">
            {/* 文件上传区 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-500" />
                导入Word文档
              </h2>

              <div
                ref={dropZoneRef}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragging
                    ? 'border-blue-500 bg-blue-50 scale-105'
                    : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'
                  }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.txt,.md"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {isDragging ? (
                  <>
                    <Upload className="w-12 h-12 text-blue-500 mx-auto mb-3 animate-bounce" />
                    <p className="text-blue-600 font-medium">松开鼠标上传文件</p>
                  </>
                ) : (
                  <>
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">点击或拖拽上传</p>
                    <p className="text-sm text-gray-400 mt-1">支持 .docx, .txt, .md 格式</p>
                  </>
                )}
              </div>

              {/* 上传进度 */}
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>上传中...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 错误提示 */}
              {errorMessage && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-700">{errorMessage}</p>
                    <button
                      onClick={() => setErrorMessage('')}
                      className="text-xs text-red-500 hover:text-red-700 mt-1"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              )}

              {/* 最少功能过程设置 */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700">最少功能过程数量</p>
                    <p className="text-xs text-gray-500">达到该数量后才停止分析（默认30，推荐30-120）</p>
                  </div>
                  <span className="text-lg font-semibold text-blue-600">{minFunctionCount}</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="150"
                  step="5"
                  value={minFunctionCount}
                  onChange={(e) => setMinFunctionCount(Number(e.target.value))}
                  className="w-full"
                />
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={minFunctionCount}
                  onChange={(e) => setMinFunctionCount(Math.min(200, Math.max(5, Number(e.target.value) || 5)))}
                  className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* 已上传文件 */}
              {documentName && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <span className="text-sm text-blue-700 truncate flex-1">{documentName}</span>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setShowPreview(true)}
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      预览文档
                    </button>
                    <button
                      onClick={() => {
                        if (apiStatus.hasApiKey) {
                          startAnalysis(documentContent);
                        } else {
                          setShowSettings(true);
                        }
                      }}
                      className="text-xs px-2 py-1 bg-green-100 text-green-600 rounded hover:bg-green-200 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      重新分析
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 使用说明 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">使用说明</h2>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  <p>上传包含功能过程描述的Word文档</p>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  <p>AI自动分析并生成Cosmic拆分表格</p>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  <p>通过对话优化拆分结果</p>
                </div>
                <div className="flex gap-3">
                  <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">4</span>
                  <p>导出Excel格式的拆分结果</p>
                </div>
              </div>
            </div>

            {/* 数据统计 */}
            {tableData.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">拆分统计</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">{tableData.length}</p>
                    <p className="text-sm text-gray-600">子过程数</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{tableData.length}</p>
                    <p className="text-sm text-gray-600">CFP点数</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-purple-600">
                      {tableData.filter(r => r.dataMovementType === 'E').length}
                    </p>
                    <p className="text-sm text-gray-600">输入(E)</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-orange-600">
                      {tableData.filter(r => r.dataMovementType === 'X').length}
                    </p>
                    <p className="text-sm text-gray-600">输出(X)</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 右侧：对话区域 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 h-[calc(100vh-180px)] flex flex-col">
              {/* 对话消息区 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && !streamingContent && (
                  <div className="text-center py-12">
                    <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-600 mb-2">欢迎使用Cosmic拆分智能体</h3>
                    <p className="text-gray-400">上传Word文档开始分析，或直接输入功能过程描述</p>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user'
                        ? 'bg-blue-500'
                        : msg.role === 'system'
                          ? 'bg-gray-500'
                          : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                      }`}>
                      {msg.role === 'user' ? (
                        <User className="w-4 h-4 text-white" />
                      ) : (
                        <Bot className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                      <div className={`inline-block p-4 rounded-2xl ${msg.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : msg.role === 'system'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-gray-50 text-gray-800'
                        }`}>
                        {msg.role === 'assistant' ? (
                          <div className="markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                      {msg.role === 'assistant' && (
                        <button
                          onClick={() => copyContent(msg.content)}
                          className="mt-2 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied ? '已复制' : '复制'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* 流式输出 */}
                {streamingContent && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="max-w-[80%]">
                      <div className="inline-block p-4 rounded-2xl bg-gray-50 text-gray-800">
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {streamingContent}
                          </ReactMarkdown>
                        </div>
                        <span className="typing-cursor"></span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 加载状态 */}
                {isLoading && !streamingContent && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-2">
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                      <span className="text-gray-600">AI正在分析中...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* 输入区 */}
              <div className="border-t border-gray-200 p-4">
                <div className="flex gap-3">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入功能过程描述或与AI对话..."
                    className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={2}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!inputText.trim() || isLoading}
                    className="px-6 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">按 Enter 发送，Shift + Enter 换行</p>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* 需求规格书生成模块 */}
        {activeModule === 'requirement' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：文件上传 */}
          <div className="lg:col-span-1 space-y-4">
            {/* 文件上传区 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-500" />
                导入需求文档
              </h2>

              <div
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.docx,.txt,.md';
                  input.onchange = (e) => {
                    const file = e.target.files?.[0];
                    if (file) processFileForSpec(file);
                  };
                  input.click();
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer?.files?.[0];
                  if (file) processFileForSpec(file);
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50/50'
                }`}
              >
                {isDragging ? (
                  <>
                    <Upload className="w-12 h-12 text-purple-500 mx-auto mb-3 animate-bounce" />
                    <p className="text-purple-600 font-medium">松开鼠标上传文件</p>
                  </>
                ) : (
                  <>
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">点击或拖拽上传</p>
                    <p className="text-sm text-gray-400 mt-1">支持 .docx, .txt, .md 格式</p>
                  </>
                )}
              </div>

              {/* 上传进度 */}
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>上传中...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 错误提示 */}
              {errorMessage && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-700">{errorMessage}</p>
                    <button
                      onClick={() => setErrorMessage('')}
                      className="text-xs text-red-500 hover:text-red-700 mt-1"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              )}

              {/* 已上传文件 */}
              {documentName && activeModule === 'requirement' && (
                <div className="mt-4 p-3 bg-purple-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-purple-500" />
                    <span className="text-sm text-purple-700 truncate flex-1">{documentName}</span>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={() => setShowPreview(true)}
                      className="text-xs px-2 py-1 bg-purple-100 text-purple-600 rounded hover:bg-purple-200 flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      预览文档
                    </button>
                    {extractedImages.length > 0 && (
                      <button
                        onClick={() => setShowImagePreview(true)}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 flex items-center gap-1"
                      >
                        🖼️ 查看图片({extractedImages.length})
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (apiStatus.hasApiKey && documentContent) {
                          startRequirementSpecGeneration(documentContent, extractedImages);
                        } else if (!apiStatus.hasApiKey) {
                          setShowSettings(true);
                        }
                      }}
                      disabled={isGeneratingSpec || isEnhancing}
                      className="text-xs px-2 py-1 bg-green-100 text-green-600 rounded hover:bg-green-200 flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isGeneratingSpec || isEnhancing ? 'animate-spin' : ''}`} />
                      重新生成
                    </button>
                  </div>
                </div>
              )}
              
              {/* 模板选择 */}
              <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-500" />
                  选择文档模板
                </h3>
                <div className="space-y-2">
                  {/* 模板1 */}
                  <label 
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                      selectedTemplate === 1 
                        ? 'bg-white border-2 border-purple-500 shadow-sm' 
                        : 'bg-white/50 border border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={1}
                      checked={selectedTemplate === 1}
                      onChange={() => setSelectedTemplate(1)}
                      className="mt-1 w-4 h-4 text-purple-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800">完整型需求规格说明书</span>
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded">7章节</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">适用于正式项目立项、招投标，含用例图、接口设计、验收标准</p>
                    </div>
                  </label>
                  
                  {/* 模板2 */}
                  <label 
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                      selectedTemplate === 2 
                        ? 'bg-white border-2 border-blue-500 shadow-sm' 
                        : 'bg-white/50 border border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={2}
                      checked={selectedTemplate === 2}
                      onChange={() => setSelectedTemplate(2)}
                      className="mt-1 w-4 h-4 text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800">江苏移动项目需求文档</span>
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded">5章节</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">参照江苏移动格式，含功能说明、字段表、接口说明表</p>
                    </div>
                  </label>
                </div>
                
                {/* 生成轮次提示 */}
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-gray-500">
                    {selectedTemplate === 1 ? '每章节生成+完善，共14轮AI调用' : '每章节生成+完善，共10轮AI调用'}
                  </span>
                  <span className={`font-semibold ${selectedTemplate === 1 ? 'text-purple-600' : 'text-blue-600'}`}>
                    {totalEnhanceRounds}轮
                  </span>
                </div>
              </div>

              {/* 多轮完善开关 */}
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enableEnhance"
                    checked={enableMultiRoundEnhance}
                    onChange={(e) => setEnableMultiRoundEnhance(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <label htmlFor="enableEnhance" className="text-sm text-gray-700">
                    启用多轮完善（推荐）
                  </label>
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-6">关闭后仅生成基础内容，不进行章节完善</p>
              </div>
            </div>

            {/* 使用说明 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                使用说明
                <span className={`text-xs px-2 py-0.5 rounded ${selectedTemplate === 1 ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                  {selectedTemplate === 1 ? '模板1' : '模板2'}
                </span>
              </h2>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex gap-3">
                  <span className={`w-6 h-6 ${selectedTemplate === 1 ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'} rounded-full flex items-center justify-center text-xs font-bold`}>1</span>
                  <p>选择文档模板，上传初步需求文档</p>
                </div>
                <div className="flex gap-3">
                  <span className={`w-6 h-6 ${selectedTemplate === 1 ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'} rounded-full flex items-center justify-center text-xs font-bold`}>2</span>
                  <p>{selectedTemplate === 1 ? 'AI按7章节结构生成完整需求规格说明书' : 'AI按5章节结构生成简洁功能需求文档'}</p>
                </div>
                <div className="flex gap-3">
                  <span className={`w-6 h-6 ${selectedTemplate === 1 ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'} rounded-full flex items-center justify-center text-xs font-bold`}>3</span>
                  <p>{selectedTemplate === 1 ? '每章节经过生成+完善两轮优化' : '聚焦功能说明：输入/处理/输出/字段表'}</p>
                </div>
                <div className="flex gap-3">
                  <span className={`w-6 h-6 ${selectedTemplate === 1 ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'} rounded-full flex items-center justify-center text-xs font-bold`}>4</span>
                  <p>查看生成结果并导出Word文档</p>
                </div>
              </div>
              
              {/* 当前模板章节预览 */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">当前模板章节结构：</p>
                <div className="flex flex-wrap gap-1">
                  {CHAPTER_CONFIG.map((ch, idx) => (
                    <span key={idx} className={`text-xs px-2 py-0.5 rounded ${selectedTemplate === 1 ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                      {ch.name.replace('第', '').replace('章 ', '.')}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 生成状态 */}
            {(isGeneratingSpec || isEnhancing || specContent) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">生成状态</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {isGeneratingSpec || isEnhancing ? (
                      <>
                        <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                        <span className="text-sm text-gray-600">
                          {isEnhancing 
                            ? `正在生成 (${enhanceRound}/${totalEnhanceRounds})...` 
                            : '正在生成中...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm text-gray-600">生成完成</span>
                      </>
                    )}
                  </div>
                  
                  {/* 多轮完善进度条 */}
                  {isEnhancing && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>完善进度</span>
                        <span>{Math.round((enhanceRound / totalEnhanceRounds) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(enhanceRound / totalEnhanceRounds) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {specContent && (
                    <div className="text-sm text-gray-500">
                      <p>文档长度: {specContent.length} 字符</p>
                      <p>预计页数: {Math.ceil(specContent.length / 1500)} 页</p>
                      {extractedImages.length > 0 && (
                        <p>包含图片: {extractedImages.length} 张</p>
                      )}
                    </div>
                  )}
                  {specAnalysisJson && (
                    <div className="text-xs text-gray-500 bg-purple-50 border border-purple-100 rounded-lg p-3">
                      <p className="font-medium text-purple-700 mb-1">结构化分析摘要</p>
                      <pre className="text-[11px] whitespace-pre-wrap text-gray-700 max-h-40 overflow-y-auto">{specAnalysisJson}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 右侧：生成结果展示 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 h-[calc(100vh-180px)] flex flex-col">
              {/* 标题栏 */}
              <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-purple-500" />
                  需求规格说明书
                </h3>
                {specContent && (
                  <button
                    onClick={() => copyContent(specContent)}
                    className="text-sm px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 flex items-center gap-1"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? '已复制' : '复制全文'}
                  </button>
                )}
              </div>

              {/* 内容区 */}
              <div className="flex-1 overflow-y-auto p-6">
                {!specContent && !specStreamingContent && specMessages.length === 0 && (
                  <div className="text-center py-12">
                    <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-600 mb-2">欢迎使用需求规格书生成</h3>
                    <p className="text-gray-400">上传需求文档，AI将自动生成完整的需求规格说明书</p>
                  </div>
                )}

                {/* 系统消息 */}
                {specMessages.filter(m => m.role === 'system').map((msg, idx) => (
                  <div key={idx} className="mb-4 p-3 bg-gray-100 rounded-lg text-sm text-gray-600">
                    {msg.content}
                  </div>
                ))}

                {/* 分析结果显示 */}
                {specAnalysisJson && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-500" />
                      结构化分析结果（阶段1）
                    </h4>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {specAnalysisJson}
                    </div>
                  </div>
                )}

                {/* 流式输出或最终内容 - 支持Mermaid图表渲染 */}
                {(specStreamingContent || specContent) && (
                  <div className="prose prose-sm max-w-none">
                    <MarkdownWithMermaid content={specStreamingContent || specContent} />
                  </div>
                )}

                {/* 加载指示器 */}
                {isGeneratingSpec && !specStreamingContent && (
                  <div className="flex items-center gap-3 text-purple-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>AI正在分析文档并生成需求规格书...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
        </div>
        )}
      </main>

      {/* 设置弹窗 */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 m-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">API设置</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 快速配置 */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-800">推荐：智谱GLM-4-Flash（免费）</span>
                </div>
                <p className="text-sm text-green-700 mb-3">
                  无限tokens、永久有效、无需付费
                </p>
                <button
                  onClick={() => {
                    setBaseUrl('https://open.bigmodel.cn/api/paas/v4');
                    setModelName('glm-4-flash');
                  }}
                  className="text-sm px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600"
                >
                  一键填入智谱配置
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Base URL
                </label>
                <select
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                >
                  <option value="https://open.bigmodel.cn/api/paas/v4">智谱GLM (免费)</option>
                  <option value="https://api.siliconflow.cn/v1">SiliconCloud (免费)</option>
                  <option value="https://api.openai.com/v1">OpenAI</option>
                  <option value="https://api.deepseek.com/v1">DeepSeek</option>
                  <option value="https://ark.cn-beijing.volces.com/api/v3">豆包/火山方舟</option>
                  <option value="custom">自定义...</option>
                </select>
                {baseUrl === 'custom' && (
                  <input
                    type="text"
                    value=""
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="输入自定义API地址"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="输入你的API密钥..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="bg-blue-50 rounded-lg p-4 text-sm">
                <p className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  免费API获取方式
                </p>
                <div className="space-y-2 text-blue-700">
                  <div className="flex items-start gap-2">
                    <span className="font-bold">智谱GLM:</span>
                    <span>访问 <a href="https://bigmodel.cn" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">bigmodel.cn</a> 注册获取</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold">SiliconCloud:</span>
                    <span>访问 <a href="https://cloud.siliconflow.cn" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">cloud.siliconflow.cn</a> 注册获取</span>
                  </div>
                </div>
              </div>

              <button
                onClick={saveApiConfig}
                className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 架构图生成模块 */}
      {activeModule === 'diagram' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：文件上传 */}
          <div className="lg:col-span-1 space-y-4">
            {/* 文件上传区 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-green-500" />
                导入需求文档
              </h2>

              <div
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.docx,.txt,.md';
                  input.onchange = async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // 架构图模块独立处理文件，不触发其他模块
                      const formData = new FormData();
                      formData.append('file', file);
                      try {
                        setIsLoading(true);
                        const res = await axios.post('/api/parse-word', formData);
                        if (res.data.success) {
                          setDiagramDocContent(res.data.text);
                          setDiagramDocName(res.data.filename);
                        }
                      } catch (err) {
                        alert('文档解析失败: ' + (err.response?.data?.error || err.message));
                      } finally {
                        setIsLoading(false);
                      }
                    }
                  };
                  input.click();
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    const formData = new FormData();
                    formData.append('file', file);
                    try {
                      setIsLoading(true);
                      const res = await axios.post('/api/parse-word', formData);
                      if (res.data.success) {
                        setDiagramDocContent(res.data.text);
                        setDiagramDocName(res.data.filename);
                      }
                    } catch (err) {
                      alert('文档解析失败: ' + (err.response?.data?.error || err.message));
                    } finally {
                      setIsLoading(false);
                    }
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-300 hover:border-green-400 hover:bg-green-50/50'
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    {isLoading ? (
                      <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
                    ) : (
                      <Upload className="w-6 h-6 text-green-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-gray-700 font-medium">
                      {isLoading ? '解析中...' : '点击或拖拽上传文档'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">支持 .docx, .txt, .md 格式</p>
                  </div>
                </div>
              </div>

              {/* 已上传文件 */}
              {diagramDocName && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-green-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{diagramDocName}</p>
                      <p className="text-xs text-gray-500">{diagramDocContent.length} 字符</p>
                    </div>
                    <button
                      onClick={() => {
                        setDiagramDocContent('');
                        setDiagramDocName('');
                      }}
                      className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                      title="清除文档"
                    >
                      <X className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 使用说明 */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-100">
              <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                <Info className="w-4 h-4" />
                架构图生成说明
              </h3>
              <ul className="text-sm text-green-700 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  <span>上传文档后点击"生成架构图"按钮</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  <span>AI将分析文档内容，生成分层架构图</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  <span>支持导出SVG/PNG格式，可插入Word</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  <span>可复制Mermaid代码进行二次编辑</span>
                </li>
              </ul>
            </div>
          </div>

          {/* 右侧：架构图生成器 */}
          <div className="lg:col-span-2">
            <ArchitectureDiagram 
              documentContent={diagramDocContent}
              documentName={diagramDocName}
            />
          </div>
        </div>
      )}

      {/* 文档预览弹窗 */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl m-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                文档预览: {documentName}
              </h2>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-4 rounded-lg">
                {documentContent}
              </pre>
            </div>
            <div className="p-4 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(documentContent);
                  alert('文档内容已复制到剪贴板');
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                复制内容
              </button>
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 表格预览弹窗 */}
      {showTableView && tableData.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl m-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Table className="w-5 h-5 text-blue-500" />
                Cosmic拆分结果表格 ({tableData.length} 条记录)
              </h2>
              <button
                onClick={() => setShowTableView(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-blue-500 text-white">
                    <th className="border border-blue-600 px-3 py-2 text-left">功能用户</th>
                    <th className="border border-blue-600 px-3 py-2 text-left">触发事件</th>
                    <th className="border border-blue-600 px-3 py-2 text-left">功能过程</th>
                    <th className="border border-blue-600 px-3 py-2 text-left">子过程描述</th>
                    <th className="border border-blue-600 px-3 py-2 text-center w-20">类型</th>
                    <th className="border border-blue-600 px-3 py-2 text-left">数据组</th>
                    <th className="border border-blue-600 px-3 py-2 text-left">数据属性</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-200 px-3 py-2">{row.functionalUser}</td>
                      <td className="border border-gray-200 px-3 py-2">{row.triggerEvent}</td>
                      <td className="border border-gray-200 px-3 py-2">{row.functionalProcess}</td>
                      <td className="border border-gray-200 px-3 py-2">{row.subProcessDesc}</td>
                      <td className="border border-gray-200 px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.dataMovementType === 'E' ? 'bg-green-100 text-green-700' :
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
            </div>
            <div className="p-4 border-t flex justify-end gap-3">
              <button
                onClick={exportExcel}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                导出Excel
              </button>
              <button
                onClick={() => setShowTableView(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 图片预览弹窗 */}
      {showImagePreview && extractedImages.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl m-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                🖼️ 文档图片预览 ({extractedImages.length} 张)
              </h2>
              <button
                onClick={() => setShowImagePreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-sm text-gray-500 mb-4">
                以下图片已从原文档中提取，将在导出Word时自动添加到附录中。
                AI生成内容时可使用 [插入图片: img_X] 标记来引用这些图片。
              </p>
              <div className="grid grid-cols-2 gap-4">
                {extractedImages.map((img, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 flex items-center justify-between">
                      <span>图片 {idx + 1}: {img.filename || '未命名'}</span>
                      <span className="text-xs text-gray-500">[插入图片: img_{idx + 1}]</span>
                    </div>
                    <div className="p-2 bg-white">
                      <img 
                        src={img.dataUrl} 
                        alt={`图片${idx + 1}`}
                        className="w-full h-auto max-h-64 object-contain"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'block';
                        }}
                      />
                      <div className="hidden text-center py-8 text-gray-400">
                        <p>图片无法显示</p>
                        <p className="text-xs">{img.mimeType}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={() => setShowImagePreview(false)}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Red Alert GI Watermark */}
      <div className="gi-watermark">
        <div className="gi-soldier"></div>
      </div>
    </div>
  );
}

export default App;
