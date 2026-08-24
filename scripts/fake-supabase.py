# Nagemaakte Supabase-API voor scripts/test-smoke-api.sh. Twee standen:
#   healthy = grants en RLS staan goed
#   leaky   = anon mag posten en de audittabel is leesbaar
# Geen productiecode; enkel om de smoketest zelf te testen.
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

MODE = sys.argv[1] if len(sys.argv) > 1 else "healthy"

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, body):
        b = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if "report_audit" in self.path:
            if MODE == "leaky":
                return self._send(200, [{"report_id": "x", "ip_hash": "abc"}])
            return self._send(200, [])
        self._send(404, {"message": "not found"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n) or "{}")
        auth = self.headers.get("Authorization", "")
        is_user_jwt = "USERJWT" in auth

        if self.path.endswith("/map_reports"):
            z = body.get("zoom")
            # bbox-oppervlak nabootsen zoals de SQL-functie doet
            area = abs(body["max_lng"] - body["min_lng"]) * abs(body["max_lat"] - body["min_lat"])
            if area > 100:
                return self._send(400, {"code": "P0001", "message": "bbox_too_large"})
            if z >= 14:
                return self._send(200, [
                    {"is_cluster": False, "lng": 4.40, "lat": 51.21, "point_count": 1,
                     "report_id": "a", "kind": "litter", "size": "bag",
                     "has_photo": True, "created_at": "2026-08-20T10:00:00Z"},
                    {"is_cluster": False, "lng": 4.41, "lat": 51.22, "point_count": 1,
                     "report_id": "b", "kind": "litter", "size": "piece",
                     "has_photo": False, "created_at": "2026-08-21T10:00:00Z"}])
            return self._send(200, [
                {"is_cluster": True, "lng": 4.4, "lat": 51.2, "point_count": 23,
                 "report_id": None, "kind": "litter", "size": "piece",
                 "has_photo": True, "created_at": "2026-08-22T10:00:00Z"}])

        if self.path.endswith("/nearby_reports"):
            return self._send(200, [])

        if self.path.endswith("/create_report"):
            if not is_user_jwt:
                if MODE == "leaky":   # verkeerde grants: anon mag posten
                    return self._send(200, {"report_id": "lek", "status": "published"})
                return self._send(401, {
                    "code": "42501",
                    "message": "permission denied for function create_report"})
            if abs(body["p_lng"] - 2.3522) < 0.01:
                return self._send(400, {"code": "P0001", "message": "outside_service_area"})
            ref = body["p_client_ref"]
            if ref in SEEN:
                return self._send(200, {"report_id": SEEN[ref], "status": "published",
                                        "idempotent": True})
            SEEN[ref] = "r-" + str(len(SEEN) + 1)
            return self._send(200, {"report_id": SEEN[ref], "status": "published",
                                    "nearby_count": 0})

        self._send(404, {"message": "not found"})

SEEN = {}
HTTPServer(("127.0.0.1", int(sys.argv[2])), H).serve_forever()
