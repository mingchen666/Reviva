---
name: skill-installer
description: 跨平台智能安装助手：自动检测操作系统，适配Windows/macOS/Linux命令，处理Git/网络/路径问题。当用户说"安装skill"、"帮我安装xxx"、"我下载了skill，路径是xxx"时触发。
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(curl *), Bash(wget *), Bash(mv *), Bash(cp *), Bash(mkdir *), Bash(ls *), Bash(unzip *), Read, Grep, Glob
---

# 跨平台智能安装助手

自动检测操作系统，适配各种环境，智能处理安装问题。

## 工作流程

### 步骤1: 跨平台环境检测
```bash
# 检测操作系统类型
detect_os() {
    case "$(uname -s)" in
        Linux*)     OS="Linux";;
        Darwin*)    OS="macOS";;
        CYGWIN*|MINGW*|MSYS*) OS="Windows";;
        *)          OS="Unknown";;
    esac
    echo "操作系统: $OS"
}

# 检测架构
detect_arch() {
    case "$(uname -m)" in
        x86_64*)  ARCH="x64";;
        i686*)    ARCH="x86";;
        arm*)     ARCH="arm";;
        aarch64*) ARCH="arm64";;
        *)        ARCH="unknown";;
    esac
    echo "架构: $ARCH"
}

# 检测Shell环境
detect_shell() {
    if [ -n "$ZSH_VERSION" ]; then
        SHELL_TYPE="zsh"
    elif [ -n "$BASH_VERSION" ]; then
        SHELL_TYPE="bash"
    elif [ -n "$PSModulePath" ]; then
        SHELL_TYPE="powershell"
    elif command -v cmd &> /dev/null; then
        SHELL_TYPE="cmd"
    else
        SHELL_TYPE="unknown"
    fi
    echo "Shell: $SHELL_TYPE"
}
```

### 步骤2: 跨平台命令适配

#### Git安装命令
```bash
# 跨平台Git安装
install_git() {
    case "$OS" in
        "Linux")
            if command -v apt &> /dev/null; then
                sudo apt update && sudo apt install -y git
            elif command -v yum &> /dev/null; then
                sudo yum install -y git
            elif command -v dnf &> /dev/null; then
                sudo dnf install -y git
            elif command -v pacman &> /dev/null; then
                sudo pacman -Sy git
            fi
            ;;
        "macOS")
            if command -v brew &> /dev/null; then
                brew install git
            else
                echo "请安装Homebrew后重试"
                exit 1
            fi
            ;;
        "Windows")
            if command -v choco &> /dev/null; then
                choco install git -y
            elif command -v winget &> /dev/null; then
                winget install Git.Git
            elif command -v scoop &> /dev/null; then
                scoop install git
            else
                echo "请安装Chocolatey、winget或Scoop后重试"
                exit 1
            fi
            ;;
    esac
}
```

#### 路径处理函数
```bash
# 跨平台路径处理
normalize_path() {
    local path="$1"
    case "$OS" in
        "Windows")
            # 转换为Windows路径
            echo "$path" | sed 's|/|\\|g'
            ;;
        *)
            # 保持Unix路径
            echo "$path"
            ;;
    esac
}

# 获取主目录
get_home_dir() {
    case "$OS" in
        "Windows")
            echo "$USERPROFILE"
            ;;
        *)
            echo "$HOME"
            ;;
    esac
}
```

### 步骤3: 智能安装策略

#### 策略1: Git克隆（跨平台）
```bash
git_clone_install() {
    local repo_url="$1"
    local target_dir="$2"
  
    # 检查Git是否可用
    if ! command -v git &> /dev/null; then
        echo "Git未安装，正在尝试安装..."
        install_git
    fi
  
    # 根据操作系统选择克隆命令
    case "$OS" in
        "Windows")
            # Windows下处理路径分隔符
            local win_target=$(normalize_path "$target_dir")
            git clone "$repo_url" "$win_target"
            ;;
        *)
            git clone "$repo_url" "$target_dir"
            ;;
    esac
}
```

