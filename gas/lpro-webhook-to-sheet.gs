/**
 * Lpro → Googleスプレッドシート連携スクリプト（シンプル版）
 *
 * 【機能】
 * 1. doPost: Lproから届くデータ（識別コード・LINEユーザー管理ID・広告コード）をメンバー一覧にupsert
 * 2. doGet: ヘルスチェック用
 *
 * 【セットアップ】
 * 1. Google Apps Script で新規プロジェクト作成
 * 2. このコードを貼り付け
 * 3.「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 4. 発行されたURLをLproのWebhook転送先に設定
 */

// ========== 設定 ==========
var SPREADSHEET_ID = '11WEW1zgKsot-WFD0e0cg0D8pz6kAi71JsTZT_hRg2BU';
var SHEET_NAME = 'メンバー一覧';
var COLUMNS = ['識別コード', 'LINEユーザー管理ID', '広告コード', '更新日時'];

// ========== doPost ==========
function doPost(e) {
  try {
    var item = {};

    // JSON
    if (e.postData && e.postData.contents) {
      try {
        var json = JSON.parse(e.postData.contents);
        if (!Array.isArray(json)) json = [json];
        // 最初の要素を使う
        item = json[0] || {};
      } catch (_) {}
    }

    // form-urlencoded（上書き優先）
    if (e.parameter && Object.keys(e.parameter).length > 0) {
      var p = e.parameter;
      if (p['識別コード'] || p['identification_code']) item['識別コード'] = p['識別コード'] || p['identification_code'];
      if (p['LINEユーザー管理ID'] || p['line_user_id']) item['LINEユーザー管理ID'] = p['LINEユーザー管理ID'] || p['line_user_id'];
      if (p['広告コード'] || p['ad_code']) item['広告コード'] = p['広告コード'] || p['ad_code'];
    }

    var code = item['識別コード'] || item['identification_code'] || item['code'] || '';
    if (!code) {
      return jsonResponse_({ ok: false, error: '識別コードがありません' });
    }

    upsertMember_(code, item);
    return jsonResponse_({ ok: true });
  } catch (err) {
    Logger.log('doPost エラー: ' + err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}

// ========== doGet ==========
function doGet() {
  return jsonResponse_({ status: 'ok', message: 'Lpro Webhook受信エンドポイント稼働中' });
}

// ========== upsert ==========
function upsertMember_(code, item) {
  var sheet = getOrCreateSheet_();
  var lastRow = sheet.getLastRow();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

  var rowData = [
    code,
    item['LINEユーザー管理ID'] || item['line_user_id'] || '',
    item['広告コード'] || item['ad_code'] || '',
    now
  ];

  // 既存行を検索
  if (lastRow > 1) {
    var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < codes.length; i++) {
      if (String(codes[i][0]) === String(code)) {
        sheet.getRange(i + 2, 1, 1, rowData.length).setValues([rowData]);
        Logger.log('更新: ' + code);
        return;
      }
    }
  }

  // 新規追加
  sheet.appendRow(rowData);
  Logger.log('追加: ' + code);
}

// ========== ユーティリティ ==========
function getOrCreateSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    var headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
