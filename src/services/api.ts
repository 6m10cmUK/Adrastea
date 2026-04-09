const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface ExtractedPage {
  page_number: number;
  text: string;
  blocks: Array<{
    bbox: number[];
    text: string;
    font_size: number;
    is_bold: boolean;
  }>;
  column_count?: number;
  has_header?: boolean;
  has_footer?: boolean;
  header_text?: string;
  footer_text?: string;
}

export interface ExtractResponse {
  total_pages: number;
  extracted_pages: ExtractedPage[];
  full_text: string;
}

export interface EncryptedExtractResponse {
  encrypted_data: string;
  iv: string;
  metadata: {
    total_pages: number;
    extracted_pages_count: number;
    status: string;
  };
}

import type { LayoutData } from '../types/layout.types';

export const analyzeLayout = (file: File, startPage?: number, endPage?: number): Promise<LayoutData> => 
  PDFApiService.analyzeLayout(file, startPage, endPage);

export const extractText = (
  file: File,
  startPage?: number,
  endPage?: number,
  preserveLayout?: boolean,
  applyFormatting?: boolean
) => PDFApiService.extractText(file, startPage, endPage, preserveLayout, applyFormatting);

export class PDFApiService {
  private static async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/`);
      return response.ok;
    } catch {
      return false;
    }
  }

  static async extractText(
    file: File,
    startPage: number = 1,
    endPage?: number,
    preserveLayout: boolean = true,
    applyFormatting: boolean = true
  ): Promise<ExtractResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    const params = new URLSearchParams({
      start_page: startPage.toString(),
      preserve_layout: preserveLayout.toString(),
      apply_formatting: applyFormatting.toString(),
      remove_headers_footers: 'true',
      merge_paragraphs: 'true',
      normalize_spaces: 'true',
      fix_hyphenation: 'true'
    });
    
    if (endPage) {
      params.append('end_page', endPage.toString());
    }

    const response = await fetch(`${API_URL}/api/extract-text?${params}`, {
      method: 'POST',
      body: formData,
    });

    return this.handleResponse<ExtractResponse>(response);
  }

  static async extractTextEncrypted(
    file: File,
    encryptionKey: string,
    startPage: number = 1,
    endPage?: number,
    preserveLayout: boolean = true,
    applyFormatting: boolean = true
  ): Promise<EncryptedExtractResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    const params = new URLSearchParams({
      start_page: startPage.toString(),
      preserve_layout: preserveLayout.toString(),
      user_key: encryptionKey,
      apply_formatting: applyFormatting.toString(),
      remove_headers_footers: 'true',
      merge_paragraphs: 'true',
      normalize_spaces: 'true',
      fix_hyphenation: 'true'
    });
    
    if (endPage) {
      params.append('end_page', endPage.toString());
    }

    const response = await fetch(`${API_URL}/api/extract-text-encrypted?${params}`, {
      method: 'POST',
      body: formData,
    });

    return this.handleResponse<EncryptedExtractResponse>(response);
  }

  static async analyzeLayout(
    file: File,
    startPage: number = 1,
    endPage?: number
  ): Promise<LayoutData> {
    const formData = new FormData();
    formData.append('file', file);

    const params = new URLSearchParams({
      start_page: startPage.toString(),
    });
    
    if (endPage) {
      params.append('end_page', endPage.toString());
    }

    const response = await fetch(`${API_URL}/api/analyze-layout?${params}`, {
      method: 'POST',
      body: formData,
    });

    return this.handleResponse(response);
  }
}