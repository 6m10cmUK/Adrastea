/**
 * オーナー・サブオーナー・一般ユーザー向け組み込み初期レイアウト（セッション無し・guest 除く）。
 * guest は `DEFAULT_LAYOUT_GUEST`。PL 向けも同一マスタを使い、権限のないパネルはサニタイズで除去する想定。
 * この経路で適用するとき、盤面ステータスオーバは既定でオン（`DockLayout`、guest 除く）。
 *
 * 列構成はスプレッドシート上のワイヤー（左→右）に合わせる。
 *
 * 1. シーン（全高）
 * 2. 上〜65%: キャラクター+ステータス（タブ） / 下〜35%: プロパティ
 * 3. 上〜25%: BGM / 中〜40%: テキストメモ / 下〜35%: レイヤー
 * 4. 盤面（全高・最幅）
 * 5. 上〜75%: チャットログ+PDF / 下〜25%: チャット入力+チャットパレット
 */

export const DEFAULT_LAYOUT_OWNER = {
  grid: {
    root: {
      type: 'branch' as const,
      data: [
        { type: 'leaf' as const, data: { views: ['scene'], activeView: 'scene', id: '17' }, size: 0.09 },
        {
          type: 'branch' as const,
          data: [
            {
              type: 'leaf' as const,
              data: { views: ['character', 'status'], activeView: 'character', id: '18' },
              size: 0.65,
            },
            {
              type: 'leaf' as const,
              data: { views: ['property'], activeView: 'property', id: '8' },
              size: 0.35,
            },
          ],
          size: 0.14,
        },
        {
          type: 'branch' as const,
          data: [
            { type: 'leaf' as const, data: { views: ['bgm'], activeView: 'bgm', id: '10' }, size: 0.25 },
            { type: 'leaf' as const, data: { views: ['scenarioText'], activeView: 'scenarioText', id: '19' }, size: 0.4 },
            { type: 'leaf' as const, data: { views: ['layer'], activeView: 'layer', id: '12' }, size: 0.35 },
          ],
          size: 0.14,
        },
        { type: 'leaf' as const, data: { views: ['board'], activeView: 'board', id: '5' }, size: 0.47 },
        {
          type: 'branch' as const,
          data: [
            {
              type: 'leaf' as const,
              data: { views: ['chatLog', 'pdfViewer'], activeView: 'chatLog', id: '2' },
              size: 0.75,
            },
            {
              type: 'leaf' as const,
              data: { views: ['chatInput', 'chatPalette'], activeView: 'chatInput', id: '6' },
              size: 0.25,
            },
          ],
          size: 0.16,
        },
      ],
      size: 1,
    },
    width: 1,
    height: 1,
    orientation: 'HORIZONTAL' as const,
  },
  panels: {
    board: { id: 'board', contentComponent: 'board', tabComponent: 'boardTab', title: 'Board' },
    chatLog: { id: 'chatLog', contentComponent: 'chatLog', title: 'チャットログ' },
    chatPalette: { id: 'chatPalette', contentComponent: 'chatPalette', title: 'チャットパレット' },
    pdfViewer: { id: 'pdfViewer', contentComponent: 'pdfViewer', title: 'PDF' },
    chatInput: { id: 'chatInput', contentComponent: 'chatInput', title: 'チャット入力' },
    property: { id: 'property', contentComponent: 'property', title: 'プロパティ' },
    bgm: { id: 'bgm', contentComponent: 'bgm', title: 'BGM' },
    layer: { id: 'layer', contentComponent: 'layer', title: 'レイヤー' },
    scenarioText: { id: 'scenarioText', contentComponent: 'scenarioText', title: 'テキストメモ' },
    scene: { id: 'scene', contentComponent: 'scene', title: 'シーン' },
    character: { id: 'character', contentComponent: 'character', title: 'キャラクター' },
    status: { id: 'status', contentComponent: 'status', title: 'ステータス' },
  },
  activeGroup: '5',
  floatingGroups: [] as const,
};
