import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Upload,
  FileText,
  Send,
  Download,
  Code,
  Eye,
  EyeOff,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  Settings,
  ChevronDown,
  ChevronUp,
  FileCode,
  Layout,
  Database,
  Server,
  Smartphone,
  Monitor,
  Palette,
  Zap,
  MessageSquare,
  History,
  Save,
  FolderOpen,
  X,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
  AlertCircle,
  CheckCircle,
  Info,
  Terminal,
  Box,
  Layers,
  GitBranch,
  Package
} from 'lucide-react';

// API基础URL
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/**
 * 编程智能体组件
 * 支持需求输入、文档上传、代码生成、实时预览
 */
function CodeGenerator({ apiStatus, setShowSettings }) {
  // ==================== 状态管理 ====================
  // 需求输入
  const [requirement, setRequirement] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [documentName, setDocumentName] = useState('');
  
  // HTML模板上传
  const [uploadedHtml, setUploadedHtml] = useState('');
  const [uploadedHtmlName, setUploadedHtmlName] = useState('');
  
  // 代码生成
  const [generatedCode, setGeneratedCode] = useState({
    html: '',
    css: '',
    javascript: '',
    react: '',
    fullCode: ''
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPhase, setGenerationPhase] = useState('');
  const [generationProgress, setGenerationProgress] = useState(0);
  
  // 多轮迭代状态
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(5);
  const [currentFocus, setCurrentFocus] = useState('');
  const [lineCount, setLineCount] = useState(0);
  
  // 对话历史
  const [chatHistory, setChatHistory] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  
  // 预览
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState('desktop'); // desktop | tablet | mobile
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  
  // 代码编辑器
  const [activeCodeTab, setActiveCodeTab] = useState('react');
  const [isCodeExpanded, setIsCodeExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  
  // 项目设置
  const [projectType, setProjectType] = useState('react'); // react | vue | html
  const [uiFramework, setUIFramework] = useState('tailwind'); // tailwind | antd | material
  const [includeBackend, setIncludeBackend] = useState(false);
  
  // 错误和状态
  const [error, setError] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  
  // Refs
  const fileInputRef = useRef(null);
  const htmlInputRef = useRef(null);  // HTML模板上传
  const previewIframeRef = useRef(null);
  const chatEndRef = useRef(null);

  // ==================== 文件上传处理 ====================
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setError('');
      const response = await axios.post(`${API_BASE}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setDocumentContent(response.data.content);
      setDocumentName(file.name);
      
      // 添加到对话历史
      setChatHistory(prev => [...prev, {
        role: 'system',
        content: `已上传文档: ${file.name}`,
        timestamp: new Date().toISOString()
      }]);
    } catch (err) {
      setError('文件上传失败: ' + (err.response?.data?.error || err.message));
    }
  };

  // ==================== HTML模板上传处理 ====================
  const handleHtmlUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError('');
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        setUploadedHtml(content);
        setUploadedHtmlName(file.name);
        
        // 添加到对话历史
        setChatHistory(prev => [...prev, {
          role: 'system',
          content: `已上传HTML模板: ${file.name}，将作为参考样式生成代码`,
          timestamp: new Date().toISOString()
        }]);
      };
      reader.readAsText(file);
    } catch (err) {
      setError('HTML文件读取失败: ' + err.message);
    }
  };

  // ==================== 代码生成 ====================
  const generateCode = async () => {
    if (!requirement.trim() && !documentContent) {
      setError('请输入需求描述或上传需求文档');
      return;
    }

    setIsGenerating(true);
    setError('');
    setGenerationPhase('analyzing');
    setGenerationProgress(0);
    setStreamingContent('');

    // 添加用户消息到历史
    const userMessage = {
      role: 'user',
      content: requirement || `根据上传的文档 "${documentName}" 生成代码`,
      timestamp: new Date().toISOString()
    };
    setChatHistory(prev => [...prev, userMessage]);

    try {
      const response = await fetch(`${API_BASE}/api/code-generator/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement: requirement.trim(),
          documentContent,
          projectType,
          uiFramework,
          includeBackend,
          uploadedHtml,  // 上传的HTML模板
          chatHistory: chatHistory.slice(-10) // 最近10条历史
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = '生成请求失败';
        try {
          const parsed = JSON.parse(errorText || '{}');
          if (parsed.error) {
            errorMessage = parsed.error;
          }
        } catch (parseErr) {
          if (errorText) {
            errorMessage = errorText;
          }
        }
        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let codeBlocks = {
        html: '',
        css: '',
        javascript: '',
        react: '',
        fullCode: ''
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // 处理多轮迭代进度
              if (data.round !== undefined) {
                setCurrentRound(data.round);
              }
              if (data.totalRounds !== undefined) {
                setTotalRounds(data.totalRounds);
              }
              if (data.focus) {
                setCurrentFocus(data.focus);
              }
              if (data.lineCount !== undefined) {
                setLineCount(data.lineCount);
              }
              
              if (data.phase) {
                setGenerationPhase(data.phase);
                setGenerationProgress(data.progress || 0);
              }
              
              if (data.message) {
                // 更新消息显示
                setGenerationPhase(data.message);
              }
              
              if (data.content) {
                fullResponse += data.content;
                setStreamingContent(fullResponse);
              }
              
              if (data.code) {
                codeBlocks = { ...codeBlocks, ...data.code };
                setGeneratedCode(codeBlocks);
              }

              if (data.complete) {
                setGeneratedCode(data.finalCode || codeBlocks);
                if (data.lineCount) {
                  setLineCount(data.lineCount);
                }
              }

              if (data.error) {
                setError(data.error);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 添加助手回复到历史
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: '代码生成完成！您可以在右侧预览效果，或继续提出修改需求。',
        code: codeBlocks,
        timestamp: new Date().toISOString()
      }]);

      setGenerationPhase('complete');
      setGenerationProgress(100);

    } catch (err) {
      setError('代码生成失败: ' + err.message);
      setGenerationPhase('error');
    } finally {
      setIsGenerating(false);
    }
  };

  // ==================== 代码修改 ====================
  const modifyCode = async () => {
    if (!currentMessage.trim()) return;

    const userMessage = {
      role: 'user',
      content: currentMessage,
      timestamp: new Date().toISOString()
    };
    setChatHistory(prev => [...prev, userMessage]);
    setCurrentMessage('');
    setIsGenerating(true);
    setStreamingContent('');

    try {
      const response = await fetch(`${API_BASE}/api/code-generator/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modification: currentMessage,
          currentCode: generatedCode,
          projectType,
          uiFramework,
          chatHistory: chatHistory.slice(-10)
        })
      });

      if (!response.ok) {
        throw new Error('修改请求失败');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let updatedCode = { ...generatedCode };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.content) {
                fullResponse += data.content;
                setStreamingContent(fullResponse);
              }
              
              if (data.code) {
                updatedCode = { ...updatedCode, ...data.code };
                setGeneratedCode(updatedCode);
              }

              if (data.complete) {
                setGeneratedCode(data.finalCode || updatedCode);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 添加助手回复
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: fullResponse || '代码已更新！',
        code: updatedCode,
        timestamp: new Date().toISOString()
      }]);

    } catch (err) {
      setError('代码修改失败: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // ==================== 预览更新 ====================
  useEffect(() => {
    if (previewIframeRef.current) {
      const iframe = previewIframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      const htmlCode = generatedCode.html || generatedCode.fullCode || '';
      const hasFullHtml = !!htmlCode && /<!DOCTYPE html/i.test(htmlCode);
      
      // 纯HTML模式或返回的是完整HTML文件
      if (projectType === 'html' || hasFullHtml) {
        if (!htmlCode) {
          doc.open();
          doc.write(`<!DOCTYPE html>
<html><head>
<style>body{display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666;background:#f5f5f5;}</style>
</head><body><div style="text-align:center"><div style="font-size:48px;margin-bottom:16px;">🌐</div><div>等待生成HTML代码...</div></div></body></html>`);
          doc.close();
          return;
        }
        
        // 直接写入HTML代码
        doc.open();
        doc.write(htmlCode);
        doc.close();
        return;
      }
      
      // React模式：优先使用React代码；如果仍然是HTML，则降级为直接渲染
      const codeToPreview = generatedCode.react || generatedCode.javascript || generatedCode.fullCode || '';
      const reactContainsHtmlDoc = /<!DOCTYPE html/i.test(codeToPreview);
      if (reactContainsHtmlDoc) {
        doc.open();
        doc.write(codeToPreview);
        doc.close();
        return;
      }
      
      if (!codeToPreview) {
        doc.open();
        doc.write(`<!DOCTYPE html>
<html><head>
<style>body{display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666;background:#f5f5f5;}</style>
</head><body><div style="text-align:center"><div style="font-size:48px;margin-bottom:16px;">⚛️</div><div>等待生成React代码...</div></div></body></html>`);
        doc.close();
        return;
      }
      
      // 构建React预览HTML
      const previewHTML = buildReactPreview({ react: codeToPreview, css: generatedCode.css || '' });
      
      doc.open();
      doc.write(previewHTML);
      doc.close();
    }
  }, [generatedCode, projectType]);

  // 构建React预览HTML - 增强版
  const buildReactPreview = (code) => {
    // 清理代码：移除 import/export 语句（在浏览器中不需要）
    let cleanCode = code.react || '';
    
    // 移除 import 语句
    cleanCode = cleanCode.replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
    cleanCode = cleanCode.replace(/^import\s+['"].*?['"];?\s*$/gm, '');
    
    // 移除 export 语句，但保留函数定义
    cleanCode = cleanCode.replace(/^export\s+default\s+/gm, '');
    cleanCode = cleanCode.replace(/^export\s+/gm, '');
    
    // 处理模板字符串中的特殊字符
    cleanCode = cleanCode.replace(/`\$\{/g, '`${');
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>代码预览</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    ${code.css || ''}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react">
    // React Hooks
    const { useState, useEffect, useCallback, useMemo, useRef } = React;
    
    ${cleanCode || `
      function App() {
        return (
          <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="text-6xl mb-4">🚀</div>
              <div className="text-xl">等待生成代码...</div>
            </div>
          </div>
        );
      }
    `}
    
    // 渲染应用
    try {
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(<App />);
    } catch (error) {
      document.getElementById('root').innerHTML = '<div style="padding:20px;color:red;">渲染错误: ' + error.message + '</div>';
      console.error('React渲染错误:', error);
    }
  <\/script>
  <script>
    // 捕获Babel编译错误
    window.onerror = function(msg, url, line, col, error) {
      console.error('预览错误:', msg, error);
      var root = document.getElementById('root');
      if (root && !root.innerHTML.includes('渲染错误')) {
        root.innerHTML = '<div style="padding:20px;color:red;font-family:monospace;"><strong>编译错误:</strong><br>' + msg + '</div>';
      }
    };
  <\/script>
</body>
</html>`;
  };

  // ==================== 复制代码 ====================
  const copyCode = (codeType) => {
    const code = generatedCode[codeType] || generatedCode.fullCode;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ==================== 下载代码 ====================
  const downloadCode = () => {
    const code = generatedCode.fullCode || generatedCode.react || generatedCode.html;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = projectType === 'react' ? 'App.jsx' : 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ==================== 清空 ====================
  const clearAll = () => {
    setRequirement('');
    setDocumentContent('');
    setDocumentName('');
    setGeneratedCode({ html: '', css: '', javascript: '', react: '', fullCode: '' });
    setChatHistory([]);
    setStreamingContent('');
    setError('');
    setGenerationPhase('');
    setGenerationProgress(0);
  };

  // 滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, streamingContent]);

  // ==================== 渲染 ====================
  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* 项目类型选择 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">项目类型:</span>
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="react">React</option>
              <option value="vue">Vue</option>
              <option value="html">纯HTML</option>
            </select>
          </div>

          {/* UI框架选择 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">UI框架:</span>
            <select
              value={uiFramework}
              onChange={(e) => setUIFramework(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="tailwind">Tailwind CSS</option>
              <option value="antd">Ant Design</option>
              <option value="material">Material UI</option>
              <option value="bootstrap">Bootstrap</option>
            </select>
          </div>

          {/* 是否包含后端 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeBackend}
              onChange={(e) => setIncludeBackend(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">生成后端代码</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {/* 预览模式切换 */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setPreviewMode('desktop')}
              className={`p-1.5 rounded ${previewMode === 'desktop' ? 'bg-white shadow-sm' : ''}`}
              title="桌面端预览"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPreviewMode('tablet')}
              className={`p-1.5 rounded ${previewMode === 'tablet' ? 'bg-white shadow-sm' : ''}`}
              title="平板预览"
            >
              <Layout className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPreviewMode('mobile')}
              className={`p-1.5 rounded ${previewMode === 'mobile' ? 'bg-white shadow-sm' : ''}`}
              title="移动端预览"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>

          {/* 显示/隐藏预览 */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`p-2 rounded-lg ${showPreview ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}
          >
            {showPreview ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* 下载 */}
          <button
            onClick={downloadCode}
            disabled={!generatedCode.fullCode && !generatedCode.react}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            下载代码
          </button>

          {/* 清空 */}
          <button
            onClick={clearAll}
            className="p-2 text-gray-500 hover:text-red-500 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：需求输入和对话 */}
        <div className={`flex flex-col ${showPreview ? 'w-1/2' : 'w-full'} border-r border-gray-200`}>
          {/* 需求输入区 */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-start gap-3">
              {/* 文档上传 */}
              <div className="flex-shrink-0 flex gap-2">
                {/* 需求文档上传 */}
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".docx,.doc,.txt,.md"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-1 p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <Upload className="w-5 h-5 text-gray-500" />
                    <span className="text-xs text-gray-500">上传文档</span>
                  </button>
                </div>
                
                {/* HTML模板上传 */}
                <div>
                  <input
                    type="file"
                    ref={htmlInputRef}
                    onChange={handleHtmlUpload}
                    accept=".html,.htm"
                    className="hidden"
                  />
                  <button
                    onClick={() => htmlInputRef.current?.click()}
                    className="flex flex-col items-center gap-1 p-3 border-2 border-dashed border-orange-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors"
                    title="上传HTML模板作为参考样式"
                  >
                    <FileCode className="w-5 h-5 text-orange-500" />
                    <span className="text-xs text-orange-500">HTML模板</span>
                  </button>
                </div>
              </div>

              {/* 需求输入框 */}
              <div className="flex-1">
                <textarea
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  placeholder="描述你想要的功能，例如：&#10;- 创建一个用户登录页面，包含用户名、密码输入框和登录按钮&#10;- 设计一个商品列表页面，支持搜索和筛选&#10;- 开发一个数据可视化仪表盘..."
                  className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {documentName && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                    <FileText className="w-4 h-4" />
                    <span>已上传: {documentName}</span>
                    <button
                      onClick={() => { setDocumentContent(''); setDocumentName(''); }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {uploadedHtmlName && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-orange-600">
                    <FileCode className="w-4 h-4" />
                    <span>HTML模板: {uploadedHtmlName}</span>
                    <button
                      onClick={() => { setUploadedHtml(''); setUploadedHtmlName(''); }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* 生成按钮 */}
              <button
                onClick={generateCode}
                disabled={isGenerating || (!requirement.trim() && !documentContent)}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    生成代码
                  </>
                )}
              </button>
            </div>

            {/* 多轮迭代生成进度 */}
            {isGenerating && (
              <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
                {/* 轮次指示器 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{currentRound}</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        第 {currentRound} / {totalRounds} 轮迭代
                      </div>
                      <div className="text-xs text-gray-500">{generationPhase}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600">{lineCount}</div>
                    <div className="text-xs text-gray-500">行代码</div>
                  </div>
                </div>

                {/* 轮次进度条 */}
                <div className="flex gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((round) => (
                    <div
                      key={round}
                      className={`flex-1 h-2 rounded-full transition-all duration-300 ${
                        round < currentRound
                          ? 'bg-green-500'
                          : round === currentRound
                          ? 'bg-gradient-to-r from-blue-500 to-purple-600 animate-pulse'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>

                {/* 轮次标签 */}
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span className={currentRound >= 1 ? 'text-blue-600 font-medium' : ''}>结构</span>
                  <span className={currentRound >= 2 ? 'text-blue-600 font-medium' : ''}>组件</span>
                  <span className={currentRound >= 3 ? 'text-blue-600 font-medium' : ''}>交互</span>
                  <span className={currentRound >= 4 ? 'text-blue-600 font-medium' : ''}>数据</span>
                  <span className={currentRound >= 5 ? 'text-blue-600 font-medium' : ''}>优化</span>
                </div>

                {/* 总进度条 */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-500">总进度</span>
                  <span className="text-xs font-medium text-blue-600">{generationProgress}%</span>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>

          {/* 对话历史区 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <Code className="w-16 h-16 mb-4" />
                <p className="text-lg font-medium">智能编程助手</p>
                <p className="text-sm mt-2">输入需求或上传文档，AI将为你生成完整的前端代码</p>
                <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="font-medium text-gray-600 mb-1">支持功能</div>
                    <ul className="text-gray-500 space-y-1">
                      <li>• React/Vue/HTML项目</li>
                      <li>• 多种UI框架</li>
                      <li>• 实时预览</li>
                      <li>• 代码修改迭代</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="font-medium text-gray-600 mb-1">使用示例</div>
                    <ul className="text-gray-500 space-y-1">
                      <li>• "创建登录页面"</li>
                      <li>• "设计商品列表"</li>
                      <li>• "开发数据看板"</li>
                      <li>• "实现表单功能"</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : msg.role === 'system'
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <div className="text-sm">{msg.content}</div>
                    {msg.code && (
                      <div className="mt-2 text-xs text-gray-500">
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          代码已更新
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* 流式内容显示 */}
            {isGenerating && streamingContent && (
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {streamingContent.slice(-500)}
                </div>
                <div className="mt-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* 底部修改输入 */}
          {generatedCode.fullCode && (
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && modifyCode()}
                  placeholder="描述你想要的修改，例如：'把按钮改成红色'、'添加搜索功能'..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isGenerating}
                />
                <button
                  onClick={modifyCode}
                  disabled={isGenerating || !currentMessage.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：代码和预览 */}
        {showPreview && (
          <div className="w-1/2 flex flex-col">
            {/* 代码编辑器 */}
            <div className={`${isCodeExpanded ? 'h-1/2' : 'h-12'} border-b border-gray-200 flex flex-col transition-all`}>
              {/* 代码标签栏 */}
              <div className="flex items-center justify-between px-2 py-1 bg-gray-100 border-b border-gray-200">
                <div className="flex items-center gap-1">
                  {projectType === 'react' && (
                    <button
                      onClick={() => setActiveCodeTab('react')}
                      className={`px-3 py-1 text-sm rounded ${activeCodeTab === 'react' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
                    >
                      <span className="flex items-center gap-1">
                        <FileCode className="w-3 h-3" />
                        App.jsx
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => setActiveCodeTab('html')}
                    className={`px-3 py-1 text-sm rounded ${activeCodeTab === 'html' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
                  >
                    HTML
                  </button>
                  <button
                    onClick={() => setActiveCodeTab('css')}
                    className={`px-3 py-1 text-sm rounded ${activeCodeTab === 'css' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
                  >
                    CSS
                  </button>
                  <button
                    onClick={() => setActiveCodeTab('javascript')}
                    className={`px-3 py-1 text-sm rounded ${activeCodeTab === 'javascript' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
                  >
                    JavaScript
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyCode(activeCodeTab)}
                    className="p-1 hover:bg-gray-200 rounded"
                    title="复制代码"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setIsCodeExpanded(!isCodeExpanded)}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {isCodeExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 代码内容 */}
              {isCodeExpanded && (
                <div className="flex-1 overflow-auto bg-gray-900 p-4">
                  <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap">
                    {generatedCode[activeCodeTab] || generatedCode.fullCode || '// 等待生成代码...'}
                  </pre>
                </div>
              )}
            </div>

            {/* 预览区 */}
            <div className={`${isCodeExpanded ? 'h-1/2' : 'flex-1'} flex flex-col`}>
              <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  实时预览
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {previewMode === 'desktop' ? '桌面端' : previewMode === 'tablet' ? '平板' : '移动端'}
                  </span>
                  <button
                    onClick={() => setIsPreviewFullscreen(!isPreviewFullscreen)}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {isPreviewFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              <div className="flex-1 bg-gray-200 p-4 overflow-auto flex items-start justify-center">
                <div
                  className={`bg-white shadow-lg rounded-lg overflow-hidden transition-all ${
                    previewMode === 'desktop' ? 'w-full h-full' :
                    previewMode === 'tablet' ? 'w-[768px] h-full' :
                    'w-[375px] h-full'
                  }`}
                >
                  <iframe
                    ref={previewIframeRef}
                    title="代码预览"
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 全屏预览模态框 */}
      {isPreviewFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8">
          <div className="w-full h-full bg-white rounded-lg overflow-hidden relative">
            <button
              onClick={() => setIsPreviewFullscreen(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-gray-800 text-white rounded-full hover:bg-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
            <iframe
              src=""
              ref={(el) => {
                if (el && generatedCode.fullCode) {
                  const doc = el.contentDocument || el.contentWindow.document;
                  doc.open();
                  doc.write(projectType === 'react' ? buildReactPreview(generatedCode) : generatedCode.fullCode);
                  doc.close();
                }
              }}
              title="全屏预览"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default CodeGenerator;
