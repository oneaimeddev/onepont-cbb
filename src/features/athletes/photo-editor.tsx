"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function PhotoEditor({ athleteId }: { athleteId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function save(remove: boolean) {
    setBusy(true);
    setStatus("");
    const form = new FormData();
    if (remove) form.set("remove", "yes");
    else if (file) form.set("photo", file);
    try {
      const response = await fetch(`/api/atletas/${athleteId}/foto`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setStatus(remove ? "Foto removida." : "Foto salva.");
      setFile(undefined);
      setPreview("");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar. Tente novamente.");
    } finally { setBusy(false); }
  }

  return (
    <section className="photo-editor">
      <h2>Foto de perfil</h2>
      <label htmlFor="photo">JPEG, PNG ou WebP, até 5 MB</label>
      <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          setFile(selected);
          setPreview(selected ? URL.createObjectURL(selected) : "");
        }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview && <img src={preview} width={96} height={96} alt="Pré-visualização da foto" />}
      <div className="form-actions">
        <button className="button" disabled={!file || busy} onClick={() => save(false)}>Salvar foto</button>
        <button className="outline" disabled={busy} onClick={() => save(true)}>Remover foto</button>
      </div>
      <p role="status">{status}</p>
    </section>
  );
}