#### 策略2: 下载解压（跨平台）
```bash
download_install() {
    local url="$1"
    local target_dir="$2"
    local filename=$(basename "$url")
  
    # 根据操作系统选择下载工具
    if command -v curl &> /dev/null; then
        curl -L "$url" -o "$filename"
    elif command -v wget &> /dev/null; then
        wget "$url" -O "$filename"
    elif [ "$OS" = "Windows" ]; then
        # Windows PowerShell下载
        powershell -Command "Invoke-WebRequest -Uri '$url' -OutFile '$filename'"
    else
        echo "未找到下载工具，请安装curl或wget"
        exit 1
    fi
  
    # 解压文件
    if command -v unzip &> /dev/null && [[ "$filename" == *.zip ]]; then
        unzip "$filename" -d "$target_dir"
    elif command -v tar &> /dev/null && [[ "$filename" == *.tar* ]]; then
        tar -xvf "$filename" -C "$target_dir"
    elif [ "$OS" = "Windows" ]; then
        # Windows PowerShell解压
        powershell -Command "Expand-Archive -Path '$filename' -DestinationPath '$target_dir'"
    fi
  
    # 清理临时文件
    rm -f "$filename"
}
```

### 步骤4: 智能目录选择

#### 跨平台Skills目录
```bash
get_skills_dir() {
    local base_dir=""
  
    case "$OS" in
        "Windows")
            # Windows: 使用用户目录
            if [ -n "$USERPROFILE" ]; then
                base_dir="$USERPROFILE\\.claude\\skills"
            else
                base_dir="$HOME\\.claude\\skills"
            fi
            ;;
        "macOS")
            # macOS: 使用用户目录
            base_dir="$HOME/.claude/skills"
            ;;
        "Linux")
            # Linux: 使用用户目录
            base_dir="$HOME/.claude/skills"
            ;;
    esac
  
    # 确保目录存在
    mkdir -p "$base_dir"
    echo "$base_dir"
}

# 项目级Skills目录
get_project_skills_dir() {
    local project_dir=""
  
    # 检查是否在Git项目中
    if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        project_dir=$(git rev-parse --show-toplevel)
        project_dir="$project_dir/.claude/skills"
    else
        # 非Git项目，使用当前目录
        project_dir="$(pwd)/.claude/skills"
    fi
  
    # 确保目录存在
    mkdir -p "$project_dir"
    echo "$project_dir"
}
```

### 步骤5: 权限处理

#### 跨平台权限检查
```bash
check_permissions() {
    local dir="$1"
  
    # 检查写入权限
    if [ ! -w "$dir" ]; then
        echo "⚠️  权限不足: $dir"
        echo "💡 解决方案:"
      
        case "$OS" in
            "Windows")
                echo "  1. 以管理员身份运行"
                echo "  2. 更改目录权限"
                echo "  3. 选择其他安装位置"
                ;;
            "macOS"|"Linux")
                echo "  1. 使用sudo执行"
                echo "  2. 更改目录权限: chmod 755 $dir"
                echo "  3. 选择其他安装位置"
                ;;
        esac
      
        return 1
    fi
  
    return 0
}
```

### 步骤6: 安装验证

#### 跨平台验证
```bash
verify_installation() {
    local skill_dir="$1"
    local skill_name="$2"
  
    # 检查SKILL.md是否存在
    if [ -f "$skill_dir/$skill_name/SKILL.md" ]; then
        echo "✅ 安装成功: $skill_name"
        echo "📁 安装位置: $skill_dir/$skill_name"
      
        # 显示文件信息
        echo "📋 文件列表:"
        ls -la "$skill_dir/$skill_name/" 2>/dev/null || dir "$skill_dir\\$skill_name" 2>/dev/null
      
        return 0
    else
        echo "❌ 安装失败: 未找到SKILL.md"
        return 1
    fi
}
```

## 完整工作流程

