/**
 * 动态驱动的深度理解模块
 * 用于深度理解需求文档模板和COSMIC数据，实现智能化的需求规格书生成
 */

// ==================== 模板深度理解 ====================

/**
 * 多维度深度分析模板
 * 不仅提取结构，还理解每个章节的写作意图、内容要求、语言风格
 */
async function deepAnalyzeTemplate(client, templateText, templateSections) {
    console.log('🧠 开始多维度深度分析模板...');

    const analysis = {
        structuralAnalysis: null,      // 结构性分析
        semanticAnalysis: null,         // 语义分析
        styleAnalysis: null,            // 风格分析
        examplesExtraction: null,       // 示例提取
        contentRequirements: null,      // 内容要求
        writingGuidelines: null,        // 写作指南
        relationshipMap: null           // 章节关系图谱
    };

    try {
        // ========== 第一维度：结构性分析 ==========
        console.log('📊 第一维度：结构性分析');
        analysis.structuralAnalysis = await analyzeTemplateStructure(client, templateText, templateSections);

        // ========== 第二维度：语义分析 ==========
        console.log('🔍 第二维度：语义分析');
        analysis.semanticAnalysis = await analyzeTemplateSemantic(client, templateText, templateSections);

        // ========== 第三维度：风格分析 ==========
        console.log('✍️ 第三维度：风格分析');
        analysis.styleAnalysis = await analyzeTemplateStyle(client, templateText);

        // ========== 第四维度：示例提取 ==========
        console.log('📝 第四维度：示例提取');
        analysis.examplesExtraction = extractAllExamples(templateText, templateSections);

        // ========== 第五维度：内容要求提取 ==========
        console.log('📋 第五维度：内容要求提取');
        analysis.contentRequirements = await extractContentRequirements(client, templateText, templateSections);

        // ========== 第六维度：章节关系图谱 ==========
        console.log('🗺️ 第六维度：章节关系图谱');
        analysis.relationshipMap = buildChapterRelationshipMap(templateSections, analysis);

        console.log('✅ 多维度深度分析完成');
        return analysis;
    } catch (error) {
        console.error('❌ 深度分析失败:', error.message);
        return null;
    }
}

/**
 * 第一维度：结构性分析
 * 分析章节层级、编号规则、必选/可选关系
 */
async function analyzeTemplateStructure(client, templateText, sections) {
    const prompt = `你是文档结构分析专家。请深度分析以下需求规格说明书模板的**结构特征**。

## 【模板章节列表】
${sections.map(s => `${'  '.repeat(s.level - 1)}${s.number} ${s.title} (Level ${s.level})`).join('\n')}

## 【模板内容片段】
${templateText.slice(0, 5000)}

## 【分析任务】
1. **章节编号规则**：分析编号格式（如1、1.1、1.1.1）和递进规律
2. **层级深度**：最大层级深度是多少？各层级的含义？
3. **必选章节**：哪些章节是必须的？
4. **可选章节**：哪些章节是可选的？
5. **特殊章节**：是否有特殊的章节（如附录、参考文献）？
6. **功能需求章节特征**：功能需求章节的特殊结构是什么？

请输出JSON格式：
\`\`\`json
{
  "numberingRules": {
    "pattern": "描述编号规则",
    "separator": "分隔符（如.或、）",
    "maxDepth": 最大层级深度
  },
  "chapterTypes": {
    "required": ["必选章节编号列表"],
    "optional": ["可选章节编号列表"],
    "special": ["特殊章节编号列表"]
  },
  "functionalChapter": {
    "number": "功能需求章节编号",
    "hierarchyLevels": {
      "level1": "子系统/功能模块",
      "level2": "功能组",
      "level3": "具体功能过程"
    },
    "contentSections": ["功能过程下的子节列表"]
  },
  "structuralPatterns": [
    "识别到的结构模式描述"
  ]
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是文档结构分析专家，擅长识别文档的结构模式和编号规则。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 3000
        });

        const content = response.choices[0].message.content;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1] || jsonMatch[0]);
        }
        return null;
    } catch (error) {
        console.error('结构性分析失败:', error.message);
        return null;
    }
}

/**
 * 第二维度：语义分析
 * 理解每个章节的写作目的和内容主题
 */
async function analyzeTemplateSemantic(client, templateText, sections) {
    // 为每个一级章节进行语义分析
    const chapterSemantics = [];

    const level1Chapters = sections.filter(s => s.level === 1);

    for (const chapter of level1Chapters.slice(0, 8)) { // 分析前8个主要章节
        const chapterContent = extractChapterContent(templateText, chapter, sections);

        const prompt = `你是需求文档语义分析专家。请分析以下章节的**写作目的**和**内容主题**。

## 【章节】${chapter.number} ${chapter.title}

## 【章节内容】
${chapterContent.slice(0, 3000)}

## 【分析任务】
1. 这个章节的**核心目的**是什么？（为什么要写这个章节？）
2. 读者从这个章节应该获得什么**信息**？
3. 这个章节的**典型内容**包括哪些？
4. 这个章节与其他章节的**关系**是什么？

请输出JSON格式：
\`\`\`json
{
  "chapterNumber": "${chapter.number}",
  "chapterTitle": "${chapter.title}",
  "purpose": "章节核心目的",
  "readerExpectation": "读者期望获得的信息",
  "typicalContent": [
    "典型内容项1",
    "典型内容项2"
  ],
  "relationships": {
    "dependsOn": ["依赖哪些章节的内容"],
    "providesFor": ["为哪些章节提供信息"]
  },
  "keywords": ["关键词列表"]
}
\`\`\``;

        try {
            const response = await client.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'glm-4-flash',
                messages: [
                    { role: 'system', content: '你是需求文档语义分析专家。' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 2000
            });

            const content = response.choices[0].message.content;
            const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                chapterSemantics.push(JSON.parse(jsonMatch[1] || jsonMatch[0]));
            }
        } catch (error) {
            console.error(`章节 ${chapter.number} 语义分析失败:`, error.message);
        }
    }

    return {
        chapterSemantics,
        overallTheme: '需求规格说明书',
        documentPurpose: '详细描述软件系统的功能和非功能需求'
    };
}

