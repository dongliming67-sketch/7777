import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Upload,
  FileText,
  Search,
  Zap,
  GitCompare,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Target,
  Shield,
  Eye,
  FileCheck,
  TrendingUp,
  AlertCircle,
  Clock,
  BarChart3
} from 'lucide-react';

// 严重程度配置 - Claude风格
const SEVERITY_CONFIG = {
  critical: { label: '严重', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  major: { label: '重要', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: AlertTriangle },
  minor: { label: '一般', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Info },
  suggestion: { label: '建议', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Info }
};

// 风险等级配置 - Claude风格
const RISK_CONFIG = {
  critical: { label: '极高', color: 'text-red-700', bgColor: 'bg-red-50' },
  high: { label: '高', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  medium: { label: '中', color: 'text-yellow-700', bgColor: 'bg-yellow-50' },
  low: { label: '低', color: 'text-green-700', bgColor: 'bg-green-50' }
};

// 维度图标配置
const DIMENSION_ICONS = {
  completeness: Target,
  consistency: Shield,
  testability: FileCheck,
  clarity: Eye,
  feasibility: TrendingUp,
  traceability: GitCompare
};

function RequirementReview({ apiStatus, setShowSettings }) {
  // 状态管理
  const [reviewMode, setReviewMode] = useState('full'); // 'full' | 'quick' | 'compare'
  const [documentContent, setDocumentContent] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [oldDocContent, setOldDocContent] = useState('');
  const [oldDocName, setOldDocName] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewProgress, setReviewProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [reviewReport, setReviewReport] = useState(null);
  const [quickResult, setQuickResult] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const oldFileInputRef = useRef(null);
  const newFileInputRef = useRef(null);

  // 文件处理
  const handleFileUpload = useCallback(async (file, setContent, setName) => {
    if (!file) return;

    setName(file.name);
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'txt' || ext === 'md') {
      const text = await file.text();
      setContent(text);
    } else if (ext === 'docx' || ext === 'doc') {
      // 对于Word文件，我们需要通过后端解析
      setContent(`[文件已上传: ${file.name}]`);
    }
  }, []);

  // 拖拽处理
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e, setContent, setName) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file, setContent, setName);
    }
  };

  // 执行完整评审
  const runFullReview = async () => {
    if (!documentContent && !documentName) {
      setError('请先上传需求文档');
      return;
    }

    setIsReviewing(true);
    setReviewProgress(0);
    setProgressMessage('准备开始评审...');
    setError('');
    setReviewReport(null);

    try {
      const formData = new FormData();
      
      // 如果有文件，上传文件；否则上传文本内容
      if (fileInputRef.current?.files?.[0]) {
        formData.append('file', fileInputRef.current.files[0]);
      } else {
        formData.append('content', documentContent);
      }

      const response = await fetch('http://localhost:3001/api/review/full', {
        method: 'POST',
        body: formData
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setIsReviewing(false);
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.phase === 'error') {
                setError(parsed.error);
                setIsReviewing(false);
              } else if (parsed.phase === 'result') {
                setReviewReport(parsed.report);
              } else {
                setReviewProgress(parsed.progress || 0);
                setProgressMessage(parsed.message || '');
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (err) {
      setError('评审失败: ' + err.message);
      setIsReviewing(false);
    }
  };

  // 执行快速评审
  const runQuickReview = async () => {
    if (!documentContent && !documentName) {
      setError('请先上传需求文档');
      return;
    }

    setIsReviewing(true);
    setError('');
    setQuickResult(null);

    try {
      const formData = new FormData();
      
      if (fileInputRef.current?.files?.[0]) {
        formData.append('file', fileInputRef.current.files[0]);
      } else {
        formData.append('content', documentContent);
      }

      const response = await axios.post('http://localhost:3001/api/review/quick', formData);
      setQuickResult(response.data.result);
    } catch (err) {
      setError('快速评审失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsReviewing(false);
    }
  };

  // 执行对比评审
  const runCompareReview = async () => {
    if ((!oldDocContent && !oldDocName) || (!newDocContent && !newDocName)) {
      setError('请上传两个版本的需求文档');
      return;
    }

    setIsReviewing(true);
    setError('');
    setCompareResult(null);

    try {
      const formData = new FormData();
      
      if (oldFileInputRef.current?.files?.[0]) {
        formData.append('oldFile', oldFileInputRef.current.files[0]);
      } else {
        formData.append('oldContent', oldDocContent);
      }

      if (newFileInputRef.current?.files?.[0]) {
        formData.append('newFile', newFileInputRef.current.files[0]);
      } else {
        formData.append('newContent', newDocContent);
      }

      const response = await axios.post('http://localhost:3001/api/review/compare', formData);
      setCompareResult(response.data.result);
    } catch (err) {
      setError('对比评审失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsReviewing(false);
    }
  };

  // 切换展开/收起
  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  // 导出报告
  const exportReport = () => {
    if (!reviewReport) return;

    const reportText = JSON.stringify(reviewReport, null, 2);
    const blob = new Blob([reportText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `需求评审报告_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 获取分数颜色
  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  // 获取分数背景
  const getScoreBg = (score) => {
    if (score >= 90) return 'bg-green-50 border-green-200';
    if (score >= 80) return 'bg-blue-50 border-blue-200';
    if (score >= 70) return 'bg-yellow-50 border-yellow-200';
    if (score >= 60) return 'bg-orange-50 border-orange-200';
    return 'bg-red-50 border-red-200';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左侧：文件上传和模式选择 */}
      <div className="lg:col-span-1 space-y-4">
        {/* 评审模式选择 */}
        <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6 transition-all duration-300 hover:shadow-claude-lg">
          <h2 className="text-lg font-serif font-bold text-claude-text-primary mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-claude-accent-primary" />
            评审模式
          </h2>
          
          <div className="space-y-2">
            <button
              onClick={() => setReviewMode('full')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                reviewMode === 'full'
                  ? 'border-claude-accent-primary bg-claude-bg-warm text-claude-text-primary shadow-sm'
                  : 'border-claude-border-warm hover:border-claude-border hover:bg-claude-bg-warm'
              }`}
            >
              <div className={`p-2 rounded-lg ${reviewMode === 'full' ? 'bg-claude-accent-primary text-white' : 'bg-claude-bg-cream text-claude-text-muted'}`}>
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-medium text-claude-text-primary">完整评审</div>
                <div className="text-xs text-claude-text-secondary">六维度深度分析</div>
              </div>
            </button>
            
            <button
              onClick={() => setReviewMode('quick')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                reviewMode === 'quick'
                  ? 'border-claude-accent-primary bg-claude-bg-warm text-claude-text-primary shadow-sm'
                  : 'border-claude-border-warm hover:border-claude-border hover:bg-claude-bg-warm'
              }`}
            >
              <div className={`p-2 rounded-lg ${reviewMode === 'quick' ? 'bg-claude-accent-primary text-white' : 'bg-claude-bg-cream text-claude-text-muted'}`}>
                <Zap className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-medium text-claude-text-primary">快速评审</div>
                <div className="text-xs text-claude-text-secondary">识别关键问题</div>
              </div>
            </button>
            
            <button
              onClick={() => setReviewMode('compare')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                reviewMode === 'compare'
                  ? 'border-claude-accent-primary bg-claude-bg-warm text-claude-text-primary shadow-sm'
                  : 'border-claude-border-warm hover:border-claude-border hover:bg-claude-bg-warm'
              }`}
            >
              <div className={`p-2 rounded-lg ${reviewMode === 'compare' ? 'bg-claude-accent-primary text-white' : 'bg-claude-bg-cream text-claude-text-muted'}`}>
                <GitCompare className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-medium text-claude-text-primary">对比评审</div>
                <div className="text-xs text-claude-text-secondary">版本变更分析</div>
              </div>
            </button>
          </div>
        </div>

        {/* 文件上传区 */}
        {reviewMode !== 'compare' ? (
          <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6 transition-all duration-300 hover:shadow-claude-lg">
            <h2 className="text-lg font-serif font-bold text-claude-text-primary mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-claude-accent-primary" />
              上传需求文档
            </h2>
            
            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-claude-accent-primary bg-claude-accent-light'
                  : 'border-claude-border-warm hover:border-claude-accent-primary hover:bg-claude-bg-warm'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, setDocumentContent, setDocumentName)}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.doc,.txt,.md"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files[0], setDocumentContent, setDocumentName)}
              />
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-claude-bg-cream text-claude-text-muted">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-claude-text-primary font-medium mb-1">拖拽文件到此处或点击上传</p>
              <p className="text-xs text-claude-text-muted">支持 .docx, .doc, .txt, .md</p>
            </div>

            {documentName && (
              <div className="mt-4 p-3 bg-claude-bg-cream border border-claude-border-warm rounded-lg flex items-center gap-3">
                <FileText className="w-5 h-5 text-claude-accent-primary" />
                <span className="text-sm text-claude-text-primary truncate flex-1">{documentName}</span>
                <button
                  onClick={() => {
                    setDocumentName('');
                    setDocumentContent('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-claude-text-muted hover:text-red-500 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 或者直接输入文本 */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-claude-text-secondary mb-2">
                或直接粘贴需求内容
              </label>
              <textarea
                value={documentContent.startsWith('[文件已上传') ? '' : documentContent}
                onChange={(e) => setDocumentContent(e.target.value)}
                placeholder="在此粘贴需求文档内容..."
                className="w-full h-32 p-3 border border-claude-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-claude-accent-primary/20 focus:border-claude-accent-primary text-sm bg-claude-bg-warm"
              />
            </div>
          </div>
        ) : (
          /* 对比评审的双文件上传 */
          <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6 space-y-4 transition-all duration-300 hover:shadow-claude-lg">
            <h2 className="text-lg font-serif font-bold text-claude-text-primary mb-4 flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-claude-accent-primary" />
              上传对比文档
            </h2>
            
            {/* 旧版本 */}
            <div>
              <label className="block text-sm font-medium text-claude-text-secondary mb-2">旧版本</label>
              <div
                className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer border-claude-border-warm hover:border-claude-accent-primary hover:bg-claude-bg-warm transition-all"
                onClick={() => oldFileInputRef.current?.click()}
              >
                <input
                  ref={oldFileInputRef}
                  type="file"
                  accept=".docx,.doc,.txt,.md"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files[0], setOldDocContent, setOldDocName)}
                />
                {oldDocName ? (
                  <div className="flex items-center justify-center gap-2 text-claude-text-primary">
                    <FileText className="w-4 h-4 text-claude-accent-primary" />
                    <span className="text-sm truncate">{oldDocName}</span>
                  </div>
                ) : (
                  <p className="text-sm text-claude-text-muted">点击上传旧版本</p>
                )}
              </div>
            </div>

            {/* 新版本 */}
            <div>
              <label className="block text-sm font-medium text-claude-text-secondary mb-2">新版本</label>
              <div
                className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer border-claude-border-warm hover:border-claude-accent-primary hover:bg-claude-bg-warm transition-all"
                onClick={() => newFileInputRef.current?.click()}
              >
                <input
                  ref={newFileInputRef}
                  type="file"
                  accept=".docx,.doc,.txt,.md"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files[0], setNewDocContent, setNewDocName)}
                />
                {newDocName ? (
                  <div className="flex items-center justify-center gap-2 text-claude-text-primary">
                    <FileText className="w-4 h-4 text-claude-accent-primary" />
                    <span className="text-sm truncate">{newDocName}</span>
                  </div>
                ) : (
                  <p className="text-sm text-claude-text-muted">点击上传新版本</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 开始评审按钮 */}
        <button
          onClick={() => {
            if (reviewMode === 'full') runFullReview();
            else if (reviewMode === 'quick') runQuickReview();
            else runCompareReview();
          }}
          disabled={isReviewing || !apiStatus.hasApiKey}
          className="w-full flex items-center justify-center gap-2 py-3 bg-claude-accent-primary text-white rounded-xl font-medium hover:bg-claude-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
        >
          {isReviewing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              评审中...
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              开始{reviewMode === 'full' ? '完整' : reviewMode === 'quick' ? '快速' : '对比'}评审
            </>
          )}
        </button>

        {!apiStatus.hasApiKey && (
          <p className="text-center text-sm text-amber-600">
            请先<button onClick={() => setShowSettings(true)} className="underline hover:text-amber-700">配置API密钥</button>
          </p>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          </div>
        )}
      </div>

      {/* 右侧：评审结果 */}
      <div className="lg:col-span-2 space-y-6">
        {/* 进度显示 */}
        {isReviewing && reviewMode === 'full' && (
          <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 text-claude-accent-primary animate-spin" />
              <span className="font-medium text-claude-text-primary">正在评审...</span>
            </div>
            <div className="w-full bg-claude-bg-cream rounded-full h-2 mb-2">
              <div
                className="bg-claude-accent-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${reviewProgress}%` }}
              />
            </div>
            <p className="text-sm text-claude-text-secondary">{progressMessage}</p>
          </div>
        )}

        {/* 完整评审结果 */}
        {reviewReport && reviewMode === 'full' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            {/* 总览卡片 */}
            <div className={`bg-white rounded-xl shadow-claude border p-6 ${getScoreBg(reviewReport.overallScore)}`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-serif font-bold text-claude-text-primary">评审报告</h2>
                <button
                  onClick={exportReport}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-claude-border rounded-lg text-sm hover:bg-claude-bg-cream hover:text-claude-text-primary transition-all shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  导出报告
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* 总分 */}
                <div className="text-center p-4 bg-white/50 rounded-xl border border-claude-border-warm backdrop-blur-sm">
                  <div className={`text-4xl font-bold mb-1 ${getScoreColor(reviewReport.overallScore)}`}>
                    {reviewReport.overallScore}
                  </div>
                  <div className="text-sm text-claude-text-secondary">总分</div>
                </div>

                {/* 问题数 */}
                <div className="text-center p-4 bg-white/50 rounded-xl border border-claude-border-warm backdrop-blur-sm">
                  <div className="text-4xl font-bold text-claude-text-primary mb-1">
                    {reviewReport.issues?.length || 0}
                  </div>
                  <div className="text-sm text-claude-text-secondary">发现问题</div>
                </div>

                {/* 严重问题 */}
                <div className="text-center p-4 bg-white/50 rounded-xl border border-claude-border-warm backdrop-blur-sm">
                  <div className="text-4xl font-bold text-red-600 mb-1">
                    {reviewReport.summary?.criticalCount || 0}
                  </div>
                  <div className="text-sm text-claude-text-secondary">严重问题</div>
                </div>

                {/* 风险等级 */}
                <div className="text-center p-4 bg-white/50 rounded-xl border border-claude-border-warm backdrop-blur-sm">
                  <div className={`text-2xl font-bold mb-1 pt-1.5 ${RISK_CONFIG[reviewReport.riskAnalysis?.overallRiskLevel]?.color || 'text-claude-text-secondary'}`}>
                    {RISK_CONFIG[reviewReport.riskAnalysis?.overallRiskLevel]?.label || '未知'}
                  </div>
                  <div className="text-sm text-claude-text-secondary">风险等级</div>
                </div>
              </div>
            </div>

            {/* 维度得分 */}
            <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6">
              <h3 className="text-lg font-serif font-bold text-claude-text-primary mb-4">维度评分</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(reviewReport.dimensions || {}).map(([key, dim]) => {
                  const Icon = DIMENSION_ICONS[key] || Target;
                  return (
                    <div
                      key={key}
                      className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${getScoreBg(dim.score)}`}
                      onClick={() => toggleSection(`dim-${key}`)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-5 h-5 text-claude-text-secondary" />
                        <span className="font-medium text-claude-text-primary">{dim.dimensionName}</span>
                      </div>
                      <div className={`text-2xl font-bold mb-1 ${getScoreColor(dim.score)}`}>
                        {dim.score}分
                      </div>
                      <p className="text-xs text-claude-text-secondary mt-1 line-clamp-2">{dim.summary}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 问题列表 */}
            {reviewReport.issues?.length > 0 && (
              <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection('issues')}
                >
                  <h3 className="text-lg font-serif font-bold text-claude-text-primary flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    发现的问题 ({reviewReport.issues.length})
                  </h3>
                  {expandedSections['issues'] ? <ChevronUp className="text-claude-text-muted" /> : <ChevronDown className="text-claude-text-muted" />}
                </div>

                {expandedSections['issues'] && (
                  <div className="mt-4 space-y-3">
                    {reviewReport.issues.map((issue, idx) => {
                      const config = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.minor;
                      const Icon = config.icon;
                      return (
                        <div
                          key={idx}
                          className={`p-4 rounded-xl border ${config.color.replace('bg-', 'bg-opacity-10 ')}`}
                        >
                          <div className="flex items-start gap-3">
                            <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{issue.title}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-white/50 border border-black/5">
                                  {issue.dimension}
                                </span>
                              </div>
                              <p className="text-sm opacity-90">{issue.description}</p>
                              {issue.location && (
                                <p className="text-xs mt-1 opacity-75">位置: {issue.location}</p>
                              )}
                              {issue.recommendation && (
                                <p className="text-sm mt-2 p-2 bg-white/50 rounded-lg border border-black/5">
                                  💡 {issue.recommendation}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 风险分析 */}
            {reviewReport.riskAnalysis?.risks?.length > 0 && (
              <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection('risks')}
                >
                  <h3 className="text-lg font-serif font-bold text-claude-text-primary flex items-center gap-2">
                    <Shield className="w-5 h-5 text-red-500" />
                    风险分析 ({reviewReport.riskAnalysis.risks.length})
                  </h3>
                  {expandedSections['risks'] ? <ChevronUp className="text-claude-text-muted" /> : <ChevronDown className="text-claude-text-muted" />}
                </div>

                {expandedSections['risks'] && (
                  <div className="mt-4 space-y-3">
                    {reviewReport.riskAnalysis.risks.map((risk, idx) => (
                      <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-800">{risk.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            risk.probability === 'high' ? 'bg-red-100 text-red-700' :
                            risk.probability === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            概率: {risk.probability === 'high' ? '高' : risk.probability === 'medium' ? '中' : '低'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            risk.impact === 'high' ? 'bg-red-100 text-red-700' :
                            risk.impact === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            影响: {risk.impact === 'high' ? '高' : risk.impact === 'medium' ? '中' : '低'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{risk.description}</p>
                        {risk.mitigation && (
                          <p className="text-sm mt-2 p-2 bg-blue-50 rounded-lg text-blue-700 border border-blue-100">
                            缓解措施: {risk.mitigation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 改进建议 */}
            {reviewReport.suggestions?.length > 0 && (
              <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6">
                <h3 className="text-lg font-serif font-bold text-claude-text-primary mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  改进建议
                </h3>
                <div className="space-y-3">
                  {reviewReport.suggestions.map((sug, idx) => (
                    <div key={idx} className="p-4 bg-green-50 rounded-xl border border-green-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-green-800">{sug.dimension}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          sug.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {sug.priority === 'high' ? '高优先级' : '中优先级'}
                        </span>
                      </div>
                      <p className="text-sm text-green-700">{sug.suggestion}</p>
                      {sug.actions?.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {sug.actions.map((action, i) => (
                            <li key={i} className="text-sm text-green-600 flex items-start gap-2">
                              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 评审元数据 */}
            <div className="bg-claude-bg-cream rounded-xl p-4 text-sm text-claude-text-secondary flex items-center gap-4 border border-claude-border-warm">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                耗时: {((reviewReport.metadata?.reviewTime || 0) / 1000).toFixed(1)}秒
              </div>
              <div className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                文档长度: {reviewReport.metadata?.documentLength?.toLocaleString() || 0}字符
              </div>
            </div>
          </div>
        )}

        {/* 快速评审结果 */}
        {quickResult && reviewMode === 'quick' && (
          <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-serif font-bold text-claude-text-primary">快速评审结果</h2>
              <div className={`text-3xl font-bold ${getScoreColor(quickResult.quickScore)}`}>
                {quickResult.quickScore}分
              </div>
            </div>

            {/* 主要问题 */}
            {quickResult.topIssues?.length > 0 && (
              <div>
                <h3 className="font-medium text-claude-text-primary mb-2">主要问题</h3>
                <div className="space-y-2">
                  {quickResult.topIssues.map((issue, idx) => {
                    const config = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.minor;
                    return (
                      <div key={idx} className={`p-3 rounded-lg border ${config.color.replace('bg-', 'bg-opacity-10 ')}`}>
                        <div className="font-medium">{issue.title}</div>
                        <div className="text-sm opacity-90">{issue.description}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 缺失内容 */}
            {quickResult.missingContent?.length > 0 && (
              <div>
                <h3 className="font-medium text-claude-text-primary mb-2">缺失内容</h3>
                <ul className="space-y-1">
                  {quickResult.missingContent.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-claude-text-secondary">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 主要风险 */}
            {quickResult.mainRisk && (
              <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                <h3 className="font-medium text-red-800 mb-1">主要风险</h3>
                <p className="text-sm text-red-700">{quickResult.mainRisk}</p>
              </div>
            )}

            {/* 总体建议 */}
            {quickResult.recommendation && (
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <h3 className="font-medium text-blue-800 mb-1">总体建议</h3>
                <p className="text-sm text-blue-700">{quickResult.recommendation}</p>
              </div>
            )}
          </div>
        )}

        {/* 对比评审结果 */}
        {compareResult && reviewMode === 'compare' && (
          <div className="bg-white rounded-xl shadow-claude border border-claude-border p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-serif font-bold text-claude-text-primary">版本对比结果</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                compareResult.overallImpact === 'high' ? 'bg-red-100 text-red-700' :
                compareResult.overallImpact === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-green-100 text-green-700'
              }`}>
                变更影响: {compareResult.overallImpact === 'high' ? '高' : compareResult.overallImpact === 'medium' ? '中' : '低'}
              </span>
            </div>

            {/* 新增需求 */}
            {compareResult.addedRequirements?.length > 0 && (
              <div>
                <h3 className="font-medium text-green-700 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  新增需求 ({compareResult.addedRequirements.length})
                </h3>
                <div className="space-y-2">
                  {compareResult.addedRequirements.map((req, idx) => (
                    <div key={idx} className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="font-medium text-green-800">{req.title}</div>
                      <div className="text-sm text-green-700">{req.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 删除需求 */}
            {compareResult.removedRequirements?.length > 0 && (
              <div>
                <h3 className="font-medium text-red-700 mb-2 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  删除需求 ({compareResult.removedRequirements.length})
                </h3>
                <div className="space-y-2">
                  {compareResult.removedRequirements.map((req, idx) => (
                    <div key={idx} className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <div className="font-medium text-red-800">{req.title}</div>
                      <div className="text-sm text-red-700">{req.description}</div>
                      {req.risk && (
                        <div className="text-xs text-red-600 mt-1">风险: {req.risk}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 修改需求 */}
            {compareResult.modifiedRequirements?.length > 0 && (
              <div>
                <h3 className="font-medium text-amber-700 mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  修改需求 ({compareResult.modifiedRequirements.length})
                </h3>
                <div className="space-y-2">
                  {compareResult.modifiedRequirements.map((req, idx) => (
                    <div key={idx} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="font-medium text-amber-800">{req.title}</div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                        <div className="p-2 bg-white/50 rounded border border-amber-100">
                          <div className="text-xs text-amber-600 mb-1">旧版本</div>
                          <div className="text-amber-900">{req.oldVersion}</div>
                        </div>
                        <div className="p-2 bg-white/50 rounded border border-amber-100">
                          <div className="text-xs text-amber-600 mb-1">新版本</div>
                          <div className="text-amber-900">{req.newVersion}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 变更建议 */}
            {compareResult.recommendations?.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <h3 className="font-medium text-blue-800 mb-2">变更建议</h3>
                <ul className="space-y-1">
                  {compareResult.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-sm text-blue-700 flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 空状态 */}
        {!isReviewing && !reviewReport && !quickResult && !compareResult && (
          <div className="bg-white rounded-xl shadow-claude border border-claude-border p-12 text-center h-full flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-3xl bg-claude-bg-warm border border-claude-border shadow-sm flex items-center justify-center mb-6">
              <Search className="w-10 h-10 text-claude-text-light" />
            </div>
            <h3 className="text-xl font-serif font-medium text-claude-text-primary mb-2">准备开始评审</h3>
            <p className="text-claude-text-secondary max-w-xs mx-auto">
              上传需求文档，选择评审模式，点击开始评审。AI将从完整性、一致性等维度为您分析文档质量。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default RequirementReview;
