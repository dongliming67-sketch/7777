/**
 * 需求评审智能体模块
 * 自研智能体 - 对需求文档进行多维度智能评审
 * 
 * 功能特性：
 * 1. 完整性检查 - 检测需求是否完整、无遗漏
 * 2. 一致性检查 - 检测需求之间是否存在矛盾
 * 3. 可测试性检查 - 检测需求是否可验证
 * 4. 清晰度检查 - 检测需求描述是否清晰明确
 * 5. 可行性检查 - 检测需求是否技术可行
 * 6. 优先级建议 - 智能推荐需求优先级
 * 7. 风险识别 - 识别潜在的项目风险
 */

// ==================== 评审维度定义 ====================

const REVIEW_DIMENSIONS = {
  completeness: {
    name: '完整性',
    description: '检查需求是否完整，是否存在遗漏',
    weight: 0.20,
    checkPoints: [
      '功能需求是否完整覆盖业务场景',
      '非功能需求是否明确（性能、安全、可用性）',
      '边界条件和异常情况是否考虑',
      '用户角色和权限是否定义清楚',
      '数据需求是否完整'
    ]
  },
  consistency: {
    name: '一致性',
    description: '检查需求之间是否存在矛盾或冲突',
    weight: 0.20,
    checkPoints: [
      '术语使用是否一致',
      '功能描述是否前后一致',
      '数据定义是否一致',
      '业务规则是否存在冲突',
      '接口定义是否匹配'
    ]
  },
  testability: {
    name: '可测试性',
    description: '检查需求是否可验证、可测试',
    weight: 0.15,
    checkPoints: [
      '需求是否有明确的验收标准',
      '是否可以设计测试用例',
      '性能指标是否可量化',
      '预期结果是否明确',
      '边界值是否可测试'
    ]
  },
  clarity: {
    name: '清晰度',
    description: '检查需求描述是否清晰、无歧义',
    weight: 0.15,
    checkPoints: [
      '描述是否使用精确的语言',
      '是否避免模糊词汇（如"快速"、"友好"）',
      '业务流程是否清晰',
      '输入输出是否明确',
      '是否有必要的图表辅助说明'
    ]
  },
  feasibility: {
    name: '可行性',
    description: '检查需求是否技术可行、资源可达',
    weight: 0.15,
    checkPoints: [
      '技术实现是否可行',
      '时间和资源是否充足',
      '是否依赖外部系统或服务',
      '是否需要特殊硬件或软件',
      '团队是否具备相关技能'
    ]
  },
  traceability: {
    name: '可追溯性',
    description: '检查需求是否可追溯到业务目标',
    weight: 0.15,
    checkPoints: [
      '需求是否关联业务目标',
      '需求来源是否明确',
      '需求之间的依赖关系是否清晰',
      '是否可以追溯到用户故事',
      '变更历史是否可追踪'
    ]
  }
};

// ==================== 问题严重级别 ====================

const SEVERITY_LEVELS = {
  critical: { name: '严重', color: '#ef4444', priority: 1 },
  major: { name: '重要', color: '#f97316', priority: 2 },
  minor: { name: '一般', color: '#eab308', priority: 3 },
  suggestion: { name: '建议', color: '#3b82f6', priority: 4 }
};

// ==================== 核心评审函数 ====================

/**
 * 执行完整的需求评审
 * @param {Object} client - OpenAI客户端
 * @param {string} requirementDoc - 需求文档内容
 * @param {Object} options - 评审选项
 * @param {Function} progressCallback - 进度回调
 * @returns {Object} 评审报告
 */
