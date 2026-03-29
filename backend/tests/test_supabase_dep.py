import pytest


def test_get_supabase_client_raises_without_env(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    import importlib
    import app.deps.supabase as dep_module
    importlib.reload(dep_module)
    with pytest.raises(ValueError, match="SUPABASE_URL"):
        dep_module.get_supabase_client()


def test_get_supabase_client_returns_client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    # supabase-py validates JWT format; use a properly structured fake token
    monkeypatch.setenv(
        "SUPABASE_SERVICE_ROLE_KEY",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake-signature",
    )
    import importlib
    import app.deps.supabase as dep_module
    importlib.reload(dep_module)
    client = dep_module.get_supabase_client()
    assert client is not None
