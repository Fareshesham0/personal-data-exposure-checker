export interface Env {
  PDEC_KV: KVNamespace;
  XPOSEDORNOT_API_KEY?: string;
  HIBP_API_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

export interface PagesContext {
  request: Request;
  env: Env;
}
