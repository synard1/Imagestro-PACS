"""
Modality Simulator (Scanner Device)
Simulates a medical imaging device that queries worklists and sends DICOM images
"""
import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from pydicom.dataset import Dataset
# from pydicom.file_meta import FileMetaInformation
from pydicom.uid import generate_uid, CTImageStorage, ExplicitVRLittleEndian
from pynetdicom import AE
from pynetdicom.sop_class import ModalityWorklistInformationFind
import numpy as np

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ORTHANC_HOST = os.getenv('ORTHANC_HOST', 'orthanc')
ORTHANC_PORT = int(os.getenv('ORTHANC_PORT', 4242))
ORTHANC_AET = os.getenv('ORTHANC_AET', 'ORTHANC')
MODALITY_AET = os.getenv('MODALITY_AET', 'SCANNER01')

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"}), 200

@app.route('/worklist/query', methods=['GET'])
def query_worklist():
    """Query worklist from Orthanc via C-FIND"""
    try:
        # Create Application Entity
        ae = AE(ae_title=MODALITY_AET)
        ae.add_requested_context(ModalityWorklistInformationFind)
        
        # Create query dataset
        ds = Dataset()
        ds.PatientName = request.args.get('patient_name', '*')
        ds.PatientID = request.args.get('patient_id', '')
        ds.AccessionNumber = request.args.get('accession_number', '')
        
        # Scheduled Procedure Step Sequence
        sps = Dataset()
        sps.ScheduledStationAETitle = MODALITY_AET
        sps.ScheduledProcedureStepStartDate = request.args.get('date', '')
        sps.Modality = request.args.get('modality', '')
        ds.ScheduledProcedureStepSequence = [sps]
        
        logger.info(f"Querying worklist from {ORTHANC_HOST}:{ORTHANC_PORT}")
        
        # Associate with Orthanc
        assoc = ae.associate(ORTHANC_HOST, ORTHANC_PORT, ae_title=ORTHANC_AET)
        
        worklist_items = []
        if assoc.is_established:
            # Send C-FIND request
            responses = assoc.send_c_find(ds, ModalityWorklistInformationFind)
            
            for (status, identifier) in responses:
                if status and status.Status == 0xFF00:  # Pending
                    if identifier:
                        item = {
                            'patient_name': str(identifier.get('PatientName', 'N/A')),
                            'patient_id': str(identifier.get('PatientID', 'N/A')),
                            'accession_number': str(identifier.get('AccessionNumber', 'N/A')),
                            'procedure_description': str(identifier.get('RequestedProcedureDescription', 'N/A')),
                            'study_uid': str(identifier.get('StudyInstanceUID', 'N/A'))
                        }
                        
                        # Extract SPS information
                        if 'ScheduledProcedureStepSequence' in identifier:
                            sps_item = identifier.ScheduledProcedureStepSequence[0]
                            item['modality'] = str(sps_item.get('Modality', 'N/A'))
                            item['scheduled_date'] = str(sps_item.get('ScheduledProcedureStepStartDate', 'N/A'))
                            item['scheduled_time'] = str(sps_item.get('ScheduledProcedureStepStartTime', 'N/A'))
                            item['procedure_step_description'] = str(sps_item.get('ScheduledProcedureStepDescription', 'N/A'))
                        
                        worklist_items.append(item)
                        logger.info(f"Found worklist item: {item['patient_name']} - {item['accession_number']}")
            
            assoc.release()
            
            return jsonify({
                'status': 'success',
                'count': len(worklist_items),
                'worklist': worklist_items
            }), 200
        else:
            logger.error("Association rejected or failed")
            return jsonify({'status': 'error', 'message': 'Failed to connect to worklist server'}), 500
            
    except Exception as e:
        logger.error(f"Error querying worklist: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/scan/simulate', methods=['POST'])
def simulate_scan():
    """Simulate scanning and create DICOM image"""
    try:
        data = request.json
        logger.info(f"Simulating scan for patient: {data.get('patient_name')}")
        
        # Create DICOM image file
        file_meta = Dataset()
        file_meta.MediaStorageSOPClassUID = CTImageStorage
        file_meta.MediaStorageSOPInstanceUID = generate_uid()
        file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        file_meta.ImplementationClassUID = generate_uid()
        
        ds = Dataset()
        ds.file_meta = file_meta
        ds.is_little_endian = True
        ds.is_implicit_VR = False
        
        # Patient Information (from worklist)
        ds.PatientName = data.get('patient_name', 'DOE^JOHN')
        ds.PatientID = data.get('patient_id', '12345678')
        ds.PatientBirthDate = data.get('patient_birth_date', '19800101')
        ds.PatientSex = data.get('patient_sex', 'M')
        
        # Study Information
        ds.StudyInstanceUID = data.get('study_uid', generate_uid())
        ds.StudyDate = datetime.now().strftime('%Y%m%d')
        ds.StudyTime = datetime.now().strftime('%H%M%S')
        ds.AccessionNumber = data.get('accession_number', f"ACC{datetime.now().strftime('%Y%m%d%H%M%S')}")
        ds.StudyDescription = data.get('procedure_description', 'MRI Kepala')
        
        # Series Information
        ds.SeriesInstanceUID = generate_uid()
        ds.SeriesNumber = '1'
        ds.SeriesDescription = 'Axial T1'
        ds.Modality = data.get('modality', 'MR')
        
        # Instance Information
        ds.SOPClassUID = CTImageStorage
        ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
        ds.InstanceNumber = '1'
        
        # Image data (simple dummy image 512x512)
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.Rows = 512
        ds.Columns = 512
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 0
        
        # Create dummy pixel data
        pixel_array = np.random.randint(0, 4096, size=(512, 512), dtype=np.uint16)
        ds.PixelData = pixel_array.tobytes()
        
        # Send DICOM file to DICOM Router
        ae = AE(ae_title=MODALITY_AET)
        ae.add_requested_context(CTImageStorage)
        
        router_host = os.getenv('DICOM_ROUTER_HOST', 'dicom-router')
        router_port = 11112
        router_aet = 'DCMROUTER'
        
        logger.info(f"Sending DICOM file to router: {router_host}:{router_port}")
        
        assoc = ae.associate(router_host, router_port, ae_title=router_aet)
        
        if assoc.is_established:
            status = assoc.send_c_store(ds)
            assoc.release()
            
            if status and status.Status == 0x0000:
                logger.info("DICOM file sent successfully")
                return jsonify({
                    'status': 'success',
                    'message': 'Scan completed and image sent to DICOM Router',
                    'study_uid': ds.StudyInstanceUID,
                    'accession_number': ds.AccessionNumber
                }), 200
            else:
                return jsonify({'status': 'error', 'message': 'Failed to send DICOM file'}), 500
        else:
            return jsonify({'status': 'error', 'message': 'Failed to connect to DICOM Router'}), 500
            
    except Exception as e:
        logger.error(f"Error simulating scan: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    logger.info(f"Modality Simulator starting with AET: {MODALITY_AET}")
    app.run(host='0.0.0.0', port=8090, debug=True)
