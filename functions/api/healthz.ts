import { json, options } from "../_lib/http";
import type { Env } from "../_lib/types";

export const onRequestOptions = () => options();

export const onRequestGet: PagesFunction<Env> = async () => json({ status: "ok" });
