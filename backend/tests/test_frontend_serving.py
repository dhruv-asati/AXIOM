from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import mount_frontend


def test_spa_serves_root_routes_and_real_assets_but_not_missing_assets(tmp_path):
    assets = tmp_path / "assets"
    assets.mkdir()
    (tmp_path / "index.html").write_text("<main>AXIOM</main>", encoding="utf-8")
    (tmp_path / "favicon.svg").write_text("<svg />", encoding="utf-8")
    (assets / "app.js").write_text("console.log('axiom')", encoding="utf-8")
    app = FastAPI()
    mount_frontend(app, tmp_path)

    client = TestClient(app)
    assert client.get("/").text == "<main>AXIOM</main>"
    assert client.get("/login").text == "<main>AXIOM</main>"
    assert client.get("/dashboard").text == "<main>AXIOM</main>"
    assert client.get("/favicon.svg").text == "<svg />"
    assert client.get("/assets/app.js").text == "console.log('axiom')"
    assert client.get("/assets/missing.js").status_code == 404
    assert client.get("/missing.js").status_code == 404


def test_api_routes_and_unknown_api_paths_are_not_rewritten_to_spa(tmp_path):
    (tmp_path / "index.html").write_text("<main>AXIOM</main>", encoding="utf-8")
    app = FastAPI()

    @app.get("/api/v1/health")
    def health():
        return {"status": "ok"}

    mount_frontend(app, tmp_path)
    client = TestClient(app)

    assert client.get("/api/v1/health").json() == {"status": "ok"}
    missing = client.get("/api/v1/not-a-route")
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Not Found"}
    assert missing.headers["content-type"].startswith("application/json")


def test_frontend_fallback_is_helpful_when_no_production_build_exists(tmp_path):
    app = FastAPI()
    mount_frontend(app, tmp_path)
    response = TestClient(app).get("/dashboard")

    assert response.status_code == 404
    assert "npm run build" in response.json()["detail"]
