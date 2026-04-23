"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface FormField {
  id: string;
  field_order: number;
  field_label: string;
  field_type: string;
  options: Array<{ label: string; value: string }>;
  is_required: boolean;
  placeholder: string | null;
}

export default function RegistrationFormPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const formId = params.id as string;
  const lineUserId = searchParams.get("uid") ?? "";

  const [form, setForm] = useState<{ id: string; name: string; description: string | null; fields: FormField[] } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [thankYou, setThankYou] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/line/registration-forms/submit?form_id=${formId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error === "inactive" ? "このフォームは受付終了しています" : "フォームが見つかりません");
        else setForm(data);
      })
      .catch(() => setError("読み込みに失敗しました"));
  }, [formId]);

  const handleSubmit = async () => {
    if (!form) return;
    for (const f of form.fields) {
      if (f.is_required && !values[f.id]?.trim()) {
        alert(`「${f.field_label}」は必須項目です`);
        return;
      }
      if (f.field_type === "email" && values[f.id] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[f.id])) {
        alert(`「${f.field_label}」に正しいメールアドレスを入力してください`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/line/registration-forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_id: formId, line_user_id: lineUserId || null, data: values }),
      });
      const data = await res.json();
      if (res.ok) {
        setThankYou(data.thank_you_message);
        setSubmitted(true);
      } else alert(data.error ?? "送信に失敗しました");
    } catch { alert("送信エラー"); }
    finally { setSubmitting(false); }
  };

  if (error) return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-sm border p-8 text-center max-w-md w-full"><p className="text-gray-500">{error}</p></div></div>;
  if (submitted) return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-sm border p-8 text-center max-w-md w-full"><div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></div><p className="text-gray-800 text-lg font-bold mb-2">送信完了</p><p className="text-gray-600 text-sm">{thankYou}</p></div></div>;
  if (!form) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400 text-sm">読み込み中...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="bg-[#06C755] px-6 py-5">
            <h1 className="text-white text-lg font-bold">{form.name}</h1>
            {form.description && <p className="text-white/80 text-sm mt-1">{form.description}</p>}
          </div>
          <div className="p-6 space-y-5">
            {form.fields.map((f) => (
              <div key={f.id}>
                <label className="text-sm font-medium text-gray-800 block mb-1.5">
                  {f.field_label}{f.is_required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {(f.field_type === "text" || f.field_type === "email" || f.field_type === "phone" || f.field_type === "number" || f.field_type === "date") && (
                  <input
                    type={f.field_type === "phone" ? "tel" : f.field_type}
                    value={values[f.id] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                    placeholder={f.placeholder ?? ""}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]"
                  />
                )}
                {f.field_type === "textarea" && (
                  <textarea
                    value={values[f.id] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                    placeholder={f.placeholder ?? ""}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]"
                  />
                )}
                {(f.field_type === "select") && (
                  <select value={values[f.id] ?? ""} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-[#06C755] focus:outline-none">
                    <option value="">選択してください</option>
                    {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                {f.field_type === "radio" && (
                  <div className="space-y-2">{(f.options ?? []).map((o) => (
                    <label key={o.value} className="flex items-center gap-2 cursor-pointer"><input type="radio" name={`f-${f.id}`} value={o.value} checked={values[f.id] === o.value} onChange={() => setValues({ ...values, [f.id]: o.value })} className="accent-[#06C755]" /><span className="text-sm text-gray-700">{o.label}</span></label>
                  ))}</div>
                )}
                {f.field_type === "checkbox" && (
                  <div className="space-y-2">{(f.options ?? []).map((o) => {
                    const sel = (values[f.id] ?? "").split(",").filter(Boolean);
                    return (
                      <label key={o.value} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={sel.includes(o.value)} onChange={() => { const next = sel.includes(o.value) ? sel.filter((v) => v !== o.value) : [...sel, o.value]; setValues({ ...values, [f.id]: next.join(",") }); }} className="accent-[#06C755]" /><span className="text-sm text-gray-700">{o.label}</span></label>
                    );
                  })}</div>
                )}
              </div>
            ))}
            <button onClick={handleSubmit} disabled={submitting} className="w-full py-3 bg-[#06C755] hover:bg-[#05a648] disabled:opacity-50 text-white font-bold rounded-lg transition text-sm">
              {submitting ? "送信中..." : "登録する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
