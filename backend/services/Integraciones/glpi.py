import requests
import json
import math

# ==========================================
# CONFIGURACIÓN DE TU ENTORNO GLPI
# ==========================================
GLPI_URL = "http://192.168.0.88/apirest.php"
APP_TOKEN = "123456"   # Si no usas App-Token, déjalo vacío
USER_TOKEN = "Cw9kx8Lz1dtyLS6oYQtzRykgwtbsBIgTgyWU6PHt"

ITEM_TYPES = ["Computer", "NetworkEquipment", "Peripheral", "Phone", "Printer"]

DETAIL_PARAMS = {
    "expand_dropdowns": "true",
    "with_devices": "true",
    "with_disks": "true",
    "with_softwares": "true",
    "with_connections": "true",
    "with_networkports": "true",
    "with_infocoms": "true",
    "with_contracts": "true",
    "with_documents": "true",
    "with_tickets": "true",
    "with_problems": "true",
    "with_changes": "true",
    "with_notes": "true",
    "with_logs": "true"
}

headers = {
    "Content-Type": "application/json",
    "App-Token": APP_TOKEN
}


def init_session():
    print("Iniciando sesión en GLPI...")
    
    auth_headers = headers.copy()
    auth_headers["Authorization"] = f"user_token {USER_TOKEN}"

    response = requests.get(f"{GLPI_URL}/initSession", headers=auth_headers)
    response.raise_for_status()

    session_token = response.json().get("session_token")

    if not session_token:
        raise Exception("No se pudo obtener session_token")

    print("¡Sesión iniciada correctamente!")
    return session_token


def kill_session(session_token):
    print("Cerrando sesión en GLPI...")
    
    req_headers = headers.copy()
    req_headers["Session-Token"] = session_token

    try:
        requests.get(f"{GLPI_URL}/killSession", headers=req_headers)
    except Exception as e:
        print(f"Error al cerrar sesión: {e}")


def get_asset_ids(session_token, itemtype):
    req_headers = headers.copy()
    req_headers["Session-Token"] = session_token

    asset_ids = []
    start = 0
    step = 50
    total_count = 1

    print(f"--- Buscando IDs para {itemtype} ---")

    while start < total_count:
        end = start + step - 1

        url = f"{GLPI_URL}/search/{itemtype}/?range={start}-{end}&forcedisplay[0]=2"

        response = requests.get(url, headers=req_headers)

        if response.status_code not in [200, 206]:
            print(f"Error buscando {itemtype}: {response.status_code}")
            print(response.text)
            break

        data = response.json()
        total_count = data.get("totalcount", 0)

        rows = data.get("data", [])

        for row_data in rows:
            item_id = row_data.get("2")
            if item_id:
                asset_ids.append(item_id)

        start += step

    print(f"Encontrados {len(asset_ids)} ítems de tipo {itemtype}")
    return asset_ids


def get_detailed_items(session_token, assets_to_fetch):
    req_headers = headers.copy()
    req_headers["Session-Token"] = session_token

    params = DETAIL_PARAMS.copy()

    for idx, asset in enumerate(assets_to_fetch):
        params[f"items[{idx}][itemtype]"] = asset["itemtype"]
        params[f"items[{idx}][items_id]"] = asset["items_id"]

    response = requests.get(
        f"{GLPI_URL}/getMultipleItems",
        headers=req_headers,
        params=params
    )

    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error obteniendo detalles: {response.status_code}")
        print(response.text)
        return []


def main():
    session_token = None

    try:
        session_token = init_session()

        assets_to_fetch = []
        all_detailed_assets = []

        # --------------------------------------
        # 1. Buscar todos los IDs
        # --------------------------------------
        for itemtype in ITEM_TYPES:
            ids = get_asset_ids(session_token, itemtype)

            for item_id in ids:
                assets_to_fetch.append({
                    "itemtype": itemtype,
                    "items_id": item_id
                })

        total_assets = len(assets_to_fetch)

        print(f"\nExtrayendo detalles de {total_assets} assets...")

        # --------------------------------------
        # 2. Traer detalles en lotes
        # --------------------------------------
        BATCH_SIZE = 50

        for i in range(0, total_assets, BATCH_SIZE):
            batch = assets_to_fetch[i:i + BATCH_SIZE]

            batch_num = math.ceil(i / BATCH_SIZE) + 1
            total_batches = math.ceil(total_assets / BATCH_SIZE)

            print(f"Procesando lote {batch_num} de {total_batches}...")

            detailed_data = get_detailed_items(session_token, batch)
            all_detailed_assets.extend(detailed_data)

        # --------------------------------------
        # 3. Guardar resultado
        # --------------------------------------
        output_file = "glpi_full_assets.json"

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(all_detailed_assets, f, indent=4, ensure_ascii=False)

        print(f"\n¡Éxito! Datos guardados en {output_file}")

    except Exception as e:
        print(f"Error general: {e}")

    finally:
        if session_token:
            kill_session(session_token)


if __name__ == "__main__":
    main()