/**
 * 第三维度：风格分析
 * 分析文档的语言风格、术语使用、格式偏好
 */
async function analyzeTemplateStyle(client, templateText) {
    const sampleTexts = extractSampleParagraphs(templateText, 5);

    const prompt = `你是文档风格分析专家。请分析以下需求规格说明书模板的**写作风格**。

## 【示例文本段落】
${sampleTexts.join('\n\n---\n\n')}

## 【分析任务】
1. **语言正式程度**：非常正式/正式/半正式/口语化？
2. **句式特点**：长句/短句/复合句？
3. **术语使用**：专业术语密度如何？
4. **表述方式**：陈述式/祈使式/说明式？
5. **格式偏好**：列表/表格/段落？
6. **标注习惯**：是否使用【】、「」等标注？

请输出JSON格式：
\`\`\`json
{
  "formalityLevel": "正式程度（1-5，5最正式）",
  "sentenceStyle": "句式特点描述",
  "terminologyDensity": "术语密度（低/中/高）",
  "expressionMode": "表述方式",
  "formatPreference": {
    "list": "列表使用频率（低/中/高）",
    "table": "表格使用频率（低/中/高）",
    "paragraph": "段落使用频率（低/中/高）"
  },
  "annotationStyle": "标注习惯描述",
  "writingTips": [
    "写作建议1",
    "写作建议2"
  ]
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是文档风格分析专家，擅长识别文档的语言风格和格式特征。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 2000
        });

        const content = response.choices[0].message.content;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1] || jsonMatch[0]);
        }
        return null;
    } catch (error) {
        console.error('风格分析失败:', error.message);
        return null;
    }
}

/**
 * 第四维度：示例提取
 * 提取模板中的所有示例内容
 */
function extractAllExamples(templateText, sections) {
    const examples = {
        functionalProcesses: [],    // 功能过程示例
        tables: [],                 // 表格示例
        diagrams: [],               // 图表引用
        businessRules: [],          // 业务规则示例
        dataDictionary: [],         // 数据字典示例
        interfaces: []              // 接口示例
    };

    // 提取功能过程示例
    const funcExample = extractFunctionalProcessExample(templateText, sections);
    if (funcExample) {
        examples.functionalProcesses.push(funcExample);
    }

    // 提取表格示例
    examples.tables = extractTableExamples(templateText);

    // 提取业务规则示例
    examples.businessRules = extractBusinessRuleExamples(templateText);

    // 提取数据字典示例
    examples.dataDictionary = extractDataDictionaryExamples(templateText);

    // 提取接口示例
    examples.interfaces = extractInterfaceExamples(templateText);

    return examples;
}

/**
 * 提取功能过程的完整示例
 */
function extractFunctionalProcessExample(templateText, sections) {
    const lines = templateText.split('\n');
    let inFunctionalSection = false;
    let exampleLines = [];
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 识别功能需求章节
        if (/^[3-9][\.\s、].*功能.*需求/.test(line)) {
            inFunctionalSection = true;
            continue;
        }

        if (inFunctionalSection) {
            // 查找三级或四级标题（功能过程）
            const match = line.match(/^(\d+(?:\.\d+){2,})\s*[、.\s]/);
            if (match) {
                const level = match[1].split('.').length;
                if (level >= 3 && exampleLines.length === 0) {
                    // 开始收集
                    depth = level;
                    exampleLines.push(line);
                } else if (level <= depth && exampleLines.length > 0) {
                    // 遇到同级或更高级，停止
                    break;
                } else if (exampleLines.length > 0) {
                    exampleLines.push(line);
                }
            } else if (exampleLines.length > 0) {
                exampleLines.push(line);
                // 收集足够内容后停止
                if (exampleLines.length > 80) break;
            }

            // 检测离开功能需求章节
            if (/^[4-9][\.\s、]/.test(line) && !/功能/.test(line)) {
                break;
            }
        }
    }

    const result = exampleLines.join('\n').trim();
    return result.length > 200 ? result : null;
}

/**
 * 提取表格示例
 */
function extractTableExamples(templateText) {
    const tables = [];
    const lines = templateText.split('\n');
    let currentTable = [];
    let tableContext = ''; // 表格上方的标题

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 记录表格上方的标题
        if (/^#+\s+/.test(line) || /^\d+[\.\s、]/.test(line)) {
            tableContext = line;
        }

        // 检测表格行
        if (line.includes('|') && line.split('|').length >= 3) {
            if (currentTable.length === 0) {
                currentTable.push({ context: tableContext, rows: [] });
            }
            currentTable[0].rows.push(line);
        } else if (currentTable.length > 0 && currentTable[0].rows.length >= 2) {
            // 表格结束
            tables.push(currentTable[0]);
            currentTable = [];
        }
    }

    // 处理最后一个表格
    if (currentTable.length > 0 && currentTable[0].rows.length >= 2) {
        tables.push(currentTable[0]);
    }

    return tables.slice(0, 15); // 返回前15个表格
}

/**
 * 提取业务规则示例
 */
function extractBusinessRuleExamples(templateText) {
    const rules = [];
    const lines = templateText.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // 匹配业务规则编号格式：BR-001、规则1、业务规则1等
        if (/^(BR-\d+|规则\d+|业务规则\d+)[：:、.\s]/.test(line)) {
            rules.push(line);
        }
    }

    return rules.slice(0, 10);
}

/**
 * 提取数据字典示例
 */
function extractDataDictionaryExamples(templateText) {
    const dataDictEntries = [];
    const lines = templateText.split('\n');

    // 查找包含"字段名"、"类型"、"长度"等关键词的表格
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('字段') && line.includes('类型') && line.includes('|')) {
            // 找到数据字典表头，收集整个表格
            const tableLines = [line];
            for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                if (lines[j].includes('|')) {
                    tableLines.push(lines[j].trim());
                } else {
                    break;
                }
            }
            if (tableLines.length >= 3) {
                dataDictEntries.push(tableLines.join('\n'));
            }
        }
    }

    return dataDictEntries.slice(0, 5);
}

/**
 * 提取接口示例
 */
function extractInterfaceExamples(templateText) {
    const interfaces = [];
    const lines = templateText.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // 识别接口定义：API、接口编号等
        if (/(API[-_]\w+|接口\d+|INT[-_]\d+)[：:、.\s]/.test(line) ||
            (line.includes('请求') && line.includes('响应'))) {
            const interfaceLines = [line];
            // 收集接口相关内容
            for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
                const nextLine = lines[j].trim();
                if (/^#+\s+\d+/.test(nextLine)) break; // 遇到新章节
                interfaceLines.push(nextLine);
            }
            if (interfaceLines.length >= 5) {
                interfaces.push(interfaceLines.join('\n'));
            }
        }
    }

    return interfaces.slice(0, 5);
}

/**
 * 第五维度：内容要求提取
 * 从模板中提取每个章节的具体内容要求
 */
async function extractContentRequirements(client, templateText, sections) {
    const contentReqs = {};

    // 在模板中查找内容要求的标记（如【】、注释等）
    const requirementMarkers = extractRequirementMarkers(templateText);

    // 为关键章节提取内容要求
    const keyChapters = sections.filter(s =>
        s.level === 1 ||
        (s.level === 2 && (s.title.includes('功能') || s.title.includes('需求')))
    );

    for (const chapter of keyChapters.slice(0, 10)) {
        const chapterContent = extractChapterContent(templateText, chapter, sections);
        const markers = requirementMarkers.filter(m =>
            m.position >= chapter.lineIndex &&
            m.position < (chapter.lineIndex + 100)
        );

        contentReqs[chapter.number] = {
            title: chapter.title,
            explicitRequirements: markers.map(m => m.text),
            implicitRequirements: inferImplicitRequirements(chapterContent, chapter.title)
        };
    }

    return contentReqs;
}

/**
 * 提取模板中的要求标记（【】、<>等）
 */
function extractRequirementMarkers(templateText) {
    const markers = [];
    const lines = templateText.split('\n');

    lines.forEach((line, idx) => {
        // 提取【】中的内容
        const bracketsMatches = line.matchAll(/【([^】]+)】/g);
        for (const match of bracketsMatches) {
            markers.push({
                position: idx,
                type: 'brackets',
                text: match[1]
            });
        }

        // 提取<>中的内容
        const angleMatches = line.matchAll(/<([^>]+)>/g);
        for (const match of angleMatches) {
            markers.push({
                position: idx,
                type: 'angle',
                text: match[1]
            });
        }
    });

    return markers;
}

/**
 * 推断隐含的内容要求
 */
function inferImplicitRequirements(chapterContent, chapterTitle) {
    const requirements = [];

    // 根据章节标题推断
    if (chapterTitle.includes('功能')) {
        requirements.push('需要描述具体功能点');
        requirements.push('需要说明操作流程');
    }
    if (chapterTitle.includes('数据')) {
        requirements.push('需要列出数据字段');
        requirements.push('需要说明数据类型和长度');
    }
    if (chapterTitle.includes('接口')) {
        requirements.push('需要定义接口协议');
        requirements.push('需要说明请求和响应参数');
    }

    // 根据内容中出现的表格
    if (chapterContent.includes('|')) {
        requirements.push('需要使用表格形式');
    }

    return requirements;
}

/**
 * 第六维度：构建章节关系图谱
 */
function buildChapterRelationshipMap(sections, analysis) {
    const relationshipMap = {
        nodes: [],
        edges: []
    };

    // 创建节点
    sections.forEach(section => {
        relationshipMap.nodes.push({
            id: section.number,
            title: section.title,
            level: section.level,
            type: classifyChapterType(section.title)
        });
    });

    // 创建边（基于层级关系）
    sections.forEach(section => {
        const parentNumber = getParentNumber(section.number);
        if (parentNumber) {
            relationshipMap.edges.push({
                from: parentNumber,
                to: section.number,
                type: 'hierarchical'
            });
        }
    });

    // 添加语义关系（基于语义分析结果）
    if (analysis.semanticAnalysis && analysis.semanticAnalysis.chapterSemantics) {
        analysis.semanticAnalysis.chapterSemantics.forEach(semantic => {
            if (semantic.relationships) {
                (semantic.relationships.dependsOn || []).forEach(dep => {
                    relationshipMap.edges.push({
                        from: dep,
                        to: semantic.chapterNumber,
                        type: 'dependency'
                    });
                });
            }
        });
    }

    return relationshipMap;
}

/**
 * 分类章节类型
 */
function classifyChapterType(title) {
    if (/概述|引言|前言/.test(title)) return 'overview';
    if (/业务.*需求/.test(title)) return 'business';
    if (/用户.*需求/.test(title)) return 'user';
    if (/功能.*需求/.test(title)) return 'functional';
    if (/非功能|性能|安全/.test(title)) return 'non-functional';
    if (/架构|设计/.test(title)) return 'architecture';
    if (/附录|参考/.test(title)) return 'appendix';
    return 'other';
}

/**
 * 获取父章节编号
 */
function getParentNumber(number) {
    const parts = number.split('.');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('.');
}

/**
 * 提取章节内容
 */
function extractChapterContent(templateText, chapter, allSections) {
    const lines = templateText.split('\n');
    const startLine = chapter.lineIndex;

    // 找到下一个同级或更高级章节的位置
    let endLine = lines.length;
    const currentLevel = chapter.level;

    for (let i = startLine + 1; i < allSections.length; i++) {
        if (allSections[i].level <= currentLevel) {
            endLine = allSections[i].lineIndex;
            break;
        }
    }

    return lines.slice(startLine, endLine).join('\n');
}

/**
 * 提取示例段落
 */
function extractSampleParagraphs(text, count = 5) {
    const lines = text.split('\n');
    const paragraphs = [];
    let currentPara = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            if (currentPara.length > 0) {
                const para = currentPara.join(' ').trim();
                if (para.length >= 50 && para.length <= 500) {
                    paragraphs.push(para);
                    if (paragraphs.length >= count) break;
                }
                currentPara = [];
            }
        } else if (!/^#+\s+|^\d+[\.\s]|^[|]/.test(trimmed)) {
            // 排除标题和表格
            currentPara.push(trimmed);
        }
    }

    return paragraphs;
}

// ==================== 导出模块 ====================

module.exports = {
    deepAnalyzeTemplate,
    analyzeTemplateStructure,
    analyzeTemplateSemantic,
    analyzeTemplateStyle,
    extractAllExamples,
    extractContentRequirements,
    buildChapterRelationshipMap
};
