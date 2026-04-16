import requests
import json
import math

# ==========================================
# CONFIGURACIÓN DE TU ENTORNO GLPI
# ==========================================
GLPI_URL = "http://192.168.0.88/apirest.php"
APP_TOKEN = "123456" # Si no usas App-Token en tu config, déjalo vacío
USER_TOKEN = "Cw9kx8Lz1dtyLS6oYQtzRykgwtbsBIgTgyWU6PHt" # Token de usuario (generado en las preferencias del usuario en GLPI)

# Tipos de assets que queremos extraer. 
# La documentación detalla que with_devices, with_disks, etc., aplican principalmente a estos:
ITEM_TYPES = ["Computer", "NetworkEquipment", "Peripheral", "Phone", "Printer"]

# Parámetros para traer ABSOLUTAMENTE TODO el detalle
# Basado en la documentación del endpoint getMultipleItems
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
    """Inicia sesión y devuelve el Session-Token"""
    print("Iniciando sesión en GLPI...")
    auth_headers = headers.copy()
    auth_headers["Authorization"] = f"user_token {USER_TOKEN}"
    
    response = requests.get(f"{GLPI_URL}/initSession", headers=auth_headers)
    response.raise_for_status()
    session_token = response.json().get("session_token")
    print("¡Sesión iniciada correctamente!")
    return session_token

def kill_session(session_token):
    """Destruye la sesión en GLPI"""
    print("Cerrando sesión en GLPI...")
    req_headers = headers.copy()
    req_headers["Session-Token"] = session_token
    requests.get(f"{GLPI_URL}/killSession", headers=req_headers)

def get_asset_ids(session_token, itemtype):
    """Busca todos los IDs de un itemtype usando paginación"""
    req_headers = headers.copy()
    req_headers["Session-Token"] = session_token
    
    asset_ids = []
    start = 0
    step = 50 # GLPI pagina de a 50 por defecto
    total_count = 1 # Valor inicial temporal
    
    print(f"--- Buscando IDs para {itemtype} ---")
    
    while start < total_count:
        end = start + step - 1
        # Forzamos que nos devuelva la columna 2, que es el ID en GLPI
        url = f"{GLPI_URL}/search/{itemtype}/?range={start}-{end}&forcedisplay[0]=2"
        
        response = requests.get(url, headers=req_headers)
        if response.status_code not in [200, 206]:
            print(f"Error al buscar {itemtype}: {response.text}")
            break
            
        data = response.json()
        total_count = data.get("totalcount", 0)
        
        # El endpoint search devuelve los datos dentro de un diccionario "data"
        rows = data.get("data", {})
        for row_key, row_data in rows.items():
            # La key "2" corresponde al ID del item
            item_id = row_data.get("2")
            if item_id:
                asset_ids.append(item_id)
                
        start += step

    print(f"Encontrados {len(asset_ids)} ítems de tipo {itemtype}.")
    return asset_ids

def get_detailed_items(session_token, assets_to_fetch):
    """Usa getMultipleItems para traer todo el detalle de una lista de assets"""
    req_headers = headers.copy()
    req_headers["Session-Token"] = session_token
    
    # Armamos el payload con la estructura {"items": [{"itemtype": "Computer", "items_id": 1}, ...]}
    payload = {"items": assets_to_fetch}
    
    response = requests.get(
        f"{GLPI_URL}/getMultipleItems",
        headers=req_headers,
        params=DETAIL_PARAMS,
        json=payload
    )
    
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error al obtener detalles: {response.status_code} - {response.text}")
        return []

def main():
    session_token = init_session()
    all_detailed_assets = []
    
    try:
        # PASO 1: Recopilar qué vamos a buscar
        assets_to_fetch = []
        for itemtype in ITEM_TYPES:
            ids = get_asset_ids(session_token, itemtype)
            for item_id in ids:
                assets_to_fetch.append({
                    "itemtype": itemtype,
                    "items_id": item_id
                })
        
        # PASO 2: Traer los detalles en lotes (batches)
        # Hacemos lotes de 50 para no reventar la memoria del servidor de GLPI
        BATCH_SIZE = 50
        total_assets = len(assets_to_fetch)
        print(f"\nExtrayendo detalles profundos para {total_assets} assets en total...")
        
        for i in range(0, total_assets, BATCH_SIZE):
            batch = assets_to_fetch[i:i+BATCH_SIZE]
            print(f"Procesando lote {math.ceil(i/BATCH_SIZE)+1} de {math.ceil(total_assets/BATCH_SIZE)}...")
            
            detailed_data = get_detailed_items(session_token, batch)
            all_detailed_assets.extend(detailed_data)
            
        # PASO 3: Guardar en JSON
        output_file = "glpi_full_assets.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(all_detailed_assets, f, indent=4, ensure_ascii=False)
            
        print(f"\n¡Éxito! Todos los datos han sido guardados en {output_file}")
        
    finally:
        # Siempre cerramos la sesión, incluso si el script falla a la mitad
        kill_session(session_token)

if __name__ == "__main__":
    main()