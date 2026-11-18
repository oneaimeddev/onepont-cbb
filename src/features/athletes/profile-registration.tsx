import { SubmitButton } from "../../components/submit-button";
import { editAthlete } from "../../app/(workspace)/atletas/[id]/edit-actions";
import { SportLinkForm } from "./registration-form";
import { PhotoEditor } from "./photo-editor";
import { RegistrationGuard } from "./registration-guard";
import type {
  AthleteWorkspace,
  AthleteRegistration,
  RegistrationCatalog,
} from "./data";
const genderLabels: Record<string, string> = {
  feminino: "Feminino",
  masculino: "Masculino",
  nao_binario: "Não binário",
  outro: "Outro",
  nao_informado: "Prefere não informar",
};
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
    new Date(value + "T12:00:00-03:00"),
  );
function Phone({ value }: { value: string | null }) {
  const telephone =
    value &&
    /^\+?[\d\s().-]+$/.test(value) &&
    value.replace(/\D/g, "").length >= 8
      ? value.replace(/[^\d+]/g, "")
      : null;
  return telephone ? (
    <a href={`tel:${telephone}`}>{value}</a>
  ) : (
    <>{value || "Não informado"}</>
  );
}
export function ProfileRegistration({
  athlete,
  canEdit,
  registration,
  catalog,
  sports,
}: {
  athlete: AthleteWorkspace["athlete"];
  canEdit: boolean;
  registration: AthleteRegistration | null;
  catalog: RegistrationCatalog | null;
  sports: AthleteWorkspace["sports"];
}) {
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  });
  return (
    <section aria-labelledby="dados-cadastrais">
      <h2 id="dados-cadastrais">Dados cadastrais</h2>
      <RegistrationGuard
        key={JSON.stringify([
          athlete.id,
          athlete.full_name,
          athlete.social_name,
          athlete.birth_date,
          athlete.status,
          sports.map((s) => s.id),
        ])}
      >
        <div className="profile-registration-grid">
          <section aria-labelledby="identificacao-atleta">
            <h3 id="identificacao-atleta">Identificação</h3>
            <dl className="record-spec">
              <div>
                <dt>Nome completo</dt>
                <dd>{athlete.full_name}</dd>
              </div>
              <div>
                <dt>Nome social</dt>
                <dd>{athlete.social_name || "Não informado"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{athlete.status === "active" ? "Ativo" : "Inativo"}</dd>
              </div>
            </dl>
          </section>
          <section aria-labelledby="dados-pessoais">
            <h3 id="dados-pessoais">Informações pessoais</h3>
            <dl className="record-spec">
              <div>
                <dt>Nascimento</dt>
                <dd>
                  {athlete.birth_date ? (
                    <time dateTime={athlete.birth_date}>
                      {date(athlete.birth_date)}
                    </time>
                  ) : (
                    "Não informado"
                  )}
                </dd>
              </div>
              {registration && (
                <>
                  <div>
                    <dt>Identidade de gênero</dt>
                    <dd>
                      {registration.gender_identity
                        ? genderLabels[registration.gender_identity]
                        : "Não informada"}
                    </dd>
                  </div>
                  <div>
                    <dt>Identificador</dt>
                    <dd>{registration.document_id || "Não informado"}</dd>
                  </div>
                </>
              )}
            </dl>
          </section>
          {registration && (
            <section
              className="profile-contact-section"
              aria-labelledby="contatos-cadastro"
            >
              <h3 id="contatos-cadastro">Contatos e responsáveis</h3>
              <dl className="record-spec">
                <div>
                  <dt>Telefone</dt>
                  <dd>
                    <Phone value={registration.phone} />
                  </dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>
                    {registration.email &&
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registration.email) ? (
                      <a href={`mailto:${registration.email}`}>
                        {registration.email}
                      </a>
                    ) : (
                      registration.email || "Não informado"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Responsável legal</dt>
                  <dd>{registration.guardian_name || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Relação</dt>
                  <dd>{registration.guardian_relation || "Não informada"}</dd>
                </div>
                <div>
                  <dt>Contato do responsável</dt>
                  <dd>
                    <Phone value={registration.guardian_contact} />
                  </dd>
                </div>
                <div>
                  <dt>Contato de emergência</dt>
                  <dd>
                    <Phone value={registration.emergency_contact} />
                  </dd>
                </div>
              </dl>
              <p className="muted">
                Os contatos e responsáveis são apresentados para consulta. Sua
                atualização não está disponível nesta tela.
              </p>
            </section>
          )}
        </div>
        <section
          className="profile-sports-section"
          aria-labelledby="dados-esportivos"
        >
          <h3 id="dados-esportivos">Dados esportivos</h3>
          {sports.some(
            (s) => s.starts_on <= today && (!s.ends_on || s.ends_on >= today),
          ) ? (
            <ul className="season-lines">
              {sports
                .filter(
                  (s) =>
                    s.starts_on <= today && (!s.ends_on || s.ends_on >= today),
                )
                .map((s) => (
                  <li key={s.id}>
                    <strong>
                      {[s.category, s.division, s.modality]
                        .filter(Boolean)
                        .join(" · ")}
                    </strong>
                    <span>
                      {[
                        s.club,
                        s.national_team,
                        s.position,
                        s.shirt_number ? `Camisa ${s.shirt_number}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sem equipe informada"}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p>Nenhum vínculo esportivo vigente disponível para este perfil.</p>
          )}
        </section>
        {canEdit && (
          <details className="profile-edit-disclosure">
            <summary>Editar identificação e status</summary>
            <p>
              Esta edição altera nome completo, nome social, nascimento e
              status.
            </p>
            <form
              action={editAthlete}
              className="athlete-form composer-panel"
              key={`${athlete.id}:${athlete.full_name}:${athlete.social_name}:${athlete.birth_date}:${athlete.status}`}
            >
              <input type="hidden" name="id" value={athlete.id} />
              <label>
                Nome completo
                <input
                  name="name"
                  required
                  maxLength={160}
                  autoComplete="off"
                  defaultValue={athlete.full_name}
                />
              </label>
              <label>
                Nome social
                <input
                  name="social"
                  maxLength={160}
                  autoComplete="off"
                  defaultValue={athlete.social_name ?? ""}
                />
              </label>
              <label>
                Nascimento
                <input
                  type="date"
                  name="birth"
                  defaultValue={athlete.birth_date ?? ""}
                />
              </label>
              <input type="hidden" name="club" value={athlete.team ?? ""} />
              <input
                type="hidden"
                name="category"
                value={athlete.category ?? ""}
              />
              <label>
                Status
                <select name="status" defaultValue={athlete.status}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </label>
              <SubmitButton pendingLabel="Salvando…">
                Salvar cadastro
              </SubmitButton>
            </form>
          </details>
        )}
        {canEdit && (
          <details className="profile-edit-disclosure">
            <summary>Atualizar fotografia</summary>
            <PhotoEditor athleteId={athlete.id} />
          </details>
        )}
        {canEdit && catalog && (
          <details className="profile-edit-disclosure">
            <summary>Registrar novo vínculo esportivo</summary>
            <SportLinkForm athleteId={athlete.id} catalog={catalog} />
          </details>
        )}
      </RegistrationGuard>
      <section className="sport-history" aria-labelledby="historico-esportivo">
        <h3 id="historico-esportivo">Histórico de vínculos</h3>
        {sports.length ? (
          <ul className="season-lines">
            {sports.map((s) => (
              <li key={s.id}>
                <strong>
                  {[s.category, s.modality, s.division]
                    .filter(Boolean)
                    .join(" · ")}
                </strong>
                <span>
                  {[
                    s.club,
                    s.position,
                    s.shirt_number ? `Camisa ${s.shirt_number}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Sem clube"}{" "}
                  · Temporada {s.season}
                </span>
                <span>
                  De {date(s.starts_on)}
                  {s.ends_on
                    ? ` até ${date(s.ends_on)}`
                    : " · Sem encerramento registrado"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            Nenhum vínculo disponível para este perfil.{" "}
            {canEdit
              ? "Use a ação de registrar vínculo quando houver dados esportivos a incluir."
              : "Consulte a equipe responsável pelo cadastro para atualizar os dados esportivos."}
          </p>
        )}
      </section>
    </section>
  );
}
