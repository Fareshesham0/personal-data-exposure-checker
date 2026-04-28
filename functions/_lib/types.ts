export interface Env {
  PDEC_KV: KVNamespace;
}

export interface PagesContext {
  request: Request;
  env: Env;
}
