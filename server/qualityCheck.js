/**
 * 质量自检与优化模块
 * 对生成的需求规格说明书进行多维度质量检查和优化
 */

// ==================== 质量检查 ====================

/**
 * 综合质量检查
 * 检查生成的文档是否符合标准
 */
async function comprehensiveQualityCheck(client, generatedContent, templateAnalysis, cosmicData) {
    console.log('🔍 开始综合质量检查...');

    const qualityReport = {
        overallScore: 0,
        checks: {
            structuralIntegrity: null,      // 结构完整性
            contentCompleteness: null,       // 内容完整性
            templateCompliance: null,        // 模板符合度
            dataConsistency: null,           // 数据一致性
            languageQuality: null,           // 语言质量
            formatCorrectness: null          // 格式正确性
        },
        issues: [],
        suggestions: [],
        passedChecks: [],
        failedChecks: []
    };

    try {
        // ========== 检查1：结构完整性 ==========
        console.log('📊 检查结构完整性...');
        qualityReport.checks.structuralIntegrity = checkStructuralIntegrity(
            generatedContent,
            templateAnalysis
        );

        // ========== 检查2：内容完整性 ==========
        console.log('📝 检查内容完整性...');
        qualityReport.checks.contentCompleteness = checkContentCompleteness(
            generatedContent,
            cosmicData
        );

        // ========== 检查3：模板符合度 ==========
        console.log('📋 检查模板符合度...');
        qualityReport.checks.templateCompliance = await checkTemplateCompliance(
            client,
            generatedContent,
            templateAnalysis
        );

        // ========== 检查4：数据一致性 ==========
        console.log('🔗 检查数据一致性...');
        qualityReport.checks.dataConsistency = checkDataConsistency(
            generatedContent,
            cosmicData
        );

        // ========== 检查5：语言质量 ==========
        console.log('✍️ 检查语言质量...');
        qualityReport.checks.languageQuality = await checkLanguageQuality(
            client,
            generatedContent
        );

        // ========== 检查6：格式正确性 ==========
        console.log('🎨 检查格式正确性...');
        qualityReport.checks.formatCorrectness = checkFormatCorrectness(
            generatedContent
        );

        // ========== 汇总结果 ==========
        qualityReport = summarizeQualityReport(qualityReport);

        console.log(`✅ 质量检查完成，总分: ${qualityReport.overallScore}/100`);
        return qualityReport;

    } catch (error) {
        console.error('❌ 质量检查失败:', error.message);
        return qualityReport;
    }
}

/**
 * 检查1：结构完整性
 * 检查文档是否包含所有必需的章节
 */
function checkStructuralIntegrity(content, templateAnalysis) {
    const result = {
        score: 100,
        issues: [],
        details: {}
    };

    if (!templateAnalysis || !templateAnalysis.allChapters) {
        result.score = 50;
        result.issues.push('缺少模板分析数据，无法准确检查');
        return result;
    }

    const requiredChapters = templateAnalysis.allChapters.filter(c =>
        c.level === 1 || (c.level === 2 && c.required !== false)
    );

    const missingChapters = [];
    requiredChapters.forEach(chapter => {
        const pattern = new RegExp(`#{1,${chapter.level}}\\s*${escapeRegExp(chapter.number)}\\s*${escapeRegExp(chapter.title)}`);
        if (!pattern.test(content)) {
            missingChapters.push(`${chapter.number} ${chapter.title}`);
            result.score -= 10;
        }
    });

    if (missingChapters.length > 0) {
        result.issues.push(`缺少章节: ${missingChapters.join('、')}`);
    }

    result.details.totalRequired = requiredChapters.length;
    result.details.missing = missingChapters.length;
    result.details.present = requiredChapters.length - missingChapters.length;

    return result;
}

/**
 * 检查2：内容完整性
 * 检查每个章节是否有实质性内容
 */
