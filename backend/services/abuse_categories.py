"""Catálogo de categorías de AbuseIPDB (IDs oficiales)."""

from __future__ import annotations

# IDs y etiquetas tal cual las define AbuseIPDB (POST /api/v2/report).
CATEGORIES: list[dict[str, object]] = [
    {"id": 1, "label": "Compromiso de DNS", "group": "Red"},
    {"id": 2, "label": "Envenenamiento de DNS", "group": "Red"},
    {"id": 3, "label": "Pedidos fraudulentos", "group": "Fraude"},
    {"id": 4, "label": "Ataque DDoS", "group": "Red"},
    {"id": 5, "label": "Fuerza bruta FTP", "group": "Fuerza bruta"},
    {"id": 6, "label": "Ping de la muerte", "group": "Red"},
    {"id": 7, "label": "Phishing", "group": "Web"},
    {"id": 8, "label": "VoIP fraudulenta", "group": "Fraude"},
    {"id": 9, "label": "Proxy abierto", "group": "Abuso de servicio"},
    {"id": 10, "label": "Spam web", "group": "Web"},
    {"id": 11, "label": "Spam de correo", "group": "Correo"},
    {"id": 12, "label": "Spam en blogs", "group": "Web"},
    {"id": 13, "label": "IP de VPN", "group": "Abuso de servicio"},
    {"id": 14, "label": "Escaneo de puertos", "group": "Reconocimiento"},
    {"id": 15, "label": "Hacking", "group": "Intrusión"},
    {"id": 16, "label": "Inyección SQL", "group": "Intrusión"},
    {"id": 17, "label": "Suplantación (spoofing)", "group": "Red"},
    {"id": 18, "label": "Fuerza bruta", "group": "Fuerza bruta"},
    {"id": 19, "label": "Bot web malicioso", "group": "Web"},
    {"id": 20, "label": "Host comprometido", "group": "Intrusión"},
    {"id": 21, "label": "Ataque a aplicación web", "group": "Intrusión"},
    {"id": 22, "label": "SSH", "group": "Fuerza bruta"},
    {"id": 23, "label": "IoT atacado", "group": "Intrusión"},
]

VALID_IDS: frozenset[int] = frozenset(int(c["id"]) for c in CATEGORIES)
