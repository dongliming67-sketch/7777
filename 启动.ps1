# Cosmic拆分智能体 - PowerShell启动脚本
# 编码设置
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 切换到脚本所在目录（关键！）
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# 设置窗口标题和颜色
$Host.UI.RawUI.WindowTitle = "Cosmic拆分智能体 - 一键启动"

# 显示欢迎信息
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                                                            ║" -ForegroundColor Green
Write-Host "║           🚀 Cosmic拆分智能体 - 一键启动脚本               ║" -ForegroundColor Green
Write-Host "║                Cosmic拆分 / 需求规格书生成                 ║" -ForegroundColor Green
Write-Host "║                                                            ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# 检查Node.js
Write-Host "[1/4] 🔍 检查Node.js环境..." -ForegroundColor Cyan

$nodeInstalled = $false
try {
    $nodeVersion = node -v 2>$null
    if ($LASTEXITCODE -eq 0 -and $nodeVersion) {
        $nodeInstalled = $true
        Write-Host "✅ Node.js版本: $nodeVersion" -ForegroundColor Green
    }
} catch {
    $nodeInstalled = $false
}

if (-not $nodeInstalled) {
    Write-Host "⚠️  未检测到Node.js，正在自动下载安装..." -ForegroundColor Yellow
    Write-Host ""
    
    # 优先尝试使用winget安装
    $wingetAvailable = $false
    try {
        $wingetCheck = winget --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            $wingetAvailable = $true
        }
    } catch {
        $wingetAvailable = $false
    }
    
    if ($wingetAvailable) {
        Write-Host "📦 使用winget安装Node.js LTS版本..." -ForegroundColor Cyan
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Node.js安装完成" -ForegroundColor Green
            Write-Host "⚠️  请关闭此窗口，重新打开PowerShell后再次运行此脚本" -ForegroundColor Yellow
            Read-Host "按回车键退出"
            exit 0
        } else {
            Write-Host "❌ winget安装失败，尝试手动下载安装..." -ForegroundColor Red
        }
    }
    
    # 手动下载安装
    Write-Host "📥 正在下载Node.js安装包..." -ForegroundColor Cyan
    $nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
    $installerPath = "$env:TEMP\node_installer.msi"
    
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $nodeUrl -OutFile $installerPath -UseBasicParsing
        
        Write-Host "📦 正在安装Node.js..." -ForegroundColor Cyan
        $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$installerPath`" /qn /norestart" -Wait -PassThru
        
        if ($process.ExitCode -ne 0) {
            Write-Host "⚠️  静默安装失败，启动交互式安装..." -ForegroundColor Yellow
            Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$installerPath`"" -Wait
        }
        
        # 清理安装包
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        
        Write-Host "✅ Node.js安装完成" -ForegroundColor Green
        Write-Host "⚠️  请关闭此窗口，重新打开PowerShell后再次运行此脚本" -ForegroundColor Yellow
        Read-Host "按回车键退出"
        exit 0
    } catch {
        Write-Host "❌ 下载或安装失败: $_" -ForegroundColor Red
        Write-Host "请手动安装Node.js: https://nodejs.org/" -ForegroundColor Yellow
        Read-Host "按回车键退出"
        exit 1
    }
}
Write-Host ""

# 检查并安装依赖
Write-Host "[2/4] 📦 检查项目依赖..." -ForegroundColor Cyan

if (-not (Test-Path "node_modules")) {
    Write-Host "⚠️  未检测到根目录依赖，开始安装..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 根目录依赖安装失败" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }
} else {
    Write-Host "✅ 根目录依赖已存在" -ForegroundColor Green
}

if (-not (Test-Path "client\node_modules")) {
    Write-Host "⚠️  未检测到客户端依赖，开始安装..." -ForegroundColor Yellow
    Set-Location client
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 客户端依赖安装失败" -ForegroundColor Red
        Set-Location ..
        Read-Host "按回车键退出"
        exit 1
    }
    Set-Location ..
} else {
    Write-Host "✅ 客户端依赖已存在" -ForegroundColor Green
}
Write-Host ""

# 检查配置文件
Write-Host "[3/4] ⚙️  检查配置文件..." -ForegroundColor Cyan
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  未检测到.env文件，从.env.example复制..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "⚠️  请编辑.env文件配置您的API密钥" -ForegroundColor Yellow
    Write-Host "推荐使用智谱GLM（免费）: https://bigmodel.cn" -ForegroundColor Yellow
    Read-Host "按回车键继续"
} else {
    Write-Host "✅ 配置文件检查完成" -ForegroundColor Green
}
Write-Host ""

# 启动应用
Write-Host "[4/4] 🚀 启动应用服务..." -ForegroundColor Cyan
Write-Host "    · Cosmic拆分：AI功能过程拆解 + Excel导出" -ForegroundColor DarkCyan
Write-Host "    · 需求规格书：文档上传、结构化分析、Word导出" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "┌────────────────────────────────────────────────────────────┐" -ForegroundColor Magenta
Write-Host "│  服务启动中，请稍候...                                     │" -ForegroundColor Magenta
Write-Host "│  后端服务: http://localhost:3001 (API/Word导出)             │" -ForegroundColor Magenta
Write-Host "│  前端服务: http://localhost:5173 (Cosmic/需求规格)          │" -ForegroundColor Magenta
Write-Host "│                                                            │" -ForegroundColor Magenta
Write-Host "│  💡 提示: 按 Ctrl+C 可停止服务                             │" -ForegroundColor Magenta
Write-Host "└────────────────────────────────────────────────────────────┘" -ForegroundColor Magenta
Write-Host ""

# 延迟3秒后打开浏览器
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 5
    Start-Process "http://localhost:5173"
} | Out-Null

# 启动开发服务器
npm run dev

# 如果服务异常退出
Write-Host ""
Write-Host "⚠️  服务已停止" -ForegroundColor Yellow
Read-Host "按回车键退出"
