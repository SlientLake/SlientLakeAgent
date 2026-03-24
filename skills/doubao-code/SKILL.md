---
name: doubao-code
description: "【占位】Doubao Code CLI skill. 当字节跳动官方 Doubao Code CLI 发布后，按 coding-agent 模式激活。需要 doubao-code CLI 二进制。"
metadata:
  {
    "openclaw": {
      "emoji": "🫘",
      "status": "placeholder",
      "requires": { "anyBins": ["doubao-code"] }
    }
  }
---

# Doubao Code Skill（占位）

> **状态：** 等待官方 CLI 发布。Doubao Code CLI 发布后，参考 `coding-agent` skill 进行激活。

## 激活步骤（待 CLI 发布后）

1. 安装 `doubao-code` CLI：
   ```bash
   # 官方安装命令（待确认）
   npm install -g @bytedance/doubao-code
   ```

2. 更新本文件 metadata，移除 `"status": "placeholder"`

3. 在 `~/.openclaw/skills/registry.yaml` 中启用：
   ```yaml
   - name: doubao-code
     enabled: true
   ```

## 预期用法（参考 coding-agent）

```bash
# 届时将支持类似以下调用
doubao-code --print "你的任务"
```

## 参考

- [字节跳动豆包官网](https://www.doubao.com)
- coding-agent skill：`skills/coding-agent/SKILL.md`
- kimi-code skill：`skills/kimi-code/SKILL.md`
