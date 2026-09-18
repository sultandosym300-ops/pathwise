import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { readLocaleFromCookieString, type Locale } from "./i18n";

/** Read the persisted locale from the request cookie so SSR renders the right language. */
export const getRequestLocale = createServerFn({ method: "GET" }).handler(async (): Promise<Locale> => {
  return readLocaleFromCookieString(getRequestHeader("cookie"));
});
