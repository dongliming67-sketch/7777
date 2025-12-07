/**
 * 增强版COSMIC转需求规格书生成器 - 主集成模块
 * 集成深度理解、智能推理和质量检查功能
 */

const { deepAnalyzeTemplate } = require('./deepUnderstanding');
const { intelligentReasoningForFunction, analyzeDataFlow } = require('./intelligentReasoning');
const { comprehensiveQualityCheck } = require('./qualityCheck');

/**
 * 增强版生成流程
 * 
 * @param {Object} client - OpenAI客户端
 * @param {Object} cosmicData - COSMIC拆分数据 {功能过程名: [数据移动行]}
 * @param {Object} templateAnalysis - 模板分析结果
 * @param {Object} requirementDoc - 原始需求文档
 * @param {Function} progressCallback - 进度回调函数
 */
async function enhancedGenerateRequirementSpec(client, cosmicData, templateAnalysis, requirementDoc, progressCallback) {
    console.log('🚀 启动增强版需求规格书生成流程...');

    const context = {
        requirementDoc,
        templateAnalysis,
        cosmicData
    };

    let generatedContent = '';
    const generationLog = [];

    try {
        // ========== 阶段1：深度理解模板 ==========
        if (progressCallback) {
            progressCallback({
                phase: 'deep_analyze_template',
                message: '🧠 深度理解模板结构和要求...',
                progress: 10
            });
        }

        let deepTemplateUnderstanding = null;
        if (templateAnalysis && templateAnalysis.originalTemplateText) {
            const templateSections = templateAnalysis.sections || [];
            deepTemplateUnderstanding = await deepAnalyzeTemplate(
                client,
                templateAnalysis.originalTemplateText,
                templateSections
            );

            context.deepTemplateUnderstanding = deepTemplateUnderstanding;
            generationLog.push({
                phase: '深度模板分析',
                status: '完成',
                details: '已完成多维度模板分析'
            });
        }

        // ========== 阶段2：智能推理功能需求内容 ==========
        if (progressCallback) {
            progressCallback({
                phase: 'intelligent_reasoning',
                message: '💡 智能推理功能需求内容...',
                progress: 25
            });
        }

        const functionalProcesses = Object.keys(cosmicData);
        const reasoningResults = {};

        let processedCount = 0;
        for (const funcName of functionalProcesses) {
            const functionInfo = {
                name: funcName,
                cosmicData: cosmicData[funcName]
            };

            reasoningResults[funcName] = await intelligentReasoningForFunction(
                client,
                functionInfo,
                context
            );

            processedCount++;
            if (progressCallback && processedCount % 3 === 0) {
                progressCallback({
                    phase: 'intelligent_reasoning',
                    message: `💡 智能推理 (${processedCount}/${functionalProcesses.length})...`,
                    progress: 25 + (processedCount / functionalProcesses.length) * 20
                });
            }
        }

        context.reasoningResults = reasoningResults;
        generationLog.push({
            phase: '智能推理',
            status: '完成',
            details: `已完成${functionalProcesses.length}个功能的内容推理`
        });

        // ========== 阶段3：生成文档前置章节 ==========
        if (progressCallback) {
            progressCallback({
                phase: 'generate_header',
                message: '📝 生成文档前置章节...',
                progress: 50
            });
        }

        const headerContent = await generateHeaderChapters(
            client,
            context,
            templateAnalysis
        );
        generatedContent += headerContent + '\n\n';

        generationLog.push({
            phase: '前置章节生成',
            status: '完成',
            length: headerContent.length
        });

        // ========== 阶段4：生成功能需求章节 ==========
        if (progressCallback) {
            progressCallback({
                phase: 'generate_functions',
                message: '🔧 生成功能需求章节...',
                progress: 60
            });
        }

        const functionalChapterNum = templateAnalysis?.functionalChapter?.number || '5';
        generatedContent += `# ${functionalChapterNum} 功能需求\n\n`;

        // 对功能进行分类（子系统 -> 功能模块 -> 功能过程）
        const classification = await classifyFunctions(client, functionalProcesses, context);

        let funcIndex = 1;
        for (const [subsystem, modules] of Object.entries(classification)) {
            // 生成子系统章节
            generatedContent += `## ${functionalChapterNum}.${funcIndex} ${subsystem}\n\n`;

            let moduleIndex = 1;
            for (const [module, functions] of Object.entries(modules)) {
                // 生成功能模块章节
                generatedContent += `### ${functionalChapterNum}.${funcIndex}.${moduleIndex} ${module}\n\n`;

                let functionIndex = 1;
                for (const funcName of functions) {
                    // 生成具体功能过程
                    const funcContent = await generateFunctionContent(
                        client,
                        funcName,
                        reasoningResults[funcName],
                        context,
                        `${functionalChapterNum}.${funcIndex}.${moduleIndex}.${functionIndex}`
                    );

                    generatedContent += funcContent + '\n\n';
                    functionIndex++;

                    if (progressCallback && functionIndex % 2 === 0) {
                        const totalProgress = 60 + ((funcIndex / functionalProcesses.length) * 30);
                        progressCallback({
                            phase: 'generate_functions',
                            message: `🔧 生成功能 ${funcIndex}/${functionalProcesses.length}...`,
                            progress: totalProgress
                        });
                    }
                }

                moduleIndex++;
            }

            funcIndex++;
        }

        generationLog.push({
            phase: '功能需求生成',
            status: '完成',
            functionsGenerated: functionalProcesses.length
        });

        // ========== 阶段5：生成文档后置章节 ==========
        if (progressCallback) {
            progressCallback({
                phase: 'generate_footer',
                message: '📋 生成文档后置章节...',
                progress: 92
            });
        }

        const footerContent = await generateFooterChapters(
            client,
            context,
            templateAnalysis
        );
        generatedContent += footerContent;

        generationLog.push({
            phase: '后置章节生成',
            status: '完成',
            length: footerContent.length
        });

        // ========== 阶段6：质量检查与优化 ==========
        if (progressCallback) {
            progressCallback({
                phase: 'quality_check',
                message: '🔍 进行质量检查...',
                progress: 95
            });
        }

        const qualityReport = await comprehensiveQualityCheck(
            client,
            generatedContent,
            templateAnalysis,
            cosmicData
        );

        generationLog.push({
            phase: '质量检查',
            status: '完成',
            score: qualityReport.overallScore,
            issues: qualityReport.issues.length
        });

        // ========== 阶段7：根据质量报告优化（如果分数低于80） ==========
        if (qualityReport.overallScore < 80) {
            if (progressCallback) {
                progressCallback({
                    phase: 'optimization',
                    message: '✨ 根据质量报告优化文档...',
                    progress: 97
                });
            }

            generatedContent = await optimizeContentBasedOnQuality(
                client,
                generatedContent,
                qualityReport,
                context
            );

            generationLog.push({
                phase: '内容优化',
                status: '完成',
                optimized: true
            });
        }

        // ========== 完成 ==========
        if (progressCallback) {
            progressCallback({
                phase: 'complete',
                message: '✅ 生成完成！',
                progress: 100
            });
        }

        console.log('✅ 增强版需求规格书生成完成');
        console.log(`📊 文档长度: ${generatedContent.length} 字符`);
        console.log(`📊 质量分数: ${qualityReport.overallScore}/100`);

        return {
            content: generatedContent,
            qualityReport,
            generationLog,
            metadata: {
                totalFunctions: functionalProcesses.length,
                generatedAt: new Date().toISOString(),
                version: '2.0-enhanced'
            }
        };

    } catch (error) {
        console.error('❌ 生成过程出错:', error);
        throw error;
    }
}

