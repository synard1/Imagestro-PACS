from abc import ABC, abstractmethod
from typing import Optional, List
from app.models.khanza import KhanzaConfig

class KhanzaRepository(ABC):
    @abstractmethod
    def get_config(self) -> Optional[KhanzaConfig]:
        pass

    @abstractmethod
    def save_config(self, config_data: dict) -> KhanzaConfig:
        pass

class PostgresKhanzaRepository(KhanzaRepository):
    def __init__(self, db: 'Session'):
        self.db = db

    def get_config(self) -> Optional[KhanzaConfig]:
        return self.db.query(KhanzaConfig).first()

    def save_config(self, config_data: dict) -> KhanzaConfig:
        config = self.get_config()
        if config:
            for key, value in config_data.items():
                setattr(config, key, value)
        else:
            config = KhanzaConfig(**config_data)
            self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return config
