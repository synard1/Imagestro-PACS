/**
 * UI Module
 * 
 * This module handles all user interface operations including form management,
 * table operations, modal dialogs, autocomplete functionality, and other
 * UI-related operations. It provides a clean interface for UI interactions
 * and enhances user experience with proper event handling and feedback.
 * 
 * @version 1.0.0
 * @author SIMRS Order UI Team
 */

import { showToast, setValue, getValue, setText, setHTML, toggleVisibility, toggleEnabled, addClass, removeClass, toggleClass, addEventListener, removeEventListener, debounce, throttle } from '../utils/dom.js';
import { APP_CONFIG } from '../config/constants.js';
import { formatDate, formatDateTime, formatTime, parseDate } from '../utils/date.js';

/**
 * Form Manager class for handling form operations
 */
class FormManager {
  constructor() {
    this.forms = new Map();
    this.validators = new Map();
    this.autoSaveTimers = new Map();
  }

  /**
   * Register a form for management
   * @param {string} formId - Form ID
   * @param {Object} options - Form options
   */
  registerForm(formId, options = {}) {
    const form = document.querySelector(formId);
    if (!form) {
      console.warn(`Form ${formId} not found`);
      return;
    }

    const formConfig = {
      element: form,
      autoSave: options.autoSave || false,
      autoSaveDelay: options.autoSaveDelay || 2000,
      validateOnChange: options.validateOnChange || true,
      clearOnSubmit: options.clearOnSubmit || false,
      confirmBeforeClear: options.confirmBeforeClear || true,
      ...options,
    };

    this.forms.set(formId, formConfig);
    this.setupFormEventListeners(formId, formConfig);
  }

