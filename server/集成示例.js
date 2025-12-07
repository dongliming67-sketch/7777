/**
 * 快速集成示例
 * 演示如何将深度理解系统集成到现有的server/index.js中
 */

// ===== 在 server/index.js 顶部添加引用 =====

const { enhancedGenerateRequirementSpec } = require('./enhancedGenerator');
const { deepAnalyzeTemplate } = require('./deepUnderstanding');
const { comprehensiveQualityCheck } = require('./qualityCheck');

// ===== 添加新的API端点 =====

/**
 * API: 深度分析模板（独立使用）
 * POST /api/deep-analyze-template
 */
app.post('/api/deep-analyze-template', async (req, res) => {
    try {
        const { templateId } = req.body;

        const client = getOpenAIClient();
        if (!client) {
            return res.status(400).json({ error: '请先配置API密钥' });
        }

        // 获取模板
        const templatePath = path.join(TEMPLATES_DIR, `${templateId}.json`);
        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ error: '模板不存在' });
        }

        const templateMeta = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));

        // 读取模板文档
        let templateDocPath = path.join(TEMPLATES_DIR, `${templateId}.docx`);
        let ext = '.docx';
        if (!fs.existsSync(templateDocPath)) {
            templateDocPath = path.join(TEMPLATES_DIR, `${templateId}.doc`);
            ext = '.doc';
        }

        const buffer = fs.readFileSync(templateDocPath);
        const parsed = await parseWordTemplate(buffer, ext);

        // 设置SSE响应
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 进度回调
        const progressCallback = (phase, message) => {
            res.write(`data: ${JSON.stringify({ phase, message })}\n\n`);
        };

        // 执行深度分析
        const deepAnalysis = await deepAnalyzeTemplate(
            client,
            parsed.fullText,
            parsed.sections,
            progressCallback
        );

        if (deepAnalysis) {
            // 保存分析结果
            const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_deep_analysis.json`);
            fs.writeFileSync(analysisPath, JSON.stringify(deepAnalysis, null, 2));

            res.write(`data: ${JSON.stringify({
                phase: 'complete',
                analysis: deepAnalysis
            })}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({
                phase: 'error',
                message: '深度分析失败'
            })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error('深度分析失败:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    }
});

/**
 * API: 增强版COSMIC转需求规格书生成
 * POST /api/cosmic-to-spec/enhanced-generate
 */
