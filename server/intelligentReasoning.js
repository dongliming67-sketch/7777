/**
 * 智能内容推理与质量自检模块
 * 基于COSMIC数据和原始需求文档，智能推理生成内容，并进行质量检查
 * 增强版：集成深度思考引擎，生成更全面、更丰富的内容
 */

// 引入模板驱动的提示词构建器 - 这是深度理解的关键！
const { buildTemplateAwarePrompt } = require('./templateAwarePromptBuilder');
// 引入深度思考引擎 - 动态驱动的深度分析
const { quickDeepThink, deepThinkForFunction, analyzeDataFlowPattern } = require('./deepThinkingEngine');

// ==================== 智能内容推理 ====================

/**
 * 智能推理功能需求内容（增强版）
 * 基于COSMIC拆分结果、原始需求文档、模板分析，结合深度思考引擎推理出应该生成的内容
 * @param {Object} client - OpenAI客户端
 * @param {Object} functionInfo - 功能信息 {name, cosmicData}
 * @param {Object} context - 上下文信息
 * @param {Object} options - 选项 {enableDeepThinking: boolean, thinkingDepth: 'quick'|'full'}
 */
async function intelligentReasoningForFunction(client, functionInfo, context, options = {}) {
    const { enableDeepThinking = true, thinkingDepth = 'quick' } = options;
    
    console.log(`🧠 智能推理功能: ${functionInfo.name}`);
    console.log(`   深度思考: ${enableDeepThinking ? '✓ 启用' : '✗ 禁用'}, 深度: ${thinkingDepth}`);

    const reasoning = {
        functionName: functionInfo.name,
        cosmicData: functionInfo.cosmicData,
        inferredContent: {},
        confidenceScores: {},
        deepThinkingResult: null  // 深度思考结果
    };

    // ========== 增强：执行深度思考 ==========
    if (enableDeepThinking) {
        try {
            if (thinkingDepth === 'full') {
                console.log('🧠 执行完整深度思考...');
                reasoning.deepThinkingResult = await deepThinkForFunction(client, functionInfo, context);
            } else {
                console.log('⚡ 执行快速深度思考...');
                reasoning.deepThinkingResult = await quickDeepThink(client, functionInfo, context);
            }
        } catch (error) {
            console.error('深度思考过程出错，继续使用基础推理:', error.message);
        }
    }

    // ========== 推理1：功能说明（增强版） ==========
    reasoning.inferredContent.functionDescription = await reasonFunctionDescriptionEnhanced(
        client, functionInfo, context, reasoning.deepThinkingResult
    );
    reasoning.confidenceScores.functionDescription = calculateConfidence(
        reasoning.inferredContent.functionDescription,
        context
    );

    // ========== 推理2：业务规则（增强版） ==========
    reasoning.inferredContent.businessRules = await reasonBusinessRulesEnhanced(
        client, functionInfo, context, reasoning.deepThinkingResult
    );
    reasoning.confidenceScores.businessRules = calculateConfidence(
        reasoning.inferredContent.businessRules,
        context
    );

    // ========== 推理3：数据项（增强版） ==========
    reasoning.inferredContent.dataItems = reasonDataItemsEnhanced(
        functionInfo.cosmicData, reasoning.deepThinkingResult
    );
    reasoning.confidenceScores.dataItems = 0.9; // COSMIC数据直接推导，置信度高

    // ========== 推理4：接口定义 ==========
    reasoning.inferredContent.interfaceDefinition = reasonInterfaceDefinition(
        functionInfo.cosmicData
    );
    reasoning.confidenceScores.interfaceDefinition = 0.85;

    // ========== 推理5：界面元素 ==========
    reasoning.inferredContent.uiElements = reasonUIElements(
        functionInfo.cosmicData,
        context
    );
    reasoning.confidenceScores.uiElements = 0.75;

    // ========== 推理6：验收标准（增强版） ==========
    reasoning.inferredContent.acceptanceCriteria = reasonAcceptanceCriteriaEnhanced(
        functionInfo.cosmicData,
        reasoning.inferredContent.businessRules,
        reasoning.deepThinkingResult
    );
    reasoning.confidenceScores.acceptanceCriteria = 0.8;

    // ========== 增强：添加非功能需求 ==========
    if (reasoning.deepThinkingResult) {
        reasoning.inferredContent.exceptionHandling = 
            reasoning.deepThinkingResult.exceptionHandling || 
            reasoning.deepThinkingResult.enhancedContent?.nonFunctionalRequirements?.exceptions || [];
        
        reasoning.inferredContent.performanceRequirements = 
            reasoning.deepThinkingResult.performanceCriteria || 
            reasoning.deepThinkingResult.enhancedContent?.nonFunctionalRequirements?.performance || {};
    }

    console.log(`✅ 智能推理完成: ${functionInfo.name}`);
    return reasoning;
}

/**
 * 推理功能说明
 * ⭐ 使用模板驱动的提示词 - 这是深度理解的真正体现！
 */
