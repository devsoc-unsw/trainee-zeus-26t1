from fastapi.testclient import TestClient


def test_health_returns_ok():
    from app.main import app
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_header_for_allowed_origin(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")
    import importlib
    import app.main as main_module
    importlib.reload(main_module)
    from app.main import app
    client = TestClient(app)
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
