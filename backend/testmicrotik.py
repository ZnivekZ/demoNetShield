import routeros_api
import traceback
import time

HOST = "192.168.0.27"
PORT = 8728
USER = "admin"
PASSWORD = "admin"

print("=" * 60)
print("MIKROTIK API TEST")
print("=" * 60)

print(f"[1] Host: {HOST}")
print(f"[2] Puerto: {PORT}")
print(f"[3] Usuario: {USER}")
print()

try:
    print("[4] Intentando conectar...")
    start = time.time()

    connection = routeros_api.RouterOsApiPool(
        HOST,
        username=USER,
        password=PASSWORD,
        port=PORT,
        plaintext_login=True
    )

    print(f"[OK] Conexión establecida en {time.time() - start:.2f}s")
    print()

    print("[5] Obteniendo API...")
    api = connection.get_api()

    print("[OK] API obtenida")
    print()

    # -------------------------------------------------
    # IDENTITY
    # -------------------------------------------------

    print("[6] Consultando identidad del MikroTik...")

    identity = api.get_resource("/system/identity")
    result = identity.get()

    print("[OK] Resultado:")
    print(result)
    print()

    # -------------------------------------------------
    # RESOURCES
    # -------------------------------------------------

    print("[7] Consultando interfaces...")

    interfaces = api.get_resource("/interface")
    result = interfaces.get()

    print(f"[OK] Interfaces encontradas: {len(result)}")

    for interface in result:
        print(
            f"  - {interface.get('name')} "
            f"| type={interface.get('type')} "
            f"| running={interface.get('running')} "
            f"| disabled={interface.get('disabled')}"
        )

    print()

    # -------------------------------------------------
    # IP ADDRESSES
    # -------------------------------------------------

    print("[8] Consultando IPs...")

    ips = api.get_resource("/ip/address")
    result = ips.get()

    print(f"[OK] IPs encontradas: {len(result)}")

    for ip in result:
        print(
            f"  - address={ip.get('address')} "
            f"| interface={ip.get('interface')} "
            f"| network={ip.get('network')}"
        )

    print()

    # -------------------------------------------------
    # ROUTES
    # -------------------------------------------------

    print("[9] Consultando rutas...")

    routes = api.get_resource("/ip/route")
    result = routes.get()

    print(f"[OK] Rutas encontradas: {len(result)}")

    for route in result:
        print(
            f"  - dst={route.get('dst-address')} "
            f"| gateway={route.get('gateway')} "
            f"| active={route.get('active')}"
        )

    print()

    # -------------------------------------------------
    # SYSTEM RESOURCE
    # -------------------------------------------------

    print("[10] Consultando recursos del sistema...")

    resource = api.get_resource("/system/resource")
    result = resource.get()

    if result:
        r = result[0]

        print(f"  - RouterOS: {r.get('version')}")
        print(f"  - Architecture: {r.get('architecture-name')}")
        print(f"  - Board: {r.get('board-name')}")
        print(f"  - CPU: {r.get('cpu')}")
        print(f"  - CPU cores: {r.get('cpu-count')}")
        print(f"  - RAM total: {r.get('total-memory')}")
        print(f"  - RAM libre: {r.get('free-memory')}")
        print(f"  - Uptime: {r.get('uptime')}")

    print()
    print("=" * 60)
    print("TODO OK 🎉")
    print("=" * 60)

    connection.disconnect()

except Exception as e:
    print()
    print("=" * 60)
    print("❌ ERROR")
    print("=" * 60)

    print(f"Tipo: {type(e).__name__}")
    print(f"Mensaje: {e}")
    print()

    print("TRACEBACK COMPLETO:")
    traceback.print_exc()