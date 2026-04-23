// ============================================================
// 配信条件（UTAGE準拠）
// - ステップ配信・予約配信で使う「対象者絞り込み」条件の型と評価ロジック
// - DB には line_step_sequences.target_condition (jsonb) として保存
// ============================================================

export type ConditionField =
  // --- 対応済み（Supabase の line_followers から絞り込める） ---
  | "line_display_name"       // LINE名 / LINE登録名 → line_followers.display_name
  | "inflow_route"            // 登録経路 → line_followers.inflow_route_id
  | "followed_at_date"        // 配信基準日時(日付)   → line_followers.followed_at
  | "followed_at_datetime"    // 配信基準日時(日時刻) → line_followers.followed_at
  | "followed_at_range_from"  // 登録日(開始) → followed_at >= value
  | "followed_at_range_to"    // 登録日(終了) → followed_at <= value
  | "label"                   // ラベル (クライアント側 state)
  | "label_has"               // ラベルあり（指定ラベルがついている人）
  | "label_not_has"           // ラベルなし（指定ラベルがついていない人）
  // --- UTAGE 互換のため UI に出すが、現時点では DB に該当カラムが無いため未対応 ---
  | "name"
  | "email"
  | "phone"
  | "address"
  | "gender"
  | "age"
  | "job"
  | "custom_free_text"
  | "scenario"
  | "broadcast";

export type ConditionOp =
  | "eq"          // が次と等しい (完全一致)
  | "neq"         // が次と等しくない
  | "contains"    // が次を含む (部分一致)
  | "not_contains"// が次を含まない
  | "gte"         // が次以上
  | "lte"         // が次以下
  | "gt"          // が次より大きい
  | "lt"          // が次より小さい
  | "blank"       // が空白
  | "not_blank";  // が空白でない

export interface ConditionRow {
  field: ConditionField;
  op: ConditionOp;
  value: string;
}

export type ConditionConnector = "AND" | "OR";

export interface DeliveryCondition {
  mode: "all" | "filtered";
  rows: ConditionRow[];
  // connectors[i] は rows[i] と rows[i+1] の間 (length = rows.length - 1)
  connectors: ConditionConnector[];
}

export const emptyDeliveryCondition: DeliveryCondition = {
  mode: "all",
  rows: [{ field: "line_display_name", op: "eq", value: "" }],
  connectors: [],
};

// ============================================================
// UI 表示用メタデータ
// ============================================================

export const FIELD_LABELS: Record<ConditionField, string> = {
  line_display_name: "LINE登録名",
  inflow_route: "登録経路",
  followed_at_date: "配信基準日時(日付)",
  followed_at_datetime: "配信基準日時(日時刻)",
  followed_at_range_from: "登録日時(開始)",
  followed_at_range_to: "登録日時(終了)",
  label: "ラベル",
  label_has: "ラベルあり(指定ラベル)",
  label_not_has: "ラベルなし(指定ラベル)",
  name: "お名前",
  email: "メールアドレス",
  phone: "電話番号",
  address: "ご住所",
  gender: "性別",
  age: "年代",
  job: "ご職業",
  custom_free_text: "自由記述（カスタム項目）",
  scenario: "シナリオ",
  broadcast: "配信",
};

export const OP_LABELS: Record<ConditionOp, string> = {
  eq: "が次と等しい(完全一致)",
  neq: "が次と等しくない",
  contains: "が次を含む(部分一致)",
  not_contains: "が次を含まない",
  gte: "が次以上",
  lte: "が次以下",
  gt: "が次より大きい",
  lt: "が次より小さい",
  blank: "が空白",
  not_blank: "が空白でない",
};

// 対応済みフィールドのリスト
export const SUPPORTED_FIELDS: ConditionField[] = [
  "line_display_name",
  "inflow_route",
  "followed_at_date",
  "followed_at_datetime",
  "followed_at_range_from",
  "followed_at_range_to",
  "label",
  "label_has",
  "label_not_has",
];

export function isSupportedField(f: ConditionField): boolean {
  return SUPPORTED_FIELDS.includes(f);
}

// フィールドごとに使える演算子（UTAGE の仕様にできるだけ寄せる）
const TEXT_OPS: ConditionOp[] = ["eq", "neq", "contains", "not_contains", "blank", "not_blank"];
const DATE_OPS: ConditionOp[] = ["eq", "neq", "gte", "lte", "gt", "lt", "blank", "not_blank"];
const LABEL_OPS: ConditionOp[] = ["eq", "neq", "blank", "not_blank"];

const RANGE_OPS: ConditionOp[] = ["gte", "lte"];
const HAS_OPS: ConditionOp[] = ["eq"];

export function operatorsForField(f: ConditionField): ConditionOp[] {
  switch (f) {
    case "followed_at_date":
    case "followed_at_datetime":
    case "age":
      return DATE_OPS;
    case "followed_at_range_from":
      return RANGE_OPS;
    case "followed_at_range_to":
      return RANGE_OPS;
    case "label":
    case "inflow_route":
    case "scenario":
    case "broadcast":
    case "gender":
      return LABEL_OPS;
    case "label_has":
    case "label_not_has":
      return HAS_OPS;
    default:
      return TEXT_OPS;
  }
}

