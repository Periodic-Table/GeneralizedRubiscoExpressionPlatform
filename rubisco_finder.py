#!/usr/bin/env python3
"""Rubisco large subunit finder + dry-lab compatibility explorer.

Run:
    python3 rubisco_finder.py

Then open:
    http://127.0.0.1:8000
"""

from __future__ import annotations

import json
import re
import ssl
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote_plus, urlparse
from urllib.request import Request, urlopen

HOST = "127.0.0.1"
PORT = 8000
BASE_DIR = Path(__file__).resolve().parent
INDEX_HTML_PATH = BASE_DIR / "index.html"
APP_JS_PATH = BASE_DIR / "app.js"
SITE_DATA_PATH = BASE_DIR / "rubisco_site_data.json"
UNIPROT_TAXONOMY_SEARCH = "https://rest.uniprot.org/taxonomy/search"
UNIPROT_KB_SEARCH = "https://rest.uniprot.org/uniprotkb/search"

HARDCODED_REPLACEMENT_76 = ""  # Paste a 76-aa replacement here if needed.


@dataclass
class TaxonCandidate:
    scientific_name: str = ""
    common_name: str = ""
    taxon_id: str = ""
    lineage: str = ""
    raw: Dict[str, Any] | None = None


def load_site_data() -> Dict[str, Any]:
    if not SITE_DATA_PATH.exists():
        raise FileNotFoundError(f"Missing site data file: {SITE_DATA_PATH}")
    return json.loads(SITE_DATA_PATH.read_text(encoding="utf-8"))


SITE_DATA = load_site_data()

PLANT_HINTS = (
    "viridiplantae",
    "plantae",
    "embryophyta",
    "streptophyta",
    "chlorophyta",
    "land plant",
    "plant",
    "green algae",
)
NON_PLANT_HINTS = (
    "phytoplasma",
    "bacteria",
    "bacterium",
    "archaea",
    "virus",
    "viridae",
    "virales",
    "viroid",
    "phage",
)