function checkContentCompleteness(content, cosmicData) {
    const result = {
        score: 100,
        issues: [],
        details: {}
    };

    // 提取所有章节
    const chapters = extractChaptersFromContent(content);
    let emptyChapters = 0;
    let insufficientChapters = 0;

    chapters.forEach(chapter => {
        const contentLength = chapter.content.length;

        if (contentLength < 50) {
            emptyChapters++;
            result.issues.push(`章节 "${chapter.title}" 内容为空或过少（${contentLength}字符）`);
            result.score -= 5;
        } else if (contentLength < 200 && chapter.level <= 2) {
            insufficientChapters++;
            result.issues.push(`章节 "${chapter.title}" 内容不足（${contentLength}字符）`);
            result.score -= 3;
        }
    });

    // 检查是否包含占位符
    const placeholders = findPlaceholders(content);
    if (placeholders.length > 0) {
        result.issues.push(`发现${placeholders.length}个占位符: ${placeholders.slice(0, 5).join('、')}`);
        result.score -= placeholders.length * 2;
    }

    // 检查功能需求是否对应COSMIC数据
    if (cosmicData && Object.keys(cosmicData).length > 0) {
        const functionalProcessCount = Object.keys(cosmicData).length;
        const functionsInDoc = countFunctionsInDocument(content);

        if (functionsInDoc < functionalProcessCount * 0.8) {
            result.issues.push(`文档中的功能数量（${functionsInDoc}）少于COSMIC数据（${functionalProcessCount}）`);
            result.score -= 10;
        }

        result.details.expectedFunctions = functionalProcessCount;
        result.details.actualFunctions = functionsInDoc;
    }

    result.details.totalChapters = chapters.length;
    result.details.emptyChapters = emptyChapters;
    result.details.insufficientChapters = insufficientChapters;

    result.score = Math.max(0, result.score);
    return result;
}

/**
 * 检查3：模板符合度
 * 使用AI检查内容是否符合模板要求
 */
async function checkTemplateCompliance(client, content, templateAnalysis) {
    const result = {
        score: 100,
        issues: [],
        details: {}
    };

    if (!client || !templateAnalysis) {
        result.score = 60;
        result.issues.push('无法进行AI符合度检查');
        return result;
    }

    try {
        const sampleContent = content.slice(0, 8000); // 取样检查
        const templateSample = templateAnalysis.originalTemplateText?.slice(0, 5000) || '';

        const prompt = `你是文档质量检查专家。请对比生成的文档与模板，检查符合度。

## 【模板参考】
${templateSample}

## 【生成的文档（样本）】
${sampleContent}

## 【检查要点】
1. 章节编号格式是否一致？
2. 标题格式是否一致？
3. 表格结构是否符合模板？
4. 语言风格是否一致？
5. 内容组织方式是否符合模板？

请输出JSON格式：
\`\`\`json
{
  "complianceScore": 0-100的分数,
  "issues": ["问题列表"],
  "strengths": ["符合的地方"]
}
\`\`\``;

        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是文档质量检查专家。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 1500
        });

        const responseText = response.choices[0].message.content;
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/) || responseText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const checkResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            result.score = checkResult.complianceScore || 70;
            result.issues = checkResult.issues || [];
            result.details.strengths = checkResult.strengths || [];
        }

    } catch (error) {
        console.error('模板符合度检查失败:', error.message);
        result.score = 70;
        result.issues.push('AI检查失败，使用默认分数');
    }

    return result;
}

/**
 * 检查4：数据一致性
 * 检查文档中的数据是否一致（如功能名称、数据项等）
 */
