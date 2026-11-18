"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Icon } from "../../components/icon";
import type { CatalogOption, RegistrationCatalog } from "./data";
import { addSportLink, createCategory, createOrganization, registerAthlete, type RegisterResult } from "../../app/(workspace)/atletas/novo/actions";

const sections = [
  ["pessoais", "Dados pessoais"],
  ["esportivos", "Dados esportivos"],
  ["contatos", "Contatos"],
] as const;

const genderOptions = [
  ["", "Não informar"],
  ["feminino", "Feminino"],
  ["masculino", "Masculino"],
  ["nao_binario", "Não binário"],
  ["outro", "Outro"],
  ["nao_informado", "Prefere não informar"],
] as const;

const fieldSection: Record<string, (typeof sections)[number][0]> = {
  name: "pessoais", birth: "pessoais", gender_identity: "pessoais", document: "pessoais",
  category_id: "esportivos", division: "esportivos", modality: "esportivos", shirt: "esportivos", club_id: "esportivos",
  phone: "contatos", email: "contatos", guardian_name: "contatos", guardian_relation: "contatos",
  guardian_contact: "contatos", emergency_contact: "contatos",
};

const courtPositions = ["Armador", "Ala-armador", "Ala", "Ala-pivô", "Pivô"];

const fieldMessage: Record<string, string> = {
  name: "Informe o nome completo, com até 160 caracteres.",
  birth: "Informe uma data de nascimento válida.",
  document: "Use 11 dígitos fictícios ou um identificador institucional.",
  gender_identity: "Escolha uma identidade de gênero da lista.",
  category_id: "Para registrar o vínculo, escolha categoria, feminino ou masculino e modalidade.",
  division: "Escolha feminino ou masculino.",
  modality: "Escolha a modalidade.",
  club_id: "Escolha um clube ou equipe cadastrado.",
  shirt: "O número da camisa usa até três dígitos.",
  phone: "Informe um telefone fictício com 8 a 20 caracteres.",
  email: "Informe um e-mail fictício válido.",
  guardian_name: "O nome do responsável pode ter até 160 caracteres.",
  guardian_relation: "A relação com o responsável pode ter até 40 caracteres.",
  guardian_contact: "O contato do responsável precisa ter pelo menos 8 caracteres.",
  emergency_contact: "O contato de emergência precisa ter pelo menos 8 caracteres.",
};

function Optional() {
  return <span className="optional"> (opcional)</span>;
}

function DivisionField({ divisions }: { divisions: string[] }) {
  return (
    <div>
      <label>Feminino ou masculino
        <select name="division" defaultValue="">
          <option value="">Não informar</option>
          {divisions.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <p className="field-hint">O time da competição. A identidade de gênero fica em Dados pessoais.</p>
    </div>
  );
}

function PositionField() {
  return (
    <label>Posição esportiva<Optional />
      <select name="position" defaultValue="">
        <option value="">Não informar</option>
        {courtPositions.map((item) => <option key={item}>{item}</option>)}
      </select>
    </label>
  );
}

function CatalogCombobox({ name, label, optional = true, options, value, onChange, onCreate, notice }: {
  name: "category_id" | "club_id";
  label: string;
  optional?: boolean;
  options: CatalogOption[];
  value: string;
  onChange: (id: string) => void;
  onCreate: (name: string) => Promise<RegisterResult>;
  notice?: string;
}) {
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelClose() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }
  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(notice ?? "");
  const selected = options.find((option) => option.id === value);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return options.filter((option) => option.name.toLocaleLowerCase("pt-BR").includes(term)).slice(0, 8);
  }, [options, query]);
  const canAdd = query.trim().length > 1 && !options.some((option) => option.name.toLocaleLowerCase("pt-BR") === query.trim().toLocaleLowerCase("pt-BR"));

  async function add() {
    const result = await onCreate(query.trim());
    if (!result.ok && result.error === "duplicate" && result.id) {
      onChange(result.id);
      setQuery("");
      setMessage("Essa opção já existe e foi selecionada.");
      setOpen(false);
      return;
    }
    if (!result.ok || !result.id || !result.name) {
      setMessage(result.error === "denied" ? "Seu perfil não pode criar esta opção." : "Não foi possível adicionar. Revise o nome.");
      return;
    }
    onChange(result.id);
    setQuery("");
    setMessage("");
    setOpen(false);
  }

  return (
    <div className="catalog-combo">
      <label>{label}{optional ? <Optional /> : null}
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={open ? query : (selected?.name ?? "")}
          placeholder="Buscar ou adicionar"
          autoComplete="off"
          onFocus={() => { cancelClose(); setOpen(true); setQuery(""); }}
          onChange={(event) => { cancelClose(); setQuery(event.target.value); setOpen(true); }}
          onBlur={() => { cancelClose(); blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        />
      </label>
      <input type="hidden" name={name} value={value} />
      {open && (
        <div className="catalog-menu" id={listId} role="listbox">
          {visible.map((option) => (
            <button key={option.id} type="button" role="option" aria-selected={option.id === value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option.id); setOpen(false); setQuery(""); }}>
              {option.name}
            </button>
          ))}
          {canAdd && (
            <button type="button" className="catalog-add" onMouseDown={(event) => event.preventDefault()} onClick={() => void add()}>
              Adicionar “{query.trim()}”
            </button>
          )}
          {visible.length === 0 && !canAdd && <p>Nenhuma opção encontrada.</p>}
        </div>
      )}
      {message && <p className="field-error" role="status">{message}</p>}
    </div>
  );
}

