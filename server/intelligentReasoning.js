/**
 * 智能内容推理与质量自检模块
 * 基于COSMIC数据和原始需求文档，智能推理生成内容，并进行质量检查
 */

// 引入模板驱动的提示词构建器 - 这是深度理解的关键！
const { buildTemplateAwarePrompt } = require('./templateAwarePromptBuilder');

// ==================== 智能内容推理 ====================

/**
 * 智能推理功能需求内容
 * 基于COSMIC拆分结果、原始需求文档、模板分析，推理出应该生成的内容
 */
async function intelligentReasoningForFunction(client, functionInfo, context) {
    console.log(`🧠 智能推理功能: ${functionInfo.name}`);

    const reasoning = {
        functionName: functionInfo.name,
        cosmicData: functionInfo.cosmicData,
        inferredContent: {},
        confidenceScores: {}
    };

    // ========== 推理1：功能说明 ==========
    reasoning.inferredContent.functionDescription = await reasonFunctionDescription(
        client, functionInfo, context
    );
    reasoning.confidenceScores.functionDescription = calculateConfidence(
        reasoning.inferredContent.functionDescription,
        context
    );

    // ========== 推理2：业务规则 ==========
    reasoning.inferredContent.businessRules = await reasonBusinessRules(
        client, functionInfo, context
    );
    reasoning.confidenceScores.businessRules = calculateConfidence(
        reasoning.inferredContent.businessRules,
        context
    );

    // ========== 推理3：数据项 ==========
    reasoning.inferredContent.dataItems = reasonDataItems(functionInfo.cosmicData);
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

    // ========== 推理6：验收标准 ==========
    reasoning.inferredContent.acceptanceCriteria = reasonAcceptanceCriteria(
        functionInfo.cosmicData,
        reasoning.inferredContent.businessRules
    );
    reasoning.confidenceScores.acceptanceCriteria = 0.8;

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

// ==================== 导出模块 ====================

module.exports = {
    intelligentReasoningForFunction,
    reasonFunctionDescription,
    reasonBusinessRules,
    reasonDataItems,
    reasonInterfaceDefinition,
    reasonUIElements,
    reasonAcceptanceCriteria,
    analyzeDataFlow
};