async function reasonFunctionDescription(client, functionInfo, context) {
    const { name, cosmicData } = functionInfo;
    const { requirementDoc, templateAnalysis } = context;

    console.log(`\n📝 生成功能说明: ${name}`);
    console.log(`模板分析状态: ${templateAnalysis ? '✓ 已加载' : '✗ 未加载'}`);

    // ========== 使用模板驱动的提示词构建器 ==========
    let promptResult;

    if (templateAnalysis) {
        // 🌟 有模板分析 - 使用深度理解的提示词
        console.log('🌟 使用模板驱动的提示词构建（深度理解）');
        promptResult = buildTemplateAwarePrompt({
            functionName: name,
            sectionType: 'functionDescription',
            cosmicData,
            templateAnalysis,
            context
        });

        console.log(`✓ 应用了${promptResult.sources.length}个分析维度: ${promptResult.sources.join(', ')}`);
    } else {
        // ⚠️ 没有模板分析 - 使用通用提示词
        console.log('⚠️ 未找到模板分析，使用通用提示词');

        // 从原始需求文档中查找相关内容
        const relatedContent = findRelatedContentInDoc(name, requirementDoc);

        // 分析COSMIC数据流
        const dataFlow = analyzeDataFlow(cosmicData);

        const prompt = `你是需求分析专家。请为以下功能撰写**功能说明**。

## 【功能名称】
${name}

## 【COSMIC数据移动分析】
${cosmicData.map(row => `- ${row.dataMovementType}: ${row.subProcessDesc} (数据组: ${row.dataGroup})`).join('\n')}

## 【数据流分析】
- 输入数据: ${dataFlow.entry.map(e => e.dataGroup).join('、')}
- 读取数据: ${dataFlow.read.map(r => r.dataGroup).join('、')}
- 写入数据: ${dataFlow.write.map(w => w.dataGroup).join('、')}
- 输出数据: ${dataFlow.exit.map(e => e.dataGroup).join('、')}

${relatedContent ? `## 【原始需求文档相关内容】\n${relatedContent}` : ''}

## 【要求】
1. 功能说明应包含：业务背景、使用场景、操作流程、核心价值
2. 字数：300-500字
3. 语言：专业、准确、具体
4. 基于COSMIC数据流程，描述完整的业务流程

请生成功能说明：`;

        promptResult = {
            prompt,
            templateGuidanceUsed: false,
            sources: []
        };
    }

    // ========== 调用AI生成 ==========
    try {
        console.log('\n发送AI请求...');
        console.log(`提示词长度: ${promptResult.prompt.length} 字符`);

        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是专业的需求分析师，擅长撰写清晰、准确的功能说明。' },
                { role: 'user', content: promptResult.prompt }
            ],
            temperature: 0.7,
            max_tokens: 1500
        });

        const result = response.choices[0].message.content.trim();
        console.log(`✅ 生成成功，长度: ${result.length} 字符`);
        console.log(`   ${promptResult.templateGuidanceUsed ? '✓ 符合模板要求' : '✗ 通用格式'}\n`);

        return result;
    } catch (error) {
        console.error('❌ 推理功能说明失败:', error.message);
        const dataFlow = analyzeDataFlow(cosmicData);
        return `${name}功能用于${dataFlow.purpose || '处理相关业务'}。`;
    }
}

/**
 * 推理业务规则
 */
async function reasonBusinessRules(client, functionInfo, context) {
    const { name, cosmicData } = functionInfo;
    const dataFlow = analyzeDataFlow(cosmicData);

    const prompt = `你是业务分析专家。请为以下功能推理**业务规则**。

## 【功能名称】
${name}

## 【数据流程】
${cosmicData.map((row, idx) => `步骤${idx + 1}: ${row.subProcessDesc}`).join('\n')}

## 【数据组】
${[...new Set(cosmicData.map(r => r.dataGroup))].join('、')}

## 【任务】
基于数据流程，推理出这个功能应该遵循的业务规则，包括：
1. 数据校验规则
2. 业务逻辑规则
3. 权限控制规则
4. 异常处理规则
5. 状态转换规则

## 【输出格式】
每条规则格式：
- 规则编号 | 规则名称 | 触发条件 | 处理逻辑

请输出至少5条业务规则：`;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是业务分析专家，擅长从业务流程中提取业务规则。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.6,
            max_tokens: 2000
        });

        return parseBusinessRules(response.choices[0].message.content);
    } catch (error) {
        console.error('推理业务规则失败:', error.message);
        return [];
    }
}

/**
 * 推理数据项
 */
function reasonDataItems(cosmicData) {
    const dataItems = [];
    const seenFields = new Set();

    cosmicData.forEach(row => {
        if (row.dataAttributes) {
            const fields = row.dataAttributes.split(/[,、，;；]/).map(f => f.trim());
            fields.forEach(field => {
                if (field && !seenFields.has(field)) {
                    seenFields.add(field);

                    // 推断字段类型
                    const fieldType = inferFieldType(field);
                    const fieldLength = inferFieldLength(field, fieldType);
                    const isRequired = inferIsRequired(field, row.dataMovementType);

                    dataItems.push({
                        fieldName: field,
                        fieldType: fieldType,
                        length: fieldLength,
                        required: isRequired,
                        description: `${field}`,
                        source: row.dataGroup
                    });
                }
            });
        }
    });

    return dataItems;
}

/**
 * 推断字段类型
 */
function inferFieldType(fieldName) {
    const lower = fieldName.toLowerCase();

    if (/id|编号|标识/.test(lower)) return 'VARCHAR';
    if (/时间|日期/.test(lower)) return 'DATETIME';
    if (/金额|价格|费用/.test(lower)) return 'DECIMAL';
    if (/数量|次数|个数/.test(lower)) return 'INT';
    if (/状态|类型|级别/.test(lower)) return 'VARCHAR';
    if (/描述|说明|备注|内容/.test(lower)) return 'TEXT';
    if (/是否|启用/.test(lower)) return 'BOOLEAN';

    return 'VARCHAR';
}

/**
 * 推断字段长度
 */
function inferFieldLength(fieldName, fieldType) {
    if (fieldType === 'VARCHAR') {
        if (/id|编号/.test(fieldName)) return '32';
        if (/名称/.test(fieldName)) return '100';
        if (/电话|手机/.test(fieldName)) return '20';
        return '255';
    }
    if (fieldType === 'DECIMAL') return '10,2';
    if (fieldType === 'INT') return '11';
    return '-';
}

/**
 * 推断是否必填
 */
function inferIsRequired(fieldName, dataMovementType) {
    if (/id|编号/.test(fieldName)) return '是';
    if (dataMovementType === 'E') return '是'; // Entry 类型的数据通常必填
    if (/备注|说明/.test(fieldName)) return '否';
    return '是';
}

/**
 * 推理接口定义
 */
function reasonInterfaceDefinition(cosmicData) {
    const dataFlow = analyzeDataFlow(cosmicData);

    // 提取请求参数（E类型的数据属性）
    const requestParams = [];
    dataFlow.entry.forEach(e => {
        if (e.dataAttributes) {
            const fields = e.dataAttributes.split(/[,、，;；]/).map(f => f.trim());
            fields.forEach(field => {
                requestParams.push({
                    paramName: field,
                    paramType: inferFieldType(field),
                    required: '是',
                    description: field
                });
            });
        }
    });

    // 提取响应参数（X类型的数据属性）
    const responseParams = [];
    dataFlow.exit.forEach(x => {
        if (x.dataAttributes) {
            const fields = x.dataAttributes.split(/[,、，;；]/).map(f => f.trim());
            fields.forEach(field => {
                responseParams.push({
                    paramName: field,
                    paramType: inferFieldType(field),
                    description: field
                });
            });
        }
    });

    return {
        requestParams,
        responseParams,
        method: 'POST',
        url: '/api/' + generateApiPath(cosmicData[0]?.functionalProcess || 'function')
    };
}

/**
 * 生成API路径
 */
function generateApiPath(functionName) {
    // 将中文功能名转换为拼音或英文路径
    const cleaned = functionName.replace(/[^\w\u4e00-\u9fa5]+/g, '_').toLowerCase();
    return cleaned;
}

/**
 * 推理UI元素
 */
function reasonUIElements(cosmicData, context) {
    const dataFlow = analyzeDataFlow(cosmicData);
    const uiElements = {
        inputFields: [],
        displayFields: [],
        buttons: [],
        tables: []
    };

    // 输入字段（基于E类型数据）
    dataFlow.entry.forEach(e => {
        if (e.dataAttributes) {
            const fields = e.dataAttributes.split(/[,、，;；]/).map(f => f.trim());
            fields.forEach(field => {
                uiElements.inputFields.push({
                    label: field,
                    type: inferInputType(field),
                    required: true
                });
            });
        }
    });

    // 显示字段（基于X类型数据）
    dataFlow.exit.forEach(x => {
        if (x.dataAttributes) {
            const fields = x.dataAttributes.split(/[,、，;；]/).map(f => f.trim());
            fields.forEach(field => {
                uiElements.displayFields.push({
                    label: field,
                    format: inferDisplayFormat(field)
                });
            });
        }
    });

    // 按钮（基于功能流程）
    uiElements.buttons.push({ label: '提交', action: 'submit' });
    if (dataFlow.write.length > 0) {
        uiElements.buttons.push({ label: '保存', action: 'save' });
    }
    uiElements.buttons.push({ label: '取消', action: 'cancel' });

    return uiElements;
}

/**
 * 推断输入类型
 */
function inferInputType(fieldName) {
    if (/时间|日期/.test(fieldName)) return 'datetime';
    if (/密码/.test(fieldName)) return 'password';
    if (/邮箱|email/i.test(fieldName)) return 'email';
    if (/电话|手机/.test(fieldName)) return 'tel';
    if (/数量|金额/.test(fieldName)) return 'number';
    if (/描述|备注|内容/.test(fieldName)) return 'textarea';
    if (/类型|状态|级别/.test(fieldName)) return 'select';
    return 'text';
}

/**
 * 推断显示格式
 */
function inferDisplayFormat(fieldName) {
    if (/时间|日期/.test(fieldName)) return 'YYYY-MM-DD HH:mm:ss';
    if (/金额|价格/.test(fieldName)) return '¥0,0.00';
    return 'text';
}

/**
 * 推理验收标准
 */
function reasonAcceptanceCriteria(cosmicData, businessRules) {
    const criteria = [];
    const dataFlow = analyzeDataFlow(cosmicData);

    // 基于数据流生成基本测试用例
    criteria.push({
        id: 'AC-001',
        scenario: '正常流程测试',
        precondition: '用户已登录系统',
        steps: [
            '1. 输入必填字段',
            '2. 点击提交按钮',
            '3. 系统处理请求'
        ],
        expected: '操作成功，显示成功提示信息'
    });

    // 数据校验测试
    if (dataFlow.entry.length > 0) {
        criteria.push({
            id: 'AC-002',
            scenario: '必填项校验',
            precondition: '用户已登录系统',
            steps: [
                '1. 不填写必填字段',
                '2. 点击提交按钮'
            ],
            expected: '系统提示必填项不能为空'
        });
    }

    // 权限测试
    criteria.push({
        id: 'AC-003',
        scenario: '权限控制测试',
        precondition: '使用无权限账号登录',
        steps: [
            '1. 尝试访问功能',
            '2. 系统检查权限'
        ],
        expected: '系统提示无权限，拒绝访问'
    });

    // 异常处理测试
    if (dataFlow.write.length > 0) {
        criteria.push({
            id: 'AC-004',
            scenario: '数据保存失败处理',
            precondition: '模拟数据库异常',
            steps: [
                '1. 提交数据',
                '2. 数据库保存失败'
            ],
            expected: '系统回滚事务，提示保存失败'
        });
    }

    // 业务规则测试
    if (businessRules && businessRules.length > 0) {
        criteria.push({
            id: 'AC-005',
            scenario: '业务规则验证',
            precondition: '准备测试数据',
            steps: [
                '1. 输入违反业务规则的数据',
                '2. 提交请求'
            ],
            expected: '系统提示违反业务规则，拒绝操作'
        });
    }

    return criteria;
}

// ==================== 辅助函数 ====================

/**
 * 分析数据流
 */
function analyzeDataFlow(cosmicData) {
    const flow = {
        entry: [],
        read: [],
        write: [],
        exit: [],
        purpose: ''
    };

    cosmicData.forEach(row => {
        switch (row.dataMovementType) {
            case 'E':
                flow.entry.push(row);
                break;
            case 'R':
                flow.read.push(row);
                break;
            case 'W':
                flow.write.push(row);
                break;
            case 'X':
                flow.exit.push(row);
                break;
        }
    });

    // 推断功能目的
    if (flow.write.length > 0) {
        if (cosmicData[0]?.functionalProcess.includes('新增') ||
            cosmicData[0]?.functionalProcess.includes('创建')) {
            flow.purpose = '创建新数据';
        } else if (cosmicData[0]?.functionalProcess.includes('修改') ||
            cosmicData[0]?.functionalProcess.includes('更新')) {
            flow.purpose = '更新已有数据';
        } else if (cosmicData[0]?.functionalProcess.includes('删除')) {
            flow.purpose = '删除数据';
        } else {
            flow.purpose = '处理和保存数据';
        }
    } else if (flow.read.length > 0) {
        flow.purpose = '查询和展示数据';
    } else {
        flow.purpose = '处理业务流程';
    }

    return flow;
}

/**
 * 在需求文档中查找相关内容
 */
function findRelatedContentInDoc(functionName, requirementDoc) {
    if (!requirementDoc || !requirementDoc.fullText) return null;

    const lines = requirementDoc.fullText.split('\n');
    const keywords = extractKeywords(functionName);

    let relatedLines = [];
    let contextWindow = 5; // 上下文窗口

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (keywords.some(kw => line.includes(kw))) {
            // 找到相关行，提取上下文
            const start = Math.max(0, i - contextWindow);
            const end = Math.min(lines.length, i + contextWindow + 1);
            relatedLines = relatedLines.concat(lines.slice(start, end));

            if (relatedLines.length > 100) break; // 限制长度
        }
    }

    return relatedLines.length > 0 ? relatedLines.join('\n') : null;
}

/**
 * 提取关键词
 */
function extractKeywords(text) {
    // 去除常见的功能动词，保留核心名词
    const stopWords = ['查询', '新增', '修改', '删除', '管理', '设置', '配置'];
    const words = text.split(/\s+/);
    return words.filter(w => w.length >= 2 && !stopWords.includes(w));
}

/**
 * 解析业务规则
 */
function parseBusinessRules(text) {
    const rules = [];
    const lines = text.split('\n');

    let currentRule = null;

    lines.forEach(line => {
        const trimmed = line.trim();

        // 匹配规则行（如：BR-001 | 规则名 | 条件 | 逻辑）
        const ruleMatch = trimmed.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/);
        if (ruleMatch) {
            rules.push({
                id: ruleMatch[1].trim(),
                name: ruleMatch[2].trim(),
                condition: ruleMatch[3].trim(),
                logic: ruleMatch[4].trim()
            });
        } else if (/^(BR-\d+|规则\d+)[：:]/.test(trimmed)) {
            // 匹配其他格式的规则
            const parts = trimmed.split(/[：:]/);
            if (parts.length >= 2) {
                rules.push({
                    id: parts[0].trim(),
                    name: parts[1].trim(),
                    condition: '待定义',
                    logic: '待定义'
                });
            }
        }
    });

    return rules;
}

/**
 * 计算置信度
 */
function calculateConfidence(content, context) {
    let confidence = 0.5; // 基础置信度

    if (!content) return 0;

    // 内容长度影响
    const length = typeof content === 'string' ? content.length : JSON.stringify(content).length;
    if (length > 200) confidence += 0.1;
    if (length > 500) confidence += 0.1;

    // 是否有原始文档支持
    if (context.requirementDoc && context.requirementDoc.fullText) {
        confidence += 0.15;
    }

    // 是否有模板指导
    if (context.templateAnalysis) {
        confidence += 0.15;
    }

    return Math.min(confidence, 1.0);
}

// ==================== 增强版推理函数 ====================

/**
 * 增强版功能说明推理
 * 结合深度思考结果，生成更丰富的功能说明
 */
async function reasonFunctionDescriptionEnhanced(client, functionInfo, context, deepThinkingResult) {
    const { name, cosmicData } = functionInfo;
    const { requirementDoc, templateAnalysis } = context;

    console.log(`📝 生成增强版功能说明: ${name}`);

    // 如果有深度思考结果，使用增强后的内容
    let enhancedContext = '';
    if (deepThinkingResult) {
        // 从深度思考结果中提取业务价值
        const businessValue = deepThinkingResult.businessValue || 
            deepThinkingResult.businessScenario?.businessValue || '';
        
        // 从深度思考结果中提取使用场景
        const scenarios = deepThinkingResult.coreScenarios || 
            deepThinkingResult.businessScenario?.scenarios || [];
        
        enhancedContext = `
## 【深度思考分析结果】
### 业务价值
${businessValue}

### 核心使用场景
${scenarios.map((s, i) => `${i + 1}. **${s.name}**: ${s.description || ''}`).join('\n')}

### 业务流程定位
${deepThinkingResult.businessScenario?.processPosition ? 
    `- 前置环节: ${(deepThinkingResult.businessScenario.processPosition.upstream || []).join(' → ')}
- 后续环节: ${(deepThinkingResult.businessScenario.processPosition.downstream || []).join(' → ')}` : ''}
`;
    }

    // 分析COSMIC数据流
    const dataFlow = analyzeDataFlow(cosmicData);
    
    // 从原始需求文档中查找相关内容
    const relatedContent = findRelatedContentInDoc(name, requirementDoc);

    const prompt = `你是资深需求分析专家。请为以下功能撰写**详细、专业、丰富的功能说明**。

## 【功能名称】
${name}

## 【COSMIC数据移动分析】
${cosmicData.map(row => `- ${row.dataMovementType}: ${row.subProcessDesc} (数据组: ${row.dataGroup})`).join('\n')}

## 【数据流分析】
- 输入数据: ${dataFlow.entry.map(e => e.dataGroup).join('、') || '无'}
- 读取数据: ${dataFlow.read.map(r => r.dataGroup).join('、') || '无'}
- 写入数据: ${dataFlow.write.map(w => w.dataGroup).join('、') || '无'}
- 输出数据: ${dataFlow.exit.map(e => e.dataGroup).join('、') || '无'}
- 功能目的: ${dataFlow.purpose}

${enhancedContext}

${relatedContent ? `## 【原始需求文档相关内容】\n${relatedContent}` : ''}

## 【输出要求】
请生成一份**全面、专业、详细**的功能说明，必须包含以下内容：

### 1. 功能概述（2-3句话概括功能目的）

### 2. 业务背景
- 解释这个功能存在的业务原因
- 说明它解决了什么业务问题

### 3. 使用场景（至少3个）
每个场景包括：
- 场景名称
- 触发条件
- 参与角色
- 操作流程
- 预期结果

### 4. 操作流程
详细描述用户从开始到完成的完整操作流程

### 5. 核心价值
说明该功能为用户/业务带来的价值

### 6. 前置条件
列出使用该功能前需要满足的条件

### 7. 后置影响
说明功能执行后对系统其他部分的影响

**要求：**
- 字数：500-800字
- 语言：专业、准确、具体、避免模糊表述
- 基于COSMIC数据流程，描述完整的业务逻辑
- 内容要有深度，不要浮于表面

请直接输出功能说明（不要输出标题）：`;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是专业的需求分析师，擅长撰写清晰、准确、全面的功能说明。你的输出应该具有深度和专业性。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 3000
        });

        const result = response.choices[0].message.content.trim();
        console.log(`✅ 增强版功能说明生成成功，长度: ${result.length} 字符`);
        return result;
    } catch (error) {
        console.error('❌ 增强版功能说明生成失败:', error.message);
        // 降级到基础版本
        return await reasonFunctionDescription(client, functionInfo, context);
    }
}

/**
 * 增强版业务规则推理
 * 结合深度思考结果，生成更全面的业务规则
 */
async function reasonBusinessRulesEnhanced(client, functionInfo, context, deepThinkingResult) {
    const { name, cosmicData } = functionInfo;
    const dataFlow = analyzeDataFlow(cosmicData);

    console.log(`📋 生成增强版业务规则: ${name}`);

    // 从深度思考结果中获取已识别的规则
    let existingRules = '';
    if (deepThinkingResult?.keyRules || deepThinkingResult?.businessRulesDeep?.rules) {
        const rules = deepThinkingResult.keyRules || deepThinkingResult.businessRulesDeep.rules;
        existingRules = `
## 【深度分析已识别的规则】
${rules.slice(0, 10).map((r, i) => `${i + 1}. **${r.name || r.ruleName}**: ${r.description}
   - 条件: ${r.condition}
   - 动作: ${r.action || r.logic}`).join('\n')}
`;
    }

    // 从深度思考结果中获取异常处理
    let exceptionRules = '';
    if (deepThinkingResult?.exceptionHandling || deepThinkingResult?.exceptionScenarios?.exceptions) {
        const exceptions = deepThinkingResult.exceptionHandling || 
            deepThinkingResult.exceptionScenarios.exceptions;
        exceptionRules = `
## 【已识别的异常场景】
${exceptions.slice(0, 5).map((e, i) => `${i + 1}. ${e.exception || e.name}: ${e.handling}`).join('\n')}
`;
    }

    const prompt = `你是业务规则分析专家。请为以下功能深入挖掘**全面、详细的业务规则**。

## 【功能名称】
${name}

## 【数据流程】
${cosmicData.map((row, idx) => `步骤${idx + 1}: [${row.dataMovementType}] ${row.subProcessDesc} (数据组: ${row.dataGroup})`).join('\n')}

## 【数据组】
${[...new Set(cosmicData.map(r => r.dataGroup))].join('、')}

## 【数据属性】
${[...new Set(cosmicData.flatMap(r => (r.dataAttributes || '').split(/[,、，;；]/).map(a => a.trim())).filter(Boolean))].join('、') || '待分析'}

${existingRules}

${exceptionRules}

## 【深度挖掘任务】
请从以下8个维度全面挖掘业务规则：

### 1. 数据校验规则（至少5条）
- 每个输入字段的格式、范围、必填性校验
- 字段间的关联校验
- 唯一性校验

### 2. 业务逻辑规则（至少3条）
- 核心业务判断逻辑
- 计算公式和算法
- 条件分支处理

### 3. 权限控制规则（至少2条）
- 角色权限要求
- 数据访问权限

### 4. 状态转换规则（至少2条）
- 数据状态变更条件
- 状态机定义

### 5. 时效性规则
- 时间限制
- 有效期规则

### 6. 限额规则
- 数量限制
- 金额限制
- 频率限制

### 7. 关联约束规则
- 与其他数据/功能的依赖关系
- 一致性约束

### 8. 异常处理规则
- 异常触发条件
- 异常处理方式

## 【输出格式】
每条规则格式：
规则编号 | 规则名称 | 规则类别 | 触发条件 | 处理逻辑 | 违规处理

请输出至少15条业务规则：`;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是业务规则分析专家，擅长从业务流程中深入挖掘全面的业务规则。输出要全面、专业、可执行。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.6,
            max_tokens: 4000
        });

        const rules = parseBusinessRulesEnhanced(response.choices[0].message.content);
        console.log(`✅ 增强版业务规则生成成功，共 ${rules.length} 条`);
        return rules;
    } catch (error) {
        console.error('增强版业务规则推理失败:', error.message);
        return await reasonBusinessRules(client, functionInfo, context);
    }
}

/**
 * 解析增强版业务规则
 */
function parseBusinessRulesEnhanced(text) {
    const rules = [];
    const lines = text.split('\n');

    lines.forEach((line, index) => {
        const trimmed = line.trim();

        // 匹配规则行（支持多种格式）
        // 格式1: BR-001 | 规则名 | 类别 | 条件 | 逻辑 | 违规处理
        const rule6Match = trimmed.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/);
        if (rule6Match) {
            rules.push({
                id: rule6Match[1].trim(),
                name: rule6Match[2].trim(),
                category: rule6Match[3].trim(),
                condition: rule6Match[4].trim(),
                logic: rule6Match[5].trim(),
                violation: rule6Match[6].trim()
            });
            return;
        }

        // 格式2: BR-001 | 规则名 | 条件 | 逻辑
        const rule4Match = trimmed.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/);
        if (rule4Match) {
            rules.push({
                id: rule4Match[1].trim(),
                name: rule4Match[2].trim(),
                category: '业务规则',
                condition: rule4Match[3].trim(),
                logic: rule4Match[4].trim(),
                violation: '拒绝操作'
            });
            return;
        }

        // 格式3: 数字. **规则名**: 描述
        const markdownMatch = trimmed.match(/^\d+\.\s*\*\*(.+?)\*\*[:：]\s*(.+)$/);
        if (markdownMatch) {
            rules.push({
                id: `BR-${String(rules.length + 1).padStart(3, '0')}`,
                name: markdownMatch[1].trim(),
                category: '业务规则',
                condition: '满足条件时',
                logic: markdownMatch[2].trim(),
                violation: '提示错误'
            });
            return;
        }

        // 格式4: BR-001：规则描述
        const simpleMatch = trimmed.match(/^(BR-\d+|规则\d+)[：:]\s*(.+)$/);
        if (simpleMatch) {
            rules.push({
                id: simpleMatch[1].trim(),
                name: simpleMatch[2].trim().slice(0, 20),
                category: '业务规则',
                condition: '触发时',
                logic: simpleMatch[2].trim(),
                violation: '拒绝操作'
            });
        }
    });

    return rules;
}

/**
 * 增强版数据项推理
 * 结合深度思考结果，生成更详细的数据字典
 */
function reasonDataItemsEnhanced(cosmicData, deepThinkingResult) {
    const dataItems = [];
    const seenFields = new Set();

    // 首先从深度思考结果中获取详细的数据定义
    if (deepThinkingResult?.keyDataFields) {
        deepThinkingResult.keyDataFields.forEach(field => {
            if (!seenFields.has(field.name)) {
                seenFields.add(field.name);
                dataItems.push({
                    fieldName: field.name,
                    fieldType: field.type || inferFieldType(field.name),
                    length: inferFieldLength(field.name, field.type || inferFieldType(field.name)),
                    required: field.required ? '是' : '否',
                    description: field.description || field.name,
                    source: '功能输入',
                    constraints: field.constraints || '',
                    example: field.example || ''
                });
            }
        });
    }

    // 从深度思考的数据实体中获取
    if (deepThinkingResult?.dataFlowAnalysis?.entities) {
        deepThinkingResult.dataFlowAnalysis.entities.forEach(entity => {
            if (entity.attributes) {
                entity.attributes.forEach(attr => {
                    if (!seenFields.has(attr.name)) {
                        seenFields.add(attr.name);
                        dataItems.push({
                            fieldName: attr.name,
                            fieldType: attr.type || 'VARCHAR',
                            length: attr.length || '255',
                            required: attr.required ? '是' : '否',
                            description: attr.description || attr.name,
                            source: entity.entityName,
                            constraints: (attr.constraints || []).join('; '),
                            example: attr.example || ''
                        });
                    }
                });
            }
        });
    }

    // 从COSMIC数据中补充
    cosmicData.forEach(row => {
        if (row.dataAttributes) {
            const fields = row.dataAttributes.split(/[,、，;；]/).map(f => f.trim());
            fields.forEach(field => {
                if (field && !seenFields.has(field)) {
                    seenFields.add(field);

                    const fieldType = inferFieldType(field);
                    const fieldLength = inferFieldLength(field, fieldType);
                    const isRequired = inferIsRequired(field, row.dataMovementType);

                    dataItems.push({
                        fieldName: field,
                        fieldType: fieldType,
                        length: fieldLength,
                        required: isRequired,
                        description: `${field}`,
                        source: row.dataGroup,
                        constraints: '',
                        example: ''
                    });
                }
            });
        }
    });

    return dataItems;
}

/**
 * 增强版验收标准推理
 * 结合深度思考结果，生成更全面的验收标准
 */
function reasonAcceptanceCriteriaEnhanced(cosmicData, businessRules, deepThinkingResult) {
    const criteria = [];
    const dataFlow = analyzeDataFlow(cosmicData);

    // 首先从深度思考结果中获取验收标准
    if (deepThinkingResult?.acceptanceCriteria) {
        deepThinkingResult.acceptanceCriteria.forEach((c, idx) => {
            criteria.push({
                id: c.id || `AC-${String(idx + 1).padStart(3, '0')}`,
                scenario: c.scenario,
                precondition: Array.isArray(c.preconditions) ? c.preconditions.join('; ') : (c.precondition || '用户已登录'),
                steps: c.steps || c.testSteps || [],
                expected: c.expected || c.expectedResult,
                priority: c.priority || 'P1'
            });
        });
    }

    if (deepThinkingResult?.acceptanceCriteriaDeep?.criteria) {
        deepThinkingResult.acceptanceCriteriaDeep.criteria.forEach((c, idx) => {
            if (!criteria.find(existing => existing.scenario === c.scenario)) {
                criteria.push({
                    id: c.criteriaId || `AC-${String(criteria.length + 1).padStart(3, '0')}`,
                    scenario: c.scenario,
                    category: c.category,
                    precondition: Array.isArray(c.preconditions) ? c.preconditions.join('; ') : '用户已登录',
                    steps: c.testSteps || [],
                    expected: c.expectedResult,
                    dataCheck: c.actualDataCheck,
                    priority: c.priority || 'P1'
                });
            }
        });
    }

    // 如果深度思考没有足够的验收标准，补充基础验收标准
    if (criteria.length < 5) {
        // 正常流程测试
        if (!criteria.find(c => c.scenario?.includes('正常'))) {
            criteria.push({
                id: `AC-${String(criteria.length + 1).padStart(3, '0')}`,
                scenario: '正常流程测试',
                category: '功能性验收',
                precondition: '用户已登录系统，具有操作权限',
                steps: [
                    '1. 进入功能页面',
                    '2. 输入所有必填字段的有效数据',
                    '3. 点击提交/保存按钮',
                    '4. 等待系统处理完成'
                ],
                expected: '操作成功，显示成功提示信息，数据正确保存/处理',
                priority: 'P0'
            });
        }

        // 必填项校验
        if (dataFlow.entry.length > 0 && !criteria.find(c => c.scenario?.includes('必填'))) {
            criteria.push({
                id: `AC-${String(criteria.length + 1).padStart(3, '0')}`,
                scenario: '必填项校验测试',
                category: '数据验收',
                precondition: '用户已登录系统',
                steps: [
                    '1. 进入功能页面',
                    '2. 不填写必填字段，留空',
                    '3. 点击提交按钮'
                ],
                expected: '系统提示必填项不能为空，阻止提交',
                priority: 'P1'
            });
        }

        // 权限控制测试
        if (!criteria.find(c => c.scenario?.includes('权限'))) {
            criteria.push({
                id: `AC-${String(criteria.length + 1).padStart(3, '0')}`,
                scenario: '权限控制测试',
                category: '安全验收',
                precondition: '使用无权限账号登录',
                steps: [
                    '1. 登录无此功能权限的账号',
                    '2. 尝试访问该功能'
                ],
                expected: '系统提示无权限，拒绝访问或隐藏功能入口',
                priority: 'P1'
            });
        }

        // 数据格式校验
        if (!criteria.find(c => c.scenario?.includes('格式'))) {
            criteria.push({
                id: `AC-${String(criteria.length + 1).padStart(3, '0')}`,
                scenario: '数据格式校验测试',
                category: '数据验收',
                precondition: '用户已登录系统',
                steps: [
                    '1. 进入功能页面',
                    '2. 在数字字段输入非数字',
                    '3. 在日期字段输入非法日期',
                    '4. 输入超长文本',
                    '5. 点击提交'
                ],
                expected: '系统对每个格式错误给出明确的错误提示',
                priority: 'P1'
            });
        }

        // 异常处理测试
        if (dataFlow.write.length > 0 && !criteria.find(c => c.scenario?.includes('异常'))) {
            criteria.push({
                id: `AC-${String(criteria.length + 1).padStart(3, '0')}`,
                scenario: '系统异常处理测试',
                category: '异常验收',
                precondition: '模拟系统异常（如数据库连接失败）',
                steps: [
                    '1. 正常提交数据',
                    '2. 模拟后端服务异常'
                ],
                expected: '系统给出友好的错误提示，不暴露技术细节，数据保持一致性',
                priority: 'P2'
            });
        }

        // 并发测试
        if (!criteria.find(c => c.scenario?.includes('并发'))) {
            criteria.push({
                id: `AC-${String(criteria.length + 1).padStart(3, '0')}`,
                scenario: '并发操作测试',
                category: '性能验收',
                precondition: '多个用户同时操作',
                steps: [
                    '1. 用户A和用户B同时修改同一数据',
                    '2. 先后提交'
                ],
                expected: '系统正确处理并发冲突，提示后提交者数据已被修改',
                priority: 'P2'
            });
        }

        // 业务规则验证
        if (businessRules && businessRules.length > 0 && !criteria.find(c => c.scenario?.includes('规则'))) {
            criteria.push({
                id: `AC-${String(criteria.length + 1).padStart(3, '0')}`,
                scenario: '业务规则验证测试',
                category: '规则验收',
                precondition: '准备违反业务规则的测试数据',
                steps: [
                    '1. 输入违反业务规则的数据',
                    '2. 提交请求'
                ],
                expected: '系统正确识别规则违反，给出明确的错误提示，拒绝操作',
                priority: 'P1'
            });
        }
    }

    // 添加异常处理相关的验收标准
    if (deepThinkingResult?.exceptionHandling) {
        deepThinkingResult.exceptionHandling.forEach((exc, idx) => {
            if (!criteria.find(c => c.scenario?.includes(exc.exception))) {
                criteria.push({
                    id: `AC-${String(criteria.length + 1).padStart(3, '0')}`,
                    scenario: `${exc.exception}处理测试`,
                    category: '异常验收',
                    precondition: `模拟${exc.exception}情况`,
                    steps: [`1. 触发${exc.exception}`, '2. 观察系统响应'],
                    expected: exc.handling || '系统正确处理异常',
                    priority: 'P2'
                });
            }
        });
    }

    return criteria;
}

// ==================== 导出模块 ====================

module.exports = {
    intelligentReasoningForFunction,
    reasonFunctionDescription,
    reasonFunctionDescriptionEnhanced,
    reasonBusinessRules,
    reasonBusinessRulesEnhanced,
    reasonDataItems,
    reasonDataItemsEnhanced,
    reasonInterfaceDefinition,
    reasonUIElements,
    reasonAcceptanceCriteria,
    reasonAcceptanceCriteriaEnhanced,
    analyzeDataFlow
};
