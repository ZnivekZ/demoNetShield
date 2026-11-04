"""Bounded, read-only public CVE context for technical remediation guidance."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

from services.cisa_kev_service import get_cisa_kev_service

NVD_API = "https://services.nvd.nist.gov/rest/json/cves/2.0"
VENDOR_HOSTS = frozenset({
    "security-tracker.debian.org", "www.debian.org", "ubuntu.com",
    "access.redhat.com", "msrc.microsoft.com", "learn.microsoft.com",
    "httpd.apache.org", "www.php.net", "www.kernel.org",
    "chromium.org", "www.chromium.org",
})
CVE_PATTERN = re.compile(r"^CVE-\d{4}-\d{4,}$")


class _VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style", "noscript"):
            self.hidden += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript") and self.hidden:
            self.hidden -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden and data.strip():
            self.parts.append(data.strip())


def _vendor_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        return parsed.scheme == "https" and parsed.port in (None, 443) and host in VENDOR_HOSTS
    except ValueError:
        return False


async def _vendor_excerpt(client: httpx.AsyncClient, url: str, cve_id: str) -> str:
    if not _vendor_url(url):
        return ""
    try:
        async with client.stream("GET", url, follow_redirects=False) as response:
            response.raise_for_status()
            if "text/html" not in response.headers.get("content-type", ""):
                return ""
            chunks = bytearray()
            async for chunk in response.aiter_bytes():
                chunks.extend(chunk)
                if len(chunks) >= 65_536:
                    break
        parser = _VisibleText()
        parser.feed(chunks.decode("utf-8", errors="replace"))
        text = re.sub(r"\s+", " ", " ".join(parser.parts))
        position = text.lower().find(cve_id.lower())
        return text[max(0, position - 250): position + 1750] if position >= 0 else ""
    except (httpx.HTTPError, ValueError):
        return ""


async def get_remediation_context(cve_id: str) -> dict:
    """Return official catalog/NVD facts and bounded vendor text when available."""
    cve_id = cve_id.strip().upper()
    if not CVE_PATTERN.fullmatch(cve_id):
        return {"cve_id": cve_id, "sources": [], "guidance": ""}

    sources: list[dict] = []
    kev = get_cisa_kev_service()
    entry = kev.entries_by_cve().get(cve_id) if kev.is_loaded() else None
    if entry:
        sources.append({
            "kind": "cisa_kev", "url": "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
            "text": str(entry.get("requiredAction") or "")[:1200],
            "date_added": entry.get("dateAdded"),
        })

    async with httpx.AsyncClient(timeout=6.0, follow_redirects=False) as client:
        try:
            response = await client.get(NVD_API, params={"cveId": cve_id})
            response.raise_for_status()
            records = response.json().get("vulnerabilities") or []
            cve = ((records[0] or {}).get("cve") or {}) if records else {}
            if str(cve.get("id") or "").upper() != cve_id:
                return {"cve_id": cve_id, "sources": sources}
            descriptions = cve.get("descriptions") or []
            description = next((d.get("value", "") for d in descriptions if d.get("lang") == "en"), "")
            sources.append({"kind": "nvd", "url": f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                            "text": description[:1500]})
            refs = [r.get("url", "") for r in cve.get("references") or []
                    if _vendor_url(r.get("url", "")) and
                    any(tag in (r.get("tags") or []) for tag in ("Vendor Advisory", "Patch"))]
            for url in refs[:2]:
                excerpt = await _vendor_excerpt(client, url, cve_id)
                if excerpt:
                    sources.append({"kind": "vendor_advisory", "url": url, "text": excerpt})
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            pass

    return {"cve_id": cve_id, "sources": sources}