### 主安装函数
```bash
install_skill() {
    local input="$1"
    local install_type="${2:-auto}"  # auto, global, project
  
    # 步骤1: 环境检测
    detect_os
    detect_arch
    detect_shell
  
    # 步骤2: 解析输入
    local skill_name=""
    local repo_url=""
    local local_path=""
  
    if [[ "$input" == http* ]]; then
        repo_url="$input"
        skill_name=$(basename "$repo_url" .git)
    elif [[ "$input" == /* || "$input" == ./* || "$input" == ../* ]]; then
        local_path="$input"
        skill_name=$(basename "$local_path")
    else
        skill_name="$input"
        # 搜索GitHub
        repo_url="https://github.com/anthropics/skills.git"
    fi
  
    # 步骤3: 选择安装目录
    local target_dir=""
    case "$install_type" in
        "global")
            target_dir=$(get_skills_dir)
            ;;
        "project")
            target_dir=$(get_project_skills_dir)
            ;;
        "auto")
            # 自动检测：优先项目级，其次全局
            if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
                target_dir=$(get_project_skills_dir)
                echo "📁 安装到项目目录: $target_dir"
            else
                target_dir=$(get_skills_dir)
                echo "📁 安装到全局目录: $target_dir"
            fi
            ;;
    esac
  
    # 步骤4: 检查权限
    if ! check_permissions "$target_dir"; then
        echo "❌ 权限检查失败"
        return 1
    fi
  
    # 步骤5: 执行安装
    echo "📦 开始安装: $skill_name"
  
    if [[ -n "$local_path" ]]; then
        # 本地文件安装
        if [ -d "$local_path" ]; then
            cp -r "$local_path" "$target_dir/$skill_name"
        elif [ -f "$local_path" ]; then
            mkdir -p "$target_dir/$skill_name"
            cp "$local_path" "$target_dir/$skill_name/SKILL.md"
        fi
    elif [[ -n "$repo_url" ]]; then
        # Git克隆安装
        git_clone_install "$repo_url" "$target_dir/$skill_name"
    fi
  
    # 步骤6: 验证安装
    verify_installation "$target_dir" "$skill_name"
  
    # 步骤7: 显示使用说明
    echo ""
    echo "🎉 安装完成！"
    echo "💡 使用方法:"
    echo "   1. 重启Claude Code或相关工具"
    echo "   2. 在对话中触发: $skill_name"
    echo "   3. 或手动加载: /skills $skill_name"
}
```

## 用户输入处理示例

### 示例1: Windows用户
```powershell
# 用户输入: 帮我安装代码审查skill
# 输出:
# 🔍 检测操作系统: Windows
# 📁 安装到全局目录: C:\Users\username\.claude\skills
# 📦 开始安装: code-review
# git clone https://github.com/xxx/code-review.git "C:\Users\username\.claude\skills\code-review"
# ✅ 安装成功: code-review
```

### 示例2: macOS用户
```bash
# 用户输入: 安装这个skill: https://github.com/anthropics/skills.git
# 输出:
# 🔍 检测操作系统: macOS
# 📁 安装到全局目录: /Users/username/.claude/skills
# 📦 开始安装: skills
# git clone https://github.com/anthropics/skills.git /Users/username/.claude/skills/skills
# ✅ 安装成功: skills
```

### 示例3: Linux用户（无Git）
```bash
# 用户输入: 我想安装PDF处理skill
# 输出:
# 🔍 检测操作系统: Linux
# ⚠️  Git未安装，正在尝试安装...
# sudo apt update && sudo apt install -y git
# 📁 安装到全局目录: /home/username/.claude/skills
# 📦 开始安装: pdf-processor
# git clone https://github.com/xxx/pdf-processor.git /home/username/.claude/skills/pdf-processor
# ✅ 安装成功: pdf-processor
```

### 示例4: 本地文件迁移
```bash
# 用户输入: 我下载了skill，路径是 /tmp/my-skill
# 输出:
# 🔍 检测操作系统: macOS
# 📁 安装到全局目录: /Users/username/.claude/skills
# 📦 开始安装: my-skill
# cp -r /tmp/my-skill /Users/username/.claude/skills/my-skill
# ✅ 安装成功: my-skill
```

### 示例5: GitHub代理（Windows）
```powershell
# 用户输入: 安装 https://github.com/xxx/yyy.git
# 输出:
# 🔍 检测操作系统: Windows
# ⚠️  无法直接访问GitHub
# 🔄 尝试代理: https://gh-proxy.com
# git clone https://gh-proxy.com/https://github.com/xxx/yyy.git "C:\Users\username\.claude\skills\yyy"
# ✅ 安装成功: yyy
```

