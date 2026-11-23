import { authConfig, siteUrl, homologation } from "./remote.mjs";
// Closed environment: no public sign-up, and login links return to this environment's own URL.
await authConfig({ disable_signup: true, mailer_autoconfirm: false, site_url: siteUrl, uri_allow_list: `${siteUrl}/**` });
console.log(`Autenticação configurada (${homologation ? "homologação" : "beta"}): cadastro público desabilitado.`);
