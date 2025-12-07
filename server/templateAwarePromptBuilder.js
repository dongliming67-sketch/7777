/**
 * 模板驱动的提示词构建器
 * 这是真正体现"深度理解"的核心模块
 * 每个提示词都基于模板分析结果动态构建
 */

/**
 * 核心函数：根据模板分析结果构建提示词
 * 这里真正体现了深度理解
 */
function buildTemplateAwarePrompt(config) {
    const {
        functionName,
        sectionType, // 'functionDescription', 'businessRules', 'dataItems', 'interface', 'ui', 'acceptance'
        cosmicData,
        templateAnalysis, // 深度分析结果
        context
    } = config;

    console.log(`📝 正在为 [${functionName}] 的 [${sectionType}] 构建模板驱动的提示词...`);

    let prompt = '';
    let templateGuidance = {
        used: false,
        sources: []
    };

    // ========== 第1步：提取该章节的模板要求 ==========
    const sectionRequirements = extractSectionRequirements(sectionType, templateAnalysis);

    if (sectionRequirements) {
        templateGuidance.used = true;
        templateGuidance.sources.push('内容要求分析');

        prompt += `【模板要求 - 来自深度分析】\n`;
        if (sectionRequirements.explicit && sectionRequirements.explicit.length > 0) {
            prompt += `显式要求：\n${sectionRequirements.explicit.map(r => `  - ${r}`).join('\n')}\n`;
        }
        if (sectionRequirements.implicit && sectionRequirements.implicit.length > 0) {
            prompt += `隐式要求：\n${sectionRequirements.implicit.map(r => `  -${r}`).join('\n')}\n`;
        }
        prompt += `\n`;
    }

    // ========== 第2步：提取该章节的格式规范 ==========
    const formatSpecification = extractFormatSpecification(sectionType, templateAnalysis);

    if (formatSpecification) {
        templateGuidance.used = true;
        templateGuidance.sources.push('格式规范分析');

        prompt += `【格式规范 - 来自模板示例】\n`;

        if (formatSpecification.format === 'table') {
            prompt += `格式：表格\n`;
            prompt += `表头：| ${formatSpecification.headers.join(' | ')} |\n`;
            prompt += `最少行数：${formatSpecification.minRows || 3}\n`;
        } else if (formatSpecification.format === 'list') {
            prompt += `格式：列表\n`;
            prompt += `列表类型：${formatSpecification.listType}\n`;
        } else {
            prompt += `格式：段落文本\n`;
            prompt += `建议长度：${formatSpecification.suggestedLength || '300-500'}字\n`;
        }
        prompt += `\n`;
    }

    // ========== 第3步：提取真实示例 ==========
    const realExamples = extractRealExamples(sectionType, templateAnalysis);

    if (realExamples && realExamples.length > 0) {
        templateGuidance.used = true;
        templateGuidance.sources.push('真实示例提取');

        prompt += `【参考示例 - 来自模板真实内容】\n`;
        realExamples.forEach((example, idx) => {
            if (idx < 2) { // 最多2个示例
                prompt += `示例${idx + 1}：\n${example.substring(0, 300)}\n...\n`;
            }
        });
        prompt += `\n`;
    }

    // ========== 第4步：应用语言风格 ==========
    const styleGuide = templateAnalysis?.styleAnalysis;

    if (styleGuide) {
        templateGuidance.used = true;
        templateGuidance.sources.push('语言风格分析');

        prompt += `【语言风格要求 - 来自模板风格分析】\n`;
        prompt += `正式程度：${styleGuide.formalityLevel || '正式'}\n`;
        prompt += `句式特点：${styleGuide.sentenceStyle || '清晰、专业'}\n`;
        prompt += `术语使用：${styleGuide.terminologyDensity || '中等密度'}\n`;
        prompt += `表述方式：${styleGuide.expressionMode || '陈述式'}\n`;

        if (styleGuide.writingTips && styleGuide.writingTips.length > 0) {
            prompt += `写作提示：\n${styleGuide.writingTips.slice(0, 3).map(t => `  - ${t}`).join('\n')}\n`;
        }
        prompt += `\n`;
    }

    // ========== 第5步：应用结构规范 ==========
    const structuralInfo = extractStructuralInfo(sectionType, templateAnalysis);

    if (structuralInfo) {
        templateGuidance.used = true;
        templateGuidance.sources.push('结构规范分析');

        prompt += `【结构规范 - 来自模板结构分析】\n`;
        prompt += `章节编号格式：${structuralInfo.numberingPattern}\n`;
        prompt += `层级深度：${structuralInfo.levelDepth}\n`;
        prompt += `\n`;
    }

    // ========== 第6步：添加业务内容 ==========
    prompt += `【功能业务信息 - 来自COSMIC数据】\n`;
    prompt += `功能名称：${functionName}\n`;
    prompt += `数据流程：\n`;
    cosmicData.forEach((row, idx) => {
        prompt += `  ${idx + 1}. ${row.dataMovementType} - ${row.subProcessDesc}\n`;
        prompt += `     数据组：${row.dataGroup}\n`;
        prompt += `     数据属性：${row.dataAttributes}\n`;
    });
    prompt += `\n`;

    // ========== 第7步：添加具体任务 ==========
    prompt += `【生成任务】\n`;
    prompt += `请为功能"${functionName}"生成${getSectionDisplayName(sectionType)}。\n\n`;

    // 根据不同类型添加具体要求
    prompt += getSpecificRequirements(sectionType, cosmicData);
    prompt += `\n`;

    // ========== 第8步：强调符合模板 ==========
    if (templateGuidance.used) {
        prompt += `【重要】\n`;
        prompt += `✓ 严格按照上述模板要求、格式规范、语言风格生成\n`;
        prompt += `✓ 参考真实示例的结构和表述方式\n`;
        prompt += `✓ 确保生成内容与模板完全一致\n`;
        prompt += `\n`;
        prompt += `本提示词使用了以下模板分析结果：\n`;
        templateGuidance.sources.forEach(s => prompt += `  ✓ ${s}\n`);
    } else {
        prompt += `⚠️ 注意：未找到模板分析结果，使用通用要求\n`;
    }

    console.log(`✅ 提示词构建完成，${templateGuidance.used ? '已应用' : '未应用'}模板分析结果`);
    console.log(`   使用的分析维度: ${templateGuidance.sources.join(', ')}`);

    return {
        prompt,
        templateGuidanceUsed: templateGuidance.used,
        sources: templateGuidance.sources
    };
}

