import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "line-images";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * 画像を Supabase Storage の "line-images" バケットにアップロードし、
 * 公開 URL を返す。Imagemap メッセージ用の画像ホスティングに使う。
 *
 * バケットが未作成なら自動で作成する。
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "file is required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return Response.json(
        { error: `対応していないファイル形式です (${file.type})。JPEG/PNG/WebPのみ。` },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return Response.json(
        { error: `ファイルサイズが大きすぎます (${Math.round(file.size / 1024 / 1024)}MB)。10MB以下にしてください。` },
        { status: 400 },
      );
    }

    // バケットが存在しなければ作成
    {
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      const exists = (buckets ?? []).some((b) => b.name === BUCKET);
      if (!exists) {
        const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
          public: true,
          fileSizeLimit: MAX_SIZE,
          allowedMimeTypes: Array.from(ALLOWED_TYPES),
        });
        if (createErr && !/already exists/i.test(createErr.message)) {
          return Response.json({ error: `バケット作成失敗: ${createErr.message}` }, { status: 500 });
        }
      }
    }

    // ランダムなファイル名で保存
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const arrayBuf = await file.arrayBuffer();

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(filename, arrayBuf, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      return Response.json({ error: `アップロード失敗: ${uploadErr.message}` }, { status: 500 });
    }

    const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(filename);
    return Response.json({ ok: true, url: publicData.publicUrl });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