async function reviewRequirementDocument(client, requirementDoc, options = {}, progressCallback = null) {
  console.log('🔍 启动需求评审智能体...');
  
  const startTime = Date.now();
  const report = {
    summary: null,
    dimensions: {},
    issues: [],
    suggestions: [],
    riskAnalysis: null,
    priorityRecommendations: [],
    overallScore: 0,
    metadata: {
      reviewTime: null,
      documentLength: requirementDoc.length,
      reviewDate: new Date().toISOString()
    }
  };

  try {
    // 阶段1：文档结构分析
    if (progressCallback) {
      progressCallback({
        phase: 'structure_analysis',
        message: '📊 分析文档结构...',
        progress: 10
      });
    }
    
    const structureAnalysis = await analyzeDocumentStructure(client, requirementDoc);
    report.structureAnalysis = structureAnalysis;

    // 阶段2：多维度评审
    let dimensionProgress = 15;
    const dimensionStep = 60 / Object.keys(REVIEW_DIMENSIONS).length;

    for (const [dimKey, dimension] of Object.entries(REVIEW_DIMENSIONS)) {
      if (progressCallback) {
        progressCallback({
          phase: 'dimension_review',
          dimension: dimension.name,
          message: `🔍 评审维度: ${dimension.name}...`,
          progress: Math.round(dimensionProgress)
        });
      }

      const dimResult = await reviewDimension(client, requirementDoc, dimKey, dimension, structureAnalysis);
      report.dimensions[dimKey] = dimResult;
      
      // 收集问题
      if (dimResult.issues && dimResult.issues.length > 0) {
        report.issues.push(...dimResult.issues.map(issue => ({
          ...issue,
          dimension: dimension.name
        })));
      }

      dimensionProgress += dimensionStep;
    }

    // 阶段3：风险分析
    if (progressCallback) {
      progressCallback({
        phase: 'risk_analysis',
        message: '⚠️ 识别项目风险...',
        progress: 80
      });
    }
    
    report.riskAnalysis = await analyzeRisks(client, requirementDoc, report.dimensions);

    // 阶段4：优先级建议
    if (progressCallback) {
      progressCallback({
        phase: 'priority_recommendation',
        message: '📋 生成优先级建议...',
        progress: 90
      });
    }
    
    report.priorityRecommendations = await generatePriorityRecommendations(client, requirementDoc, structureAnalysis);

    // 阶段5：生成改进建议
    if (progressCallback) {
      progressCallback({
        phase: 'suggestions',
        message: '💡 生成改进建议...',
        progress: 95
      });
    }
    
    report.suggestions = await generateImprovementSuggestions(client, report);

    // 计算总分
    report.overallScore = calculateOverallScore(report.dimensions);
    
    // 生成摘要
    report.summary = generateReviewSummary(report);

    // 按严重程度排序问题
    report.issues.sort((a, b) => {
      const priorityA = SEVERITY_LEVELS[a.severity]?.priority || 99;
      const priorityB = SEVERITY_LEVELS[b.severity]?.priority || 99;
      return priorityA - priorityB;
    });

    report.metadata.reviewTime = Date.now() - startTime;

    if (progressCallback) {
      progressCallback({
        phase: 'complete',
        message: '✅ 评审完成',
        progress: 100
      });
    }

    console.log(`✅ 需求评审完成，总分: ${report.overallScore}/100`);
    return report;

  } catch (error) {
    console.error('❌ 需求评审失败:', error);
    throw error;
  }
}

/**
 * 分析文档结构
 */
async function analyzeDocumentStructure(client, doc) {
  const prompt = `你是需求文档分析专家。请分析以下需求文档的结构特征。

## 文档内容
${doc.slice(0, 8000)}

## 分析任务
请识别并输出JSON格式：
\`\`\`json
{
  "documentType": "文档类型（如：需求规格说明书、用户故事、功能清单等）",
  "sections": [
    {"title": "章节标题", "level": 1, "hasContent": true}
  ],
  "functionalRequirements": ["识别到的功能需求列表"],
  "nonFunctionalRequirements": ["识别到的非功能需求"],
  "actors": ["识别到的用户角色"],
  "keyTerms": ["关键术语列表"],
  "estimatedComplexity": "low/medium/high"
}
\`\`\``;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        { role: 'system', content: '你是专业的需求分析师，擅长分析需求文档结构。请只输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return { documentType: '未知', sections: [], functionalRequirements: [], nonFunctionalRequirements: [] };
  } catch (error) {
    console.error('文档结构分析失败:', error);
    return { documentType: '未知', sections: [], functionalRequirements: [], nonFunctionalRequirements: [] };
  }
}

/**
 * 评审单个维度
 */
