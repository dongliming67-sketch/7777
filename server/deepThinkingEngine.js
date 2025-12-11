/**
 * 深度思考引擎 - 动态驱动的需求规格书内容增强
 * 在生成需求规格书内容之前，进行多轮深度思考和推理，生成更全面、更丰富的内容
 */

// ==================== 核心深度思考流程 ====================

/**
 * 对功能过程进行深度思考分析
 * 返回增强后的推理结果，用于生成更丰富的需求规格书内容
 * 
 * @param {Object} client - OpenAI客户端
 * @param {Object} functionInfo - 功能信息 {name, cosmicData}
 * @param {Object} context - 上下文 {requirementDoc, templateAnalysis, allFunctions}
 * @returns {Object} 深度思考结果
 */
async function deepThinkForFunction(client, functionInfo, context) {
    console.log(`\n🧠 ========== 深度思考引擎启动 ==========`);
    console.log(`📌 功能名称: ${functionInfo.name}`);

    const thinkingResult = {
        functionName: functionInfo.name,
        thinkingProcess: [],      // 思考过程记录
        businessScenario: null,   // 业务场景分析
        userRoles: null,          // 用户角色分析
        dataFlowAnalysis: null,   // 数据流深度分析
        exceptionScenarios: null, // 异常场景推理
        relatedFunctions: null,   // 关联功能分析
        businessRulesDeep: null,  // 业务规则深度挖掘
        acceptanceCriteriaDeep: null, // 验收标准完善
        uiuxRecommendations: null,    // 界面交互建议
        performanceConsiderations: null, // 性能考虑
        securityConsiderations: null,    // 安全考虑
        enhancedContent: {}       // 增强后的生成内容
    };

    try {
        // ========== 第一轮思考：业务场景深度分析 ==========
        console.log('💭 第一轮思考: 业务场景深度分析...');
        thinkingResult.businessScenario = await thinkBusinessScenario(
            client, functionInfo, context
        );
        thinkingResult.thinkingProcess.push({
            phase: '业务场景分析',
            status: '完成',
            insightsCount: thinkingResult.businessScenario?.scenarios?.length || 0
        });

        // ========== 第二轮思考：用户角色与权限分析 ==========
        console.log('💭 第二轮思考: 用户角色与权限分析...');
        thinkingResult.userRoles = await thinkUserRoles(
            client, functionInfo, context, thinkingResult.businessScenario
        );
        thinkingResult.thinkingProcess.push({
            phase: '用户角色分析',
            status: '完成',
            rolesIdentified: thinkingResult.userRoles?.roles?.length || 0
        });

        // ========== 第三轮思考：数据流程深度分析 ==========
        console.log('💭 第三轮思考: 数据流程深度分析...');
        thinkingResult.dataFlowAnalysis = await thinkDataFlowDeep(
            client, functionInfo, context
        );
        thinkingResult.thinkingProcess.push({
            phase: '数据流分析',
            status: '完成',
            dataEntities: thinkingResult.dataFlowAnalysis?.entities?.length || 0
        });

        // ========== 第四轮思考：异常场景推理 ==========
        console.log('💭 第四轮思考: 异常场景推理...');
        thinkingResult.exceptionScenarios = await thinkExceptionScenarios(
            client, functionInfo, context, thinkingResult
        );
        thinkingResult.thinkingProcess.push({
            phase: '异常场景推理',
            status: '完成',
            exceptionsIdentified: thinkingResult.exceptionScenarios?.exceptions?.length || 0
        });

        // ========== 第五轮思考：关联功能分析 ==========
        console.log('💭 第五轮思考: 关联功能分析...');
        thinkingResult.relatedFunctions = await thinkRelatedFunctions(
            client, functionInfo, context
        );
        thinkingResult.thinkingProcess.push({
            phase: '关联功能分析',
            status: '完成',
            relatedCount: thinkingResult.relatedFunctions?.related?.length || 0
        });

        // ========== 第六轮思考：业务规则深度挖掘 ==========
        console.log('💭 第六轮思考: 业务规则深度挖掘...');
        thinkingResult.businessRulesDeep = await thinkBusinessRulesDeep(
            client, functionInfo, context, thinkingResult
        );
        thinkingResult.thinkingProcess.push({
            phase: '业务规则深挖',
            status: '完成',
            rulesIdentified: thinkingResult.businessRulesDeep?.rules?.length || 0
        });

        // ========== 第七轮思考：验收标准完善 ==========
        console.log('💭 第七轮思考: 验收标准完善...');
        thinkingResult.acceptanceCriteriaDeep = await thinkAcceptanceCriteriaDeep(
            client, functionInfo, context, thinkingResult
        );
        thinkingResult.thinkingProcess.push({
            phase: '验收标准完善',
            status: '完成',
            criteriaCount: thinkingResult.acceptanceCriteriaDeep?.criteria?.length || 0
        });

        // ========== 第八轮思考：界面交互建议 ==========
        console.log('💭 第八轮思考: 界面交互建议...');
        thinkingResult.uiuxRecommendations = await thinkUIUXRecommendations(
            client, functionInfo, context, thinkingResult
        );
        thinkingResult.thinkingProcess.push({
            phase: 'UI/UX建议',
            status: '完成',
            recommendations: thinkingResult.uiuxRecommendations?.recommendations?.length || 0
        });

        // ========== 综合思考结果，生成增强内容 ==========
        console.log('🔄 综合思考结果...');
        thinkingResult.enhancedContent = synthesizeThinkingResults(thinkingResult);

        console.log(`✅ 深度思考完成，共${thinkingResult.thinkingProcess.length}轮分析`);
        console.log(`🧠 ========== 深度思考引擎结束 ==========\n`);

        return thinkingResult;

    } catch (error) {
        console.error('❌ 深度思考过程出错:', error.message);
        return thinkingResult;
    }
}

