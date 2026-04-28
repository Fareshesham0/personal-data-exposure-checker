export interface Env {
  PDEC_KV: KVNamespace;
  XPOSEDORNOT_API_KEY?: string;
}

export interface PagesContext {
  request: Request;
  env: Env;
}
