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
    benign_params = {"status": "paid", "operator": "="}
    benign_payload = _fetch_invoices(benign_params, auth_headers)
    assert benign_payload, (
        "Expected seeded invoices for the regression test. "
        "Run `docker compose exec backend npx knex --knexfile src/knexfile.ts seed:run` first."
    )

    attack_params = {"status": "paid' OR '1'='1", "operator": "="}
    attack_payload = _fetch_invoices(attack_params, auth_headers)

    assert len(attack_payload) <= len(benign_payload)