  /**
   * Setup event listeners for a form
   * @param {string} formId - Form ID
   * @param {Object} formConfig - Form configuration
   */
  setupFormEventListeners(formId, formConfig) {
    const form = formConfig.element;

    // Form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit(formId);
    });

    // Auto-save functionality
    if (formConfig.autoSave) {
      const inputs = form.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        const debouncedSave = debounce(() => {
          this.autoSaveForm(formId);
        }, formConfig.autoSaveDelay);

        input.addEventListener('input', debouncedSave);
        input.addEventListener('change', debouncedSave);
      });
    }

    // Validation on change
    if (formConfig.validateOnChange) {
      const inputs = form.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        input.addEventListener('blur', () => {
          this.validateField(formId, input.name || input.id);
        });
      });
    }
  }

  /**
   * Handle form submission
   * @param {string} formId - Form ID
   */
  async handleFormSubmit(formId) {
    const formConfig = this.forms.get(formId);
    if (!formConfig) return;

    try {
      // Validate form
      const isValid = await this.validateForm(formId);
      if (!isValid) {
        showToast('Mohon periksa kembali data yang diisi', APP_CONFIG.TOAST_TYPES.ERROR);
        return;
      }

      // Get form data
      const formData = this.getFormData(formId);

      // Call submit handler if provided
      if (formConfig.onSubmit) {
        const result = await formConfig.onSubmit(formData);
        
        if (result && result.success) {
          showToast('Data berhasil disimpan', APP_CONFIG.TOAST_TYPES.SUCCESS);
          
          if (formConfig.clearOnSubmit) {
            this.clearForm(formId);
          }
        }
      }

    } catch (error) {
      console.error('Form submission error:', error);
      showToast('Terjadi kesalahan saat menyimpan data', APP_CONFIG.TOAST_TYPES.ERROR);
    }
  }

  /**
   * Auto-save form data
   * @param {string} formId - Form ID
   */
  async autoSaveForm(formId) {
    const formConfig = this.forms.get(formId);
    if (!formConfig || !formConfig.autoSave) return;

    try {
      const formData = this.getFormData(formId);
      
      if (formConfig.onAutoSave) {
        await formConfig.onAutoSave(formData);
      }

      // Store in localStorage as backup
      localStorage.setItem(`form_autosave_${formId}`, JSON.stringify(formData));

    } catch (error) {
      console.error('Auto-save error:', error);
    }
  }

  /**
   * Get form data
   * @param {string} formId - Form ID
   * @returns {Object} - Form data
   */
  getFormData(formId) {
    const formConfig = this.forms.get(formId);
    if (!formConfig) return {};

    const form = formConfig.element;
    const formData = new FormData(form);
    const data = {};

    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    return data;
  }

  /**
   * Set form data
   * @param {string} formId - Form ID
   * @param {Object} data - Data to set
   */
  setFormData(formId, data) {
    const formConfig = this.forms.get(formId);
    if (!formConfig) return;

    Object.keys(data).forEach(key => {
      const element = formConfig.element.querySelector(`[name="${key}"], #${key}`);
      if (element) {
        if (element.type === 'checkbox' || element.type === 'radio') {
          element.checked = !!data[key];
        } else {
          element.value = data[key] || '';
        }
      }
    });
  }

  /**
   * Clear form
   * @param {string} formId - Form ID
   */
  clearForm(formId) {
    const formConfig = this.forms.get(formId);
    if (!formConfig) return;

    if (formConfig.confirmBeforeClear) {
      if (!confirm('Apakah Anda yakin ingin mengosongkan form?')) {
        return;
      }
    }

    formConfig.element.reset();
    this.clearFormErrors(formId);
    
    // Remove auto-save data
    localStorage.removeItem(`form_autosave_${formId}`);
  }

  /**
   * Validate form
   * @param {string} formId - Form ID
   * @returns {Promise<boolean>} - Validation result
   */
  async validateForm(formId) {
    const formConfig = this.forms.get(formId);
    if (!formConfig) return true;

    const validator = this.validators.get(formId);
    if (!validator) return true;

    try {
      const formData = this.getFormData(formId);
      const result = await validator(formData);
      
      if (result.isValid) {
        this.clearFormErrors(formId);
        return true;
      } else {
        this.showFormErrors(formId, result.errors);
        return false;
      }
    } catch (error) {
      console.error('Form validation error:', error);
      return false;
    }
  }

  /**
   * Validate single field
   * @param {string} formId - Form ID
   * @param {string} fieldName - Field name
   */
  async validateField(formId, fieldName) {
    const formConfig = this.forms.get(formId);
    if (!formConfig) return;

    const validator = this.validators.get(formId);
    if (!validator) return;

    try {
      const formData = this.getFormData(formId);
      const result = await validator(formData, fieldName);
      
      if (result.isValid || !result.errors[fieldName]) {
        this.clearFieldError(formId, fieldName);
      } else {
        this.showFieldError(formId, fieldName, result.errors[fieldName]);
      }
    } catch (error) {
      console.error('Field validation error:', error);
    }
  }

  /**
   * Show form errors
   * @param {string} formId - Form ID
   * @param {Object} errors - Errors object
   */
  showFormErrors(formId, errors) {
    Object.keys(errors).forEach(fieldName => {
      this.showFieldError(formId, fieldName, errors[fieldName]);
    });
  }

  /**
   * Show field error
   * @param {string} formId - Form ID
   * @param {string} fieldName - Field name
   * @param {string} errorMessage - Error message
   */
  showFieldError(formId, fieldName, errorMessage) {
    const formConfig = this.forms.get(formId);
    if (!formConfig) return;

    const field = formConfig.element.querySelector(`[name="${fieldName}"], #${fieldName}`);
    if (!field) return;

    // Add error class to field
    addClass(field, 'error');

    // Show error message
    let errorElement = formConfig.element.querySelector(`#${fieldName}_error`);
    if (!errorElement) {
      errorElement = document.createElement('div');
      errorElement.id = `${fieldName}_error`;
      errorElement.className = 'error-message';
      field.parentNode.appendChild(errorElement);
    }

    errorElement.textContent = errorMessage;
    errorElement.style.display = 'block';
  }

  /**
   * Clear field error
   * @param {string} formId - Form ID
   * @param {string} fieldName - Field name
   */
  clearFieldError(formId, fieldName) {
    const formConfig = this.forms.get(formId);
    if (!formConfig) return;

    const field = formConfig.element.querySelector(`[name="${fieldName}"], #${fieldName}`);
    if (field) {
      removeClass(field, 'error');
    }

    const errorElement = formConfig.element.querySelector(`#${fieldName}_error`);
    if (errorElement) {
      errorElement.style.display = 'none';
    }
  }

  /**
   * Clear all form errors
   * @param {string} formId - Form ID
   */
  clearFormErrors(formId) {
    const formConfig = this.forms.get(formId);
    if (!formConfig) return;

    const errorElements = formConfig.element.querySelectorAll('.error-message');
    errorElements.forEach(element => {
      element.style.display = 'none';
    });

    const errorFields = formConfig.element.querySelectorAll('.error');
    errorFields.forEach(field => {
      removeClass(field, 'error');
    });
  }

  /**
   * Set form validator
   * @param {string} formId - Form ID
   * @param {Function} validator - Validator function
   */
  setValidator(formId, validator) {
    this.validators.set(formId, validator);
  }
}

