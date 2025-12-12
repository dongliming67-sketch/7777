import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Bot,
  User,
  Loader2,
  Trash2,
  Copy,
  Check,
  Info,
  Cpu,
  Database,
  Zap,
  Brain
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function ChatAgent({ apiStatus, setShowSettings }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [aiInfo, setAiInfo] = useState(null);
  const [showInfo, setShowInfo] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/chat/info`)
      .then(res => res.json())
      .then(data => setAiInfo(data))
      .catch(err => console.error('获取AI信息失败:', err));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isLoading) return;
    const userMessage = inputText.trim();
    setInputText('');
    setIsLoading(true);
    setStreamingContent('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: userMessage })
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
              if (parsed.type === 'content') {
                fullContent += parsed.content;
                setStreamingContent(fullContent);
              }
            } catch (e) {}
          }
        }
      }
      setMessages(prev => [...prev, { role: 'assistant', content: fullContent }]);
      setStreamingContent('');
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 错误: ${error.message}`, isError: true }]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, sessionId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyMessage = (content, index) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const clearChat = async () => {
    setMessages([]);
    setStreamingContent('');
    try {
      await fetch(`${API_BASE}/api/chat/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    } catch (e) {}
  };

  const quickQuestions = [
    '你能做什么？',
    '什么是变量？',
    '什么是函数？',
    'React和Vue有什么区别？',
    '帮我写一个排序的代码',
    '1+2*3等于多少？',
    '现在几点了？'
  ];

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Brain className="w-7 h-7" />
            </div>
            <div>
              <h2 className="font-bold text-lg">智器云AI助手</h2>
              <p className="text-white/80 text-xs">完全自研 · 不依赖外部API</p>
            </div>
          </div>
          <p className="text-sm text-white/90">完全自主实现的AI对话系统，所有算法从零编写。</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-500" />核心模块
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg"><span className="w-2 h-2 bg-blue-500 rounded-full"></span>NLU引擎 - 意图识别</div>
            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg"><span className="w-2 h-2 bg-green-500 rounded-full"></span>对话管理 - 状态机</div>
            <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg"><span className="w-2 h-2 bg-purple-500 rounded-full"></span>知识库 - 知识检索</div>
            <div className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg"><span className="w-2 h-2 bg-orange-500 rounded-full"></span>NLG引擎 - 回复生成</div>
            <div className="flex items-center gap-2 p-2 bg-pink-50 rounded-lg"><span className="w-2 h-2 bg-pink-500 rounded-full"></span>技能系统 - 计算/代码</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />试试问我
          </h3>
          <div className="space-y-2">
            {quickQuestions.map((q, idx) => (
              <button key={idx} onClick={() => setInputText(q)} className="w-full text-left text-sm p-2 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors truncate">{q}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">智器云自研AI</h2>
              <p className="text-xs text-gray-500">100%自主实现 · 无外部依赖</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowInfo(!showInfo)} className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg"><Info className="w-5 h-5" /></button>
            <button onClick={clearChat} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-5 h-5" /></button>
          </div>
        </div>

        {showInfo && aiInfo && (
          <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100">
            <h3 className="font-medium text-indigo-800 mb-2">{aiInfo.name} v{aiInfo.version}</h3>
            <p className="text-sm text-indigo-700">{aiInfo.description}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && !streamingContent && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-3xl flex items-center justify-center mb-6">
                <Brain className="w-12 h-12 text-indigo-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3">智器云自研AI助手</h3>
              <p className="text-gray-500 max-w-md mb-6">完全自主实现的AI对话系统<br /><span className="text-indigo-600 font-medium">所有代码从零编写，不调用任何外部大模型API！</span></p>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div className="p-3 bg-blue-50 rounded-xl text-left"><div className="text-blue-600 font-medium text-sm mb-1">💡 知识问答</div><div className="text-xs text-gray-600">编程概念、技术框架</div></div>
                <div className="p-3 bg-green-50 rounded-xl text-left"><div className="text-green-600 font-medium text-sm mb-1">💻 代码生成</div><div className="text-xs text-gray-600">多种语言代码示例</div></div>
                <div className="p-3 bg-purple-50 rounded-xl text-left"><div className="text-purple-600 font-medium text-sm mb-1">🧮 数学计算</div><div className="text-xs text-gray-600">四则运算计算器</div></div>
                <div className="p-3 bg-orange-50 rounded-xl text-left"><div className="text-orange-600 font-medium text-sm mb-1">🕐 日期时间</div><div className="text-xs text-gray-600">当前时间查询</div></div>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
                {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
              </div>
              <div className={`flex-1 max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                <div className={`inline-block p-4 rounded-2xl ${msg.role === 'user' ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white' : msg.isError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-800'}`}>
                  {msg.role === 'user' ? <p className="whitespace-pre-wrap">{msg.content}</p> : <div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>}
                </div>
                {msg.role === 'assistant' && !msg.isError && (
                  <button onClick={() => copyMessage(msg.content, idx)} className="mt-2 text-gray-400 hover:text-gray-600 text-sm flex items-center gap-1">
                    {copiedIndex === idx ? <><Check className="w-3 h-3" />已复制</> : <><Copy className="w-3 h-3" />复制</>}
                  </button>
                )}
              </div>
            </div>
          ))}

          {streamingContent && (
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0"><Bot className="w-5 h-5 text-white" /></div>
              <div className="flex-1 max-w-[80%]"><div className="inline-block p-4 rounded-2xl bg-gray-100 text-gray-800"><div className="prose prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown></div></div></div>
            </div>
          )}

          {isLoading && !streamingContent && (
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0"><Bot className="w-5 h-5 text-white" /></div>
              <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /><span>正在思考...</span></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-end gap-3">
            <textarea ref={inputRef} value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown} placeholder="输入消息... (Shift+Enter换行)" className="flex-1 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" rows={1} style={{ minHeight: '48px', maxHeight: '200px' }} disabled={isLoading} />
            <button onClick={sendMessage} disabled={!inputText.trim() || isLoading} className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">🧠 智器云自研AI · 完全自主实现 · 不依赖外部大模型API</p>
        </div>
      </div>
    </div>
  );
}

export default ChatAgent;