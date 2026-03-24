#!/bin/bash
# agent-status.sh - 查看所有 agent 运行状态

echo "====== SilentLake Agent Status ======"
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

echo "--- OpenClaw 版本 ---"
cat ~/.nvm/versions/node/v24.13.0/lib/node_modules/openclaw/package.json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'])" 2>/dev/null || echo "unknown"

echo ""
echo "--- 运行中的 Gateway 进程 ---"
ps aux | grep openclaw-gateway | grep -v grep | awk '{print "PID:"$2, "CPU:"$3"%", "MEM:"$4"%" }'

echo ""
echo "--- 监听端口 ---"
ss -tlnp 2>/dev/null | grep 187 | awk '{print $4, $6}' || netstat -tlnp 2>/dev/null | grep 187

echo ""
echo "--- Cron Job 状态 ---"
python3 << 'PYEOF'
import json
try:
    with open('/home/zhuofei/.openclaw/cron/jobs.json') as f:
        data = json.load(f)
    for job in data['jobs']:
        state = job.get('state', {})
        status = state.get('lastStatus', 'unknown')
        enabled = '✅' if job.get('enabled') else '⏸ '
        name = job['name'][:45]
        agent = job.get('agentId', '?')
        print(f"  {enabled} [{agent}] {name}: {status}")
except Exception as e:
    print(f"  Error reading jobs: {e}")
PYEOF

echo ""
echo "--- 组织架构 ---"
python3 << 'PYEOF'
try:
    import subprocess
    result = subprocess.run(['python3', '-c', '''
import yaml
with open("/home/zhuofei/.openclaw/organization.yaml") as f:
    org = yaml.safe_load(f)
agents = org["organization"]["topology"]["agents"]
print(f"  组织: {org['organization']['name']}")
print(f"  Agent 总数: {len(agents)}")
for a in agents:
    reports = f"  → 汇报给: {a.get('reports_to', '-')}" if a.get('reports_to') else ""
    print(f"    [{a['id']}] {a['display_name']} (port:{a.get('port','?')}){reports}")
'''], capture_output=True, text=True)
    if result.returncode == 0:
        print(result.stdout)
    else:
        print("  需要安装 pyyaml: pip3 install pyyaml")
except:
    print("  无法读取组织架构配置")
PYEOF