/**
 * Table Manager class for handling table operations
 */
class TableManager {
  constructor() {
    this.tables = new Map();
    this.sortState = new Map();
    this.filterState = new Map();
  }

  /**
   * Register a table for management
   * @param {string} tableId - Table ID
   * @param {Object} options - Table options
   */
  registerTable(tableId, options = {}) {
    const table = document.querySelector(tableId);
    if (!table) {
      console.warn(`Table ${tableId} not found`);
      return;
    }

    const tableConfig = {
      element: table,
      sortable: options.sortable || false,
      filterable: options.filterable || false,
      paginated: options.paginated || false,
      pageSize: options.pageSize || 10,
      selectable: options.selectable || false,
      multiSelect: options.multiSelect || false,
      ...options,
    };

    this.tables.set(tableId, tableConfig);
    this.setupTableEventListeners(tableId, tableConfig);
  }

  /**
   * Setup event listeners for a table
   * @param {string} tableId - Table ID
   * @param {Object} tableConfig - Table configuration
   */
  setupTableEventListeners(tableId, tableConfig) {
    const table = tableConfig.element;

    // Sortable headers
    if (tableConfig.sortable) {
      const headers = table.querySelectorAll('th[data-sortable]');
      headers.forEach(header => {
        header.style.cursor = 'pointer';
        header.addEventListener('click', () => {
          this.sortTable(tableId, header.dataset.sortable);
        });
      });
    }

    // Row selection
    if (tableConfig.selectable) {
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.type !== 'checkbox') {
            this.selectRow(tableId, row);
          }
        });
      });
    }
  }

  /**
   * Populate table with data
   * @param {string} tableId - Table ID
   * @param {Array} data - Data array
   * @param {Object} columns - Column configuration
   */
  populateTable(tableId, data, columns = {}) {
    const tableConfig = this.tables.get(tableId);
    if (!tableConfig) return;

    const tbody = tableConfig.element.querySelector('tbody');
    if (!tbody) return;

    // Clear existing rows
    tbody.innerHTML = '';

    // Add data rows
    data.forEach((item, index) => {
      const row = this.createTableRow(item, columns, index);
      tbody.appendChild(row);
    });

    // Update table event listeners
    this.setupTableEventListeners(tableId, tableConfig);
  }

  /**
   * Create table row
   * @param {Object} item - Data item
   * @param {Object} columns - Column configuration
   * @param {number} index - Row index
   * @returns {HTMLElement} - Table row element
   */
  createTableRow(item, columns, index) {
    const row = document.createElement('tr');
    row.dataset.index = index;

    Object.keys(columns).forEach(key => {
      const cell = document.createElement('td');
      const column = columns[key];

      if (column.render) {
        cell.innerHTML = column.render(item[key], item, index);
      } else if (column.type === 'date') {
        cell.textContent = formatDate(item[key]);
      } else if (column.type === 'datetime') {
        cell.textContent = formatDateTime(item[key]);
      } else if (column.type === 'currency') {
        cell.textContent = this.formatCurrency(item[key]);
      } else {
        cell.textContent = item[key] || '';
      }

      if (column.className) {
        cell.className = column.className;
      }

      row.appendChild(cell);
    });

    return row;
  }

  /**
   * Sort table
   * @param {string} tableId - Table ID
   * @param {string} column - Column to sort
   */
  sortTable(tableId, column) {
    const tableConfig = this.tables.get(tableId);
    if (!tableConfig) return;

    const currentSort = this.sortState.get(tableId) || {};
    const direction = currentSort.column === column && currentSort.direction === 'asc' ? 'desc' : 'asc';

    this.sortState.set(tableId, { column, direction });

    const tbody = tableConfig.element.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    rows.sort((a, b) => {
      const aValue = this.getCellValue(a, column);
      const bValue = this.getCellValue(b, column);

      if (direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // Clear tbody and append sorted rows
    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));

    // Update sort indicators
    this.updateSortIndicators(tableId, column, direction);
  }

  /**
   * Get cell value for sorting
   * @param {HTMLElement} row - Table row
   * @param {string} column - Column name
   * @returns {string} - Cell value
   */
  getCellValue(row, column) {
    const cell = row.querySelector(`[data-column="${column}"]`);
    return cell ? cell.textContent.trim() : '';
  }

  /**
   * Update sort indicators
   * @param {string} tableId - Table ID
   * @param {string} column - Column name
   * @param {string} direction - Sort direction
   */
  updateSortIndicators(tableId, column, direction) {
    const tableConfig = this.tables.get(tableId);
    if (!tableConfig) return;

    // Clear all sort indicators
    const headers = tableConfig.element.querySelectorAll('th[data-sortable]');
    headers.forEach(header => {
      header.classList.remove('sort-asc', 'sort-desc');
    });

    // Add sort indicator to current column
    const currentHeader = tableConfig.element.querySelector(`th[data-sortable="${column}"]`);
    if (currentHeader) {
      currentHeader.classList.add(`sort-${direction}`);
    }
  }

  /**
   * Select table row
   * @param {string} tableId - Table ID
   * @param {HTMLElement} row - Table row
   */
  selectRow(tableId, row) {
    const tableConfig = this.tables.get(tableId);
    if (!tableConfig || !tableConfig.selectable) return;

    if (!tableConfig.multiSelect) {
      // Clear other selections
      const selectedRows = tableConfig.element.querySelectorAll('tr.selected');
      selectedRows.forEach(selectedRow => {
        removeClass(selectedRow, 'selected');
      });
    }

    // Toggle selection
    toggleClass(row, 'selected');

    // Call selection handler if provided
    if (tableConfig.onRowSelect) {
      const selectedRows = tableConfig.element.querySelectorAll('tr.selected');
      tableConfig.onRowSelect(Array.from(selectedRows));
    }
  }

  /**
   * Format currency value
   * @param {number} value - Currency value
   * @returns {string} - Formatted currency
   */
  formatCurrency(value) {
    if (typeof value !== 'number') return value;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
    }).format(value);
  }
}

