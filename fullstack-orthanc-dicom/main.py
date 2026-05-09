Traceback (most recent call last):
  File "main.py", line 27, in <module>
  File "utils/config.py", line 24, in init
  File "interface/satusehat.py", line 125, in get_dcm_config
  File "requests/api.py", line 73, in get
  File "requests/api.py", line 59, in request
  File "requests/sessions.py", line 575, in request
  File "requests/sessions.py", line 486, in prepare_request
  File "requests/models.py", line 368, in prepare
  File "requests/models.py", line 439, in prepare_url
requests.exceptions.MissingSchema: Invalid URL '/fhir-r4/v1/dcm_cfg': No scheme supplied. Perhaps you meant https:///fhir-r4/v1/dcm_cfg?
[PYI-12:ERROR] Failed to execute script 'main' due to unhandled exception!