/**
 * 提取章节要求
 */
function extractSectionRequirements(sectionType, templateAnalysis) {
    if (!templateAnalysis || !templateAnalysis.contentRequirements) {
        return null;
    }

    // 映射到模板章节
    const sectionMap = {
        'functionDescription': '功能说明',
        'businessRules': '业务规则',
        'dataItems': '处理数据',
        'interface': '接口',
        'ui': '界面',
        'acceptance': '验收标准'
    };

    const targetSection = sectionMap[sectionType];

    // 查找匹配的章节要求
    for (const [chapterNum, requirements] of Object.entries(templateAnalysis.contentRequirements)) {
        if (requirements.title && requirements.title.includes(targetSection)) {
            return {
                explicit: requirements.explicitRequirements || [],
                implicit: requirements.implicitRequirements || []
            };
        }
    }

    return null;
}

/**
 * 提取格式规范
 */
function extractFormatSpecification(sectionType, templateAnalysis) {
    if (!templateAnalysis) return null;

    // 从processContentTemplate中提取
    const processTemplate = templateAnalysis?.functionalChapter?.processContentTemplate;

    if (processTemplate && processTemplate.sections) {
        const section = processTemplate.sections.find(s =>
            s.name.includes(getSectionDisplayName(sectionType))
        );

        if (section) {
            return {
                format: section.format || 'text',
                headers: section.tableHeaders || [],
                minRows: section.minRows || 3,
                suggestedLength: section.suggestedLength,
                listType: section.listType
            };
        }
    }

    // 从示例中推断
    if (sectionType === 'businessRules' && templateAnalysis.examplesExtraction?.businessRules) {
        const firstRule = templateAnalysis.examplesExtraction.businessRules[0];
        if (firstRule && firstRule.includes('|')) {
            // 是表格格式
            const headers = firstRule.split('|').map(h => h.trim()).filter(Boolean);
            return {
                format: 'table',
                headers: headers,
                minRows: 5
            };
        }
    }

    if (sectionType === 'dataItems' && templateAnalysis.examplesExtraction?.dataDictionary) {
        const firstDict = templateAnalysis.examplesExtraction.dataDictionary[0];
        if (firstDict) {
            const lines = firstDict.split('\n');
            if (lines.length > 0 && lines[0].includes('|')) {
                const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean);
                return {
                    format: 'table',
                    headers: headers,
                    minRows: 8
                };
            }
        }
    }

    // 默认格式
    const defaultFormats = {
        'functionDescription': { format: 'text', suggestedLength: '300-500' },
        'businessRules': { format: 'table', headers: ['规则编号', '规则名称', '触发条件', '处理逻辑'], minRows: 5 },
        'dataItems': { format: 'table', headers: ['字段名', '类型', '长度', '必填', '说明'], minRows: 8 },
        'interface': { format: 'mixed', suggestedLength: '200-400' },
        'ui': { format: 'text', suggestedLength: '200-300' },
        'acceptance': { format: 'table', headers: ['编号', '测试场景', '前置条件', '操作步骤', '预期结果'], minRows: 5 }
    };

    return defaultFormats[sectionType] || { format: 'text' };
}

/**
 * 提取真实示例
 */
