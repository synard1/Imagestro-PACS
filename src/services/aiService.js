
import { apiClient } from './http';
import { getConfigSync } from './config';
import { getAuthHeader } from './auth-storage';

const API_BASE = '/api/ai';
const aiApi = apiClient('ai');

export const aiService = {
  /**
   * Generate a report draft from findings
   * @param {Object} data - { findings, modality, patient_info }
   */
  async generateReport(data) {
    try {
      const response = await aiApi.post(`${API_BASE}/generate-report`, data);
      return response;
    } catch (error) {
      console.error('AI Report Generation Failed:', error);
      throw error;
    }
  },

  /**
   * Analyze priority based on clinical text
   * @param {string} text - Clinical history / reason
   * @param {string} currentPriority - Current set priority
   */
  async analyzePriority(text, currentPriority) {
    try {
      const response = await aiApi.post(`${API_BASE}/analyze-priority`, {
        clinical_text: text,
        current_priority: currentPriority
      });
      return response;
    } catch (error) {
      console.error('AI Priority Analysis Failed:', error);
      return { priority: currentPriority };
    }
  },

  /**
   * Chat with AI (Analytics or Flexible) - Non-streaming legacy/fallback
   * @param {string} query - Natural language query
   * @param {Object} context - Additional context (e.g., current page, filter)
   */
  async chatAnalytics(query, context = {}) {
    try {
      const config = getConfigSync();
      const mode = config.aiChat?.mode || 'kpi';
      
      const endpoint = mode === 'flexible' 
        ? `${API_BASE}/chat` 
        : `${API_BASE}/chat-analytics`;
        
      const response = await aiApi.post(endpoint, { query, context });
      return response;
    } catch (error) {
      console.error('AI Chat Failed:', error);
      throw error;
    }
  },

  /**
   * Initialize AI Chat session and get context (welcome msg, suggestions)
   */
  async initialize(context = {}) {
    try {
      // Use standard GET request with query params for context
      const params = new URLSearchParams(context).toString();
      const url = params ? `${API_BASE}/init?${params}` : `${API_BASE}/init`;

      const response = await aiApi.get(url);
      return response;
    } catch (error) {
      console.warn('AI Init Failed (using local defaults):', error);
      // Fallback response if endpoint fails
      return {
        status: "ready",
        welcome_message: "Halo! Saya asisten AI PACS Anda. (Offline Mode)",
        suggestions: ["Pasien Hari Ini", "Statistik Modality", "Order URGENT"],
        capabilities: ["Basic Queries"]
      };
    }
  },

  /**
   * Chat with AI using Streaming (SSE)
   * @param {string} query - User query
   * @param {Object} context - Page context
   * @param {Object} callbacks - { onStatus, onStart, onChunk, onFinish, onError }
   */
  async chatStream(query, context = {}, callbacks = {}) {
    const { onStatus, onStart, onChunk, onFinish, onError } = callbacks;
    
    try {
      const config = getConfigSync();
      // Force flexible mode for streaming
      const endpoint = `${API_BASE}/chat`;
      
      // Get Auth Token
      const auth = getAuthHeader();
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(auth || {})
        },
        body: JSON.stringify({ 
          query, 
          context,
          stream: true 
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check for non-streaming JSON response (Fallback)
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
         const data = await response.json();
         
         if (onStart) onStart();
         
         // Extract content safely
         let contentText = '';
         if (data.content) {
             contentText = typeof data.content === 'object' ? JSON.stringify(data.content) : String(data.content);
             
             // Check for Double-Encoded JSON (Common API issue)
             if (contentText.trim().startsWith('{') && contentText.includes('"content"')) {
                 try {
                     const inner = JSON.parse(contentText);
                     if (inner.content && typeof inner.content === 'string') {
                         contentText = inner.content;
                         // Merge metadata if needed, but for text display, this is prioritized
                     }
                 } catch (e) { /* ignore, generic text that looks like json */ }
             }
         } else if (data.message) {
             contentText = data.message;
         }
         
         if (onChunk) onChunk(contentText);
         if (onFinish) onFinish(data);
         return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n'); // SSE standard delimiter
        buffer = lines.pop(); // Keep incomplete chunk in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.type) {
                case 'status':
                  if (onStatus) onStatus(data.content);
                  break;
                case 'start':
                  if (onStart) onStart();
                  break;
                case 'content':
                  const textChunk = data.content || data.delta || data.text || data.data;
                  if (textChunk !== undefined && textChunk !== null) {
                    if (onChunk) onChunk(textChunk);
                  } else {
                    console.debug("Received empty or malformed content chunk:", data);
                  }
                  break;
                case 'end':
                  if (onFinish) onFinish(data); // data contains full response/metadata
                  break;
                case 'error':
                  if (onError) onError(data.content);
                  break;
              }
            } catch (e) {
              console.warn('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('AI Stream Error:', error);
      if (onError) onError(error.message);
    }
  }
};

export default aiService;