// 値入力欄の種類
export type InputKind = "text" | "date" | "datetime-local" | "select" | "none";

export function inputKindForRow(row: ConditionRow): InputKind {
  if (row.op === "blank" || row.op === "not_blank") return "none";
  switch (row.field) {
    case "followed_at_date":
    case "followed_at_range_from":
    case "followed_at_range_to":
      return "date";
    case "followed_at_datetime":
      return "datetime-local";
    case "inflow_route":
    case "label":
    case "label_has":
    case "label_not_has":
    case "gender":
    case "scenario":
    case "broadcast":
      return "select";
    default:
      return "text";
  }
}

// ============================================================
// 評価ロジック
// ============================================================

export interface FollowerLite {
  id: string;
  line_user_id: string;
  display_name: string | null;
  followed_at: string; // ISO
  inflow_route_id?: string | null;
  label_ids?: string[];
}

// 単一行の評価
function evalRow(row: ConditionRow, f: FollowerLite): boolean {
  const { field, op, value } = row;

  // 未対応フィールドは「常に true」とみなす（＝絞り込みから外す）
  if (!isSupportedField(field)) return true;

  // 対象値を取り出す
  let target: string | Date | null = null;
  switch (field) {
    case "line_display_name":
      target = f.display_name;
      break;
    case "inflow_route":
      target = f.inflow_route_id ?? null;
      break;
    case "followed_at_date":
    case "followed_at_datetime":
      target = f.followed_at ? new Date(f.followed_at) : null;
      break;
    case "followed_at_range_from":
      // 登録日(開始): followed_at >= value
      if (!f.followed_at) return false;
      target = new Date(f.followed_at);
      break;
    case "followed_at_range_to":
      // 登録日(終了): followed_at <= value (当日の終わりまで)
      if (!f.followed_at) return false;
      target = new Date(f.followed_at);
      break;
    case "label":
      // ラベルは配列評価: eq = 含む, neq = 含まない
      if (op === "blank") return (f.label_ids?.length ?? 0) === 0;
      if (op === "not_blank") return (f.label_ids?.length ?? 0) > 0;
      if (op === "eq") return (f.label_ids ?? []).includes(value);
      if (op === "neq") return !(f.label_ids ?? []).includes(value);
      return true;
    case "label_has":
      // 指定ラベルがついている人
      return (f.label_ids ?? []).includes(value);
    case "label_not_has":
      // 指定ラベルがついていない人
      return !(f.label_ids ?? []).includes(value);
  }

  if (op === "blank") return target === null || target === "" || (target instanceof Date && isNaN(target.getTime()));
  if (op === "not_blank") return !(target === null || target === "" || (target instanceof Date && isNaN(target.getTime())));

  if (target === null || target === "") return false;

  // 日付比較
  if (target instanceof Date) {
    const rv = value ? new Date(value) : null;
    if (!rv || isNaN(rv.getTime())) return false;
    const a = target.getTime();
    let b = rv.getTime();
    // followed_at_range_to の場合、日付の終わりまで含める（23:59:59.999）
    if (field === "followed_at_range_to" && value.length <= 10) {
      b = new Date(value + "T23:59:59.999Z").getTime();
    }
    switch (op) {
      case "eq": return a === b;
      case "neq": return a !== b;
      case "gte": return a >= b;
      case "lte": return a <= b;
      case "gt": return a > b;
      case "lt": return a < b;
      default: return true;
    }
  }

  // 文字列比較
  const s = String(target);
  switch (op) {
    case "eq": return s === value;
    case "neq": return s !== value;
    case "contains": return s.includes(value);
    case "not_contains": return !s.includes(value);
    case "gte": return s >= value;
    case "lte": return s <= value;
    case "gt": return s > value;
    case "lt": return s < value;
    default: return true;
  }
}

// 複数行を AND/OR で評価（AND > OR の優先順位で左から）
export function evalCondition(cond: DeliveryCondition, f: FollowerLite): boolean {
  if (cond.mode === "all" || cond.rows.length === 0) return true;

  // OR で分割 → それぞれは AND グループ
  const orGroups: ConditionRow[][] = [];
  let current: ConditionRow[] = [cond.rows[0]];
  for (let i = 1; i < cond.rows.length; i++) {
    const conn = cond.connectors[i - 1] ?? "AND";
    if (conn === "OR") {
      orGroups.push(current);
      current = [cond.rows[i]];
    } else {
      current.push(cond.rows[i]);
    }
  }
  orGroups.push(current);

  // いずれかの AND グループが成立すれば true
  return orGroups.some((group) => group.every((r) => evalRow(r, f)));
}

// 未対応フィールドを使っている行があれば返す（UI で警告表示用）
export function listUnsupportedFields(cond: DeliveryCondition): ConditionField[] {
  if (cond.mode !== "filtered") return [];
  const set = new Set<ConditionField>();
  for (const r of cond.rows) {
    if (!isSupportedField(r.field)) set.add(r.field);
  }
  return Array.from(set);
}
