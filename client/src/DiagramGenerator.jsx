import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import mermaid from 'mermaid';
import {
  Layers,
  Download,
  RefreshCw,
  Copy,
  Check,
  Image,
  Code,
  FileText,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

/**
 * 架构图生成组件
 * 支持从需求文档自动生成分层架构图
 */
function DiagramGenerator({ documentContent, documentName }) {
  // 状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [mermaidCode, setMermaidCode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [outputFormat, setOutputFormat] = useState('svg');
  const [showCode, setShowCode] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [renderError, setRenderError] = useState('');
  
  const mermaidRef = useRef(null);

  // 初始化Mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'Microsoft YaHei, sans-serif'
    });
  }, []);

  // 当Mermaid代码变化时，尝试前端渲染
  useEffect(() => {
    if (mermaidCode && mermaidRef.current) {
      renderMermaidLocal();
    }
  }, [mermaidCode]);

  // 前端渲染Mermaid
  const renderMermaidLocal = async () => {
    if (!mermaidRef.current || !mermaidCode) return;
    
    try {
      setRenderError('');
      mermaidRef.current.innerHTML = '';
      const { svg } = await mermaid.render('diagram-' + Date.now(), mermaidCode);
      mermaidRef.current.innerHTML = svg;
    } catch (err) {
      console.error('Mermaid本地渲染失败:', err);
      setRenderError(err.message);
      // 显示代码让用户可以手动修复
      mermaidRef.current.innerHTML = '';
    }
  };

  // 生成架构图
  const generateDiagram = async () => {
    if (!documentContent) {
      setError('请先上传需求文档');
      return;
    }

    setIsGenerating(true);
    setError('');
    setRenderError('');
    setMermaidCode('');
    setImageUrl('');
    setAnalysis(null);

    try {
      const response = await axios.post('/api/diagram/generate', {
        documentContent,
        diagramType: 'layered',
        outputFormat
      });

      if (response.data.success) {
        const code = response.data.mermaidCode;
        setMermaidCode(code);
        setAnalysis(response.data.analysis);
        
        // 如果服务端渲染成功，使用服务端图片
        if (response.data.imageUrl) {
          setImageUrl(response.data.imageUrl);
        }
        // 否则前端会自动尝试渲染
      } else {
        setError(response.data.error || '生成失败');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 复制Mermaid代码
  const copyCode = () => {
    navigator.clipboard.writeText(mermaidCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 下载图片
  const downloadImage = async () => {
    if (imageUrl) {
      // 从base64下载
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `${documentName || 'architecture'}_diagram.${outputFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (mermaidCode) {
      // 从Kroki获取图片
      try {
        const response = await axios.post('/api/diagram/render', {
          mermaidCode,
          outputFormat
        }, { responseType: 'blob' });
        
        const url = window.URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${documentName || 'architecture'}_diagram.${outputFormat}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (err) {
        setError('下载失败: ' + err.message);
      }
    }
  };

  // 重新渲染（切换格式）
  const reRender = async () => {
    if (!mermaidCode) return;
    
    setIsGenerating(true);
    try {
      const response = await axios.post('/api/diagram/render', {
        mermaidCode,
        outputFormat
      }, { responseType: 'arraybuffer' });
      
      const base64 = btoa(
        new Uint8Array(response.data).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      const mimeType = outputFormat === 'png' ? 'image/png' : 'image/svg+xml';
      setImageUrl(`data:${mimeType};base64,${base64}`);
    } catch (err) {
      setError('渲染失败: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">架构图生成</h3>
        </div>
        
        {/* 格式选择 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">输出格式:</span>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="svg">SVG (矢量)</option>
            <option value="png">PNG (位图)</option>
          </select>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={generateDiagram}
          disabled={isGenerating || !documentContent}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              AI分析中...
            </>
          ) : (
            <>
              <Layers className="w-4 h-4" />
              生成架构图
            </>
          )}
        </button>

        {mermaidCode && (
          <>
            <button
              onClick={reRender}
              disabled={isGenerating}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              重新渲染
            </button>
            
            <button
              onClick={downloadImage}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              下载图片
            </button>
            
            <button
              onClick={copyCode}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制代码'}
            </button>
          </>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* 渲染错误提示 */}
      {renderError && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 text-yellow-700 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <div>
            <p className="font-medium">Mermaid渲染失败</p>
            <p className="text-sm">{renderError}</p>
            <p className="text-xs mt-1">请查看下方代码，可能需要手动修复语法</p>
          </div>
        </div>
      )}

      {/* 图片预览 */}
      {mermaidCode && (
        <div className="border rounded-lg p-4 bg-gray-50 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              <Image className="w-4 h-4 inline mr-1" />
              架构图预览
              {imageUrl && <span className="text-xs text-green-600 ml-2">(服务端渲染)</span>}
              {!imageUrl && !renderError && <span className="text-xs text-blue-600 ml-2">(本地渲染)</span>}
            </span>
          </div>
          
          <div className="bg-white rounded border p-4 overflow-auto max-h-[500px] min-h-[200px]">
            {imageUrl ? (
              <img 
                src={imageUrl} 
                alt="架构图" 
                className="max-w-full h-auto mx-auto"
                style={{ maxHeight: '450px' }}
              />
            ) : (
              <div ref={mermaidRef} className="flex justify-center min-h-[150px]" />
            )}
          </div>
        </div>
      )}

      {/* 分析结果折叠面板 */}
      {analysis && (
        <div className="border rounded-lg mb-4">
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <FileText className="w-4 h-4" />
              AI分析结果
            </span>
            {showAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {showAnalysis && (
            <div className="p-4 bg-white">
              <div className="text-sm">
                <p className="font-medium text-gray-800 mb-2">
                  系统名称: {analysis.systemName || '未识别'}
                </p>
                
                {analysis.layers && (
                  <div className="mb-3">
                    <p className="font-medium text-gray-700 mb-1">识别的层级:</p>
                    <ul className="list-disc list-inside text-gray-600 space-y-1">
                      {analysis.layers.map((layer, idx) => (
                        <li key={idx}>
                          <span className="font-medium">{layer.name}</span>
                          {layer.groups && (
                            <span className="text-gray-500">
                              {' - '}
                              {layer.groups.map(g => g.modules?.join(', ')).join('; ')}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {analysis.dataFlows && analysis.dataFlows.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">数据流向:</p>
                    <ul className="list-disc list-inside text-gray-600">
                      {analysis.dataFlows.map((flow, idx) => (
                        <li key={idx}>
                          {flow.from} → {flow.to}: {flow.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mermaid代码折叠面板 */}
      {mermaidCode && (
        <div className="border rounded-lg">
          <button
            onClick={() => setShowCode(!showCode)}
            className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Code className="w-4 h-4" />
              Mermaid代码
            </span>
            {showCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {showCode && (
            <div className="p-4 bg-gray-900 rounded-b-lg">
              <pre className="text-sm text-green-400 overflow-auto max-h-[300px]">
                <code>{mermaidCode}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 使用说明 */}
      {!mermaidCode && !isGenerating && (
        <div className="text-center py-8 text-gray-500">
          <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            上传需求文档后，点击"生成架构图"按钮
          </p>
          <p className="text-xs mt-1">
            AI将自动分析文档内容，生成分层架构图
          </p>
        </div>
      )}
    </div>
  );
}

export default DiagramGenerator;
