/**
 * Lpro データ同期 GAS スクリプト
 *
 * スプレッドシートの全件データを読み取り、ハーネスの API に POST する。
 * 毎日指定時刻に自動実行（トリガー設定）。
 *
 * ===== 設定手順 =====
 * 1. スクリプトプロパティに以下を設定:
 *    - HARNESS_URL: ハーネスのベースURL（例: https://your-app.vercel.app）
 *    - CRON_SECRET: ハーネスの CRON_SECRET と同じ値
 *    - ACCOUNT_ID: 同期先の LINE アカウント ID
 *
 * 2. トリガー設定:
 *    setupDailyTrigger() を1回実行して毎日AM6:00に自動実行を設定
 *
 * ===== スプシのカラム構成（例） =====
 * A列: LINE ユーザーID
 * B列: 広告コード
 * C列: ラベル（カンマ区切りで複数可）
 * D列: 友だち追加日時（YYYY-MM-DD HH:MM:SS）
 * E列: カスタムアクション
 *
 * ※カラム構成は COLUMN_MAP で変更可能
 */

// スプシのカラムマッピング（0始まり）
var COLUMN_MAP = {
  line_user_id: 0,  // A列
  ad_code: 1,       // B列
  labels: 2,        // C列（カンマ区切り）
  followed_at: 3,   // D列
  custom_action: 4  // E列
};

// 1回のAPIリクエストで送信する最大行数
var BATCH_SIZE = 200;

/**
 * メイン同期関数
 */
function syncLproData() {
  var props = PropertiesService.getScriptProperties();
  var harnessUrl = props.getProperty('HARNESS_URL');
  var cronSecret = props.getProperty('CRON_SECRET');
  var accountId = props.getProperty('ACCOUNT_ID');

  if (!harnessUrl || !cronSecret || !accountId) {
    Logger.log('ERROR: スクリプトプロパティに HARNESS_URL, CRON_SECRET, ACCOUNT_ID を設定してください');
    return;
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();

  // ヘッダー行をスキップ
  var rows = data.slice(1);
  Logger.log('読み取り行数: ' + rows.length);

  if (rows.length === 0) {
    Logger.log('データがありません');
    return;
  }

  var totalSent = 0;
  var totalUpdated = 0;
  var totalCreated = 0;
  var totalSkipped = 0;
  var totalErrors = 0;

  // バッチ分割して送信
  for (var i = 0; i < rows.length; i += BATCH_SIZE) {
    var batch = rows.slice(i, i + BATCH_SIZE);
    var apiRows = [];

    for (var j = 0; j < batch.length; j++) {
      var row = batch[j];
      var lineUserId = String(row[COLUMN_MAP.line_user_id] || '').trim();
      if (!lineUserId) continue;

      var entry = {
        line_user_id: lineUserId
      };

      // 広告コード
      var adCode = String(row[COLUMN_MAP.ad_code] || '').trim();
      if (adCode) entry.ad_code = adCode;

      // ラベル（カンマ区切り → 配列）
      var labelsStr = String(row[COLUMN_MAP.labels] || '').trim();
      if (labelsStr) {
        entry.labels = labelsStr.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
      }

      // 友だち追加日時
      var followedAt = row[COLUMN_MAP.followed_at];
      if (followedAt) {
        if (followedAt instanceof Date) {
          entry.followed_at = followedAt.toISOString();
        } else {
          var d = new Date(followedAt);
          if (!isNaN(d.getTime())) entry.followed_at = d.toISOString();
        }
      }

      // カスタムアクション
      var customAction = String(row[COLUMN_MAP.custom_action] || '').trim();
      if (customAction) entry.custom_action = customAction;

      apiRows.push(entry);
    }

    if (apiRows.length === 0) continue;

    try {
      var response = UrlFetchApp.fetch(harnessUrl + '/api/line/lpro-sync', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': 'Bearer ' + cronSecret
        },
        payload: JSON.stringify({
          account_id: accountId,
          rows: apiRows
        }),
        muteHttpExceptions: true
      });

      var status = response.getResponseCode();
      var result = JSON.parse(response.getContentText());

      if (status === 200 && result.ok) {
        totalSent += apiRows.length;
        totalUpdated += result.updated || 0;
        totalCreated += result.created || 0;
        totalSkipped += result.skipped || 0;
        totalErrors += result.errors || 0;
        Logger.log('バッチ ' + Math.floor(i / BATCH_SIZE + 1) + ' 完了: ' + apiRows.length + '件送信');
      } else {
        Logger.log('ERROR バッチ ' + Math.floor(i / BATCH_SIZE + 1) + ': HTTP ' + status + ' - ' + response.getContentText());
        totalErrors += apiRows.length;
      }
    } catch (e) {
      Logger.log('ERROR バッチ ' + Math.floor(i / BATCH_SIZE + 1) + ': ' + e.message);
      totalErrors += apiRows.length;
    }

    // API レートリミット対策
    Utilities.sleep(1000);
  }

  Logger.log('===== 同期完了 =====');
  Logger.log('送信: ' + totalSent + '件');
  Logger.log('更新: ' + totalUpdated + '件');
  Logger.log('新規: ' + totalCreated + '件');
  Logger.log('スキップ: ' + totalSkipped + '件');
  Logger.log('エラー: ' + totalErrors + '件');
}

/**
 * 毎日AM6:00に自動実行するトリガーを設定
 */
function setupDailyTrigger() {
  // 既存トリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncLproData') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 毎日AM6:00に実行
  ScriptApp.newTrigger('syncLproData')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  Logger.log('毎日AM6:00の自動同期トリガーを設定しました');
}