// ==================== 第一轮：业务场景深度分析 ====================

async function thinkBusinessScenario(client, functionInfo, context) {
    const { name, cosmicData } = functionInfo;
    const { requirementDoc } = context;

    // 分析COSMIC数据流
    const dataFlow = analyzeDataFlowPattern(cosmicData);

    const prompt = `你是一位资深业务分析师，请对以下功能进行**深度业务场景分析**。

## 【功能名称】
${name}

## 【COSMIC数据移动】
${cosmicData.map((row, idx) => `步骤${idx + 1}. [${row.dataMovementType}] ${row.subProcessDesc} (数据组: ${row.dataGroup})`).join('\n')}

## 【数据流模式分析】
- 输入数据(E): ${dataFlow.entry.map(e => e.dataGroup).join('、') || '无'}
- 读取数据(R): ${dataFlow.read.map(r => r.dataGroup).join('、') || '无'}
- 写入数据(W): ${dataFlow.write.map(w => w.dataGroup).join('、') || '无'}
- 输出数据(X): ${dataFlow.exit.map(x => x.dataGroup).join('、') || '无'}

${requirementDoc?.fullText ? `## 【原始需求文档片段】\n${extractRelevantContent(requirementDoc.fullText, name).slice(0, 2000)}` : ''}

## 【深度分析任务】
请从以下维度进行深度思考和分析：

1. **核心业务价值**：这个功能解决了什么业务问题？为用户/企业带来什么价值？
2. **典型使用场景**：列举3-5个具体的使用场景，包括：
   - 场景名称
   - 触发条件/时机
   - 参与角色
   - 预期结果
3. **业务流程定位**：这个功能在整体业务流程中处于什么位置？前后有哪些环节？
4. **业务约束条件**：有哪些业务约束或前置条件？
5. **成功标志**：如何判断该功能执行成功？

请输出JSON格式：
\`\`\`json
{
  "businessValue": "核心业务价值描述",
  "scenarios": [
    {
      "name": "场景名称",
      "trigger": "触发条件",
      "actors": ["参与角色"],
      "steps": ["步骤1", "步骤2"],
      "expectedResult": "预期结果"
    }
  ],
  "processPosition": {
    "upstream": ["前置功能/环节"],
    "downstream": ["后续功能/环节"]
  },
  "constraints": ["约束条件列表"],
  "successCriteria": ["成功判断标准"]
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是资深业务分析师，擅长从技术数据中挖掘业务价值和使用场景。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 3000
        });

        return parseJSONResponse(response.choices[0].message.content);
    } catch (error) {
        console.error('业务场景分析失败:', error.message);
        return null;
    }
}

// ==================== 第二轮：用户角色与权限分析 ====================

async function thinkUserRoles(client, functionInfo, context, businessScenario) {
    const { name, cosmicData } = functionInfo;

    // 从COSMIC数据中提取功能用户
    const functionalUsers = [...new Set(cosmicData.map(r => r.functionalUser).filter(Boolean))];

    const prompt = `你是用户体验和权限设计专家，请对以下功能进行**用户角色与权限深度分析**。

## 【功能名称】
${name}

## 【已识别的功能用户】
${functionalUsers.join('、') || '未明确'}

## 【业务场景分析结果】
${businessScenario ? JSON.stringify(businessScenario, null, 2) : '无'}

## 【深度分析任务】
请分析：

1. **涉及用户角色**：识别所有可能使用该功能的用户角色
2. **权限层级**：每个角色对该功能有什么权限（查看/编辑/删除/审批等）
3. **操作差异**：不同角色操作该功能时有什么差异
4. **权限控制点**：在功能流程中哪些环节需要权限控制
5. **角色交互**：不同角色之间如何协作/交互

请输出JSON格式：
\`\`\`json
{
  "roles": [
    {
      "roleName": "角色名称",
      "roleDescription": "角色描述",
      "permissions": ["权限1", "权限2"],
      "restrictions": ["限制1"],
      "typicalOperations": ["典型操作"]
    }
  ],
  "permissionMatrix": {
    "角色1": {"查看": true, "编辑": true, "删除": false},
    "角色2": {"查看": true, "编辑": false, "删除": false}
  },
  "controlPoints": ["权限控制点列表"],
  "roleInteractions": [
    {
      "from": "角色1",
      "to": "角色2",
      "interaction": "交互方式"
    }
  ]
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是用户体验和权限设计专家，擅长分析用户角色和权限控制。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.6,
            max_tokens: 2500
        });

        return parseJSONResponse(response.choices[0].message.content);
    } catch (error) {
        console.error('用户角色分析失败:', error.message);
        return null;
    }
}

// ==================== 第三轮：数据流程深度分析 ====================

async function thinkDataFlowDeep(client, functionInfo, context) {
    const { name, cosmicData } = functionInfo;
    const dataFlow = analyzeDataFlowPattern(cosmicData);

    // 提取所有数据组和属性
    const allDataGroups = [...new Set(cosmicData.map(r => r.dataGroup).filter(Boolean))];
    const allDataAttrs = [...new Set(cosmicData.flatMap(r => 
        (r.dataAttributes || '').split(/[,、，;；]/).map(a => a.trim())
    ).filter(Boolean))];

    const prompt = `你是数据架构专家，请对以下功能进行**数据流程深度分析**。

## 【功能名称】
${name}

## 【数据移动详情】
${cosmicData.map((row, idx) => `${idx + 1}. [${row.dataMovementType}] ${row.subProcessDesc}
   - 数据组: ${row.dataGroup}
   - 数据属性: ${row.dataAttributes || '未指定'}`).join('\n')}

## 【数据概览】
- 涉及数据组: ${allDataGroups.join('、')}
- 涉及数据属性: ${allDataAttrs.join('、')}

## 【深度分析任务】
请进行数据层面的深度分析：

1. **数据实体识别**：识别涉及的数据实体及其属性
2. **数据来源追溯**：每个数据从哪里来？（用户输入/系统读取/外部接口）
3. **数据转换逻辑**：数据在处理过程中经过什么转换？
4. **数据存储设计**：数据需要如何存储？有什么存储要求？
5. **数据完整性约束**：有哪些数据完整性要求？
6. **数据字典扩展**：每个字段的详细定义

请输出JSON格式：
\`\`\`json
{
  "entities": [
    {
      "entityName": "实体名称",
      "description": "实体描述",
      "attributes": [
        {
          "name": "属性名",
          "type": "数据类型",
          "length": "长度",
          "required": true,
          "description": "详细描述",
          "constraints": ["约束条件"],
          "source": "数据来源",
          "example": "示例值"
        }
      ]
    }
  ],
  "dataTransformations": [
    {
      "input": "输入数据",
      "output": "输出数据",
      "transformLogic": "转换逻辑描述"
    }
  ],
  "integrityRules": ["完整性规则列表"],
  "storageRequirements": {
    "persistence": "持久化要求",
    "indexing": ["需要索引的字段"],
    "archiving": "归档策略"
  }
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是数据架构专家，擅长分析数据流程和数据模型设计。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 4000
        });

        return parseJSONResponse(response.choices[0].message.content);
    } catch (error) {
        console.error('数据流分析失败:', error.message);
        return null;
    }
}

// ==================== 第四轮：异常场景推理 ====================

async function thinkExceptionScenarios(client, functionInfo, context, previousResults) {
    const { name, cosmicData } = functionInfo;

    const prompt = `你是质量保证专家，请对以下功能进行**异常场景深度推理**。

## 【功能名称】
${name}

## 【数据流程】
${cosmicData.map((row, idx) => `${idx + 1}. [${row.dataMovementType}] ${row.subProcessDesc}`).join('\n')}

## 【已分析的业务场景】
${previousResults.businessScenario ? JSON.stringify(previousResults.businessScenario.scenarios?.slice(0, 3), null, 2) : '无'}

## 【已分析的数据实体】
${previousResults.dataFlowAnalysis?.entities ? previousResults.dataFlowAnalysis.entities.map(e => e.entityName).join('、') : '无'}

## 【深度分析任务】
请推理可能出现的异常场景：

1. **输入异常**：用户输入可能有哪些问题？（格式错误/超出范围/空值等）
2. **系统异常**：系统处理时可能遇到什么问题？（并发冲突/数据库异常/网络问题等）
3. **业务异常**：业务规则上可能出现什么异常？（权限不足/状态不匹配/超时等）
4. **边界情况**：有哪些边界情况需要考虑？
5. **恢复策略**：每种异常应该如何处理和恢复？

请输出JSON格式：
\`\`\`json
{
  "exceptions": [
    {
      "category": "异常类别（输入/系统/业务/边界）",
      "name": "异常名称",
      "description": "异常描述",
      "trigger": "触发条件",
      "impact": "影响范围",
      "handling": "处理策略",
      "userMessage": "用户提示信息",
      "recoveryAction": "恢复措施"
    }
  ],
  "boundaryConditions": [
    {
      "condition": "边界条件描述",
      "expectedBehavior": "预期行为"
    }
  ],
  "globalErrorHandling": {
    "retryStrategy": "重试策略",
    "fallbackAction": "降级措施",
    "alertThreshold": "告警阈值"
  }
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是质量保证专家，擅长识别系统异常和边界情况。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 3000
        });

        return parseJSONResponse(response.choices[0].message.content);
    } catch (error) {
        console.error('异常场景推理失败:', error.message);
        return null;
    }
}

// ==================== 第五轮：关联功能分析 ====================

async function thinkRelatedFunctions(client, functionInfo, context) {
    const { name, cosmicData } = functionInfo;
    const { allFunctions } = context;

    // 获取所有功能列表
    const allFunctionNames = allFunctions || [];

    const prompt = `你是系统架构师，请分析以下功能与其他功能的**关联关系**。

## 【当前功能】
${name}

## 【数据流程】
${cosmicData.map(r => `- [${r.dataMovementType}] ${r.subProcessDesc} (${r.dataGroup})`).join('\n')}

## 【系统中的其他功能】
${allFunctionNames.length > 0 ? allFunctionNames.slice(0, 30).join('\n') : '未提供其他功能列表'}

## 【分析任务】
请分析：

1. **前置功能**：哪些功能需要先执行才能使用本功能？
2. **后续功能**：本功能完成后，通常会触发哪些功能？
3. **数据依赖**：本功能依赖哪些功能产生的数据？
4. **数据供给**：本功能产生的数据会被哪些功能使用？
5. **互斥功能**：有哪些功能与本功能互斥或不能同时执行？
6. **组合场景**：本功能通常与哪些功能一起使用？

请输出JSON格式：
\`\`\`json
{
  "related": [
    {
      "functionName": "关联功能名称",
      "relationType": "关系类型（前置/后续/数据依赖/数据供给/互斥/常用组合）",
      "description": "关系描述",
      "dataShared": ["共享的数据"]
    }
  ],
  "dependencies": {
    "required": ["必须的前置功能"],
    "optional": ["可选的前置功能"]
  },
  "impacts": {
    "directlyAffected": ["直接受影响的功能"],
    "indirectlyAffected": ["间接受影响的功能"]
  },
  "commonWorkflows": [
    {
      "workflowName": "工作流名称",
      "steps": ["步骤1", "步骤2", "本功能", "步骤4"]
    }
  ]
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是系统架构师，擅长分析功能模块间的关联关系。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.6,
            max_tokens: 2500
        });

        return parseJSONResponse(response.choices[0].message.content);
    } catch (error) {
        console.error('关联功能分析失败:', error.message);
        return null;
    }
}

// ==================== 第六轮：业务规则深度挖掘 ====================

async function thinkBusinessRulesDeep(client, functionInfo, context, previousResults) {
    const { name, cosmicData } = functionInfo;

    const prompt = `你是业务规则专家，请对以下功能进行**业务规则深度挖掘**。

## 【功能名称】
${name}

## 【数据流程】
${cosmicData.map((row, idx) => `${idx + 1}. [${row.dataMovementType}] ${row.subProcessDesc}
   数据组: ${row.dataGroup}，属性: ${row.dataAttributes || '未指定'}`).join('\n')}

## 【已分析的业务场景】
${previousResults.businessScenario?.scenarios ? 
    previousResults.businessScenario.scenarios.map(s => `- ${s.name}: ${s.trigger}`).join('\n') : '无'}

## 【已识别的异常场景】
${previousResults.exceptionScenarios?.exceptions ? 
    previousResults.exceptionScenarios.exceptions.slice(0, 5).map(e => `- ${e.name}: ${e.description}`).join('\n') : '无'}

## 【深度挖掘任务】
请从以下维度深度挖掘业务规则：

1. **数据校验规则**：每个输入字段应该如何校验？（格式/范围/逻辑）
2. **计算规则**：涉及哪些计算或公式？
3. **状态转换规则**：数据状态如何变化？有什么限制？
4. **时效规则**：有没有时间限制或有效期？
5. **关联约束**：与其他数据/功能的约束关系？
6. **审批/授权规则**：是否需要审批或特殊授权？
7. **限额规则**：是否有数量/金额限制？
8. **优先级规则**：多个请求时如何确定优先级？

请输出JSON格式：
\`\`\`json
{
  "rules": [
    {
      "ruleId": "BR-001",
      "ruleName": "规则名称",
      "category": "规则类别（校验/计算/状态/时效/关联/审批/限额/优先级）",
      "description": "规则详细描述",
      "condition": "触发条件",
      "action": "执行动作",
      "exception": "违反规则时的处理",
      "priority": "优先级（高/中/低）",
      "source": "规则来源（业务要求/法规/行业标准）"
    }
  ],
  "validationMatrix": {
    "字段名": {
      "required": true,
      "format": "格式要求",
      "range": "范围",
      "dependency": "依赖条件"
    }
  },
  "stateTransitions": [
    {
      "fromState": "起始状态",
      "toState": "目标状态",
      "trigger": "触发条件",
      "guard": "守卫条件"
    }
  ]
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是业务规则专家，擅长从业务流程中挖掘和定义业务规则。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.6,
            max_tokens: 4000
        });

        return parseJSONResponse(response.choices[0].message.content);
    } catch (error) {
        console.error('业务规则挖掘失败:', error.message);
        return null;
    }
}

// ==================== 第七轮：验收标准完善 ====================

async function thinkAcceptanceCriteriaDeep(client, functionInfo, context, previousResults) {
    const { name, cosmicData } = functionInfo;

    const prompt = `你是质量验收专家，请为以下功能制定**完善的验收标准**。

## 【功能名称】
${name}

## 【业务场景】
${previousResults.businessScenario?.scenarios ? 
    previousResults.businessScenario.scenarios.map(s => `- ${s.name}`).join('\n') : '无'}

## 【业务规则】
${previousResults.businessRulesDeep?.rules ? 
    previousResults.businessRulesDeep.rules.slice(0, 5).map(r => `- ${r.ruleName}: ${r.description}`).join('\n') : '无'}

## 【异常场景】
${previousResults.exceptionScenarios?.exceptions ? 
    previousResults.exceptionScenarios.exceptions.slice(0, 5).map(e => `- ${e.name}`).join('\n') : '无'}

## 【制定任务】
请制定全面的验收标准，包括：

1. **功能性验收**：核心功能是否正常工作
2. **数据验收**：数据处理是否正确
3. **规则验收**：业务规则是否正确执行
4. **异常验收**：异常情况是否正确处理
5. **边界验收**：边界条件是否正确处理
6. **性能验收**：响应时间是否满足要求
7. **安全验收**：安全控制是否生效

请输出JSON格式：
\`\`\`json
{
  "criteria": [
    {
      "criteriaId": "AC-001",
      "category": "验收类别",
      "scenario": "测试场景",
      "preconditions": ["前置条件"],
      "testSteps": ["步骤1", "步骤2", "步骤3"],
      "expectedResult": "预期结果",
      "actualDataCheck": "实际数据检查点",
      "priority": "优先级（P0/P1/P2）"
    }
  ],
  "performanceCriteria": {
    "responseTime": "响应时间要求",
    "throughput": "吞吐量要求",
    "concurrency": "并发要求"
  },
  "securityCriteria": [
    "安全验收标准"
  ]
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是质量验收专家，擅长制定全面的验收标准和测试用例。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.6,
            max_tokens: 4000
        });

        return parseJSONResponse(response.choices[0].message.content);
    } catch (error) {
        console.error('验收标准制定失败:', error.message);
        return null;
    }
}

// ==================== 第八轮：界面交互建议 ====================

async function thinkUIUXRecommendations(client, functionInfo, context, previousResults) {
    const { name, cosmicData } = functionInfo;
    const dataFlow = analyzeDataFlowPattern(cosmicData);

    const prompt = `你是UI/UX设计专家，请为以下功能提供**界面交互设计建议**。

## 【功能名称】
${name}

## 【数据流分析】
- 用户输入: ${dataFlow.entry.map(e => e.dataGroup + '(' + (e.dataAttributes || '') + ')').join(', ') || '无'}
- 系统输出: ${dataFlow.exit.map(x => x.dataGroup + '(' + (x.dataAttributes || '') + ')').join(', ') || '无'}

## 【用户角色】
${previousResults.userRoles?.roles ? 
    previousResults.userRoles.roles.map(r => r.roleName).join('、') : '未明确'}

## 【业务场景】
${previousResults.businessScenario?.scenarios ? 
    previousResults.businessScenario.scenarios.slice(0, 3).map(s => `- ${s.name}`).join('\n') : '无'}

## 【设计任务】
请提供界面交互设计建议：

1. **页面布局**：推荐的页面布局方式
2. **输入控件**：每个输入字段推荐使用什么控件
3. **信息展示**：如何展示输出信息
4. **操作按钮**：需要哪些操作按钮
5. **交互反馈**：用户操作后的反馈方式
6. **辅助功能**：搜索/筛选/排序等辅助功能
7. **移动端适配**：是否需要移动端，注意事项

请输出JSON格式：
\`\`\`json
{
  "recommendations": [
    {
      "aspect": "设计维度",
      "suggestion": "建议内容",
      "reason": "建议原因"
    }
  ],
  "pageLayout": {
    "type": "布局类型（表单/列表/详情/混合）",
    "sections": ["区块1", "区块2"],
    "primaryAction": "主要操作"
  },
  "inputComponents": [
    {
      "field": "字段名",
      "componentType": "控件类型",
      "placeholder": "占位符",
      "validation": "校验提示"
    }
  ],
  "outputDisplay": {
    "format": "展示格式",
    "highlights": ["高亮信息"]
  },
  "buttons": [
    {
      "label": "按钮名称",
      "type": "类型（primary/secondary/danger）",
      "position": "位置"
    }
  ],
  "feedbacks": [
    {
      "trigger": "触发场景",
      "feedbackType": "反馈类型（toast/modal/inline）",
      "message": "反馈信息"
    }
  ]
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是UI/UX设计专家，擅长设计直观易用的用户界面。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 3000
        });

        return parseJSONResponse(response.choices[0].message.content);
    } catch (error) {
        console.error('UI/UX建议生成失败:', error.message);
        return null;
    }
}

// ==================== 综合思考结果 ====================

function synthesizeThinkingResults(thinkingResult) {
    const enhanced = {
        functionDescription: '',
        businessRules: [],
        dataItems: [],
        interfaceDefinition: {},
        uiElements: {},
        acceptanceCriteria: [],
        nonFunctionalRequirements: {}
    };

    // 综合功能说明
    if (thinkingResult.businessScenario) {
        const bs = thinkingResult.businessScenario;
        enhanced.functionDescription = `**业务价值：** ${bs.businessValue || ''}\n\n`;
        
        if (bs.scenarios && bs.scenarios.length > 0) {
            enhanced.functionDescription += `**典型使用场景：**\n`;
            bs.scenarios.forEach((s, idx) => {
                enhanced.functionDescription += `${idx + 1}. **${s.name}**\n`;
                enhanced.functionDescription += `   - 触发条件：${s.trigger}\n`;
                enhanced.functionDescription += `   - 参与角色：${(s.actors || []).join('、')}\n`;
                enhanced.functionDescription += `   - 预期结果：${s.expectedResult}\n`;
            });
        }

        if (bs.processPosition) {
            enhanced.functionDescription += `\n**业务流程定位：**\n`;
            enhanced.functionDescription += `- 前置环节：${(bs.processPosition.upstream || []).join('→')}\n`;
            enhanced.functionDescription += `- 后续环节：${(bs.processPosition.downstream || []).join('→')}\n`;
        }
    }

    // 综合业务规则
    if (thinkingResult.businessRulesDeep?.rules) {
        enhanced.businessRules = thinkingResult.businessRulesDeep.rules.map(r => ({
            id: r.ruleId,
            name: r.ruleName,
            category: r.category,
            condition: r.condition,
            logic: r.action,
            exception: r.exception,
            priority: r.priority
        }));
    }

    // 综合数据项
    if (thinkingResult.dataFlowAnalysis?.entities) {
        thinkingResult.dataFlowAnalysis.entities.forEach(entity => {
            if (entity.attributes) {
                entity.attributes.forEach(attr => {
                    enhanced.dataItems.push({
                        entityName: entity.entityName,
                        fieldName: attr.name,
                        fieldType: attr.type,
                        length: attr.length,
                        required: attr.required ? '是' : '否',
                        description: attr.description,
                        constraints: (attr.constraints || []).join('; '),
                        source: attr.source,
                        example: attr.example
                    });
                });
            }
        });
    }

    // 综合验收标准
    if (thinkingResult.acceptanceCriteriaDeep?.criteria) {
        enhanced.acceptanceCriteria = thinkingResult.acceptanceCriteriaDeep.criteria.map(c => ({
            id: c.criteriaId,
            category: c.category,
            scenario: c.scenario,
            precondition: (c.preconditions || []).join('; '),
            steps: c.testSteps || [],
            expected: c.expectedResult,
            dataCheck: c.actualDataCheck,
            priority: c.priority
        }));
    }

    // 综合UI元素
    if (thinkingResult.uiuxRecommendations) {
        const uiux = thinkingResult.uiuxRecommendations;
        enhanced.uiElements = {
            layout: uiux.pageLayout,
            inputFields: (uiux.inputComponents || []).map(c => ({
                label: c.field,
                type: c.componentType,
                placeholder: c.placeholder,
                validation: c.validation,
                required: true
            })),
            buttons: (uiux.buttons || []).map(b => ({
                label: b.label,
                type: b.type,
                action: b.label
            })),
            feedbacks: uiux.feedbacks
        };
    }

    // 综合非功能需求
    enhanced.nonFunctionalRequirements = {
        performance: thinkingResult.acceptanceCriteriaDeep?.performanceCriteria || {},
        security: thinkingResult.acceptanceCriteriaDeep?.securityCriteria || [],
        exceptions: (thinkingResult.exceptionScenarios?.exceptions || []).map(e => ({
            name: e.name,
            handling: e.handling,
            userMessage: e.userMessage
        }))
    };

    return enhanced;
}

// ==================== 辅助函数 ====================

function analyzeDataFlowPattern(cosmicData) {
    const flow = {
        entry: [],
        read: [],
        write: [],
        exit: [],
        purpose: ''
    };

    cosmicData.forEach(row => {
        switch (row.dataMovementType) {
            case 'E': flow.entry.push(row); break;
            case 'R': flow.read.push(row); break;
            case 'W': flow.write.push(row); break;
            case 'X': flow.exit.push(row); break;
        }
    });

    // 推断功能目的
    if (flow.write.length > 0 && flow.read.length === 0) {
        flow.purpose = '数据创建';
    } else if (flow.write.length > 0 && flow.read.length > 0) {
        flow.purpose = '数据更新';
    } else if (flow.read.length > 0 && flow.write.length === 0) {
        flow.purpose = '数据查询';
    } else {
        flow.purpose = '业务处理';
    }

    return flow;
}

function extractRelevantContent(fullText, functionName) {
    const lines = fullText.split('\n');
    const keywords = functionName.split(/[\s、，,]/).filter(k => k.length >= 2);
    let relevantLines = [];
    let contextWindow = 5;

    for (let i = 0; i < lines.length; i++) {
        if (keywords.some(kw => lines[i].includes(kw))) {
            const start = Math.max(0, i - contextWindow);
            const end = Math.min(lines.length, i + contextWindow + 1);
            relevantLines = relevantLines.concat(lines.slice(start, end));
            if (relevantLines.length > 50) break;
        }
    }

    return relevantLines.join('\n');
}

function parseJSONResponse(responseText) {
    try {
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/) || 
                         responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1] || jsonMatch[0]);
        }
    } catch (error) {
        console.error('JSON解析失败:', error.message);
    }
    return null;
}

// ==================== 快速深度思考（轻量版） ====================

/**
 * 快速深度思考 - 用于生成过程中的即时增强
 * 比完整版更快，但仍能显著提升内容质量
 */
async function quickDeepThink(client, functionInfo, context) {
    console.log(`⚡ 快速深度思考: ${functionInfo.name}`);

    const { name, cosmicData } = functionInfo;
    const dataFlow = analyzeDataFlowPattern(cosmicData);

    const prompt = `你是资深需求分析师，请对以下功能进行**快速深度分析**，用于增强需求规格书的内容。

## 【功能名称】
${name}

## 【COSMIC数据】
${cosmicData.map((r, i) => `${i + 1}. [${r.dataMovementType}] ${r.subProcessDesc} (${r.dataGroup})`).join('\n')}

## 【快速分析任务】
请在一次回答中完成以下分析：

1. **功能价值**（2-3句话描述业务价值）
2. **核心场景**（列出3个最重要的使用场景）
3. **关键业务规则**（列出5条最重要的业务规则）
4. **数据要点**（列出关键数据字段及其说明）
5. **验收要点**（列出5条关键验收标准）
6. **异常处理**（列出3个主要异常及处理方式）

请输出JSON格式：
\`\`\`json
{
  "businessValue": "业务价值描述",
  "coreScenarios": [
    {"name": "场景名", "description": "场景描述", "actors": ["角色"]}
  ],
  "keyRules": [
    {"id": "BR-001", "name": "规则名", "description": "规则描述", "condition": "条件", "action": "动作"}
  ],
  "keyDataFields": [
    {"name": "字段名", "type": "类型", "required": true, "description": "说明"}
  ],
  "acceptanceCriteria": [
    {"id": "AC-001", "scenario": "场景", "steps": ["步骤"], "expected": "预期结果"}
  ],
  "exceptionHandling": [
    {"exception": "异常名", "handling": "处理方式", "userTip": "用户提示"}
  ]
}
\`\`\``;

    try {
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'glm-4-flash',
            messages: [
                { role: 'system', content: '你是资深需求分析师，擅长快速分析功能需求并提供全面的分析结果。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 4000
        });

        const result = parseJSONResponse(response.choices[0].message.content);
        console.log(`✅ 快速深度思考完成`);
        return result;
    } catch (error) {
        console.error('快速深度思考失败:', error.message);
        return null;
    }
}

// ==================== 导出模块 ====================

module.exports = {
    deepThinkForFunction,
    quickDeepThink,
    thinkBusinessScenario,
    thinkUserRoles,
    thinkDataFlowDeep,
    thinkExceptionScenarios,
    thinkRelatedFunctions,
    thinkBusinessRulesDeep,
    thinkAcceptanceCriteriaDeep,
    thinkUIUXRecommendations,
    synthesizeThinkingResults,
    analyzeDataFlowPattern
};