/**
 * Modal Manager class for handling modal dialogs
 */
class ModalManager {
  constructor() {
    this.modals = new Map();
    this.activeModal = null;
  }

  /**
   * Register a modal for management
   * @param {string} modalId - Modal ID
   * @param {Object} options - Modal options
   */
  registerModal(modalId, options = {}) {
    const modal = document.querySelector(modalId);
    if (!modal) {
      console.warn(`Modal ${modalId} not found`);
      return;
    }

    const modalConfig = {
      element: modal,
      closeOnBackdrop: options.closeOnBackdrop !== false,
      closeOnEscape: options.closeOnEscape !== false,
      ...options,
    };

    this.modals.set(modalId, modalConfig);
    this.setupModalEventListeners(modalId, modalConfig);
  }

  /**
   * Setup event listeners for a modal
   * @param {string} modalId - Modal ID
   * @param {Object} modalConfig - Modal configuration
   */
  setupModalEventListeners(modalId, modalConfig) {
    const modal = modalConfig.element;

    // Close button
    const closeButton = modal.querySelector('.modal-close, [data-modal-close]');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        this.closeModal(modalId);
      });
    }

    // Backdrop click
    if (modalConfig.closeOnBackdrop) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modalId);
        }
      });
    }

    // Escape key
    if (modalConfig.closeOnEscape) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.activeModal === modalId) {
          this.closeModal(modalId);
        }
      });
    }
  }

  /**
   * Open modal
   * @param {string} modalId - Modal ID
   * @param {Object} data - Data to pass to modal
   */
  openModal(modalId, data = {}) {
    const modalConfig = this.modals.get(modalId);
    if (!modalConfig) return;

    // Close active modal if any
    if (this.activeModal) {
      this.closeModal(this.activeModal);
    }

    // Show modal
    modalConfig.element.style.display = 'block';
    document.body.classList.add('modal-open');
    this.activeModal = modalId;

    // Call open handler if provided
    if (modalConfig.onOpen) {
      modalConfig.onOpen(data);
    }

    // Focus first input
    setTimeout(() => {
      const firstInput = modalConfig.element.querySelector('input, select, textarea, button');
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);
  }

  /**
   * Close modal
   * @param {string} modalId - Modal ID
   */
  closeModal(modalId) {
    const modalConfig = this.modals.get(modalId);
    if (!modalConfig) return;

    // Hide modal
    modalConfig.element.style.display = 'none';
    document.body.classList.remove('modal-open');
    
    if (this.activeModal === modalId) {
      this.activeModal = null;
    }

    // Call close handler if provided
    if (modalConfig.onClose) {
      modalConfig.onClose();
    }
  }

  /**
   * Close all modals
   */
  closeAllModals() {
    this.modals.forEach((config, modalId) => {
      this.closeModal(modalId);
    });
  }
}

