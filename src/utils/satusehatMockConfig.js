const SATUSEHAT_MOCK_DATA_KEY = 'satusehat_show_mock_data';

export function isSatusehatMockMode() {
  return localStorage.getItem(SATUSEHAT_MOCK_DATA_KEY) === 'true';
}

export function setSatusehatMockMode(enabled) {
  localStorage.setItem(SATUSEHAT_MOCK_DATA_KEY, String(enabled));
}

export function toggleSatusehatMockMode() {
  const current = isSatusehatMockMode();
  setSatusehatMockMode(!current);
  return !current;
}