async function reviewDimension(client, doc, dimKey, dimension, structureAnalysis) {
  const prompt = `你是资深需求评审专家。请从【${dimension.name}】维度评审以下需求文档。

## 评审维度说明
${dimension.description}

## 检查要点
${dimension.checkPoints.map((cp, i) => `${i + 1}. ${cp}`).join('\n')}

## 文档内容
${doc.slice(0, 10000)}

## 输出要求
请输出JSON格式的评审结果：
\`\`\`json
{
  "score": 85,
  "summary": "该维度的整体评价（50字以内）",
  "strengths": ["优点1", "优点2"],
  "issues": [
    {
      "id": "ISS-001",
      "title": "问题标题",
      "description": "问题详细描述",
      "location": "问题所在位置（章节或段落）",
      "severity": "critical/major/minor/suggestion",
      "recommendation": "改进建议"
    }
  ],
  "checkResults": [
    {"point": "检查点描述", "passed": true, "comment": "检查结果说明"}
  ]
}
\`\`\`

注意：
- score范围0-100
- severity必须是critical/major/minor/suggestion之一
- 请基于文档实际内容进行评审，不要编造问题`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        { role: 'system', content: '你是专业的需求评审专家，擅长发现需求文档中的问题。请只输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 3000
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[1]);
      result.dimensionKey = dimKey;
      result.dimensionName = dimension.name;
      result.weight = dimension.weight;
      return result;
    }
    return {
      dimensionKey: dimKey,
      dimensionName: dimension.name,
      weight: dimension.weight,
      score: 70,
      summary: '评审完成',
      strengths: [],
      issues: [],
      checkResults: []
    };
  } catch (error) {
    console.error(`维度 ${dimension.name} 评审失败:`, error);
    return {
      dimensionKey: dimKey,
      dimensionName: dimension.name,
      weight: dimension.weight,
      score: 0,
      summary: '评审失败',
      strengths: [],
      issues: [{ title: '评审失败', description: error.message, severity: 'major' }],
      checkResults: []
    };
  }
}

/**
 * 风险分析
 */
async function analyzeRisks(client, doc, dimensionResults) {
  const issuesSummary = Object.values(dimensionResults)
    .flatMap(d => d.issues || [])
    .map(i => `- ${i.title}: ${i.description}`)
    .join('\n');

  const prompt = `你是项目风险分析专家。基于需求文档评审结果，识别潜在的项目风险。

## 已发现的问题
${issuesSummary || '暂无明显问题'}

## 文档摘要
${doc.slice(0, 5000)}

## 输出要求
请输出JSON格式的风险分析：
\`\`\`json
{
  "overallRiskLevel": "low/medium/high/critical",
  "risks": [
    {
      "id": "RISK-001",
      "title": "风险标题",
      "description": "风险描述",
      "probability": "low/medium/high",
      "impact": "low/medium/high",
      "category": "技术风险/业务风险/资源风险/进度风险/质量风险",
      "mitigation": "缓解措施"
    }
  ],
  "recommendations": ["总体建议1", "总体建议2"]
}
\`\`\``;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        { role: 'system', content: '你是专业的项目风险分析师。请只输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 2000
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return { overallRiskLevel: 'medium', risks: [], recommendations: [] };
  } catch (error) {
    console.error('风险分析失败:', error);
    return { overallRiskLevel: 'unknown', risks: [], recommendations: [] };
  }
}

/**
 * 生成优先级建议
 */
async function generatePriorityRecommendations(client, doc, structureAnalysis) {
  const requirements = structureAnalysis.functionalRequirements || [];
  if (requirements.length === 0) {
    return [];
  }

  const prompt = `你是产品经理，擅长需求优先级排序。请为以下需求提供优先级建议。

## 需求列表
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## 输出要求
请输出JSON格式：
\`\`\`json
{
  "prioritizedRequirements": [
    {
      "requirement": "需求描述",
      "priority": "P0/P1/P2/P3",
      "reason": "优先级理由",
      "dependencies": ["依赖的其他需求"],
      "estimatedEffort": "low/medium/high"
    }
  ],
  "mvpScope": ["建议纳入MVP的需求"],
  "deferrable": ["可延后的需求"]
}
\`\`\`

优先级说明：
- P0: 必须实现，核心功能
- P1: 重要功能，应优先实现
- P2: 一般功能，可适当延后
- P3: 锦上添花，资源充足时实现`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        { role: 'system', content: '你是专业的产品经理。请只输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 2000
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return [];
  } catch (error) {
    console.error('优先级建议生成失败:', error);
    return [];
  }
}

/**
 * 生成改进建议
 */
async function generateImprovementSuggestions(client, report) {
  const suggestions = [];
  
  // 基于各维度得分生成建议
  for (const [dimKey, dimResult] of Object.entries(report.dimensions)) {
    if (dimResult.score < 70) {
      suggestions.push({
        dimension: dimResult.dimensionName,
        priority: dimResult.score < 50 ? 'high' : 'medium',
        suggestion: `建议重点改进【${dimResult.dimensionName}】维度，当前得分${dimResult.score}分`,
        actions: dimResult.issues?.slice(0, 3).map(i => i.recommendation).filter(Boolean) || []
      });
    }
  }

  // 基于风险分析生成建议
  if (report.riskAnalysis?.risks?.length > 0) {
    const highRisks = report.riskAnalysis.risks.filter(r => r.probability === 'high' || r.impact === 'high');
    if (highRisks.length > 0) {
      suggestions.push({
        dimension: '风险管理',
        priority: 'high',
        suggestion: `发现${highRisks.length}个高风险项，建议优先处理`,
        actions: highRisks.map(r => r.mitigation).filter(Boolean)
      });
    }
  }

  return suggestions;
}