app.post('/api/cosmic-to-spec/enhanced-generate', async (req, res) => {
    try {
        const { cosmicExcelFile, templateId, requirementDocFile } = req.body;

        const client = getOpenAIClient();
        if (!client) {
            return res.status(400).json({ error: '请先配置API密钥' });
        }

        // 设置SSE响应
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // ========== 步骤1：解析COSMIC Excel ==========
        res.write(`data: ${JSON.stringify({
            phase: 'parsing_cosmic',
            message: '📊 解析COSMIC Excel数据...',
            progress: 5
        })}\n\n`);

        const cosmicData = await parseCosmicExcel(cosmicExcelFile);

        res.write(`data: ${JSON.stringify({
            phase: 'cosmic_parsed',
            message: `✅ 已解析 ${Object.keys(cosmicData).length} 个功能过程`,
            progress: 10
        })}\n\n`);

        // ========== 步骤2：获取模板分析 ==========
        res.write(`data: ${JSON.stringify({
            phase: 'loading_template',
            message: '📋 加载模板分析...',
            progress: 15
        })}\n\n`);

        let templateAnalysis = null;
        if (templateId) {
            // 先尝试读取深度分析结果
            const deepAnalysisPath = path.join(TEMPLATES_DIR, `${templateId}_deep_analysis.json`);
            if (fs.existsSync(deepAnalysisPath)) {
                templateAnalysis = JSON.parse(fs.readFileSync(deepAnalysisPath, 'utf-8'));
                res.write(`data: ${JSON.stringify({
                    phase: 'template_loaded',
                    message: '✅ 已加载模板深度分析结果',
                    progress: 20
                })}\n\n`);
            } else {
                // 如果没有深度分析，使用普通分析
                const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_analysis.json`);
                if (fs.existsSync(analysisPath)) {
                    templateAnalysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
                    res.write(`data: ${JSON.stringify({
                        phase: 'template_loaded',
                        message: '⚠️ 使用普通模板分析（建议先进行深度分析）',
                        progress: 20
                    })}\n\n`);
                }
            }
        }

        // ========== 步骤3：解析需求文档（可选） ==========
        let requirementDoc = null;
        if (requirementDocFile) {
            res.write(`data: ${JSON.stringify({
                phase: 'parsing_requirement',
                message: '📄 解析原始需求文档...',
                progress: 22
            })}\n\n`);

            requirementDoc = await parseRequirementDocument(requirementDocFile.buffer, requirementDocFile.ext);

            if (client && requirementDoc.fullText.length > 100) {
                const aiAnalysis = await analyzeRequirementDocWithAI(client, requirementDoc.fullText, requirementDoc.sections);
                requirementDoc.aiAnalysis = aiAnalysis;
            }

            res.write(`data: ${JSON.stringify({
                phase: 'requirement_parsed',
                message: '✅ 需求文档解析完成',
                progress: 25
            })}\n\n`);
        }

        // ========== 步骤4：执行增强生成 ==========
        const result = await enhancedGenerateRequirementSpec(
            client,
            cosmicData,
            templateAnalysis,
            requirementDoc,
            (progress) => {
                // 转发进度信息
                res.write(`data: ${JSON.stringify(progress)}\n\n`);
            }
        );

        // ========== 步骤5：返回生成结果 ==========
        res.write(`data: ${JSON.stringify({
            phase: 'result',
            content: result.content.slice(0, 1000), // 先发送预览
            qualityReport: result.qualityReport,
            metadata: result.metadata
        })}\n\n`);

        // 完整内容通过分块发送
        const chunkSize = 5000;
        for (let i = 1000; i < result.content.length; i += chunkSize) {
            const chunk = result.content.slice(i, i + chunkSize);
            res.write(`data: ${JSON.stringify({
                phase: 'content_chunk',
                chunk: chunk
            })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error('增强生成失败:', error);
        if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/event-stream');
        }
        res.write(`data: ${JSON.stringify({
            phase: 'error',
            error: error.message
        })}\n\n`);
        res.end();
    }
});

/**
 * API: 独立质量检查
 * POST /api/quality-check
 */
app.post('/api/quality-check', async (req, res) => {
    try {
        const { content, templateId, cosmicData } = req.body;

        const client = getOpenAIClient();
        if (!client) {
            return res.status(400).json({ error: '请先配置API密钥' });
        }

        // 获取模板分析
        let templateAnalysis = null;
        if (templateId) {
            const analysisPath = path.join(TEMPLATES_DIR, `${templateId}_deep_analysis.json`);
            if (fs.existsSync(analysisPath)) {
                templateAnalysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
            }
        }

        // 执行质量检查
        const qualityReport = await comprehensiveQualityCheck(
            client,
            content,
            templateAnalysis,
            cosmicData
        );

        res.json({
            success: true,
            qualityReport
        });

    } catch (error) {
        console.error('质量检查失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== 辅助函数 =====

/**
 * 解析COSMIC Excel文件
 */
async function parseCosmicExcel(fileBuffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);

    const worksheet = workbook.worksheets[0];
    const cosmicData = {};

    // 跳过表头，从第2行开始
    for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);

        const functionalProcess = row.getCell(3).value; // 功能过程列
        if (!functionalProcess) continue;

        if (!cosmicData[functionalProcess]) {
            cosmicData[functionalProcess] = [];
        }

        cosmicData[functionalProcess].push({
            functionalUser: row.getCell(1).value || '',
            triggerEvent: row.getCell(2).value || '',
            functionalProcess: functionalProcess,
            subProcessDesc: row.getCell(4).value || '',
            dataMovementType: row.getCell(5).value || '',
            dataGroup: row.getCell(6).value || '',
            dataAttributes: row.getCell(7).value || ''
        });
    }

    return cosmicData;
}

/**
 * 解析Word模板
 */
async function parseWordTemplate(buffer, ext = '.docx') {
    if (ext === '.doc') {
        const extracted = await wordExtractor.extract(buffer);
        const text = extracted.getBody() || '';
        return {
            fullText: text,
            sections: [] // 简化处理
        };
    } else {
        const result = await mammoth.extractRawText({ buffer });
        return {
            fullText: result.value,
            sections: extractSections(result.value)
        };
    }
}

/**
 * 提取章节
 */
function extractSections(text) {
    const sections = [];
    const lines = text.split('\n');
    const sectionPattern = /^(\d{1,2}(?:\.\d{1,3})*)\s*[、.．\s]\s*([^\d\t][^\t]*?)$/;

    lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const match = trimmed.match(sectionPattern);
        if (match) {
            const number = match[1];
            const title = match[2].trim();
            const level = number.split('.').length;

            sections.push({
                number,
                title,
                level,
                lineIndex: idx
            });
        }
    });

    return sections;
}

// ===== 导出说明 =====

/*
使用方法：

1. 将上述代码复制到 server/index.js 的适当位置

2. 确保已安装所有依赖：
   - deepUnderstanding.js
   - intelligentReasoning.js
   - qualityCheck.js
   - enhancedGenerator.js

3. 前端调用示例：

   // 深度分析模板
   const eventSource = new EventSource('/api/deep-analyze-template');
   eventSource.onmessage = (event) => {
     const data = JSON.parse(event.data);
     if (data.phase === 'complete') {
       console.log('深度分析完成', data.analysis);
     }
   };

   // 增强生成
   const eventSource = new EventSource('/api/cosmic-to-spec/enhanced-generate');
   let fullContent = '';
   eventSource.onmessage = (event) => {
     const data = JSON.parse(event.data);
     if (data.phase === 'content_chunk') {
       fullContent += data.chunk;
     } else if (data.phase === 'result') {
       fullContent = data.content;
     }
   };

4. 建议的工作流程：
   - 第一步：上传模板，调用 /api/deep-analyze-template 进行深度分析
   - 第二步：上传COSMIC Excel和需求文档，调用 /api/cosmic-to-spec/enhanced-generate
   - 第三步（可选）：对生成结果调用 /api/quality-check 进行二次检查
*/
