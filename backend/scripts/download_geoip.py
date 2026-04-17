#!/usr/bin/env python3
"""
Script para descargar las bases de datos GeoLite2 de MaxMind.

Requiere:
  - MAXMIND_LICENSE_KEY en backend/.env
  - Cuenta gratuita en https://www.maxmind.com/en/geolite2/signup

Descarga:
  - GeoLite2-City.mmdb  → backend/data/geoip/GeoLite2-City.mmdb
  - GeoLite2-ASN.mmdb   → backend/data/geoip/GeoLite2-ASN.mmdb

Uso:
  cd netShield2
  python backend/scripts/download_geoip.py

Una vez descargadas, cambiar MOCK_GEOIP=false en backend/.env para usar las DBs reales.

Frecuencia de actualización recomendada: mensual (MaxMind actualiza los martes).
"""

from __future__ import annotations

import os
import sys
import tarfile
import urllib.request
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent
ENV_FILE = BACKEND_DIR / ".env"
OUTPUT_DIR = BACKEND_DIR / "data" / "geoip"

# ── MaxMind download URLs ──────────────────────────────────────────────────────

DATABASES = {
    "GeoLite2-City": {
        "filename": "GeoLite2-City.mmdb",
        "edition_id": "GeoLite2-City",
    },
    "GeoLite2-ASN": {
        "filename": "GeoLite2-ASN.mmdb",
        "edition_id": "GeoLite2-ASN",
    },
}

MAXMIND_BASE_URL = "https://download.maxmind.com/app/geoip_download"


def load_license_key() -> str:
    """Load the MaxMind license key from .env file or environment."""
    # 1. Try explicit env var
    key = os.environ.get("MAXMIND_LICENSE_KEY", "")
    if key:
        return key

    # 2. Try reading from .env file
    if ENV_FILE.exists():
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line.startswith("MAXMIND_LICENSE_KEY="):
                    key = line.split("=", 1)[1].strip()
                    if key:
                        return key

    return ""


def download_database(name: str, edition_id: str, license_key: str, filename: str) -> None:
    """Download and extract a single GeoLite2 database."""
    url = (
        f"{MAXMIND_BASE_URL}"
        f"?edition_id={edition_id}"
        f"&license_key={license_key}"
        f"&suffix=tar.gz"
    )
    tar_path = OUTPUT_DIR / f"{edition_id}.tar.gz"
    out_path = OUTPUT_DIR / filename

    print(f"\n[{name}] Descargando...")
    try:
        urllib.request.urlretrieve(url, tar_path)
        print(f"[{name}] Descarga completa. Extrayendo .mmdb...")

        with tarfile.open(tar_path, "r:gz") as tf:
            for member in tf.getmembers():
                if member.name.endswith(".mmdb"):
                    member.name = os.path.basename(member.name)  # flatten path
                    tf.extract(member, OUTPUT_DIR, filter="data")
                    extracted = OUTPUT_DIR / member.name
                    if extracted != out_path:
                        extracted.rename(out_path)
                    print(f"[{name}] Guardado en: {out_path}")
                    break
            else:
                print(f"[{name}] ERROR: No se encontró .mmdb en el archivo tar.gz")
                sys.exit(1)

        tar_path.unlink(missing_ok=True)

    except urllib.error.HTTPError as e:
        print(f"[{name}] ERROR HTTP {e.code}: {e.reason}")
        if e.code == 401:
            print("  → License key inválida o no tiene acceso a GeoLite2.")
            print("  → Registrarse gratis en: https://www.maxmind.com/en/geolite2/signup")
        sys.exit(1)
    except Exception as e:
        print(f"[{name}] ERROR: {e}")
        sys.exit(1)


def main() -> None:
    print("=" * 60)
    print("NetShield — Descarga de bases de datos GeoLite2")
    print("=" * 60)

    license_key = load_license_key()
    if not license_key:
        print("\nERROR: MAXMIND_LICENSE_KEY no configurada.")
        print("  1. Registrarse en: https://www.maxmind.com/en/geolite2/signup")
        print("  2. Generar una license key en 'My License Key'")
        print(f"  3. Agregarla en: {ENV_FILE}")
        print("     MAXMIND_LICENSE_KEY=tu_clave_aqui")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nDirectorio de salida: {OUTPUT_DIR}")
    print(f"License key: {license_key[:8]}...")

    for name, info in DATABASES.items():
        download_database(
            name=name,
            edition_id=info["edition_id"],
            license_key=license_key,
            filename=info["filename"],
        )

    print("\n" + "=" * 60)
    print("Descarga completada exitosamente.")
    print("\nPróximos pasos:")
    print("  1. Editar backend/.env")
    print("  2. Cambiar: MOCK_GEOIP=false")
    print("  3. Reiniciar el backend")
    print("=" * 60)


if __name__ == "__main__":
    main()
