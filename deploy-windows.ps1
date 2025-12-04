# Cosmic拆分智能体 - Windows一键部署脚本 (生产模式)
# 作用：安装依赖 -> 构建前端 -> 启动/更新 PM2 常驻进程

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

function Write-Step($message) {
    Write-Host "`n=== $message ===" -ForegroundColor Cyan
}

function Invoke-And-Check($command, $errorMessage) {
    Write-Host "➡️  $command" -ForegroundColor DarkGray
    $process = Start-Process powershell -ArgumentList "-NoProfile", "-Command", $command -Wait -PassThru -WindowStyle Hidden
    if ($process.ExitCode -ne 0) {
        throw "${errorMessage} (ExitCode=$($process.ExitCode))"
    }
}

Write-Host "🚀 Cosmic拆分智能体 - Windows一键部署" -ForegroundColor Green

# 1. 检查 Node.js
Write-Step "1/6 检查 Node.js"
try {
    $nodeVersion = node -v
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    throw "未检测到 Node.js，请先安装 LTS 版本 (https://nodejs.org/) 后重试"
}

# 2. 安装依赖
Write-Step "2/6 安装依赖"
if (-not (Test-Path "$scriptPath\node_modules")) {
    Invoke-And-Check "cd `$scriptPath`; npm install" "根目录依赖安装失败"
} else {
    Write-Host "✅ 根目录依赖已存在" -ForegroundColor Green
}

if (-not (Test-Path "$scriptPath\client\node_modules")) {
    Invoke-And-Check "cd `$scriptPath`\client; npm install" "客户端依赖安装失败"
} else {
    Write-Host "✅ 客户端依赖已存在" -ForegroundColor Green
}

# 3. 校验环境变量文件
Write-Step "3/6 校验 .env"
if (-not (Test-Path "$scriptPath\.env")) {
    if (Test-Path "$scriptPath\.env.example") {
        Copy-Item "$scriptPath\.env.example" "$scriptPath\.env"
        Write-Host "⚠️  已复制 .env，请编辑后重新运行本脚本" -ForegroundColor Yellow
        exit 0
    } else {
        throw ".env 文件不存在，请创建并写入 OPENAI_API_KEY 等配置"
    }
} else {
    Write-Host "✅ 检测到 .env" -ForegroundColor Green
}

# 4. 构建前端 (client/dist)
Write-Step "4/6 构建前端"
Invoke-And-Check "cd `$scriptPath`; npm run build" "前端构建失败"
Write-Host "✅ 构建完成，输出目录: client/dist" -ForegroundColor Green

# 5. 确保 PM2 可用
Write-Step "5/6 检查 PM2"
$pm2Exists = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2Exists) {
    Write-Host "⚠️  未检测到 pm2，开始全局安装..." -ForegroundColor Yellow
    Invoke-And-Check "npm install -g pm2" "pm2 安装失败"
}
$env:NODE_ENV = "production"

# 6. 启动 / 更新服务
Write-Step "6/6 启动服务"
try {
    pm2 delete cosmic-prod *>$null
} catch {}
pm2 start "$scriptPath\server\index.js" --name "cosmic-prod" --cwd "$scriptPath" --time --log-date-format "YYYY-MM-DD HH:mm:ss"
pm2 save | Out-Null

Write-Host "`n🎉 部署完成！" -ForegroundColor Green
Write-Host "- 访问地址: http://<服务器IP或域名>:${env:PORT -ne $null ? $env:PORT : 3001}" -ForegroundColor Green
Write-Host "- 首次部署建议执行：pm2 startup powershell | Out-String" -ForegroundColor DarkCyan
Write-Host "  然后按提示运行命令，确保重启后自动拉起 pm2" -ForegroundColor DarkCyan

Write-Host "`n🛠️  常用命令:" -ForegroundColor Cyan
Write-Host "  pm2 status            # 查看服务状态"
Write-Host "  pm2 logs cosmic-prod   # 查看运行日志"
Write-Host "  pm2 restart cosmic-prod # 重启服务"
Write-Host "  pm2 delete cosmic-prod  # 停止并删除服务"
