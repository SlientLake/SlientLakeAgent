---
name: kimi-code
description: "【占位】Kimi Code CLI skill. 当月之暗面官方 Kimi Code CLI 发布后，按 coding-agent 模式激活。需要 kimi-code CLI 二进制。"
metadata:
  {
    "openclaw": {
      "emoji": "🌙",
      "status": "placeholder",
      "requires": { "anyBins": ["kimi-code"] }
    }
  }
---

# Kimi Code Skill（占位）

> **状态：** 等待官方 CLI 发布。Kimi Code CLI 发布后，参考 `coding-agent` skill 进行激活。

## 激活步骤（待 CLI 发布后）

1. 安装 `kimi-code` CLI：
   ```bash
   # 官方安装命令（待确认）
   npm install -g @moonshot/kimi-code
   ```

2. 更新本文件 metadata，移除 `"status": "placeholder"`

3. 在 `~/.openclaw/skills/registry.yaml` 中启用：
   ```yaml
   - name: kimi-code
     enabled: true
   ```

## 预期用法（参考 coding-agent）

```bash
# 届时将支持类似以下调用
kimi-code --print "你的任务"
```

## 参考

- [月之暗面官网](https://www.moonshot.cn)
- coding-agent skill：`skills/coding-agent/SKILL.md`