/**
 * 生成前置章节
 */
async function generateHeaderChapters(client, context, templateAnalysis) {
    const { requirementDoc } = context;
    const projectInfo = requirementDoc?.aiAnalysis || {};

    const funcChapterNum = templateAnalysis?.functionalChapter?.number || '5';
    const funcChapterIndex = parseInt(funcChapterNum) - 1;

    let content = '';

    // 概述章节
    content += `# 1 概述\n\n`;
    content += `## 1.1 项目背景\n\n`;
    content += `${projectInfo.projectDescription || '本项目旨在构建一个先进的业务系统，满足日益增长的业务需求。'}\n\n`;

    content += `## 1.2 系统目标\n\n`;
    if (projectInfo.businessGoals && projectInfo.businessGoals.length > 0) {
        projectInfo.businessGoals.forEach((goal, idx) => {
            content += `${idx + 1}. ${goal}\n`;
        });
    } else {
        content += `1. 提升业务处理效率\n`;
        content += `2. 优化用户体验\n`;
        content += `3. 确保系统稳定性和安全性\n`;
    }
    content += `\n`;

    // 如果有更多前置章节，继续生成
    for (let i = 2; i < funcChapterIndex; i++) {
        content += `# ${i} 章节${i}\n\n`;
        content += `（此处为模板章节 ${i}的内容）\n\n`;
    }

    return content;
}