/**
 * Autocomplete Manager class for handling autocomplete functionality
 */
class AutocompleteManager {
  constructor() {
    this.autocompletes = new Map();
  }

  /**
   * Register an autocomplete input
   * @param {string} inputId - Input ID
   * @param {Object} options - Autocomplete options
   */
  registerAutocomplete(inputId, options = {}) {
    const input = document.querySelector(inputId);
    if (!input) {
      console.warn(`Input ${inputId} not found`);
      return;
    }

    const autocompleteConfig = {
      element: input,
      minLength: options.minLength || 2,
      delay: options.delay || 300,
      maxResults: options.maxResults || 10,
      source: options.source || [],
      onSelect: options.onSelect || null,
      ...options,
    };

    this.autocompletes.set(inputId, autocompleteConfig);
    this.setupAutocompleteEventListeners(inputId, autocompleteConfig);
  }

  /**
   * Setup event listeners for autocomplete
   * @param {string} inputId - Input ID
   * @param {Object} autocompleteConfig - Autocomplete configuration
   */
  setupAutocompleteEventListeners(inputId, autocompleteConfig) {
    const input = autocompleteConfig.element;

    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.style.display = 'none';
    input.parentNode.appendChild(dropdown);
    autocompleteConfig.dropdown = dropdown;

    // Input event with debounce
    const debouncedSearch = debounce((query) => {
      this.performSearch(inputId, query);
    }, autocompleteConfig.delay);

    input.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query.length >= autocompleteConfig.minLength) {
        debouncedSearch(query);
      } else {
        this.hideDropdown(inputId);
      }
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      this.handleKeyNavigation(inputId, e);
    });

    // Hide dropdown on blur
    input.addEventListener('blur', () => {
      setTimeout(() => {
        this.hideDropdown(inputId);
      }, 200);
    });
  }

  /**
   * Perform autocomplete search
   * @param {string} inputId - Input ID
   * @param {string} query - Search query
   */
  async performSearch(inputId, query) {
    const autocompleteConfig = this.autocompletes.get(inputId);
    if (!autocompleteConfig) return;

    try {
      let results = [];

      if (typeof autocompleteConfig.source === 'function') {
        results = await autocompleteConfig.source(query);
      } else if (Array.isArray(autocompleteConfig.source)) {
        results = autocompleteConfig.source.filter(item => {
          const text = typeof item === 'string' ? item : item.label || item.name || '';
          return text.toLowerCase().includes(query.toLowerCase());
        });
      }

      // Limit results
      results = results.slice(0, autocompleteConfig.maxResults);

      this.showDropdown(inputId, results);

    } catch (error) {
      console.error('Autocomplete search error:', error);
      this.hideDropdown(inputId);
    }
  }

  /**
   * Show autocomplete dropdown
   * @param {string} inputId - Input ID
   * @param {Array} results - Search results
   */
  showDropdown(inputId, results) {
    const autocompleteConfig = this.autocompletes.get(inputId);
    if (!autocompleteConfig) return;

    const dropdown = autocompleteConfig.dropdown;
    dropdown.innerHTML = '';

    if (results.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    results.forEach((item, index) => {
      const option = document.createElement('div');
      option.className = 'autocomplete-option';
      option.dataset.index = index;

      if (typeof item === 'string') {
        option.textContent = item;
        option.dataset.value = item;
      } else {
        option.textContent = item.label || item.name || item.value || '';
        option.dataset.value = item.value || item.id || '';
      }

      option.addEventListener('click', () => {
        this.selectOption(inputId, option);
      });

      dropdown.appendChild(option);
    });

    dropdown.style.display = 'block';
  }

  /**
   * Hide autocomplete dropdown
   * @param {string} inputId - Input ID
   */
  hideDropdown(inputId) {
    const autocompleteConfig = this.autocompletes.get(inputId);
    if (!autocompleteConfig) return;

    autocompleteConfig.dropdown.style.display = 'none';
  }

  /**
   * Select autocomplete option
   * @param {string} inputId - Input ID
   * @param {HTMLElement} option - Selected option
   */
  selectOption(inputId, option) {
    const autocompleteConfig = this.autocompletes.get(inputId);
    if (!autocompleteConfig) return;

    const input = autocompleteConfig.element;
    input.value = option.textContent;

    this.hideDropdown(inputId);

    // Call selection handler if provided
    if (autocompleteConfig.onSelect) {
      autocompleteConfig.onSelect({
        text: option.textContent,
        value: option.dataset.value,
      });
    }
  }

  /**
   * Handle keyboard navigation
   * @param {string} inputId - Input ID
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeyNavigation(inputId, e) {
    const autocompleteConfig = this.autocompletes.get(inputId);
    if (!autocompleteConfig) return;

    const dropdown = autocompleteConfig.dropdown;
    if (dropdown.style.display === 'none') return;

    const options = dropdown.querySelectorAll('.autocomplete-option');
    const currentActive = dropdown.querySelector('.autocomplete-option.active');
    let activeIndex = currentActive ? parseInt(currentActive.dataset.index) : -1;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, options.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && options[activeIndex]) {
          this.selectOption(inputId, options[activeIndex]);
        }
        return;
      case 'Escape':
        e.preventDefault();
        this.hideDropdown(inputId);
        return;
      default:
        return;
    }

    // Update active option
    options.forEach(option => {
      removeClass(option, 'active');
    });

    if (activeIndex >= 0 && options[activeIndex]) {
      addClass(options[activeIndex], 'active');
    }
  }
}

// Create singleton instances
const formManager = new FormManager();
const tableManager = new TableManager();
const modalManager = new ModalManager();
const autocompleteManager = new AutocompleteManager();

// Export UI utilities
export const UI = {
  // Form management
  registerForm: (formId, options) => formManager.registerForm(formId, options),
  getFormData: (formId) => formManager.getFormData(formId),
  setFormData: (formId, data) => formManager.setFormData(formId, data),
  clearForm: (formId) => formManager.clearForm(formId),
  validateForm: (formId) => formManager.validateForm(formId),
  setFormValidator: (formId, validator) => formManager.setValidator(formId, validator),

  // Table management
  registerTable: (tableId, options) => tableManager.registerTable(tableId, options),
  populateTable: (tableId, data, columns) => tableManager.populateTable(tableId, data, columns),
  sortTable: (tableId, column) => tableManager.sortTable(tableId, column),

  // Modal management
  registerModal: (modalId, options) => modalManager.registerModal(modalId, options),
  openModal: (modalId, data) => modalManager.openModal(modalId, data),
  closeModal: (modalId) => modalManager.closeModal(modalId),
  closeAllModals: () => modalManager.closeAllModals(),

  // Autocomplete management
  registerAutocomplete: (inputId, options) => autocompleteManager.registerAutocomplete(inputId, options),

  // Utility functions
  showToast,
  setValue,
  getValue,
  setText,
  setHTML,
  toggleVisibility,
  toggleEnabled,
  addClass,
  removeClass,
  toggleClass,
  addEventListener,
  removeEventListener,
  debounce,
  throttle,
  formatDate,
  formatDateTime,
  formatTime,
};

// Export manager instances
export { formManager, tableManager, modalManager, autocompleteManager };

// Export manager classes (for app.js compatibility)
export { FormManager, TableManager, ModalManager, AutocompleteManager };

export default UI;