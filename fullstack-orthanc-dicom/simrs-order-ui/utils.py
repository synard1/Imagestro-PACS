import logging
import os
from typing import Optional

LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
LOG_FILE = os.path.join(LOG_DIR, "simrs_order_ui.log")

os.makedirs(LOG_DIR, exist_ok=True)

_formatter = logging.Formatter(
    fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
_handler.setFormatter(_formatter)
_handler.setLevel(logging.INFO)

_console = logging.StreamHandler()
_console.setFormatter(_formatter)
_console.setLevel(logging.INFO)

_root_logger = logging.getLogger("simrs_order_ui")
_root_logger.setLevel(logging.INFO)
if not _root_logger.handlers:
    _root_logger.addHandler(_handler)
    _root_logger.addHandler(_console)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    if name:
        logger = logging.getLogger(f"simrs_order_ui.{name}")
    else:
        logger = _root_logger
    return logger