/**
 * 对功能进行智能分类
 */
async function classifyFunctions(client, functionalProcesses, context) {
    // 简化版分类：将所有功能放在一个子系统下
    const classification = {
        '核心业务功能': {
            '业务管理': functionalProcesses
        }
    };

    // TODO: 未来可以使用AI进行更智能的分类

    return classification;
}

/**
 * 生成单个功能的内容
 */
async function generateFunctionContent(client, funcName, reasoningResult, context, numberPrefix) {
    let content = `#### ${numberPrefix} ${funcName}\n\n`;

    // 功能说明
    content += `##### ${numberPrefix}.1 功能说明\n\n`;
    if (reasoningResult && reasoningResult.inferredContent.functionDescription) {
        content += `${reasoningResult.inferredContent.functionDescription}\n\n`;
    } else {
        content += `本功能用于${funcName}。\n\n`;
    }

    // 业务规则
    content += `##### ${numberPrefix}.2 业务规则\n\n`;
    if (reasoningResult && reasoningResult.inferredContent.businessRules &&
        reasoningResult.inferredContent.businessRules.length > 0) {
        content += `| 规则编号 | 规则名称 | 触发条件 | 处理逻辑 |\n`;
        content += `|----------|----------|----------|----------|\n`;
        reasoningResult.inferredContent.businessRules.forEach((rule, idx) => {
            content += `| BR-${String(idx + 1).padStart(3, '0')} | ${rule.name || '规则' + (idx + 1)} | ${rule.condition || '待定义'} | ${rule.logic || '待定义'} |\n`;
        });
        content += `\n`;
    } else {
        content += `（业务规则待补充）\n\n`;
    }

    // 处理数据
    content += `##### ${numberPrefix}.3 处理数据\n\n`;
    if (reasoningResult && reasoningResult.inferredContent.dataItems &&
        reasoningResult.inferredContent.dataItems.length > 0) {
        content += `| 字段名 | 类型 | 长度 | 必填 | 说明 |\n`;
        content += `|--------|------|------|------|------|\n`;
        reasoningResult.inferredContent.dataItems.forEach(item => {
            content += `| ${item.fieldName} | ${item.fieldType} | ${item.length} | ${item.required} | ${item.description} |\n`;
        });
        content += `\n`;
    } else {
        content += `（数据项待补充）\n\n`;
    }

    // 接口设计
    content += `##### ${numberPrefix}.4 接口设计\n\n`;
    if (reasoningResult && reasoningResult.inferredContent.interfaceDefinition) {
        const intf = reasoningResult.inferredContent.interfaceDefinition;
        content += `**接口名称**: ${funcName}接口\n\n`;
        content += `**请求方式**: ${intf.method}\n\n`;
        content += `**请求URL**: ${intf.url}\n\n`;

        if (intf.requestParams && intf.requestParams.length > 0) {
            content += `**请求参数**:\n\n`;
            content += `| 参数名 | 类型 | 必填 | 说明 |\n`;
            content += `|--------|------|------|------|\n`;
            intf.requestParams.forEach(param => {
                content += `| ${param.paramName} | ${param.paramType} | ${param.required} | ${param.description} |\n`;
            });
            content += `\n`;
        }

        if (intf.responseParams && intf.responseParams.length > 0) {
            content += `**响应参数**:\n\n`;
            content += `| 参数名 | 类型 | 说明 |\n`;
            content += `|--------|------|------|\n`;
            intf.responseParams.forEach(param => {
                content += `| ${param.paramName} | ${param.paramType} | ${param.description} |\n`;
            });
            content += `\n`;
        }
    } else {
        content += `（接口设计待补充）\n\n`;
    }

    // 界面设计
    content += `##### ${numberPrefix}.5 界面设计\n\n`;
    if (reasoningResult && reasoningResult.inferredContent.uiElements) {
        const ui = reasoningResult.inferredContent.uiElements;
        content += `**输入字段**:\n`;
        ui.inputFields.forEach(field => {
            content += `- ${field.label} (${field.type})${field.required ? ' *必填' : ''}\n`;
        });
        content += `\n**操作按钮**:\n`;
        ui.buttons.forEach(btn => {
            content += `- ${btn.label}\n`;
        });
        content += `\n`;
    } else {
        content += `（界面设计待补充）\n\n`;
    }

    // 验收标准
    content += `##### ${numberPrefix}.6 验收标准\n\n`;
    if (reasoningResult && reasoningResult.inferredContent.acceptanceCriteria &&
        reasoningResult.inferredContent.acceptanceCriteria.length > 0) {
        content += `| 编号 | 测试场景 | 前置条件 | 操作步骤 | 预期结果 |\n`;
        content += `|------|----------|----------|----------|----------|\n`;
        reasoningResult.inferredContent.acceptanceCriteria.forEach(criteria => {
            content += `| ${criteria.id} | ${criteria.scenario} | ${criteria.precondition} | ${criteria.steps.join('; ')} | ${criteria.expected} |\n`;
        });
        content += `\n`;
    } else {
        content += `（验收标准待补充）\n\n`;
    }

    return content;
}

