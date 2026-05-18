import pytest


def test_get_supabase_client_raises_without_env(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    import importlib

    import app.deps.supabase as dep_module

    importlib.reload(dep_module)
    with pytest.raises(ValueError, match="SUPABASE_URL"):
        dep_module.get_supabase_client()


def test_get_supabase_client_raises_on_placeholder_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://your-project.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "your-service-role-key")
    import importlib

    import app.deps.supabase as dep_module

    importlib.reload(dep_module)
    with pytest.raises(ValueError, match="placeholders"):
        dep_module.get_supabase_client()


def test_get_supabase_client_returns_client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://testproject.supabase.co")
    monkeypatch.setenv(
        "SUPABASE_SERVICE_ROLE_KEY",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake-signature",
    )
    import importlib

    import app.deps.supabase as dep_module

    importlib.reload(dep_module)
    sentinel = object()
    monkeypatch.setattr(dep_module, "create_client", lambda *a, **kwargs: sentinel)
    client = dep_module.get_supabase_client()
    assert client is sentinel