def json_response(handler: BaseHTTPRequestHandler, payload: Dict[str, Any], status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def file_response(handler: BaseHTTPRequestHandler, path: Path, content_type: str) -> None:
    body = path.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def http_get(url: str, accept: str = "application/json") -> str:
    req = Request(url, headers={"Accept": accept, "User-Agent": "RubiscoFinder/2.0"})
    ctx = ssl.create_default_context()
    with urlopen(req, timeout=30, context=ctx) as res:
        return res.read().decode("utf-8", errors="replace")


def safe_get(d: Dict[str, Any], *keys: str, default: str = "") -> str:
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return str(d[k])
    return default


def candidate_text(candidate: TaxonCandidate) -> str:
    return " ".join([
        candidate.scientific_name,
        candidate.common_name,
        candidate.lineage,
    ]).lower()


def collect_taxon_candidates(data: Dict[str, Any]) -> List[TaxonCandidate]:
    candidates: List[TaxonCandidate] = []
    for item in data.get("results", []) if isinstance(data, dict) else []:
        if not isinstance(item, dict):
            continue
        scientific = safe_get(item, "scientificName", "scientific_name", "name", default="")
        common = safe_get(item, "commonName", "common_name", default="")
        taxon_id = safe_get(item, "taxonId", "taxon_id", "id", default="")
        lineage_value = item.get("lineage", "")
        if isinstance(lineage_value, list):
            lineage = " ".join(str(x) for x in lineage_value)
        else:
            lineage = str(lineage_value or "")
        candidates.append(TaxonCandidate(scientific_name=scientific, common_name=common, taxon_id=taxon_id, lineage=lineage, raw=item))
    return candidates


def score_taxon(candidate: TaxonCandidate, query: str) -> int:
    q = query.strip().lower()
    text = candidate_text(candidate)
    sci = candidate.scientific_name.lower()
    com = candidate.common_name.lower()
    score = 0

    if q == sci or q == com:
        score += 1000
    if q in sci:
        score += 220
    if q in com:
        score += 160
    for token in [t for t in re.split(r"\s+", q) if t]:
        if token in sci:
            score += 20
        if token in com:
            score += 15

    if any(hint in text for hint in PLANT_HINTS):
        score += 250
    if any(hint in text for hint in NON_PLANT_HINTS):
        score -= 1500

    return score


def pick_best_taxon(candidates: List[TaxonCandidate], query: str) -> Optional[TaxonCandidate]:
    if not candidates:
        return None
    scored = sorted(
        ((candidate, score_taxon(candidate, query)) for candidate in candidates),
        key=lambda item: item[1],
        reverse=True,
    )
    plant_candidates = [candidate for candidate, score in scored if score > -1000 and any(h in candidate_text(candidate) for h in PLANT_HINTS)]
    if plant_candidates:
        return plant_candidates[0]
    return scored[0][0]


def build_taxonomy_search_url(name: str) -> str:
    q = quote_plus(name.strip())
    return f"{UNIPROT_TAXONOMY_SEARCH}?query={q}&format=json&size=100"


def build_rbcL_search_url(taxon_id: str) -> str:
    query = f"reviewed:true AND gene:rbcL AND organism_id:{taxon_id}"
    return f"{UNIPROT_KB_SEARCH}?query={quote_plus(query)}&format=fasta&size=1"


def build_rbcL_search_url_unreviewed(taxon_id: str) -> str:
    query = f"gene:rbcL AND organism_id:{taxon_id}"
    return f"{UNIPROT_KB_SEARCH}?query={quote_plus(query)}&format=fasta&size=1"


def parse_fasta_header(header: str) -> Dict[str, str]:
    text = header.lstrip(">")
    first_space = text.find(" ")
    first = text if first_space == -1 else text[:first_space]
    rest = "" if first_space == -1 else text[first_space + 1 :]
    parts = first.split("|")
    db = parts[0] if len(parts) > 0 else ""
    accession = parts[1] if len(parts) > 1 else ""
    entry_name = parts[2] if len(parts) > 2 else ""

    os_match = re.search(r"\bOS=(.*?)(?:\s+[A-Z]{2}=|$)", rest)
    gn_match = re.search(r"\bGN=([^\s]+)", rest)
    protein_name = rest.split(" OS=")[0].strip()

    return {
        "db": db,
        "accession": accession,
        "entry_name": entry_name,
        "protein_name": protein_name,
        "organism_name": os_match.group(1).strip() if os_match else "",
        "gene_name": gn_match.group(1).strip() if gn_match else "",
        "header": header,
    }


def parse_fasta(text: str) -> Dict[str, str]:
    lines = [line.rstrip() for line in text.strip().splitlines() if line.strip()]
    if not lines or not lines[0].startswith(">"):
        return {}
    header = lines[0]
    sequence = "".join(lines[1:]).replace(" ", "")
    meta = parse_fasta_header(header)
    meta["sequence"] = sequence
    meta["fasta"] = header + "\n" + "\n".join([sequence[i:i + 60] for i in range(0, len(sequence), 60)])
    return meta


def apply_replacement(sequence: str) -> str:
    repl = HARDCODED_REPLACEMENT_76.strip().replace("\n", "").replace(" ", "")
    if not repl:
        return sequence
    if len(repl) != 76:
        raise ValueError("HARDCODED_REPLACEMENT_76 must be exactly 76 amino acids long.")
    if len(sequence) < 76:
        raise ValueError("The returned sequence is shorter than 76 residues, so replacement cannot be applied.")
    return repl + sequence[76:]


class Handler(BaseHTTPRequestHandler):
    def _send_empty(self, status: int, content_type: str = "text/plain; charset=utf-8") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self._send_empty(200, "text/html; charset=utf-8")
            return
        if parsed.path == "/app.js":
            self._send_empty(200, "application/javascript; charset=utf-8")
            return
        if parsed.path == "/api/site-data":
            self._send_empty(200, "application/json; charset=utf-8")
            return
        if parsed.path == "/api/search":
            self._send_empty(200, "application/json; charset=utf-8")
            return
        self._send_empty(404, "application/json; charset=utf-8")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/":
            file_response(self, INDEX_HTML_PATH, "text/html; charset=utf-8")
            return

        if parsed.path == "/app.js":
            file_response(self, APP_JS_PATH, "application/javascript; charset=utf-8")
            return

        if parsed.path == "/api/site-data":
            json_response(self, SITE_DATA)
            return
        
        if parsed.path.startswith("/images/"):
            file_path = BASE_DIR / parsed.path.lstrip("/")

            if file_path.exists() and file_path.is_file():
                content_type = "image/png"
                if file_path.suffix.lower() in [".jpg", ".jpeg"]:
                    content_type = "image/jpeg"
                elif file_path.suffix.lower() == ".webp":
                    content_type = "image/webp"

                file_response(self, file_path, content_type)
                return
	

        if parsed.path == "/api/search":
            qs = parse_qs(parsed.query)
            name = (qs.get("name", [""])[0] or "").strip()
            if not name:
                json_response(self, {"error": "Please provide a plant name."}, 400)
                return
            try:
                tax_url = build_taxonomy_search_url(name)
                tax_raw = http_get(tax_url, accept="application/json")
                tax_data = json.loads(tax_raw)
                candidates = collect_taxon_candidates(tax_data)
                best = pick_best_taxon(candidates, name)
                if not best or not best.taxon_id:
                    json_response(self, {"error": "No taxonomy match found in UniProt for that name."}, 404)
                    return

                protein_meta: Dict[str, str] = {}
                for url in [build_rbcL_search_url(best.taxon_id), build_rbcL_search_url_unreviewed(best.taxon_id)]:
                    try:
                        fasta_text = http_get(url, accept="text/plain")
                        protein_meta = parse_fasta(fasta_text)
                        if protein_meta.get("fasta"):
                            break
                    except Exception:
                        continue

                if not protein_meta.get("fasta"):
                    json_response(
                        self,
                        {
                            "error": f"Found taxon '{best.scientific_name or best.common_name}' (ID {best.taxon_id}), but no rbcL sequence was returned.",
                            "taxon_display": f"{best.scientific_name or best.common_name} (taxon {best.taxon_id})",
                        },
                        404,
                    )
                    return

                sequence = protein_meta.get("sequence", "")
                try:
                    modified_sequence = apply_replacement(sequence)
                except Exception as exc:
                    json_response(self, {"error": str(exc)}, 500)
                    return

                header = protein_meta.get("header", ">unknown")
                fasta = header + "\n" + "\n".join([modified_sequence[i:i + 60] for i in range(0, len(modified_sequence), 60)])
                display_name = best.scientific_name or best.common_name or name
                message = f"Found {display_name} and loaded the top rbcL sequence."
                json_response(
                    self,
                    {
                        "message": message,
                        "taxon_display": f"{display_name} (taxon {best.taxon_id})",
                        "accession": protein_meta.get("accession", ""),
                        "protein_name": protein_meta.get("protein_name", ""),
                        "organism_name": protein_meta.get("organism_name", ""),
                        "fasta": fasta,
                    },
                )
            except HTTPError as e:
                json_response(self, {"error": f"UniProt request failed: HTTP {e.code}"}, 502)
            except URLError as e:
                json_response(self, {"error": f"Network error contacting UniProt: {e.reason}"}, 502)
            except Exception as e:
                json_response(self, {"error": str(e)}, 500)
            return

        json_response(self, {"error": "Not found"}, 404)

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
