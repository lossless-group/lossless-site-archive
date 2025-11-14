import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ModeSwitcher, modeSwitcher } from '../mode-switcher.js';

// Create a simple localStorage mock
function createLocalStorageMock() {
  const store = {};
  
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    _store: store
  };
}

// Create a simple document mock
function createDocumentMock() {
  return {
    documentElement: {
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      hasAttribute: vi.fn().mockReturnValue(false),
      getAttribute: vi.fn().mockReturnValue(null),
    },
    addEventListener: vi.fn(),
  };
}

// Create a simple window mock
function createWindowMock() {
  return {
    matchMedia: vi.fn().mockImplementation(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    localStorage: createLocalStorageMock(),
    dispatchEvent: vi.fn(),
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
  };
}

describe('ModeSwitcher', () => {
  let modeSwitcher;
  let windowMock;
  let documentMock;
  let localStorageMock;
  
  // Save original globals
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalLocalStorage = global.localStorage;
  const originalMatchMedia = global.matchMedia;

  beforeEach(() => {
    // Create fresh mocks for each test
    windowMock = createWindowMock();
    documentMock = createDocumentMock();
    localStorageMock = windowMock.localStorage;
    
    // Set up globals
    global.window = windowMock;
    global.document = documentMock;
    global.localStorage = localStorageMock;
    global.matchMedia = windowMock.matchMedia;
    
    // Create a fresh instance for each test
    modeSwitcher = new ModeSwitcher();
  });
  
  afterEach(() => {
    // Restore original globals
    global.window = originalWindow;
    global.document = originalDocument;
    global.localStorage = originalLocalStorage;
    global.matchMedia = originalMatchMedia;
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with light mode when no stored mode exists', () => {
      // Clear any stored mode
      localStorageMock.clear();
      
      // Create a new instance to test constructor
      const switcher = new ModeSwitcher();
      
      expect(switcher.getCurrentMode()).toBe('light');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('mode');
    });
    
    it('should initialize with stored mode when it exists', () => {
      // Set up a stored mode
      localStorageMock.setItem('mode', 'dark');
      
      // Create a new instance to test constructor
      const switcher = new ModeSwitcher();
      
      expect(switcher.getCurrentMode()).toBe('dark');
      expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-mode', 'dark');
    });
  });

  describe('getStoredMode', () => {
    it('should return stored mode from localStorage', () => {
      // Set up test data
      localStorageMock.setItem('mode', 'dark');
      
      const result = modeSwitcher.getStoredMode();
      
      expect(result).toBe('dark');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('mode');
    });
    
    it('should return null when localStorage is not available', () => {
      // Save and remove localStorage
      const originalLocalStorage = global.localStorage;
      delete global.localStorage;
      
      const result = modeSwitcher.getStoredMode();
      
      expect(result).toBeNull();
      
      // Restore
      global.localStorage = originalLocalStorage;
    });
  });

  describe('storeMode', () => {
    it('should store mode in localStorage', () => {
      modeSwitcher.storeMode('dark');
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mode', 'dark');
      expect(localStorageMock._store.mode).toBe('dark');
    });
    
    it('should not throw when window is not available', () => {
      // Save and remove window
      const originalWindow = global.window;
      delete global.window;
      
      // This should not throw
      expect(() => modeSwitcher.storeMode('dark')).not.toThrow();
      
      // Restore
      global.window = originalWindow;
    });
  });

  describe('applyMode', () => {
    it('should apply dark mode by setting data-mode attribute', () => {
      modeSwitcher.applyMode('dark');
      
      expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-mode', 'dark');
    });
    
    it('should apply light mode by removing data-mode attribute', () => {
      // First set to dark to ensure remove is called
      documentMock.documentElement.hasAttribute.mockReturnValueOnce(true);
      
      modeSwitcher.applyMode('light');
      
      expect(documentMock.documentElement.removeAttribute).toHaveBeenCalledWith('data-mode');
    });
    
    it('should not throw when document is not available', () => {
      // Save and remove document
      const originalDocument = global.document;
      delete global.document;
      
      // This should not throw
      expect(() => modeSwitcher.applyMode('dark')).not.toThrow();
      
      // Restore
      global.document = originalDocument;
    });
  });

  describe('toggleMode', () => {
    it('should toggle from light to dark mode', () => {
      // Set initial mode to light
      modeSwitcher.currentMode = 'light';
      
      modeSwitcher.toggleMode();
      
      expect(modeSwitcher.getCurrentMode()).toBe('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mode', 'dark');
      expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-mode', 'dark');
    });
    
    it('should toggle from dark to light mode', () => {
      // Set initial mode to dark
      modeSwitcher.currentMode = 'dark';
      
      modeSwitcher.toggleMode();
      
      expect(modeSwitcher.getCurrentMode()).toBe('light');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mode', 'light');
      expect(documentMock.documentElement.removeAttribute).toHaveBeenCalledWith('data-mode');
    });
  });

  describe('setMode', () => {
    it('should set valid mode', () => {
      const result = modeSwitcher.setMode('dark');
      
      expect(result).toBe('dark');
      expect(modeSwitcher.getCurrentMode()).toBe('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mode', 'dark');
      expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-mode', 'dark');
    });
    
    it('should warn and return current mode for invalid mode', () => {
      // Mock console.warn
      const originalConsoleWarn = console.warn;
      console.warn = vi.fn();
      
      // Set initial mode
      modeSwitcher.currentMode = 'light';
      
      const result = modeSwitcher.setMode('invalid');
      
      expect(result).toBe('light');
      expect(console.warn).toHaveBeenCalledWith('Invalid mode: invalid');
      
      // Restore console.warn
      console.warn = originalConsoleWarn;
    });
function createWindowMock() {
  return {
    matchMedia: vi.fn().mockImplementation(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    localStorage: createLocalStorageMock(),
    dispatchEvent: vi.fn(),
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
  };
}

// Create mocks
const localStorageMock = createLocalStorageMock();
const documentMock = createDocumentMock();
const windowMock = createWindowMock();

// Save original globals
const originalLocalStorage = global.localStorage;
const originalDocument = global.document;
const originalWindow = global.window;
const originalMatchMedia = global.matchMedia;

// Set up the test environment
beforeAll(() => {
  // Mock globals
  global.localStorage = localStorageMock;
  global.document = documentMock;
  global.window = windowMock;
  global.matchMedia = windowMock.matchMedia;
  
  // Mock the global modeSwitcher instance
  global.modeSwitcher = new ModeSwitcher();
});

// Clean up after each test
afterEach(() => {
  // Reset all mocks
  vi.clearAllMocks();
  
  // Reset the store
  localStorageMock.clear();
  
  // Reset the document
  documentMock.documentElement.setAttribute.mockClear();
  documentMock.documentElement.removeAttribute.mockClear();
  documentMock.documentElement.hasAttribute.mockReturnValue(false);
  documentMock.documentElement.getAttribute.mockReturnValue(null);
  
  // Reset window.matchMedia
  windowMock.matchMedia.mockImplementation(createWindowMock().matchMedia);
  
  // Reset the store
  localStorageMock._store = {};
  
  // Reset the modeSwitcher instance
  global.modeSwitcher = new ModeSwitcher();
});

// Restore globals after all tests
afterAll(() => {
  global.localStorage = originalLocalStorage;
  global.document = originalDocument;
  global.window = originalWindow;
  global.matchMedia = originalMatchMedia;
  delete global.modeSwitcher;
});

describe('ModeSwitcher', () => {
  let switcher;
  
  beforeEach(() => {
    // Create fresh instance for each test
    switcher = new ModeSwitcher();
  });
  
  describe('constructor', () => {
    it('should initialize with light mode when no stored mode exists', () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      const switcher = new ModeSwitcher();
      
      expect(switcher.getCurrentMode()).toBe('light');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('mode');
    });
    
    it('should initialize with stored mode when it exists', () => {
      localStorageMock.getItem.mockReturnValue('dark');
      
      const switcher = new ModeSwitcher();
      
      expect(switcher.getCurrentMode()).toBe('dark');
      expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-mode', 'dark');
    });
  });
  
  describe('getStoredMode', () => {
    it('should return stored mode from localStorage', () => {
      localStorageMock._store.mode = 'dark';
      
      const result = switcher.getStoredMode();
      
      expect(result).toBe('dark');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('mode');
    });
    
    it('should return null when localStorage is not available', () => {
      const originalLocalStorage = global.localStorage;
      delete global.localStorage;
      
      const result = switcher.getStoredMode();
      
      expect(result).toBeNull();
      
      // Restore
      global.localStorage = originalLocalStorage;
    });
  });
  
  describe('storeMode', () => {
    it('should store mode in localStorage', () => {
      switcher.storeMode('dark');
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mode', 'dark');
      expect(localStorageMock._store.mode).toBe('dark');
    });
    
    it('should not store when window is not available', () => {
      const originalWindow = global.window;
      delete global.window;
      
      // This should not throw
      expect(() => switcher.storeMode('dark')).not.toThrow();
      
      // Restore
      global.window = originalWindow;
    });
  });
  
  describe('applyMode', () => {
    it('should apply dark mode by setting data-mode attribute', () => {
      switcher.applyMode('dark');
      
      expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-mode', 'dark');
    });
    
    it('should apply light mode by removing data-mode attribute', () => {
      // First set to dark to ensure remove is called
      documentMock.documentElement.hasAttribute.mockReturnValueOnce(true);
      
      switcher.applyMode('light');
      
      expect(documentMock.documentElement.removeAttribute).toHaveBeenCalledWith('data-mode');
    });
    
    it('should not apply mode when document is not available', () => {
      const originalDocument = global.document;
      delete global.document;
      
      // This should not throw
      expect(() => switcher.applyMode('dark')).not.toThrow();
      
      // Restore
      global.document = originalDocument;
    });
  });
  
  describe('toggleMode', () => {
    it('should toggle from light to dark mode', () => {
      switcher.currentMode = 'light';
      
      switcher.toggleMode();
      
      expect(switcher.getCurrentMode()).toBe('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mode', 'dark');
      expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-mode', 'dark');
    });
    
    it('should toggle from dark to light mode', () => {
      switcher.currentMode = 'dark';
      
      switcher.toggleMode();
      
      expect(switcher.getCurrentMode()).toBe('light');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mode', 'light');
      expect(documentMock.documentElement.removeAttribute).toHaveBeenCalledWith('data-mode');
    });
  });
  
  describe('setMode', () => {
    it('should set valid mode', () => {
      const result = switcher.setMode('dark');
      
      expect(result).toBe('dark');
      expect(switcher.getCurrentMode()).toBe('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mode', 'dark');
      expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-mode', 'dark');
    });
    
    it('should warn and return current mode for invalid mode', () => {
      const originalConsoleWarn = console.warn;
      console.warn = vi.fn();
      
      switcher.currentMode = 'light';
      
      const result = switcher.setMode('invalid');
      
      expect(result).toBe('light');
      expect(console.warn).toHaveBeenCalledWith('Invalid mode: invalid');
      
      console.warn = originalConsoleWarn;
    });
  });
  
  describe('getCurrentMode', () => {
    it('should return current mode', () => {
      switcher.currentMode = 'dark';
      
      expect(switcher.getCurrentMode()).toBe('dark');
    });
  });
});