function checkDataConsistency(content, cosmicData) {
    const result = {
        score: 100,
        issues: [],
        details: {}
    };

    if (!cosmicData || Object.keys(cosmicData).length === 0) {
        result.score = 80;
        return result;
    }

    // 检查功能过程名称一致性
    const cosmicFunctionNames = Object.keys(cosmicData);
    const inconsistentNames = [];

    cosmicFunctionNames.forEach(funcName => {
        // 检查功能名称是否在文档中出现
        if (!content.includes(funcName)) {
            inconsistentNames.push(funcName);
            result.score -= 3;
        }
    });

    if (inconsistentNames.length > 0) {
        result.issues.push(`${inconsistentNames.length}个功能名称未在文档中找到`);
    }

    // 检查数据组的一致性
    const allDataGroups = new Set();
    Object.values(cosmicData).forEach(rows => {
        rows.forEach(row => {
            if (row.dataGroup) allDataGroups.add(row.dataGroup);
        });
    });

    result.details.totalDataGroups = allDataGroups.size;
    result.details.inconsistentFunctions = inconsistentNames.length;

    result.score = Math.max(0, result.score);
    return result;
}

/**
 * 检查5：语言质量
 * 使用AI检查语言的专业性、准确性
 */
async function checkLanguageQuality(client, content) {
    const result = {
        score: 100,
        issues: [],
        details: {}
    };

    if (!client) {
        result.score = 75;
        return result;
    }

    try {
        // 提取一些段落样本
        const paragraphs = extractParagraphSamples(content, 5);
        const sampleText = paragraphs.join('\n\n');

        const prompt = `你是中文写作专家。请检查以下技术文档的语言质量。

## 【文本样本】
${sampleText}

## 【检查要点】
1. 是否有语法错误？
2. 是否有错别字？
3. 术语使用是否准确？
4. 表述是否清晰、专业？
5. 是否符合技术文档规范？

请输出JSON格式：
\`\`\`json
{
  "qualityScore": 0-100的分数,
  "grammarErrors": ["语法错误"],
  "typos": ["错别字"],
  "suggestions": ["改进建议"]
}
\`\`\``;

        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是中文写作和技术文档专家。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 1500
        });

        const responseText = response.choices[0].message.content;
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/) || responseText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const checkResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            result.score = checkResult.qualityScore || 80;

            if (checkResult.grammarErrors) {
                result.issues = result.issues.concat(checkResult.grammarErrors);
            }
            if (checkResult.typos) {
                result.issues = result.issues.concat(checkResult.typos);
            }

            result.details.suggestions = checkResult.suggestions || [];
        }

    } catch (error) {
        console.error('语言质量检查失败:', error.message);
        result.score = 80;
    }

    return result;
}

/**
 * 检查6：格式正确性
 * 检查Markdown格式是否正确
 */
function checkFormatCorrectness(content) {
    const result = {
        score: 100,
        issues: [],
        details: {}
    };

    // 检查表格格式
    const tableIssues = checkTableFormat(content);
    if (tableIssues.length > 0) {
        result.issues = result.issues.concat(tableIssues);
        result.score -= tableIssues.length * 2;
    }

    // 检查标题层级
    const headingIssues = checkHeadingHierarchy(content);
    if (headingIssues.length > 0) {
        result.issues = result.issues.concat(headingIssues);
        result.score -= headingIssues.length * 3;
    }

    // 检查列表格式
    const listIssues = checkListFormat(content);
    if (listIssues.length > 0) {
        result.issues = result.issues.concat(listIssues);
        result.score -= listIssues.length * 1;
    }

    result.details.tableIssues = tableIssues.length;
    result.details.headingIssues = headingIssues.length;
    result.details.listIssues = listIssues.length;

    result.score = Math.max(0, result.score);
    return result;
}

// ==================== 辅助函数 ====================

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractChaptersFromContent(content) {
    const chapters = [];
    const lines = content.split('\n');
    let currentChapter = null;
    let currentContent = [];

    lines.forEach(line => {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headingMatch) {
            if (currentChapter) {
                currentChapter.content = currentContent.join('\n');
                chapters.push(currentChapter);
            }

            currentChapter = {
                level: headingMatch[1].length,
                title: headingMatch[2],
                content: ''
            };
            currentContent = [];
        } else if (currentChapter) {
            currentContent.push(line);
        }
    });

    if (currentChapter) {
        currentChapter.content = currentContent.join('\n');
        chapters.push(currentChapter);
    }

    return chapters;
}

