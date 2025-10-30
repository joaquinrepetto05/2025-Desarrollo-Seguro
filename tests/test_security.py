import os

import pytest
import requests

API_BASE = os.getenv("API_BASE_URL", "http://localhost:5000")
DEFAULT_USERNAME = os.getenv("SECURITY_TEST_USERNAME", "test")
DEFAULT_PASSWORD = os.getenv("SECURITY_TEST_PASSWORD", "password")


@pytest.fixture(scope="module")
def auth_headers() -> dict:
    """
    Reuses the seeded demo user to obtain a JWT token. The docker-compose
    seeds insert this account with a couple of invoices so the regression
    check exercises the real vulnerability.
    """
    login = requests.post(
        f"{API_BASE}/auth/login",
        json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
        timeout=10,
    )
    login.raise_for_status()
    token = login.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _fetch_invoices(params: dict, headers: dict) -> list:
    # Helper para pegarle al /invoices con los params que queremos.
    response = requests.get(
        f"{API_BASE}/invoices",
        params=params,
        headers=headers,
        timeout=10,
    )
    response.raise_for_status()
    payload = response.json()
    assert isinstance(payload, list)
    return payload


def test_login(auth_headers: dict) -> None:
    assert "Authorization" in auth_headers


def test_invoice_sql_injection_blocked(auth_headers: dict) -> None:
    """
    Este test verifica que no haya inyección SQL cuando filtramos facturas.

    Antes el backend armaba la consulta con strings, por lo que si el atacante mandaba algo como "1"="1",
    el resultado mostraria muchas mas filas de las que deberia, lo cual es una falla de seguridad.

    Ahora se usan consultas parametrizadas (ORM), evitando la inyección de strings potencialmente
    maliciosos.
    """

    ok_params = {"status": "paid", "operator": "="}
    ok_payload = _fetch_invoices(ok_params, auth_headers)

    # Se fija que ok_payload no esté vacio y si lo esta muestra el mensaje diciendo que faltan seeds.
    assert ok_payload, (
        "Expected seeded invoices for the regression test. "
        "Run `docker compose exec backend npx knex --knexfile src/knexfile.ts seed:run` first."
    )

    # Intento de ataque inyectando "OR 1=1" en el valor de status
    attack_params = {"status": "paid' OR '1'='1", "operator": "="}
    attack_payload = _fetch_invoices(attack_params, auth_headers)

    # Si la inyeccion funcionara, este resultado traeria mas filas.
    # Con la mitigacion, no deberia superar al caso feliz.
    assert len(attack_payload) <= len(ok_payload)