export function RegistrationForm({ catalog, onDone }: { catalog: RegistrationCatalog; onDone?: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = useRef(false);
  const saved = useRef(false);
  const [creationId] = useState(() => crypto.randomUUID());
  const [section, setSection] = useState<(typeof sections)[number][0]>("pessoais");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState(catalog.categories);
  const [clubs, setClubs] = useState(catalog.clubs);
  const [categoryId, setCategoryId] = useState("");
  const [clubId, setClubId] = useState("");
  const [pending, setPending] = useState(false);
  const divisions = catalog.divisions.length > 0 ? catalog.divisions : ["Feminino", "Masculino"];
  const modalities = catalog.modalities.length > 0 ? catalog.modalities : ["5x5", "3x3"];

  useEffect(() => {
    const dialog = formRef.current?.closest("dialog");
    if (!dialog) return;
    const onCancel = (event: Event) => {
      if (!saved.current && dirty.current && !window.confirm("Fechar o cadastro e descartar o que foi preenchido?")) event.preventDefault();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, []);

  function remember(option: CatalogOption, current: CatalogOption[], update: (options: CatalogOption[]) => void) {
    if (!current.some((item) => item.id === option.id)) update([...current, option].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    const form = event.currentTarget;
    const result = await registerAthlete(new FormData(form));
    if (!result.ok || !result.id) {
      const field = result.field ?? "name";
      setSection(fieldSection[field] ?? "pessoais");
      setErrors({ [field]: fieldMessage[field] ?? "Não foi possível salvar o cadastro." });
      setPending(false);
      return;
    }
    const photo = (form.elements.namedItem("photo") as HTMLInputElement | null)?.files?.[0];
    if (photo) {
      const body = new FormData();
      body.set("photo", photo);
      const response = await fetch(`/api/atletas/${result.id}/foto`, { method: "POST", body });
      if (!response.ok) setErrors({ photo: "O atleta foi cadastrado, mas a foto não foi salva." });
    }
    saved.current = true;
    form.dataset.dirty = "false";
    onDone?.();
    router.push(`/atletas/${result.id}`);
    router.refresh();
  }

  return (
    <form ref={formRef} className="athlete-form registration-form" data-dirty="false" onSubmit={onSubmit} onInput={() => { dirty.current = true; if (formRef.current) formRef.current.dataset.dirty = "true"; }}>
      <p className="notice"><Icon name="info" size={16} />Use dados fictícios no ambiente de demonstração. Nome completo basta para salvar.</p>
      <input type="hidden" name="creation_id" value={creationId} suppressHydrationWarning />
      <div className="section-tabs" role="tablist" aria-label="Seções do cadastro">
        {sections.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)}>{label}</button>
        ))}
      </div>

      <div className="registration-panels">
      <fieldset inert={section !== "pessoais"}>
        <legend className="sr-only">Dados pessoais</legend>
        <label>Nome completo<input name="name" required maxLength={160} autoComplete="off" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "erro-name" : undefined} /></label>
        {errors.name && <p id="erro-name" className="field-error" role="alert">{errors.name}</p>}
        <label>Nome social<Optional /><input name="social" maxLength={160} autoComplete="off" /></label>
        <label>Data de nascimento<Optional /><input name="birth" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} aria-invalid={Boolean(errors.birth)} /></label>
        {errors.birth && <p className="field-error" role="alert">{errors.birth}</p>}
        <label>Fotografia<Optional /><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>
        {errors.photo && <p className="field-error" role="alert">{errors.photo}</p>}
        <label>CPF ou identificador institucional<Optional /><input name="document" maxLength={40} autoComplete="off" spellCheck={false} aria-invalid={Boolean(errors.document)} /></label>
        {errors.document && <p className="field-error" role="alert">{errors.document}</p>}
        <label>Identidade de gênero<Optional />
          <select name="gender_identity" defaultValue="">
            {genderOptions.map(([value, label]) => <option key={value || "empty"} value={value}>{label}</option>)}
          </select>
        </label>
      </fieldset>

      <fieldset inert={section !== "esportivos"}>
        <legend className="sr-only">Dados esportivos</legend>
        <CatalogCombobox name="category_id" label="Categoria" optional={false} options={categories} value={categoryId} onChange={setCategoryId} onCreate={async (name) => {
          const result = await createCategory(name);
          if (result.ok && result.id && result.name) remember({ id: result.id, name: result.name }, categories, setCategories);
          if (!result.ok && result.error === "duplicate" && result.id && result.name) remember({ id: result.id, name: result.name }, categories, setCategories);
          return result;
        }} />
        {errors.category_id && <p className="field-error" role="alert">{errors.category_id}</p>}
        <div className="form-row">
          <DivisionField divisions={divisions} />
          <label>Modalidade<select name="modality" defaultValue=""><option value="">Não informar</option>{modalities.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <PositionField />
        <CatalogCombobox name="club_id" label="Clube ou equipe" options={clubs} value={clubId} onChange={setClubId} onCreate={async (name) => {
          const result = await createOrganization(name, "club");
          if (result.id && result.name) remember({ id: result.id, name: result.name }, clubs, setClubs);
          return result;
        }} />
        <label>Número da camisa<Optional /><input name="shirt" inputMode="numeric" maxLength={3} autoComplete="off" aria-invalid={Boolean(errors.shirt)} /></label>
        {errors.shirt && <p className="field-error" role="alert">{errors.shirt}</p>}
      </fieldset>

      <fieldset inert={section !== "contatos"}>
        <legend className="sr-only">Contatos</legend>
        <div className="form-row">
          <label>Telefone<Optional /><input name="phone" autoComplete="off" maxLength={20} aria-invalid={Boolean(errors.phone)} /></label>
          <label>E-mail<Optional /><input name="email" type="email" autoComplete="off" maxLength={160} aria-invalid={Boolean(errors.email)} /></label>
        </div>
        {errors.phone && <p className="field-error" role="alert">{errors.phone}</p>}
        {errors.email && <p className="field-error" role="alert">{errors.email}</p>}
        <label>Responsável legal<Optional /><input name="guardian_name" maxLength={160} autoComplete="off" /></label>
        <label>Relação com o responsável<Optional /><input name="guardian_relation" maxLength={40} autoComplete="off" /></label>
        <label>Contato do responsável<Optional /><input name="guardian_contact" maxLength={160} autoComplete="off" /></label>
        <label>Contato de emergência<Optional /><input name="emergency_contact" maxLength={160} autoComplete="off" /></label>
      </fieldset>
      </div>

      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar cadastro"}</button>
        {onDone ? <button className="ghost-link" type="button" onClick={onDone}>Cancelar</button> : <Link className="ghost-link" href="/atletas" prefetch={false}>Cancelar</Link>}
      </div>
    </form>
  );
}