function findPlaceholders(content) {
    const placeholders = [];
    const patterns = [
        /XXX/g,
        /待.*?定/g,
        /TODO/gi,
        /\[.*?placeholder.*?\]/gi,
        /\.\.\./g
    ];

    patterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
            placeholders.push(...matches);
        }
    });

    return [...new Set(placeholders)]; // 去重
}

function countFunctionsInDocument(content) {
    // 统计三级或四级标题数量（通常是功能）
    const matches = content.match(/^#{3,4}\s+\d+\.\d+/gm);
    return matches ? matches.length : 0;
}

function extractParagraphSamples(content, count) {
    const paragraphs = content.split('\n\n').filter(p => {
        const trimmed = p.trim();
        return trimmed.length > 50 &&
            !trimmed.startsWith('#') &&
            !trimmed.includes('|');
    });

    return paragraphs.slice(0, count);
}

function checkTableFormat(content) {
    const issues = [];
    const lines = content.split('\n');
    let inTable = false;
    let tableLineCount = 0;

    lines.forEach((line, idx) => {
        if (line.includes('|')) {
            if (!inTable) {
                inTable = true;
                tableLineCount = 0;
            }
            tableLineCount++;

            // 检查表格分隔行
            if (tableLineCount === 2 && !/^\|[\s:-]+\|/.test(line)) {
                issues.push(`行${idx + 1}: 表格缺少分隔行`);
            }
        } else {
            if (inTable && tableLineCount < 3) {
                issues.push(`行${idx}: 表格行数不足`);
            }
            inTable = false;
        }
    });

    return issues;
}

function checkHeadingHierarchy(content) {
    const issues = [];
    const lines = content.split('\n');
    let lastLevel = 0;

    lines.forEach((line, idx) => {
        const match = line.match(/^(#{1,6})\s+/);
        if (match) {
            const level = match[1].length;

            if (level > lastLevel + 1) {
                issues.push(`行${idx + 1}: 标题层级跳跃（从${lastLevel}级跳到${level}级）`);
            }

            lastLevel = level;
        }
    });

    return issues;
}

function checkListFormat(content) {
    const issues = [];
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
        // 检查列表项格式
        if (/^[-*+]\s/.test(line)) {
            // 无序列表应该有空格
            if (!/^[-*+]\s+\S/.test(line)) {
                issues.push(`行${idx + 1}: 列表项格式不正确`);
            }
        } else if (/^\d+\.\s/.test(line)) {
            // 有序列表应该有空格
            if (!/^\d+\.\s+\S/.test(line)) {
                issues.push(`行${idx + 1}: 有序列表格式不正确`);
            }
        }
    });

    return issues;
}

function summarizeQualityReport(report) {
    const checkScores = Object.values(report.checks)
        .filter(c => c && c.score !== undefined)
        .map(c => c.score);

    if (checkScores.length > 0) {
        report.overallScore = Math.round(
            checkScores.reduce((a, b) => a + b, 0) / checkScores.length
        );
    }

    // 汇总所有问题
    Object.values(report.checks).forEach(check => {
        if (check && check.issues) {
            report.issues = report.issues.concat(check.issues);
        }
    });

    // 分类检查结果
    Object.entries(report.checks).forEach(([name, check]) => {
        if (check && check.score !== undefined) {
            if (check.score >= 80) {
                report.passedChecks.push(name);
            } else {
                report.failedChecks.push(name);
            }
        }
    });

    // 生成改进建议
    if (report.overallScore < 60) {
        report.suggestions.push('文档质量较低，建议重新生成');
    } else if (report.overallScore < 80) {
        report.suggestions.push('文档存在一些问题，建议审查和优化');
    } else {
        report.suggestions.push('文档质量良好');
    }

    return report;
}

// ==================== 导出模块 ====================

module.exports = {
    comprehensiveQualityCheck,
    checkStructuralIntegrity,
    checkContentCompleteness,
    checkTemplateCompliance,
    checkDataConsistency,
    checkLanguageQuality,
    checkFormatCorrectness
};
