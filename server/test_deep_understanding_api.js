/**
 * 深度理解系统 - API测试脚本
 * 测试新增的三个API端点
 */

const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:3001';

// 测试1：深度分析模板
async function testDeepAnalyzeTemplate(templateId) {
    console.log('\n=== 测试1：深度分析模板 ===');
    console.log(`模板ID: ${templateId}`);

    try {
        const response = await axios.post(
            `${BASE_URL}/api/deep-analyze-template`,
            { templateId },
            {
                headers: { 'Content-Type': 'application/json' },
                responseType: 'stream'
            }
        );

        console.log('开始接收流式响应...\n');

        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data === '[DONE]') {
                        console.log('\n✅ 深度分析完成！');
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.phase && parsed.message) {
                            console.log(`[${parsed.phase}] ${parsed.message}`);
                        }
                        if (parsed.phase === 'complete' && parsed.analysis) {
                            console.log('\n分析结果摘要:');
                            console.log('- 结构分析:', parsed.analysis.structuralAnalysis ? '✓' : '✗');
                            console.log('- 语义分析:', parsed.analysis.semanticAnalysis ? `✓ (${parsed.analysis.semanticAnalysis.chapterCount}章节)` : '✗');
                            console.log('- 风格分析:', parsed.analysis.styleAnalysis ? '✓' : '✗');
                            console.log('- 示例提取:', `${parsed.analysis.examplesCount.tables}个表格, ${parsed.analysis.examplesCount.functionalProcesses}个功能过程`);
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        });

        await new Promise((resolve) => {
            response.data.on('end', resolve);
        });

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        if (error.response) {
            console.error('响应数据:', error.response.data);
        }
    }
}

// 测试2：增强版COSMIC转需求文档
async function testEnhancedGeneration(cosmicData, templateId) {
    console.log('\n=== 测试2：增强版COSMIC转需求文档 ===');
    console.log(`功能数量: ${Object.keys(cosmicData).length}`);
    console.log(`模板ID: ${templateId || '无'}`);

    try {
        const response = await axios.post(
            `${BASE_URL}/api/enhanced-cosmic-to-spec`,
            { cosmicData, templateId },
            {
                headers: { 'Content-Type': 'application/json' },
                responseType: 'stream'
            }
        );

        console.log('开始接收流式响应...\n');

        let fullContent = '';
        let qualityReport = null;

        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data === '[DONE]') {
                        console.log('\n✅ 生成完成！');
                        if (qualityReport) {
                            console.log('\n质量报告:');
                            console.log(`- 总分: ${qualityReport.overallScore}/100`);
                            console.log(`- 通过检查: ${qualityReport.passedChecks.join(', ')}`);
                            console.log(`- 未通过检查: ${qualityReport.failedChecks.join(', ')}`);
                            console.log(`- 发现问题: ${qualityReport.issues.length}个`);
                            if (qualityReport.issues.length > 0) {
                                console.log('  前3个问题:');
                                qualityReport.issues.slice(0, 3).forEach((issue, i) => {
                                    console.log(`  ${i + 1}. ${issue}`);
                                });
                            }
                        }
                        if (fullContent) {
                            console.log(`\n文档长度: ${fullContent.length} 字符`);
                            console.log('文档预览（前200字符）:');
                            console.log(fullContent.substring(0, 200) + '...');
                        }
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.phase && parsed.message) {
                            const progress = parsed.progress ? ` (${parsed.progress}%)` : '';
                            console.log(`[${parsed.phase}]${progress} ${parsed.message}`);
                        }
                        if (parsed.phase === 'content_chunk') {
                            fullContent += parsed.chunk;
                        }
                        if (parsed.phase === 'quality_report') {
                            qualityReport = parsed.qualityReport;
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        });

        await new Promise((resolve) => {
            response.data.on('end', resolve);
        });

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        if (error.response) {
            console.error('响应数据:', error.response.data);
        }
    }
}