## 高级功能

### 1. 自动Git安装
```bash
# 如果Git未安装，自动安装
auto_install_git() {
    if ! command -v git &> /dev/null; then
        echo "⚠️  Git未安装"
        echo "🔧 正在尝试自动安装..."
      
        case "$OS" in
            "Linux")
                if command -v apt &> /dev/null; then
                    sudo apt update && sudo apt install -y git
                elif command -v yum &> /dev/null; then
                    sudo yum install -y git
                fi
                ;;
            "macOS")
                if command -v brew &> /dev/null; then
                    brew install git
                else
                    echo "❌ 请先安装Homebrew: https://brew.sh/"
                    exit 1
                fi
                ;;
            "Windows")
                if command -v choco &> /dev/null; then
                    choco install git -y
                elif command -v winget &> /dev/null; then
                    winget install Git.Git
                else
                    echo "❌ 请安装Chocolatey或winget"
                    exit 1
                fi
                ;;
        esac
      
        # 验证安装
        if command -v git &> /dev/null; then
            echo "✅ Git安装成功"
        else
            echo "❌ Git安装失败"
            exit 1
        fi
    fi
}
```

### 2. 代理自动选择
```bash
# 自动选择可用代理
select_proxy() {
    local proxies=(
        "https://gh-proxy.com"
        "https://mirror.ghproxy.com"
        "https://gitclone.com"
        "https://bgithub.xyz"
    )
  
    for proxy in "${proxies[@]}"; do
        if curl -s --connect-timeout 3 "$proxy" > /dev/null 2>&1; then
            echo "$proxy"
            return 0
        fi
    done
  
    return 1
}
```

### 3. 路径标准化
```bash
# 跨平台路径标准化
standardize_path() {
    local path="$1"
  
    case "$OS" in
        "Windows")
            # 转换为Windows路径
            echo "$path" | sed 's|/|\\|g'
            ;;
        *)
            # 保持Unix路径
            echo "$path"
            ;;
    esac
}
```

## 错误处理

### 跨平台错误处理
```bash
handle_error() {
    local error_type="$1"
    local context="$2"
  
    case "$error_type" in
        "permission")
            echo "❌ 权限不足"
            echo "💡 解决方案:"
            case "$OS" in
                "Windows")
                    echo "  1. 以管理员身份运行"
                    echo "  2. 更改目录权限"
                    ;;
                "macOS"|"Linux")
                    echo "  1. 使用sudo: sudo install-skill"
                    echo "  2. 更改权限: chmod 755 $context"
                    ;;
            esac
            ;;
        "network")
            echo "❌ 网络连接失败"
            echo "💡 解决方案:"
            echo "  1. 检查网络连接"
            echo "  2. 尝试使用VPN/代理"
            echo "  3. 使用离线安装方式"
            ;;
        "git")
            echo "❌ Git命令失败"
            echo "💡 解决方案:"
            case "$OS" in
                "Windows")
                    echo "  1. 安装Git: choco install git -y"
                    echo "  2. 或: winget install Git.Git"
                    ;;
                "macOS")
                    echo "  1. 安装Git: brew install git"
                    ;;
                "Linux")
                    echo "  1. 安装Git: sudo apt install git"
                    ;;
            esac
            ;;
    esac
}
```

## 使用示例

### 完整跨平台安装流程
```bash
#!/bin/bash
# 跨平台安装入口脚本

# 检测操作系统
detect_os

# 调用安装函数
install_skill "$1" "${2:-auto}"
```

## 相关资源

1. **跨平台开发最佳实践**[1][3][8]:
   - 使用相对路径
   - 避免硬编码平台特定代码
   - 使用条件编译
   - 利用容器化技术

2. **包管理器**:
   - Windows: Chocolatey, winget, Scoop
   - macOS: Homebrew
   - Linux: apt, yum, dnf, pacman

3. **Git代理服务**:
   - gh-proxy.com
   - mirror.ghproxy.com
   - gitclone.com
   - bgithub.xyz