/**
 * 生成后置章节
 */
async function generateFooterChapters(client, context, templateAnalysis) {
    let content = '';

    const funcChapterNum = templateAnalysis?.functionalChapter?.number || '5';
    const nextChapterNum = parseInt(funcChapterNum) + 1;

    // 系统需求章节
    content += `# ${nextChapterNum} 系统需求\n\n`;
    content += `## ${nextChapterNum}.1 性能要求\n\n`;
    content += `1. 系统响应时间应在3秒以内\n`;
    content += `2. 支持至少1000并发用户\n`;
    content += `3. 数据库查询优化，常用查询在1秒内完成\n\n`;

    content += `## ${nextChapterNum}.2 安全要求\n\n`;
    content += `1. 所有用户操作需要身份认证\n`;
    content += `2. 敏感数据需加密存储\n`;
    content += `3. 系统日志记录所有关键操作\n\n`;

    // 附录
    content += `# ${nextChapterNum + 1} 附录\n\n`;
    content += `## ${nextChapterNum + 1}.1 术语表\n\n`;
    content += `| 术语 | 说明 |\n`;
    content += `|------|------|\n`;
    content += `| COSMIC | 国际标准的功能规模度量方法 |\n`;
    content += `| CFP | COSMIC功能点 |\n\n`;

    return content;
}

/**
 * 根据质量报告优化内容
 */
async function optimizeContentBasedOnQuality(client, content, qualityReport, context) {
    console.log('⚡ 开始优化内容...');

    // 针对发现的主要问题进行优化
    const majorIssues = qualityReport.issues.slice(0, 5);

    if (majorIssues.length === 0) {
        return content;
    }

    const prompt = `你是文档优化专家。请根据质量检查发现的问题，优化以下文档片段。

## 【发现的问题】
${majorIssues.join('\n')}

## 【文档片段】（前10000字符）
${content.slice(0, 10000)}

## 【优化要求】
1. 针对上述问题进行修正
2. 保持文档结构不变
3. 只修改有问题的部分
4. 输出优化后的内容

请输出优化建议（JSON格式）：
\`\`\`json
{
  "optimizations": [
    {
      "issue": "问题描述",
      "original": "原文",
      "optimized": "优化后"
    }
  ]
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是文档优化专家。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 3000
        });

        const responseText = response.choices[0].message.content;
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/) || responseText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const optimizationResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);

            // 应用优化
            let optimizedContent = content;
            if (optimizationResult.optimizations) {
                optimizationResult.optimizations.forEach(opt => {
                    if (opt.original && opt.optimized) {
                        optimizedContent = optimizedContent.replace(opt.original, opt.optimized);
                    }
                });
            }

            console.log(`✅ 已应用${optimizationResult.optimizations?.length || 0}个优化`);
            return optimizedContent;
        }
    } catch (error) {
        console.error('优化过程出错:', error.message);
    }

    return content; // 如果优化失败，返回原内容
}

// ==================== 导出 ====================

module.exports = {
    enhancedGenerateRequirementSpec
};