// 测试3：文档质量检查
async function testQualityCheck(content, templateId, cosmicData) {
    console.log('\n=== 测试3：文档质量检查 ===');
    console.log(`文档长度: ${content.length} 字符`);

    try {
        const response = await axios.post(
            `${BASE_URL}/api/quality-check`,
            { content, templateId, cosmicData },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );

        if (response.data.success) {
            const report = response.data.qualityReport;
            console.log('\n✅ 质量检查完成！');
            console.log(`\n总分: ${report.overallScore}/100`);
            console.log(`\n各项检查:`);
            Object.entries(report.checks).forEach(([name, result]) => {
                if (result && result.score !== undefined) {
                    const status = result.score >= 80 ? '✓' : '✗';
                    console.log(`  ${status} ${name}: ${result.score}/100`);
                }
            });

            if (report.issues.length > 0) {
                console.log(`\n发现问题 (${report.issues.length}个):`);
                report.issues.slice(0, 5).forEach((issue, i) => {
                    console.log(`  ${i + 1}. ${issue}`);
                });
            }

            if (report.suggestions.length > 0) {
                console.log(`\n改进建议:`);
                report.suggestions.forEach((suggestion, i) => {
                    console.log(`  ${i + 1}. ${suggestion}`);
                });
            }
        }

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        if (error.response) {
            console.error('响应数据:', error.response.data);
        }
    }
}

// 主测试函数
async function runTests() {
    console.log('========================================');
    console.log('深度理解系统 API 测试');
    console.log('========================================');

    // 准备测试数据
    const testCosmicData = {
        '新增用户': [
            { dataMovementType: 'E', subProcessDesc: '接收用户信息', dataGroup: '用户基本信息', dataAttributes: '用户名、密码、邮箱' },
            { dataMovementType: 'R', subProcessDesc: '检查用户名重复', dataGroup: '用户表', dataAttributes: '用户名' },
            { dataMovementType: 'W', subProcessDesc: '保存用户', dataGroup: '用户表', dataAttributes: '用户ID、用户名、密码、邮箱、创建时间' },
            { dataMovementType: 'X', subProcessDesc: '返回结果', dataGroup: '操作结果', dataAttributes: '用户ID、状态码、提示信息' }
        ],
        '查询用户列表': [
            { dataMovementType: 'E', subProcessDesc: '接收查询条件', dataGroup: '查询参数', dataAttributes: '页码、每页数量、搜索关键词' },
            { dataMovementType: 'R', subProcessDesc: '查询用户数据', dataGroup: '用户表', dataAttributes: '用户ID、用户名、邮箱、创建时间' },
            { dataMovementType: 'X', subProcessDesc: '返回用户列表', dataGroup: '用户列表数据', dataAttributes: '总数、用户列表、当前页' }
        ]
    };

    const testContent = `
# 1 概述

本系统是一个用户管理系统。

## 1.1 系统目标

实现用户的增删改查功能。

# 2 功能需求

## 2.1 新增用户

### 2.1.1 功能说明

本功能用于新增用户到系统中。

### 2.1.2 业务规则

| 规则编号 | 规则名称 | 触发条件 | 处理逻辑 |
|---------|---------|---------|---------|
| BR-001 | 用户名唯一性 | 新增用户时 | 检查用户名是否已存在 |

### 2.1.3 处理数据

| 字段名 | 类型 | 长度 | 必填 | 说明 |
|--------|------|------|------|------|
| 用户名 | VARCHAR | 100 | 是 | 用户登录名 |
| 密码 | VARCHAR | 255 | 是 | 加密后的密码 |
`;

    // 检查是否有可用的模板
    const templateId = process.argv[2] || null; // 从命令行参数获取

    // 运行测试
    try {
        // 如果提供了模板ID，先测试深度分析
        if (templateId) {
            await testDeepAnalyzeTemplate(templateId);
            console.log('\n等待3秒后继续下一个测试...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // 测试增强生成
        await testEnhancedGeneration(testCosmicData, templateId);

        console.log('\n等待3秒后继续下一个测试...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 测试质量检查
        await testQualityCheck(testContent, templateId, testCosmicData);

    } catch (error) {
        console.error('测试过程出错:', error);
    }

    console.log('\n========================================');
    console.log('所有测试完成！');
    console.log('========================================');
}

// 使用说明
if (require.main === module) {
    if (process.argv.includes('--help')) {
        console.log(`
使用方法:
  node test_deep_understanding_api.js [templateId]

参数:
  templateId - 可选，要测试的模板ID（如 template_xxx）

示例:
  # 不使用模板测试
  node test_deep_understanding_api.js

  # 使用模板测试
  node test_deep_understanding_api.js template_1764923673851_zixerc0k6

注意:
  - 确保服务器已启动（npm run dev）
  - 确保已配置API密钥
  - 模板文件需要存在于 server/templates 目录
`);
        process.exit(0);
    }

    runTests().catch(console.error);
}

module.exports = {
    testDeepAnalyzeTemplate,
    testEnhancedGeneration,
    testQualityCheck
};