function closeRegistration(dialog: HTMLDialogElement | null) {
  if (!dialog) return;
  const dirty = dialog.querySelector("form")?.dataset.dirty === "true";
  if (dirty && !window.confirm("Fechar o cadastro e descartar o que foi preenchido?")) return;
  dialog.close();
}

export function SportLinkForm({ athleteId, catalog }: { athleteId: string; catalog: RegistrationCatalog }) {
  const [categories, setCategories] = useState(catalog.categories);
  const [clubs, setClubs] = useState(catalog.clubs);
  const [categoryId, setCategoryId] = useState("");
  const [clubId, setClubId] = useState("");
  const divisions = catalog.divisions.length > 0 ? catalog.divisions : ["Feminino", "Masculino"];
  const modalities = catalog.modalities.length > 0 ? catalog.modalities : ["5x5", "3x3"];
  function keep(result: RegisterResult, update: Dispatch<SetStateAction<CatalogOption[]>>) {
    if (!result.id || !result.name) return;
    const option = { id: result.id, name: result.name };
    update((current) => current.some((item) => item.id === option.id) ? current : [...current, option]);
  }
  return (
    <form action={addSportLink} className="athlete-form composer-panel">
      <h2>Novo vínculo</h2>
      <p>O vínculo aberto é encerrado hoje. O clube anterior permanece no histórico.</p>
      <input type="hidden" name="athlete_id" value={athleteId} />
      <CatalogCombobox name="category_id" label="Categoria" optional={false} options={categories} value={categoryId} onChange={setCategoryId} onCreate={async (name) => {
        const result = await createCategory(name);
        keep(result, setCategories);
        return result;
      }} />
      <div className="form-row">
        <DivisionField divisions={divisions} />
        <label>Modalidade<select name="modality" defaultValue=""><option value="">Não informar</option>{modalities.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <PositionField />
      <CatalogCombobox name="club_id" label="Clube ou equipe" options={clubs} value={clubId} onChange={setClubId} onCreate={async (name) => {
        const result = await createOrganization(name, "club");
        keep(result, setClubs);
        return result;
      }} />
      <label>Número da camisa<Optional /><input name="shirt" inputMode="numeric" maxLength={3} autoComplete="off" /></label>
      <button className="button" type="submit">Registrar vínculo</button>
    </form>
  );
}

export function RegistrationEntry({ catalog }: { catalog: RegistrationCatalog }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="button" type="button" onClick={() => dialogRef.current?.showModal()}>
        <Icon name="plus" size={18} />Cadastrar atleta
      </button>
      <dialog ref={dialogRef} className="registration-dialog" aria-labelledby="cadastro-titulo">
        <header className="registration-head">
          <h2 id="cadastro-titulo">Cadastrar atleta</h2>
          <button type="button" className="record-chat" aria-label="Fechar" onClick={() => closeRegistration(dialogRef.current)}><Icon name="close" size={18} /></button>
        </header>
        <RegistrationForm catalog={catalog} onDone={() => closeRegistration(dialogRef.current)} />
      </dialog>
    </>
  );
}
