// レイアウト解析に関する型定義

export interface LayoutData {
  pages: LayoutPage[];
  total_pages: number;
  status: string;
}

export interface LayoutPage {
  page_number: number;
  width?: number;
  height?: number;
  regions: {
    vertical_gaps: VerticalGap[];
    columns: Column[];
    headers: Region[];
    footers: Region[];
    header?: Region;  // 単一のヘッダー（後方互換性のため）
    footer?: Region;  // 単一のフッター（後方互換性のため）
  };
  header_boundary: number;
  footer_boundary: number;
  main_content_height: number;
  main_content_y_start: number;
  main_content_y_end: number;
}

export interface VerticalGap {
  x: number;
  width: number;
  y: number;
  height: number;
}

export interface Column {
  x: number;
  width: number;
  y: number;
  height: number;
  column_index?: number;
  column_number?: number;
  block_count?: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  detected?: boolean;
  block_count?: number;
}

// PDFページのレンダリングに関する型
export interface RenderContext {
  canvasContext: CanvasRenderingContext2D;
  transform?: number[];
  viewport: {
    width: number;
    height: number;
    scale: number;
  };
}

// レイアウトオーバーレイの表示設定
export interface LayoutOverlaySettings {
  showVerticalGaps: boolean;
  showColumns: boolean;
  showHeaders: boolean;
  showFooters: boolean;
  opacity: number;
}