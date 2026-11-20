"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { command } from "./client";
import type { SigningInventory } from "./contracts";
import "./signing.css";
type DeclaredProfile = {
  full_name: string;
  display_name: string;
  profession: string;
  contact_email: string;
  phone: string;
  specialties: string;
};
type Registration = {
  id: string;
  council: string;
  registration_number: string;
  jurisdiction: string;
  verification: string;
};
export function ProfessionalPanel({
  initial,
  email,
}: {
  initial: { profile: DeclaredProfile; registrations: Registration[] };
  email: string;
}) {
  const [data, setData] = useState(initial),
    [editing, setEditing] = useState(false),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [photo, setPhoto] = useState<string | null>(null),
    [dirty, setDirty] = useState(false);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    fetch("/api/professional/photo")
      .then(async (r) => {
        if (r.ok && active) setPhoto(URL.createObjectURL(await r.blob()));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  async function save(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setData(await command("professional", action, payload));
      setEditing(false);
      setAdding(false);
      setDirty(false);
      setNotice(
        "Dados declarados salvos. As permissões permanecem sob gestão institucional.",
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="professional-section signing-section"
      aria-labelledby="professional-data"
    >
      <h2 id="professional-data">Dados profissionais</h2>
      <p className="professional-help">
        Informações declaradas por você. O cadastro não comprova habilitação nem
        altera permissões clínicas.
      </p>
      {photo && (
        <Image
          src={photo}
          unoptimized
          width={88}
          height={88}
          alt="Sua fotografia profissional"
          className="professional-photo"
        />
      )}
      {!editing ? (
        <>
          <dl className="professional-facts">
            {[
              ["Nome completo", data.profile.full_name || "Não informado"],
              ["Nome de exibição", data.profile.display_name],
              ["Profissão informada", data.profile.profession],
              ["E-mail de acesso", email],
              [
                "E-mail de contato declarado",
                data.profile.contact_email || "Não informado",
              ],
              ["Telefone", data.profile.phone || "Não informado"],
              [
                "Especialidades declaradas",
                data.profile.specialties || "Não informadas",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            className="ghost"
            onClick={() => setEditing(true)}
          >
            Editar dados profissionais
          </button>
        </>
      ) : (
        <form
          className="signing-form"
          onChange={() => setDirty(true)}
          onSubmit={(e) => {
            e.preventDefault();
            void save(
              "save",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
          }}
        >
          {(
            [
              ["full_name", "Nome completo", 200, "name"],
              ["display_name", "Nome de exibição", 120, "nickname"],
              ["profession", "Profissão informada", 100, "organization-title"],
              ["contact_email", "E-mail de contato declarado", 254, "email"],
              ["phone", "Telefone", 40, "tel"],
              ["specialties", "Especialidades declaradas", 1000, "off"],
            ] as const
          ).map(([name, label, max, ac]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                type={
                  name === "contact_email"
                    ? "email"
                    : name === "phone"
                      ? "tel"
                      : "text"
                }
                autoComplete={ac}
                maxLength={max}
                required={name === "display_name" || name === "profession"}
                defaultValue={data.profile[name]}
              />
            </label>
          ))}
          <div className="signing-actions">
            <button disabled={busy} className="button">
              {busy ? "Salvando…" : "Salvar dados"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(
                    "Descartar as alterações dos dados profissionais?",
                  )
                ) {
                  setEditing(false);
                  setDirty(false);
                }
              }}
            >
              Cancelar edição
            </button>
          </div>
        </form>
      )}
      <details>
        <summary>Atualizar fotografia</summary>
        <form
          className="signing-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const fd = new FormData(e.currentTarget);
              const response = await fetch("/api/professional/photo", {
                method: "POST",
                body: fd,
              });
              if (!response.ok)
                throw new Error(
                  "Use uma imagem JPEG, PNG ou WebP de até 2 MB.",
                );
              const img = await fetch("/api/professional/photo");
              if (!img.ok)
                throw new Error(
                  "A fotografia foi enviada, mas não pôde ser consultada.",
                );
              setPhoto(URL.createObjectURL(await img.blob()));
              setNotice("Fotografia atualizada.");
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Fotografia (JPEG, PNG ou WebP, até 2 MB)
            <input
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </label>
          <button className="ghost" disabled={busy}>
            Salvar fotografia
          </button>
        </form>
      </details>
      <h3>Registros profissionais</h3>
      <p className="professional-help">
        Inscrições declaradas são separadas da verificação institucional.
        Nenhuma inscrição adicionada aqui recebe verificação automática.
      </p>
      {data.registrations.length ? (
        <ul className="signing-list">
          {data.registrations.map((reg) => (
            <li key={reg.id}>
              <div>
                <strong>
                  {reg.council} {reg.registration_number} · {reg.jurisdiction}
                </strong>
                <p>
                  {reg.verification === "declared"
                    ? "Declarado — não verificado"
                    : `Verificação institucional: ${reg.verification}`}
                </p>
              </div>
              {reg.verification === "declared" && (
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Remover esta inscrição declarada?"))
                      void save("registration_remove", { id: reg.id });
                  }}
                >
                  Remover inscrição
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>Nenhuma inscrição cadastrada.</p>
      )}
      {!adding ? (
        <button className="ghost" onClick={() => setAdding(true)}>
          Adicionar inscrição
        </button>
      ) : (
        <form
          className="signing-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save(
              "registration_add",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
          }}
        >
          <label>
            Conselho profissional
            <input name="council" maxLength={40} required autoComplete="off" />
          </label>
          <label>
            Número de registro
            <input
              name="registration_number"
              maxLength={80}
              required
              autoComplete="off"
            />
          </label>
          <label>
            UF ou região
            <input
              name="jurisdiction"
              maxLength={80}
              required
              autoComplete="off"
            />
          </label>
          <div className="signing-actions">
            <button disabled={busy} className="button">
              Salvar inscrição
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setAdding(false)}
            >
              Cancelar inscrição
            </button>
          </div>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function SigningSettings({
  enabled,
  initial,
}: {
  enabled: boolean;
  initial: SigningInventory | null;
}) {
  const [inventory, setInventory] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      setInventory(await command("signing", action, payload));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="professional-section signing-section"
      aria-labelledby="professional-signature"
    >
      <h2 id="professional-signature">Assinatura digital</h2>
      <p>
        Assinatura real: <strong>Indisponível nesta versão.</strong>
      </p>
      <p className="professional-help">
        Não há conector de produção nem certificado criptograficamente validado.
      </p>
      {enabled ? (
        <>
          <aside className="signing-demo-notice">
            <strong>Ambiente de demonstração</strong>
            <p>
              As identidades abaixo são fictícias. A simulação não produz
              assinatura digital válida.
            </p>
          </aside>
          {inventory?.connected ? (
            <>
              <ul className="signing-list">
                {inventory.identities.map((i) => (
                  <li key={i.id}>
                    <div>
                      <strong>{i.label}</strong>
                      <p>
                        {i.provider} · Identidade demonstrativa · Não verificada
                      </p>
                      {inventory.preferred === i.id && (
                        <p>Preferencial para novas demonstrações</p>
                      )}
                    </div>
                    <button
                      className="ghost"
                      disabled={busy || inventory.preferred === i.id}
                      onClick={() => void run("prefer", { identity_id: i.id })}
                    >
                      Definir como preferencial
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="ghost"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Desconectar o simulador? Novas tentativas serão bloqueadas; o histórico será preservado.",
                    )
                  )
                    void run("disconnect");
                }}
              >
                Desconectar simulador
              </button>
            </>
          ) : (
            <button
              className="button"
              disabled={busy}
              onClick={() => void run("connect")}
            >
              {busy ? "Conectando…" : "Conectar identidades demonstrativas"}
            </button>
          )}
        </>
      ) : (
        <p>O simulador está desabilitado neste ambiente.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