function extractRealExamples(sectionType, templateAnalysis) {
    if (!templateAnalysis || !templateAnalysis.examplesExtraction) {
        return [];
    }

    const examples = [];

    // 从功能过程示例中提取
    if (templateAnalysis.examplesExtraction.functionalProcesses) {
        templateAnalysis.examplesExtraction.functionalProcesses.forEach(fp => {
            if (fp && fp.includes(getSectionDisplayName(sectionType))) {
                examples.push(fp);
            }
        });
    }

    // 从表格示例中提取
    if (sectionType === 'businessRules' && templateAnalysis.examplesExtraction.businessRules) {
        examples.push(...templateAnalysis.examplesExtraction.businessRules.slice(0, 2));
    }

    if (sectionType === 'dataItems' && templateAnalysis.examplesExtraction.dataDictionary) {
        examples.push(...templateAnalysis.examplesExtraction.dataDictionary.slice(0, 2));
    }

    if (sectionType === 'interface' && templateAnalysis.examplesExtraction.interfaces) {
        examples.push(...templateAnalysis.examplesExtraction.interfaces.slice(0, 2));
    }

    return examples;
}

/**
 * 提取结构信息
 */
function extractStructuralInfo(sectionType, templateAnalysis) {
    if (!templateAnalysis || !templateAnalysis.structuralAnalysis) {
        return null;
    }

    const structural = templateAnalysis.structuralAnalysis;

    return {
        numberingPattern: structural.numberingRules?.pattern || '数字.数字.数字',
        levelDepth: structural.numberingRules?.maxDepth || 4,
        separator: structural.numberingRules?.separator || '.'
    };
}

/**
 * 获取章节显示名称
 */
function getSectionDisplayName(sectionType) {
    const nameMap = {
        'functionDescription': '功能说明',
        'businessRules': '业务规则',
        'dataItems': '处理数据',
        'interface': '接口设计',
        'ui': '界面设计',
        'acceptance': '验收标准'
    };
    return nameMap[sectionType] || sectionType;
}

/**
 * 获取具体要求
 */
function getSpecificRequirements(sectionType, cosmicData) {
    const dataFlow = analyzeDataFlow(cosmicData);

    let requirements = '';

    switch (sectionType) {
        case 'functionDescription':
            requirements = `具体要求：
1. 基于COSMIC数据流（E→R→W→X）描述完整的业务流程
2. 说明功能的业务价值和使用场景
3. 描述主要操作步骤
4. 提及异常情况处理
`;
            break;

        case 'businessRules':
            requirements = `具体要求：
1. 基于数据流推导出至少5条业务规则
2. 包括：数据校验规则、权限控制规则、业务逻辑规则
3. 每条规则明确触发条件和处理逻辑
4. 规则编号使用BR-001, BR-002格式
`;
            break;

        case 'dataItems':
            requirements = `具体要求：
1. 列出所有涉及的数据字段（从COSMIC数据属性中提取）
2. 为每个字段推断：类型、长度、是否必填
3. 至少包含${Math.max(getUniqueFields(cosmicData).length, 8)}个字段
4. 字段说明要具体、准确
`;
            break;

        case 'interface':
            requirements = `具体要求：
1. 请求参数基于E类型数据（${dataFlow.entry.map(e => e.dataGroup).join('、')}）
2. 响应参数基于X类型数据（${dataFlow.exit.map(x => x.dataGroup).join('、')}）
3. 包含请求方式（POST/GET）、URL、参数表、错误码
4. 参数表至少5行
`;
            break;

        case 'ui':
            requirements = `具体要求：
1. 描述页面布局（顶部、侧边、主体、底部）
2. 列出输入字段（基于E类型数据）
3. 列出显示字段（基于X类型数据）
4. 列出操作按钮和交互流程
`;
            break;

        case 'acceptance':
            requirements = `具体要求：
1. 至少包含5条测试用例
2. 覆盖：正常流程、数据校验、权限控制、异常处理
3. 每条用例包含：编号、场景、前置条件、步骤、预期结果
4. 基于业务规则设计测试场景
`;
            break;
    }

    return requirements;
}

/**
 * 分析数据流
 */
function analyzeDataFlow(cosmicData) {
    const flow = {
        entry: [],
        read: [],
        write: [],
        exit: []
    };

    cosmicData.forEach(row => {
        switch (row.dataMovementType) {
            case 'E': flow.entry.push(row); break;
            case 'R': flow.read.push(row); break;
            case 'W': flow.write.push(row); break;
            case 'X': flow.exit.push(row); break;
        }
    });

    return flow;
}

/**
 * 获取唯一字段
 */
function getUniqueFields(cosmicData) {
    const fields = new Set();
    cosmicData.forEach(row => {
        if (row.dataAttributes) {
            const attrs = row.dataAttributes.split(/[,、，;；]/).map(a => a.trim());
            attrs.forEach(attr => {
                if (attr) fields.add(attr);
            });
        }
    });
    return Array.from(fields);
}

// ==================== 导出 ====================

module.exports = {
    buildTemplateAwarePrompt,
    extractSectionRequirements,
    extractFormatSpecification,
    extractRealExamples,
    extractStructuralInfo
};
