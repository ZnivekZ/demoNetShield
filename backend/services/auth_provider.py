"""
AuthProvider — Abstract interface for user identity backend.

Designed for extensibility: the current implementation uses MikroTik Hotspot
(/ip/hotspot/user) as the identity source. In the future, this can be swapped
for an LDAP/FreeIPA implementation by changing AUTH_PROVIDER in config.py.

HOW TO ADD A NEW PROVIDER:
1. Create a class that extends AuthProvider
2. Implement all three abstract methods
3. Register the provider in get_auth_provider() below
4. Set AUTH_PROVIDER=<your_provider_name> in .env

Example for FreeIPA/LDAP:
    class LDAPAuthProvider(AuthProvider):
        def __init__(self):
            self.ldap_url = settings.ldap_url          # e.g. ldap://ipa.example.com
            self.bind_dn  = settings.ldap_bind_dn      # e.g. cn=admin,dc=example,dc=com
            self.bind_pw  = settings.ldap_bind_password
            self.base_dn  = settings.ldap_base_dn      # e.g. dc=example,dc=com
        
        async def authenticate(self, username, password):
            # Use ldap3 or python-ldap to bind as the user
            ...
        
        async def get_user(self, username):
            # LDAP search for cn=username 
            ...
        
        async def list_users(self):
            # LDAP search for all users in base_dn
            ...
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class UserData:
    """
    Normalized user data returned by all AuthProvider implementations.
    Represents a single identity regardless of the backend source.
    """
    username: str
    profile: str = "registered"
    mac_address: str = ""
    disabled: bool = False
    comment: str = ""
    last_seen: str = ""


class AuthProvider(ABC):
    """
    Abstract interface for user identity backends.
    
    All implementations must be async-safe and handle their own
    connection management and error recovery.
    """

    @abstractmethod
    async def authenticate(self, username: str, password: str) -> bool:
        """
        Verify user credentials.
        Returns True if valid, False otherwise.
        Never raises on auth failure — only raises on infrastructure errors.
        """
        ...

    @abstractmethod
    async def get_user(self, username: str) -> UserData | None:
        """
        Retrieve a single user by username.
        Returns None if the user doesn't exist.
        """
        ...

    @abstractmethod
    async def list_users(self) -> list[UserData]:
        """
        Return all users in the identity store.
        May be paginated in the future — for now returns all.
        """
        ...


class MikrotikAuthProvider(AuthProvider):
    """
    AuthProvider backed by MikroTik Hotspot /ip/hotspot/user.
    
    Uses the MikroTikService singleton for all API calls.
    This avoids creating a second connection to the CHR.
    """

    async def authenticate(self, username: str, password: str) -> bool:
        """
        [MikroTik API] Verify credentials against /ip/hotspot/user.
        Checks if a user exists with the given name and password field matches.
        NOTE: This is a basic check — MikroTik hashes passwords, so we compare
        against what the API returns (it exposes the password field in plaintext
        on /ip/hotspot/user for admin queries).
        """
        from services.mikrotik_service import get_mikrotik_service
        try:
            service = get_mikrotik_service()
            users = await service._api_call("/ip/hotspot/user", command="print")
            for user in users:
                if user.get("name") == username and user.get("password") == password:
                    return True
            return False
        except Exception as e:
            logger.error("mikrotik_auth_provider_authenticate_failed", error=str(e))
            return False

    async def get_user(self, username: str) -> UserData | None:
        """[MikroTik API] Get a single hotspot user by name."""
        from services.mikrotik_service import get_mikrotik_service
        try:
            service = get_mikrotik_service()
            users = await service._api_call("/ip/hotspot/user", command="print")
            for user in users:
                if user.get("name") == username:
                    return UserData(
                        username=user.get("name", ""),
                        profile=user.get("profile", "registered"),
                        mac_address=user.get("mac-address", ""),
                        disabled=user.get("disabled", "false") == "true",
                        comment=user.get("comment", ""),
                    )
            return None
        except Exception as e:
            logger.error("mikrotik_auth_provider_get_user_failed", username=username, error=str(e))
            return None

    async def list_users(self) -> list[UserData]:
        """[MikroTik API] List all hotspot users."""
        from services.mikrotik_service import get_mikrotik_service
        try:
            service = get_mikrotik_service()
            users = await service._api_call("/ip/hotspot/user", command="print")
            return [
                UserData(
                    username=user.get("name", ""),
                    profile=user.get("profile", "registered"),
                    mac_address=user.get("mac-address", ""),
                    disabled=user.get("disabled", "false") == "true",
                    comment=user.get("comment", ""),
                )
                for user in users
                if user.get("name") not in ("", "default")  # skip system entries
            ]
        except Exception as e:
            logger.error("mikrotik_auth_provider_list_users_failed", error=str(e))
            return []


# TODO: LDAPAuthProvider — FreeIPA integration
# When ready, implement LDAPAuthProvider(AuthProvider) following the docstring above.
# Required new .env variables:
#   LDAP_URL=ldap://ipa.example.com
#   LDAP_BIND_DN=cn=admin,dc=example,dc=com
#   LDAP_BIND_PASSWORD=secret
#   LDAP_BASE_DN=dc=example,dc=com
#   AUTH_PROVIDER=ldap
#
# Required new config.py settings:
#   ldap_url: str = ""
#   ldap_bind_dn: str = ""
#   ldap_bind_password: str = ""
#   ldap_base_dn: str = ""
#   auth_provider: str = "mikrotik"  # change to "ldap" to use FreeIPA


def get_auth_provider() -> AuthProvider:
    """
    Factory function that returns the configured AuthProvider.
    Currently only 'mikrotik' is implemented.
    To add a new provider, add a new branch here and implement the class above.
    """
    # Future: read from settings.auth_provider
    # For now, always returns MikrotikAuthProvider
    return MikrotikAuthProvider()
