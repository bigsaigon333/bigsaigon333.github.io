// Strings of the i18n demo, keyed by locale.
export const messages = {
  en: { hello: "Hello", about: "About this demo" },
  ko: { hello: "안녕하세요", about: "이 데모에 대하여" },
} as const;

export type Locale = keyof typeof messages;

export const isLocale = (value: string | undefined): value is Locale =>
  value === "en" || value === "ko";