/**
 * 计算总分
 */
function calculateOverallScore(dimensions) {
  let totalWeight = 0;
  let weightedScore = 0;

  for (const dimResult of Object.values(dimensions)) {
    const weight = dimResult.weight || 0.1;
    const score = dimResult.score || 0;
    weightedScore += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
}

/**
 * 生成评审摘要
 */
function generateReviewSummary(report) {
  const score = report.overallScore;
  const issueCount = report.issues.length;
  const criticalCount = report.issues.filter(i => i.severity === 'critical').length;
  const majorCount = report.issues.filter(i => i.severity === 'major').length;

  let level = '优秀';
  if (score < 60) level = '需要重大改进';
  else if (score < 70) level = '需要改进';
  else if (score < 80) level = '良好';
  else if (score < 90) level = '很好';

  return {
    level,
    score,
    issueCount,
    criticalCount,
    majorCount,
    riskLevel: report.riskAnalysis?.overallRiskLevel || 'unknown',
    topIssues: report.issues.slice(0, 5).map(i => i.title),
    dimensionScores: Object.entries(report.dimensions).map(([key, dim]) => ({
      name: dim.dimensionName,
      score: dim.score
    }))
  };
}

/**
 * 快速评审 - 轻量级评审，只检查关键问题
 */
async function quickReview(client, requirementDoc) {
  console.log('⚡ 执行快速评审...');

  const prompt = `你是需求评审专家。请快速评审以下需求文档，识别最关键的问题。

## 文档内容
${requirementDoc.slice(0, 12000)}

## 评审要求
请快速识别以下方面的问题：
1. 最严重的3个问题
2. 最需要补充的内容
3. 最大的风险点

## 输出格式
\`\`\`json
{
  "quickScore": 75,
  "topIssues": [
    {"title": "问题标题", "severity": "critical/major/minor", "description": "问题描述"}
  ],
  "missingContent": ["缺失的内容1", "缺失的内容2"],
  "mainRisk": "主要风险描述",
  "recommendation": "总体建议（100字以内）"
}
\`\`\``;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        { role: 'system', content: '你是专业的需求评审专家。请只输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1500
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return { quickScore: 70, topIssues: [], missingContent: [], mainRisk: '未知', recommendation: '建议进行完整评审' };
  } catch (error) {
    console.error('快速评审失败:', error);
    throw error;
  }
}

/**
 * 对比评审 - 对比两个版本的需求文档
 */
async function compareReview(client, oldDoc, newDoc) {
  console.log('🔄 执行对比评审...');

  const prompt = `你是需求变更分析专家。请对比分析以下两个版本的需求文档。

## 旧版本
${oldDoc.slice(0, 6000)}

## 新版本
${newDoc.slice(0, 6000)}

## 分析要求
1. 识别新增的需求
2. 识别删除的需求
3. 识别修改的需求
4. 评估变更的影响

## 输出格式
\`\`\`json
{
  "addedRequirements": [{"title": "新增需求", "description": "描述", "impact": "low/medium/high"}],
  "removedRequirements": [{"title": "删除需求", "description": "描述", "risk": "删除风险说明"}],
  "modifiedRequirements": [{"title": "修改需求", "oldVersion": "旧描述", "newVersion": "新描述", "changeType": "扩展/缩减/重写"}],
  "overallImpact": "low/medium/high",
  "recommendations": ["变更建议1", "变更建议2"]
}
\`\`\``;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        { role: 'system', content: '你是专业的需求变更分析师。请只输出JSON格式。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2500
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return { addedRequirements: [], removedRequirements: [], modifiedRequirements: [], overallImpact: 'unknown', recommendations: [] };
  } catch (error) {
    console.error('对比评审失败:', error);
    throw error;
  }
}

// ==================== 导出模块 ====================

module.exports = {
  reviewRequirementDocument,
  quickReview,
  compareReview,
  REVIEW_DIMENSIONS,
  SEVERITY_LEVELS
};
