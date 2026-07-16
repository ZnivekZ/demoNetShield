"""
Diagnóstico rápido del Indexer Wazuh.

Uso: python3 diagnose_indexer.py

Muestra:
- ¿Está configurado?
- ¿Responde el ping?
- ¿Qué índices existen?
- ¿Cuántas alertas hay realmente?
- Latencia
"""
import asyncio, json, sys, os
from pathlib import Path

# Backend importable
ROOT = Path(r"C:\Users\nico_\Documents\GitHub\demoNetShield\backend")
sys.path.insert(0, str(ROOT))

# Drop PYTHONHOME/PYTHONPATH (Hermes venv issue)
for var in ["PYTHONHOME", "PYTHONPATH"]:
    if var in os.environ:
        del os.environ[var]

from services.wazuh_indexer import get_indexer_client


async def main():
    cli = get_indexer_client()
    print("=" * 60)
    print("DIAGNOSTIC: Wazuh Indexer")
    print("=" * 60)

    # Config
    print("\n[1] Configuration")
    print(f"    URL:    {cli._settings.wazuh_indexer_url!r}")
    print(f"    User:   {cli._settings.wazuh_indexer_user!r}")
    print(f"    Verify: {cli._settings.wazuh_indexer_verify_ssl}")
    print(f"    is_configured: {cli.is_configured()}")

    # Ping
    print("\n[2] Ping (GET /)")
    ping = await cli.ping()
    print(json.dumps(ping, indent=4))

    if not ping.get("reachable"):
        print("\n    ❌ Indexer NOT reachable. Check network/firewall/auth.")
        return

    # Indices
    print("\n[3] Wazuh indices (alerts + vulnerabilities)")
    for pat in ["wazuh-alerts*", "wazuh-states-vulnerabilities*"]:
        summary = await cli.indices_summary(pat)
        print(f"\n    Pattern: {pat}")
        print(f"    Count: {summary.get('count', '?')}")
        for idx in summary.get("indices", [])[:5]:
            print(f"      - {idx['index']}: {idx['docs']} docs")

    # Direct query
    print("\n[4] Direct query: alerts (level>=3, last 7 days)")
    alerts = await cli.get_alerts(limit=5, level_min=3)
    print(f"    Got {len(alerts)} alerts")
    for a in alerts[:3]:
        print(f"      - level={a['rule']['level']} agent={a['agent']['name']}")
        print(f"        desc={a['rule']['description'][:60]}")

    # Vulnerabilities
    print("\n[5] Vulnerabilities (limit 5)")
    vulns = await cli.get_vulnerabilities(limit=5)
    print(f"    Got {len(vulns)} vulns")
    for v in vulns[:3]:
        print(f"      - {v['cve']} score={v['score']} pkg={v['package']}")

    # Concurrent stress test
    print("\n[6] Concurrent stress (5 parallel requests)")
    import time
    tasks = [cli.get_alerts(limit=5, level_min=3) for _ in range(5)]
    t0 = time.time()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    elapsed = time.time() - t0
    ok = sum(1 for r in results if not isinstance(r, Exception))
    fail = len(results) - ok
    print(f"    Time: {elapsed*1000:.0f}ms  OK={ok}  FAIL={fail}")
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            print(f"      - task {i+1}: {type(r).__name__}: {r!r}")

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)
    await cli.close()


if __name__ == "__main__":
    asyncio.run(main())