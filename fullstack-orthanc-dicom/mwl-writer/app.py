from http.server import BaseHTTPRequestHandler, HTTPServer
import json, os
from datetime import datetime
from pydicom.dataset import Dataset, FileDataset
from pydicom.filewriter import dcmwrite

WL_DIR = "/worklists"

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/mwl":
            self.send_response(404); self.end_headers(); return
        ln = int(self.headers.get("content-length", "0"))
        data = json.loads(self.rfile.read(ln))
        ds = FileDataset(None, {}, preamble=b"\0"*128)
        ds.is_little_endian = True; ds.is_implicit_VR = False

        ds.AccessionNumber = data["accession_number"]                # (0008,0050)
        # (0008,0051) IssuerOfAccessionNumberSequence
        item = Dataset()
        item.LocalNamespaceEntityID = data.get("issuer","")
        ds.IssuerOfAccessionNumberSequence = [item]

        ds.Modality = data.get("modality","CR")                      # (0008,0060)
        ds.StudyDescription = data.get("description","")

        p = data.get("patient", {})
        ds.PatientID = p.get("id","")
        ds.PatientName = p.get("name","")
        ds.PatientBirthDate = p.get("birthDate","")
        ds.PatientSex = p.get("sex","")

        sps = Dataset()
        dt = datetime.fromisoformat(data["scheduled_at"].replace("Z","+00:00"))
        sps.ScheduledProcedureStepStartDate = dt.strftime("%Y%m%d")
        sps.ScheduledProcedureStepStartTime = dt.strftime("%H%M%S")
        sps.ScheduledStationAETitle = data.get("station_aet","ORTHANC")
        sps.ScheduledProcedureStepID = data.get("procedure_id", data["accession_number"])
        ds.ScheduledProcedureStepSequence = [sps]                    # (0040,0100)

        os.makedirs(WL_DIR, exist_ok=True)
        fn = os.path.join(WL_DIR, f"{data['accession_number']}.wl")
        dcmwrite(fn, ds)
        self.send_response(201); self.end_headers()
        self.wfile.write(json.dumps({"path": fn}).encode())

HTTPServer(("0.0.0.0", 8000), H).serve_forever()
